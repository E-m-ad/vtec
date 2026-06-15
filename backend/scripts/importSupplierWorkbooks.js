import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import ExcelJS from 'exceljs';

import prisma from '../src/config/db.js';
import { normalizePartNumber } from '../src/utils/normalizePartNumber.js';

// This legacy script writes parsed workbook data into live accounting/product tables.
// The app's supported supplier Excel flow is the read-only legacy workbook archive.
const IMPORT_TAG = 'supplier-excel-import';
const DAY_MS = 24 * 60 * 60 * 1000;

const accountWords = [
  'دفع',
  'دفعة',
  'دفعه',
  'حساب',
  'باقي',
  'باقى',
  'فرق',
  'رصيد',
  'تصفي',
  'تصفية',
  'تحويل',
  'نقد',
  'كاش',
];

const summaryWords = ['اجمالي', 'إجمالي', 'الاجمالى', 'الاجمالي', 'الصافي', 'صافى', 'صافي'];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    folder: path.resolve(process.cwd(), '../suppliers excel sheet'),
    commit: false,
    file: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--folder') options.folder = path.resolve(args[++index]);
    else if (arg === '--file') options.file = args[++index];
    else if (arg === '--commit') options.commit = true;
    else if (arg === '--dry-run') options.commit = false;
  }

  return options;
};

const cleanText = (value) => {
  if (value === null || value === undefined) return '';

  return String(value).replace(/\s+/g, ' ').trim();
};

const normalizeArabicText = (value) =>
  cleanText(value)
    .replace(/[ـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();

const compactCode = (value) => cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const excelValue = (cell) => {
  const value = cell?.value;
  if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (value instanceof Date) return value;
    return null;
  }

  return value;
};

const toNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const text = cleanText(value)
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٬,\s]/g, '')
    .replace('٫', '.');

  if (!text) return null;

  const productExpression = text.match(/^(-?\d+(?:\.\d+)?)\*(-?\d+(?:\.\d+)?)$/);
  if (productExpression) {
    return Number(productExpression[1]) * Number(productExpression[2]);
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const toDate = (value, fallback = new Date()) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const serial = toNumber(value);
  if (serial !== null && serial > 20000 && serial < 70000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * DAY_MS);
  }

  const text = cleanText(value);
  if (text) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return fallback;
};

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const hashKey = (value, length = 12) =>
  crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, length).toUpperCase();

const supplierNameFromFile = (fileName) => path.basename(fileName, path.extname(fileName)).trim();

const sourceKeyFor = ({ fileName, sheetName, side, rowNumber }) =>
  `${IMPORT_TAG}:${hashKey(`${fileName}|${sheetName}|${side}|${rowNumber}`, 16)}`;

const isAccountText = (value) => {
  const text = normalizeArabicText(value);
  return accountWords.some((word) => text.includes(normalizeArabicText(word)));
};

const isSummaryText = (value) => {
  const text = normalizeArabicText(value);
  return summaryWords.some((word) => text.includes(normalizeArabicText(word)));
};

const headerAt = (headers, column) => normalizeArabicText(headers[column] || '');

const firstHeaderColumn = (headers, matcher) => {
  for (let column = 1; column <= 20; column += 1) {
    if (matcher(headerAt(headers, column), column)) return column;
  }

  return null;
};

const detectRightLayout = (headers) => {
  const dateColumn = firstHeaderColumn(headers, (header) => header.includes('تاريخ الصادر'));
  const nameColumn = firstHeaderColumn(headers, (header) => header.includes('صادر') && !header.includes('تاريخ'));

  if (!dateColumn && !nameColumn) return null;

  const start = dateColumn || Math.max(nameColumn - 2, 1);
  const next = headerAt(headers, start + 1);
  const second = headerAt(headers, start + 2);
  const third = headerAt(headers, start + 3);
  const fourth = headerAt(headers, start + 4);
  const fifth = headerAt(headers, start + 5);

  if (next.includes('عدد')) {
    return {
      date: dateColumn,
      quantity: start + 1,
      code: start + 2,
      name: start + 3,
      total: fourth.includes('اجمال') ? start + 4 : start + 4,
    };
  }

  if (next.includes('كود')) {
    return {
      date: dateColumn,
      code: start + 1,
      name: start + 2,
      total: third.includes('سعر') || third.includes('اجمال') ? start + 3 : start + 3,
    };
  }

  if (second.includes('كود') && third.includes('صادر')) {
    return {
      date: dateColumn,
      quantity: next.includes('عدد') ? start + 1 : null,
      code: start + 2,
      name: start + 3,
      total: fifth.includes('اجمال') ? start + 5 : start + 4,
    };
  }

  if (nameColumn) {
    const totalColumn =
      firstHeaderColumn(
        headers,
        (header, column) =>
          column > nameColumn && column <= nameColumn + 4 && (header.includes('سعر') || header.includes('اجمال')),
      ) || nameColumn + 1;

    return {
      date: dateColumn,
      name: nameColumn,
      total: totalColumn,
    };
  }

  return {
    date: dateColumn,
    total: start + 4,
  };
};

const buildLayout = (headers) => {
  const h1 = headerAt(headers, 1);
  const h2 = headerAt(headers, 2);
  const h3 = headerAt(headers, 3);
  const h4 = headerAt(headers, 4);

  let left;
  if (h1 === 'م' && h2.includes('كود') && h3.includes('صنف')) {
    left = { date: 8, code: 2, name: [3, 4], quantity: 5, unitCost: 6, total: null };
  } else if (h1.includes('كود') && h2.includes('عدد')) {
    left = { date: 9, code: 1, quantity: 2, name: 1, unitCost: 5, total: 7 };
  } else if (h1.includes('وارد') && h2.includes('كود') && h3.includes('عدد')) {
    left = { date: 1, code: 2, quantity: 3, name: 4, unitCost: 5, total: 5 };
  } else if (h1.includes('تاريخ') && h2.includes('عدد')) {
    left = { date: 1, quantity: 2, code: 3, name: 4, unitCost: 5, total: 6 };
  } else if (h1.includes('تاريخ') && h2.includes('كود')) {
    left = { date: 1, code: 2, quantity: 3, name: 4, unitCost: 5, total: 6 };
  } else if (h1.includes('تاريخ') && (h2.includes('وارد') || h2.includes('بيان'))) {
    left = {
      date: 1,
      name: 2,
      code: h3.includes('كود') ? 3 : null,
      quantity: h4.includes('عدد') ? 4 : null,
      unitCost: h4.includes('سعر') ? 4 : null,
      total: firstHeaderColumn(
        headers,
        (header, column) => column <= 6 && column > 2 && (header.includes('اجمال') || header.includes('سعر الوارد')),
      ) || 3,
    };
  } else {
    left = { date: 1, quantity: 2, code: 3, name: 4, unitCost: 5, total: 6 };
  }

  return {
    left,
    right: detectRightLayout(headers),
  };
};

const readSide = (row, layout) => {
  if (!layout) return null;

  const read = (column) => (column ? excelValue(row.getCell(column)) : null);
  const name = Array.isArray(layout.name)
    ? layout.name.map((column) => cleanText(read(column))).filter(Boolean).join(' - ')
    : cleanText(read(layout.name));
  const code = cleanText(read(layout.code));
  const quantity = toNumber(read(layout.quantity));
  const unitCost = toNumber(read(layout.unitCost));
  const explicitTotal = toNumber(read(layout.total));
  const amount =
    explicitTotal !== null
      ? explicitTotal
      : quantity !== null && unitCost !== null
        ? quantity * unitCost
        : null;

  return {
    rawDate: read(layout.date),
    code,
    quantity,
    name,
    unitCost,
    amount: amount === null ? null : roundMoney(amount),
  };
};

const hasSideData = (entry) =>
  Boolean(
    entry?.code ||
      entry?.name ||
      entry?.unitCost !== null ||
      (entry?.amount !== null && entry?.amount !== 0),
  );

const classifyEntry = (entry, side) => {
  if (!hasSideData(entry)) return 'blank';
  if (isSummaryText(entry.name)) return 'summary';

  const hasProductIdentity = Boolean(entry.code || entry.name);
  const hasQuantity = entry.quantity !== null && entry.quantity > 0;
  const hasAmount = entry.amount !== null && entry.amount > 0;
  const accountLike = isAccountText(entry.name);

  if (accountLike && !hasAmount) return 'summary';

  if (side === 'left') {
    if (hasProductIdentity && !accountLike) return 'received_product';
    if (hasAmount) return 'supplier_debit_adjustment';
    return 'unresolved';
  }

  if (hasProductIdentity && !accountLike && (hasQuantity || entry.code || entry.name !== '-')) {
    return 'sent_product';
  }

  if (hasAmount) return 'cash_payment';
  return 'unresolved';
};

const normalizeProductInput = ({ code, name, supplierName, sourceKey }) => {
  const rawCode = cleanText(code);
  const cleanName = cleanText(name);
  const normalized = rawCode ? normalizePartNumber(rawCode) : '';
  const compact = rawCode ? compactCode(rawCode) : '';
  const sku =
    rawCode && rawCode !== '-' && rawCode.length <= 80
      ? rawCode
      : normalized && normalized.length <= 80
        ? normalized
        : compact && compact.length <= 80
          ? compact
          : `SUP-${hashKey(`${supplierName}|${cleanName}|${sourceKey}`, 14)}`;

  return {
    sku,
    name: cleanName && cleanName !== '-' ? cleanName : rawCode || sku,
    lookupCodes: Array.from(new Set([rawCode, normalized, compact].filter(Boolean))),
  };
};

const parseWorkbook = async (filePath) => {
  const fileName = path.basename(filePath);
  const supplierName = supplierNameFromFile(fileName);
  const events = [];
  const issues = [];
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
  });

  let sheetName = '';
  let layout = null;
  let lastLeftDate = null;
  let lastRightDate = null;
  let seenData = false;
  let blankStreak = 0;

  for await (const worksheet of workbook) {
    sheetName = worksheet.name;
    for await (const row of worksheet) {
      if (row.number === 1) {
        const headers = {};
        for (let column = 1; column <= 20; column += 1) {
          headers[column] = cleanText(excelValue(row.getCell(column)));
        }
        layout = buildLayout(headers);
        continue;
      }

      if (!layout) continue;

      const left = readSide(row, layout.left);
      const right = readSide(row, layout.right);
      const rowHasData = hasSideData(left) || hasSideData(right);

      if (!rowHasData) {
        if (seenData) blankStreak += 1;
        if (blankStreak > 250) break;
        continue;
      }

      seenData = true;
      blankStreak = 0;

      if (left?.rawDate) lastLeftDate = toDate(left.rawDate, lastLeftDate || new Date());
      if (right?.rawDate) lastRightDate = toDate(right.rawDate, lastRightDate || new Date());

      for (const [side, entry, eventDate] of [
        ['left', left, lastLeftDate],
        ['right', right, lastRightDate],
      ]) {
        const type = classifyEntry(entry, side);
        if (type === 'blank' || type === 'summary') continue;

        const sourceKey = sourceKeyFor({ fileName, sheetName, side, rowNumber: row.number });
        const quantity = entry.quantity !== null && entry.quantity > 0 ? Math.round(entry.quantity) : 1;
        const amount =
          entry.amount !== null
            ? entry.amount
            : type === 'received_product' || type === 'sent_product'
              ? 0
              : null;
        const unitCost = amount !== null ? roundMoney(amount / quantity) : entry.unitCost;

        if (
          type === 'unresolved' ||
          amount === null ||
          ((type === 'cash_payment' || type === 'supplier_debit_adjustment') && amount <= 0)
        ) {
          issues.push({
            fileName,
            supplierName,
            sheetName,
            rowNumber: row.number,
            side,
            type,
            name: entry.name,
            code: entry.code,
            quantity: entry.quantity,
            amount,
            reason: 'Could not identify a positive amount/product ledger row',
          });
          continue;
        }

        events.push({
          fileName,
          supplierName,
          sheetName,
          rowNumber: row.number,
          side,
          sourceKey,
          type,
          date: eventDate || new Date(),
          code: entry.code,
          name: entry.name,
          quantity,
          unitCost: roundMoney(unitCost || amount),
          amount: roundMoney(amount),
        });
      }
    }

    break;
  }

  return { supplierName, fileName, sheetName, events, issues };
};

const buildProductCache = async () => {
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, barcode: true, name: true },
  });
  const byText = new Map();
  const byCompact = new Map();

  products.forEach((product) => {
    [product.sku, product.barcode].filter(Boolean).forEach((value) => {
      byText.set(cleanText(value).toUpperCase(), product);
      const compact = compactCode(value);
      if (compact) byCompact.set(compact, product);
    });
  });

  return { byText, byCompact };
};

const findCachedProduct = (cache, lookupCodes) => {
  for (const code of lookupCodes) {
    const byText = cache.byText.get(cleanText(code).toUpperCase());
    if (byText) return byText;

    const compact = compactCode(code);
    if (compact && cache.byCompact.has(compact)) return cache.byCompact.get(compact);
  }

  return null;
};

const getOrCreateProduct = async (cache, supplierId, supplierName, event) => {
  const input = normalizeProductInput({
    code: event.code,
    name: event.name,
    supplierName,
    sourceKey: event.sourceKey,
  });
  const cached = findCachedProduct(cache, input.lookupCodes);
  if (cached) return { product: cached, created: false };

  const product = await prisma.product.create({
    data: {
      sku: input.sku,
      barcode: null,
      name: input.name,
      supplierId,
      purchasePrice: event.unitCost || 0,
      salePrice: 0,
      stockQuantity: 0,
      minStockLevel: 0,
      description: `Imported from supplier workbook. ${event.sourceKey}`,
    },
    select: { id: true, sku: true, barcode: true, name: true },
  });

  cache.byText.set(cleanText(product.sku).toUpperCase(), product);
  const compact = compactCode(product.sku);
  if (compact) cache.byCompact.set(compact, product);

  return { product, created: true };
};

const getPayablePurchases = async (supplierId) => {
  const purchases = await prisma.purchase.findMany({
    where: { supplierId },
    orderBy: [{ purchaseDate: 'asc' }, { id: 'asc' }],
  });

  if (!purchases.length) return [];

  const purchaseIds = purchases.map((purchase) => purchase.id);
  const [paymentTotals, settlementTotals] = await Promise.all([
    prisma.supplierPayment.groupBy({
      by: ['purchaseId'],
      where: { purchaseId: { in: purchaseIds } },
      _sum: { amount: true },
    }),
    prisma.supplierProductSettlementAllocation.groupBy({
      by: ['purchaseId'],
      where: { purchaseId: { in: purchaseIds } },
      _sum: { amount: true },
    }),
  ]);
  const paidByPurchase = new Map();

  paymentTotals.forEach((entry) => {
    paidByPurchase.set(entry.purchaseId, toNumber(entry._sum.amount) || 0);
  });
  settlementTotals.forEach((entry) => {
    paidByPurchase.set(entry.purchaseId, (paidByPurchase.get(entry.purchaseId) || 0) + (toNumber(entry._sum.amount) || 0));
  });

  return purchases
    .map((purchase) => ({
      ...purchase,
      remainingAmount: Math.max(roundMoney(Number(purchase.totalAmount) - (paidByPurchase.get(purchase.id) || 0)), 0),
    }))
    .filter((purchase) => purchase.remainingAmount > 0);
};

const allocatePayment = async ({ supplierId, amount, paymentDate, createdBy, sourceKey, notes }) => {
  let remaining = amount;
  const purchases = await getPayablePurchases(supplierId);

  for (const purchase of purchases) {
    if (remaining <= 0) break;
    const allocation = Math.min(remaining, purchase.remainingAmount);
    if (allocation <= 0) continue;

    await prisma.supplierPayment.create({
      data: {
        supplierId,
        purchaseId: purchase.id,
        amount: allocation,
        paymentDate,
        paymentMethod: 'import',
        notes: `${notes} ${sourceKey}`,
        createdBy,
      },
    });
    remaining = roundMoney(remaining - allocation);
  }

  if (remaining > 0) {
    await prisma.supplierPayment.create({
      data: {
        supplierId,
        amount: remaining,
        paymentDate,
        paymentMethod: 'import',
        notes: `${notes} ${sourceKey} (unallocated credit)`,
        createdBy,
      },
    });
  }
};

const allocateSettlement = async ({ supplierId, settlementId, amount }) => {
  let remaining = amount;
  const purchases = await getPayablePurchases(supplierId);

  for (const purchase of purchases) {
    if (remaining <= 0) break;
    const allocation = Math.min(remaining, purchase.remainingAmount);
    if (allocation <= 0) continue;

    await prisma.supplierProductSettlementAllocation.create({
      data: {
        settlementId,
        purchaseId: purchase.id,
        amount: allocation,
      },
    });
    remaining = roundMoney(remaining - allocation);
  }
};

const commitEvents = async (parsedFiles) => {
  const createdByUser = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { id: true },
  });
  const createdBy = createdByUser?.id || null;
  const cache = await buildProductCache();
  const stats = {
    suppliersCreated: 0,
    productsCreated: 0,
    purchasesCreated: 0,
    purchaseItemsCreated: 0,
    paymentsCreated: 0,
    settlementsCreated: 0,
    skippedExisting: 0,
  };

  for (const parsed of parsedFiles) {
    let supplier = await prisma.supplier.findUnique({ where: { name: parsed.supplierName } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: parsed.supplierName,
          notes: `Created by ${IMPORT_TAG}`,
        },
      });
      stats.suppliersCreated += 1;
    }

    const events = [...parsed.events].sort((first, second) => first.date - second.date || first.rowNumber - second.rowNumber);

    for (const event of events) {
      const alreadyImported = await Promise.all([
        prisma.purchase.findFirst({
          where: { supplierId: supplier.id, notes: { contains: event.sourceKey } },
          select: { id: true },
        }),
        prisma.supplierPayment.findFirst({
          where: { supplierId: supplier.id, notes: { contains: event.sourceKey } },
          select: { id: true },
        }),
        prisma.supplierProductSettlement.findFirst({
          where: { supplierId: supplier.id, notes: { contains: event.sourceKey } },
          select: { id: true },
        }),
      ]);

      if (alreadyImported.some(Boolean)) {
        stats.skippedExisting += 1;
        continue;
      }

      if (event.type === 'received_product') {
        const { product, created } = await getOrCreateProduct(cache, supplier.id, parsed.supplierName, event);
        if (created) stats.productsCreated += 1;

        const purchase = await prisma.purchase.create({
          data: {
            supplierId: supplier.id,
            invoiceNumber: `IMP-${hashKey(event.sourceKey, 10)}`,
            purchaseDate: event.date,
            totalAmount: event.amount,
            notes: `Imported supplier product receipt from ${event.fileName} row ${event.rowNumber}. ${event.sourceKey}. Stock not changed.`,
            createdBy,
          },
          select: { id: true },
        });
        stats.purchasesCreated += 1;

        await prisma.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: product.id,
            quantity: event.quantity,
            unitCost: event.unitCost,
            lineTotal: event.amount,
          },
        });
        stats.purchaseItemsCreated += 1;
      } else if (event.type === 'supplier_debit_adjustment') {
        await prisma.purchase.create({
          data: {
            supplierId: supplier.id,
            invoiceNumber: `IMP-ADJ-${hashKey(event.sourceKey, 8)}`,
            purchaseDate: event.date,
            totalAmount: event.amount,
            notes: `Imported supplier debit/account adjustment from ${event.fileName} row ${event.rowNumber}. ${event.sourceKey}. No stock item.`,
            createdBy,
          },
        });
        stats.purchasesCreated += 1;
      } else if (event.type === 'cash_payment') {
        await allocatePayment({
          supplierId: supplier.id,
          amount: event.amount,
          paymentDate: event.date,
          createdBy,
          sourceKey: event.sourceKey,
          notes: `Imported supplier payment from ${event.fileName} row ${event.rowNumber}.`,
        });
        stats.paymentsCreated += 1;
      } else if (event.type === 'sent_product') {
        const { product, created } = await getOrCreateProduct(cache, supplier.id, parsed.supplierName, event);
        if (created) stats.productsCreated += 1;

        const settlement = await prisma.supplierProductSettlement.create({
          data: {
            supplierId: supplier.id,
            productId: product.id,
            quantity: event.quantity,
            unitCost: event.unitCost,
            amount: event.amount,
            settlementDate: event.date,
            notes: `Imported supplier product sent/settlement from ${event.fileName} row ${event.rowNumber}. ${event.sourceKey}. Stock not changed.`,
            createdBy,
          },
          select: { id: true },
        });
        await allocateSettlement({
          supplierId: supplier.id,
          settlementId: settlement.id,
          amount: event.amount,
        });
        stats.settlementsCreated += 1;
      }
    }
  }

  return stats;
};

const summarize = (parsedFiles) => {
  const aggregate = {
    files: parsedFiles.length,
    receivedProducts: 0,
    sentProducts: 0,
    cashPayments: 0,
    debitAdjustments: 0,
    issues: 0,
    receivedValue: 0,
    sentValue: 0,
    cashPaidValue: 0,
    debitAdjustmentValue: 0,
  };
  const suppliers = [];

  parsedFiles.forEach((parsed) => {
    const summary = {
      supplierName: parsed.supplierName,
      fileName: parsed.fileName,
      events: parsed.events.length,
      issues: parsed.issues.length,
      receivedProducts: 0,
      sentProducts: 0,
      cashPayments: 0,
      debitAdjustments: 0,
      receivedValue: 0,
      sentValue: 0,
      cashPaidValue: 0,
      debitAdjustmentValue: 0,
    };

    parsed.events.forEach((event) => {
      if (event.type === 'received_product') {
        summary.receivedProducts += 1;
        summary.receivedValue += event.amount;
      } else if (event.type === 'sent_product') {
        summary.sentProducts += 1;
        summary.sentValue += event.amount;
      } else if (event.type === 'cash_payment') {
        summary.cashPayments += 1;
        summary.cashPaidValue += event.amount;
      } else if (event.type === 'supplier_debit_adjustment') {
        summary.debitAdjustments += 1;
        summary.debitAdjustmentValue += event.amount;
      }
    });

    for (const key of Object.keys(summary)) {
      if (typeof summary[key] === 'number') summary[key] = roundMoney(summary[key]);
    }

    aggregate.receivedProducts += summary.receivedProducts;
    aggregate.sentProducts += summary.sentProducts;
    aggregate.cashPayments += summary.cashPayments;
    aggregate.debitAdjustments += summary.debitAdjustments;
    aggregate.issues += summary.issues;
    aggregate.receivedValue += summary.receivedValue;
    aggregate.sentValue += summary.sentValue;
    aggregate.cashPaidValue += summary.cashPaidValue;
    aggregate.debitAdjustmentValue += summary.debitAdjustmentValue;
    suppliers.push(summary);
  });

  for (const key of Object.keys(aggregate)) {
    if (typeof aggregate[key] === 'number') aggregate[key] = roundMoney(aggregate[key]);
  }

  return { aggregate, suppliers };
};

const writeReport = (payload) => {
  const outputDir = path.resolve(process.cwd(), 'import-reports');
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outputDir, `supplier-import-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8');
  return reportPath;
};

const main = async () => {
  const options = parseArgs();
  const allFiles = fs.readdirSync(options.folder)
    .filter((name) => /\.xlsx$/i.test(name) && !name.startsWith('~$'))
    .filter((name) => !options.file || name === options.file)
    .sort((first, second) => first.localeCompare(second, 'ar'));

  const parsedFiles = [];
  for (const fileName of allFiles) {
    const parsed = await parseWorkbook(path.join(options.folder, fileName));
    parsedFiles.push(parsed);
  }

  const summary = summarize(parsedFiles);
  const report = {
    mode: options.commit ? 'commit' : 'dry-run',
    folder: options.folder,
    stockPolicy: 'No product stock quantities or stock movement rows are changed by this importer.',
    ...summary,
    parsedFiles,
  };

  if (options.commit) {
    report.commit = await commitEvents(parsedFiles);
  }

  const reportPath = writeReport(report);
  console.log(JSON.stringify({ mode: report.mode, reportPath, aggregate: report.aggregate, commit: report.commit || null }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
