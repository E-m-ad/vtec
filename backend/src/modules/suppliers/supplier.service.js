import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import { normalizePartNumberSearch } from '../../utils/normalizePartNumber.js';
import { decoratePurchasesWithPayments } from '../purchases/purchase.service.js';
import { recordStockMovement } from '../stockMovements/stockMovement.service.js';

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const cleanText = (value) => {
  if (typeof value === 'undefined' || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const normalizePayments = ({ payments, amount = 0, payment_method = null, notes = null } = {}) => {
  if (Array.isArray(payments)) {
    return payments
      .map((payment) => {
        const paymentAmount = Number(payment.amount);

        if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
          throw createError('Payment amounts must be 0 or greater', 400);
        }

        return {
          amount: paymentAmount,
          payment_method: cleanText(payment.payment_method || payment.method) || 'cash',
          notes: cleanText(payment.notes),
        };
      })
      .filter((payment) => payment.amount > 0);
  }

  const paymentAmount = Number(amount ?? 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
    throw createError('Payment amount must be 0 or greater', 400);
  }

  if (paymentAmount <= 0) return [];

  return [
    {
      amount: paymentAmount,
      payment_method: cleanText(payment_method) || 'cash',
      notes: cleanText(notes),
    },
  ];
};

const buildSummary = (
  totalPurchasesValue = 0,
  totalPurchaseReturnsValue = 0,
  totalCashPaidValue = 0,
  totalProductSettlementValue = 0,
  supplierCreditNoteValue = 0,
  supplierCashRefundValue = 0,
  openingPayableValue = 0,
  openingCreditValue = 0,
) => {
  const openingPayable = toMoneyNumber(openingPayableValue);
  const openingCredit = toMoneyNumber(openingCreditValue);
  const grossPurchases = toMoneyNumber(totalPurchasesValue);
  const totalPurchaseReturns = toMoneyNumber(totalPurchaseReturnsValue);
  const supplierCreditNotes = toMoneyNumber(supplierCreditNoteValue);
  const supplierCashRefunds = toMoneyNumber(supplierCashRefundValue);
  const netPurchases = Math.max(grossPurchases - totalPurchaseReturns, 0);
  const totalPurchases = netPurchases + openingPayable;
  const totalCashPaid = toMoneyNumber(totalCashPaidValue);
  const totalProductSettlements = toMoneyNumber(totalProductSettlementValue);
  const totalCredits = totalProductSettlements + supplierCreditNotes + openingCredit;
  const totalPaid = totalCashPaid + totalCredits - supplierCashRefunds;
  const remainingAmount = totalPurchases - totalPaid;
  const payableAmount = Math.max(remainingAmount, 0);
  const creditAmount = Math.max(-remainingAmount, 0);

  return {
    grossPurchases,
    gross_purchases: grossPurchases,
    totalPurchases,
    total_purchases: totalPurchases,
    netPurchases,
    net_purchases: netPurchases,
    totalPurchaseReturns,
    total_purchase_returns: totalPurchaseReturns,
    totalCashPaid,
    total_cash_paid: totalCashPaid,
    totalProductSettlements,
    total_product_settlements: totalProductSettlements,
    supplierCreditNotes,
    supplier_credit_notes: supplierCreditNotes,
    supplierCashRefunds,
    supplier_cash_refunds: supplierCashRefunds,
    totalCredits,
    total_credits: totalCredits,
    openingPayable,
    opening_payable: openingPayable,
    openingCredit,
    opening_credit: openingCredit,
    totalPaid,
    total_paid: totalPaid,
    remainingAmount,
    remaining_amount: remainingAmount,
    payableAmount,
    payable_amount: payableAmount,
    creditAmount,
    credit_amount: creditAmount,
  };
};

const addPaymentAliases = (payment) => ({
  ...payment,
  supplier_id: payment.supplierId,
  purchase_id: payment.purchaseId,
  payment_date: payment.paymentDate,
  payment_method: payment.paymentMethod,
  created_by: payment.createdBy,
  created_at: payment.createdAt,
});

const addOpeningBalanceAliases = (openingBalance) => ({
  ...openingBalance,
  supplier_id: openingBalance.supplierId,
  balance_date: openingBalance.balanceDate,
  created_by: openingBalance.createdBy,
  created_at: openingBalance.createdAt,
});

const addProductSettlementAliases = (settlement) => ({
  ...settlement,
  supplier_id: settlement.supplierId,
  purchase_id: settlement.purchaseId,
  product_id: settlement.productId,
  unit_cost: settlement.unitCost,
  settlement_date: settlement.settlementDate,
  created_by: settlement.createdBy,
  created_at: settlement.createdAt,
});

const addSupplierRefundAliases = (refund) => ({
  ...refund,
  supplier_id: refund.supplierId,
  purchase_id: refund.purchaseId,
  refund_date: refund.refundDate,
  payment_method: refund.paymentMethod,
  created_by: refund.createdBy,
  created_at: refund.createdAt,
});

const addPurchaseReturnAliases = (purchaseReturn) => ({
  ...purchaseReturn,
  purchase_id: purchaseReturn.purchaseId,
  supplier_id: purchaseReturn.supplierId,
  return_number: purchaseReturn.returnNumber,
  return_date: purchaseReturn.returnDate,
  total_amount: purchaseReturn.totalAmount,
  created_by: purchaseReturn.createdBy,
  created_at: purchaseReturn.createdAt,
});

const normalizePagination = ({ limit = 10, offset = 0 } = {}) => {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), 100)
      : 10;
  const safeOffset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 0;

  return {
    limit: safeLimit,
    offset: safeOffset,
  };
};

const buildProductSearchFilter = (search) => {
  const query = cleanText(search);
  if (!query) return {};

  const normalizedSearch = normalizePartNumberSearch(query);
  const partNumberSearches = [query, normalizedSearch].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );

  return {
    product: {
      is: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          ...partNumberSearches.flatMap((value) => [
            { sku: { contains: value, mode: 'insensitive' } },
            { barcode: { contains: value, mode: 'insensitive' } },
          ]),
          {
            category: {
              is: { name: { contains: query, mode: 'insensitive' } },
            },
          },
          {
            brand: {
              is: { name: { contains: query, mode: 'insensitive' } },
            },
          },
        ],
      },
    },
  };
};

const decorateSuppliersWithBalances = async (suppliers, client = prisma) => {
  if (!Array.isArray(suppliers) || suppliers.length === 0) return [];

  const supplierIds = suppliers.map((supplier) => supplier.id);
  const [
    purchaseTotals,
    purchaseReturnTotals,
    paymentTotals,
    productSettlementTotals,
    supplierRefundTotals,
    openingTotals,
  ] = await Promise.all([
    client.purchase.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: {
          in: supplierIds,
        },
      },
      _sum: {
        totalAmount: true,
      },
    }),
    client.purchaseReturn.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: {
          in: supplierIds,
        },
      },
      _sum: {
        totalAmount: true,
      },
    }),
    client.supplierPayment.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: {
          in: supplierIds,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    client.supplierProductSettlement.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: {
          in: supplierIds,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    client.supplierRefund.groupBy({
      by: ['supplierId', 'type'],
      where: {
        supplierId: {
          in: supplierIds,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    client.supplierOpeningBalance.groupBy({
      by: ['supplierId', 'type'],
      where: {
        supplierId: {
          in: supplierIds,
        },
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const purchaseMap = new Map(
    purchaseTotals.map((entry) => [entry.supplierId, toMoneyNumber(entry._sum.totalAmount)]),
  );
  const purchaseReturnMap = new Map(
    purchaseReturnTotals.map((entry) => [entry.supplierId, toMoneyNumber(entry._sum.totalAmount)]),
  );
  const paymentMap = new Map(
    paymentTotals.map((entry) => [entry.supplierId, toMoneyNumber(entry._sum.amount)]),
  );
  const productSettlementMap = new Map(
    productSettlementTotals.map((entry) => [
      entry.supplierId,
      toMoneyNumber(entry._sum.amount),
    ]),
  );
  const openingPayableMap = new Map();
  const openingCreditMap = new Map();
  const supplierCreditNoteMap = new Map();
  const supplierCashRefundMap = new Map();

  openingTotals.forEach((entry) => {
    const targetMap = entry.type === 'credit' ? openingCreditMap : openingPayableMap;
    targetMap.set(entry.supplierId, toMoneyNumber(entry._sum.amount));
  });

  supplierRefundTotals.forEach((entry) => {
    const targetMap = entry.type === 'cash_refund' ? supplierCashRefundMap : supplierCreditNoteMap;
    targetMap.set(entry.supplierId, toMoneyNumber(entry._sum.amount));
  });

  return suppliers.map((supplier) => ({
    ...supplier,
    ...buildSummary(
      purchaseMap.get(supplier.id),
      purchaseReturnMap.get(supplier.id),
      paymentMap.get(supplier.id),
      productSettlementMap.get(supplier.id),
      supplierCreditNoteMap.get(supplier.id),
      supplierCashRefundMap.get(supplier.id),
      openingPayableMap.get(supplier.id),
      openingCreditMap.get(supplier.id),
    ),
  }));
};

export const getSupplierPaymentSummary = async (supplierId, client = prisma) => {
  const id = Number(supplierId);
  const [
    purchaseTotal,
    purchaseReturnTotal,
    paymentTotal,
    productSettlementTotal,
    supplierRefundTotals,
    openingTotals,
  ] = await Promise.all([
    client.purchase.aggregate({
      where: { supplierId: id },
      _sum: { totalAmount: true },
    }),
    client.purchaseReturn.aggregate({
      where: { supplierId: id },
      _sum: { totalAmount: true },
    }),
    client.supplierPayment.aggregate({
      where: { supplierId: id },
      _sum: { amount: true },
    }),
    client.supplierProductSettlement.aggregate({
      where: { supplierId: id },
      _sum: { amount: true },
    }),
    client.supplierRefund.groupBy({
      by: ['type'],
      where: { supplierId: id },
      _sum: { amount: true },
    }),
    client.supplierOpeningBalance.groupBy({
      by: ['type'],
      where: { supplierId: id },
      _sum: { amount: true },
    }),
  ]);
  const openingPayable = openingTotals.find((entry) => entry.type === 'payable');
  const openingCredit = openingTotals.find((entry) => entry.type === 'credit');
  const supplierCreditNote = supplierRefundTotals.find((entry) => entry.type === 'credit_note');
  const supplierCashRefund = supplierRefundTotals.find((entry) => entry.type === 'cash_refund');

  return buildSummary(
    purchaseTotal._sum.totalAmount,
    purchaseReturnTotal._sum.totalAmount,
    paymentTotal._sum.amount,
    productSettlementTotal._sum.amount,
    supplierCreditNote?._sum.amount,
    supplierCashRefund?._sum.amount,
    openingPayable?._sum.amount,
    openingCredit?._sum.amount,
  );
};

export const listSuppliers = async ({ search } = {}) => {
  const query = String(search || '').trim();

  const suppliers = await prisma.supplier.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { contactName: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { name: 'asc' },
  });

  return decorateSuppliersWithBalances(suppliers);
};

export const getSupplierById = async (id) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: Number(id) },
  });

  if (!supplier) {
    throw createError('Supplier not found', 404);
  }

  const summary = await getSupplierPaymentSummary(id);

  return {
    ...supplier,
    ...summary,
  };
};

export const getSupplierDetails = async (id) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: Number(id) },
  });

  if (!supplier) {
    throw createError('Supplier not found', 404);
  }

  const [
    summary,
    purchases,
    payments,
    productSettlements,
    refunds,
    purchaseReturns,
    openingBalances,
  ] = await Promise.all([
    getSupplierPaymentSummary(id),
    prisma.purchase.findMany({
      where: { supplierId: Number(id) },
      include: {
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.supplierPayment.findMany({
      where: { supplierId: Number(id) },
      include: {
        purchase: {
          select: {
            id: true,
            invoiceNumber: true,
            purchaseDate: true,
            totalAmount: true,
          },
        },
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.supplierProductSettlement.findMany({
      where: { supplierId: Number(id) },
      include: {
        purchase: {
          select: {
            id: true,
            invoiceNumber: true,
            purchaseDate: true,
            totalAmount: true,
          },
        },
        product: {
          select: {
            sku: true,
            name: true,
          },
        },
        creator: {
          select: { name: true },
        },
        allocations: {
          include: {
            purchase: {
              select: {
                id: true,
                invoiceNumber: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: [{ settlementDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.supplierRefund.findMany({
      where: { supplierId: Number(id) },
      include: {
        purchase: {
          select: {
            id: true,
            invoiceNumber: true,
            purchaseDate: true,
            totalAmount: true,
          },
        },
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ refundDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.purchaseReturn.findMany({
      where: { supplierId: Number(id) },
      include: {
        purchase: {
          select: {
            id: true,
            invoiceNumber: true,
            purchaseDate: true,
            totalAmount: true,
          },
        },
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ returnDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.supplierOpeningBalance.findMany({
      where: { supplierId: Number(id) },
      include: {
        creator: {
          select: { name: true },
        },
      },
      orderBy: [{ balanceDate: 'desc' }, { id: 'desc' }],
    }),
  ]);

  return {
    supplier: {
      ...supplier,
      ...summary,
    },
    summary,
    purchases: await decoratePurchasesWithPayments(purchases),
    payments: payments.map(addPaymentAliases),
    refunds: refunds.map(addSupplierRefundAliases),
    supplier_refunds: refunds.map(addSupplierRefundAliases),
    purchase_returns: purchaseReturns.map(addPurchaseReturnAliases),
    purchaseReturns: purchaseReturns.map(addPurchaseReturnAliases),
    opening_balances: openingBalances.map(addOpeningBalanceAliases),
    openingBalances: openingBalances.map(addOpeningBalanceAliases),
    product_settlements: productSettlements.map(addProductSettlementAliases),
    productSettlements: productSettlements.map(addProductSettlementAliases),
  };
};

export const getSupplierPurchasedProducts = async (
  id,
  { search, limit = 10, offset = 0 } = {},
) => {
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true },
  });

  if (!supplier) {
    throw createError('Supplier not found', 404);
  }

  const pagination = normalizePagination({ limit, offset });
  const purchaseItemWhere = {
    purchase: { supplierId },
    ...buildProductSearchFilter(search),
  };
  const productSettlementWhere = {
    supplierId,
    ...buildProductSearchFilter(search),
  };

  const [groupedItems, groupedSettlements] = await Promise.all([
    prisma.purchaseItem.groupBy({
      by: ['productId'],
      where: purchaseItemWhere,
      _count: { _all: true },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
    }),
    prisma.supplierProductSettlement.groupBy({
      by: ['productId'],
      where: productSettlementWhere,
      _count: { _all: true },
      _sum: {
        quantity: true,
        amount: true,
      },
    }),
  ]);

  const allProductIds = Array.from(
    new Set([
      ...groupedItems.map((item) => item.productId),
      ...groupedSettlements.map((item) => item.productId),
    ]),
  );
  const productSummaries = new Map(
    groupedItems.map((item) => [
      item.productId,
      {
        purchasedQuantity: Number(item._sum.quantity || 0),
        purchasedValue: toMoneyNumber(item._sum.lineTotal),
        lineCount: Number(item._count._all || 0),
        sentQuantity: 0,
        sentValue: 0,
        settlementCount: 0,
      },
    ]),
  );

  groupedSettlements.forEach((item) => {
    const current =
      productSummaries.get(item.productId) || {
        purchasedQuantity: 0,
        purchasedValue: 0,
        lineCount: 0,
        sentQuantity: 0,
        sentValue: 0,
        settlementCount: 0,
      };

    current.sentQuantity = Number(item._sum.quantity || 0);
    current.sentValue = toMoneyNumber(item._sum.amount);
    current.settlementCount = Number(item._count._all || 0);
    productSummaries.set(item.productId, current);
  });

  const products = allProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: allProductIds } },
        include: {
          category: { select: { name: true } },
          brand: { select: { name: true } },
        },
      })
    : [];

  const productRows = products
    .map((product) => {
      const summary = productSummaries.get(product.id) || {};

      return {
        id: product.id,
        sku: product.sku,
        barcode: product.barcode || product.sku,
        part_number: product.sku,
        name: product.name,
        description: product.description,
        category: product.category,
        category_name: product.category?.name || null,
        brand: product.brand,
        brand_name: product.brand?.name || null,
        purchasePrice: product.purchasePrice,
        purchase_price: product.purchasePrice,
        salePrice: product.salePrice,
        sale_price: product.salePrice,
        stockQuantity: product.stockQuantity,
        stock_quantity: product.stockQuantity,
        purchasedQuantity: summary.purchasedQuantity || 0,
        purchased_quantity: summary.purchasedQuantity || 0,
        purchasedValue: summary.purchasedValue || 0,
        purchased_value: summary.purchasedValue || 0,
        purchaseLineCount: summary.lineCount || 0,
        purchase_line_count: summary.lineCount || 0,
        sentQuantity: summary.sentQuantity || 0,
        sent_quantity: summary.sentQuantity || 0,
        sentValue: summary.sentValue || 0,
        sent_value: summary.sentValue || 0,
        settlementCount: summary.settlementCount || 0,
        settlement_count: summary.settlementCount || 0,
        netQuantity: (summary.purchasedQuantity || 0) - (summary.sentQuantity || 0),
        net_quantity: (summary.purchasedQuantity || 0) - (summary.sentQuantity || 0),
        netValue: (summary.purchasedValue || 0) - (summary.sentValue || 0),
        net_value: (summary.purchasedValue || 0) - (summary.sentValue || 0),
      };
    })
    .sort((first, second) =>
      String(first.name || '').localeCompare(String(second.name || ''), 'ar', {
        sensitivity: 'base',
      }),
    );

  const total = productRows.length;
  const pagedProducts = productRows.slice(pagination.offset, pagination.offset + pagination.limit);
  const pagedProductIds = pagedProducts.map((product) => product.id);

  const [purchaseItems, settlements] = pagedProductIds.length
    ? await Promise.all([
        prisma.purchaseItem.findMany({
          where: {
            productId: { in: pagedProductIds },
            purchase: { supplierId },
          },
          include: {
            purchase: {
              select: {
                id: true,
                invoiceNumber: true,
                purchaseDate: true,
                totalAmount: true,
              },
            },
          },
          orderBy: [{ purchaseId: 'desc' }, { id: 'desc' }],
        }),
        prisma.supplierProductSettlement.findMany({
          where: {
            productId: { in: pagedProductIds },
            supplierId,
          },
          orderBy: [{ settlementDate: 'desc' }, { id: 'desc' }],
        }),
      ])
    : [[], []];

  const invoiceMaps = new Map();
  purchaseItems.forEach((item) => {
    if (!invoiceMaps.has(item.productId)) {
      invoiceMaps.set(item.productId, new Map());
    }

    const productInvoiceMap = invoiceMaps.get(item.productId);
    const purchaseId = item.purchaseId;
    const current =
      productInvoiceMap.get(purchaseId) || {
        id: item.purchase.id,
        invoiceNumber: item.purchase.invoiceNumber,
        invoice_number: item.purchase.invoiceNumber,
        purchaseDate: item.purchase.purchaseDate,
        purchase_date: item.purchase.purchaseDate,
        invoiceTotal: toMoneyNumber(item.purchase.totalAmount),
        invoice_total: toMoneyNumber(item.purchase.totalAmount),
        quantity: 0,
        lineTotal: 0,
        line_total: 0,
      };

    current.quantity += Number(item.quantity || 0);
    current.lineTotal += toMoneyNumber(item.lineTotal);
    current.line_total = current.lineTotal;
    current.unitCost = current.quantity > 0 ? current.lineTotal / current.quantity : 0;
    current.unit_cost = current.unitCost;
    productInvoiceMap.set(purchaseId, current);
  });

  const settlementMaps = new Map();
  settlements.forEach((settlement) => {
    if (!settlementMaps.has(settlement.productId)) {
      settlementMaps.set(settlement.productId, []);
    }

    settlementMaps.get(settlement.productId).push({
      id: settlement.id,
      settlementDate: settlement.settlementDate,
      settlement_date: settlement.settlementDate,
      quantity: settlement.quantity,
      unitCost: settlement.unitCost,
      unit_cost: settlement.unitCost,
      amount: settlement.amount,
      notes: settlement.notes,
    });
  });

  const productsWithInvoices = pagedProducts.map((product) => {
    const invoices = Array.from(invoiceMaps.get(product.id)?.values() || [])
      .map((invoice) => ({
        ...invoice,
        lineTotal: Math.round(invoice.lineTotal * 100) / 100,
        line_total: Math.round(invoice.lineTotal * 100) / 100,
        unitCost: Math.round(invoice.unitCost * 100) / 100,
        unit_cost: Math.round(invoice.unitCost * 100) / 100,
      }))
      .sort((first, second) => {
        const firstDate = new Date(first.purchaseDate).getTime();
        const secondDate = new Date(second.purchaseDate).getTime();
        return secondDate - firstDate || second.id - first.id;
      });

    return {
      ...product,
      invoiceCount: invoices.length,
      invoice_count: invoices.length,
      invoices,
      settlements: settlementMaps.get(product.id) || [],
    };
  });

  const page = Math.floor(pagination.offset / pagination.limit) + 1;
  const pageCount = Math.max(Math.ceil(total / pagination.limit), 1);

  return {
    products: productsWithInvoices,
    pagination: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      page,
      page_count: pageCount,
      has_previous: pagination.offset > 0,
      has_next: pagination.offset + pagination.limit < total,
    },
  };
};

export const createSupplier = async ({
  name,
  contact_name = null,
  phone = null,
  email = null,
  address = null,
  tax_number = null,
  notes = null,
}) => {
  if (!name) {
    throw createError('Supplier name is required', 400);
  }

  return prisma.supplier.create({
    data: {
      name: name.trim(),
      contactName: contact_name,
      phone,
      email,
      address,
      taxNumber: tax_number,
      notes,
    },
  });
};

export const updateSupplier = async (
  id,
  { name, contact_name, phone, email, address, tax_number, notes },
) => {
  const data = {};

  if (typeof name !== 'undefined') data.name = name.trim();
  if (typeof contact_name !== 'undefined') data.contactName = contact_name;
  if (typeof phone !== 'undefined') data.phone = phone;
  if (typeof email !== 'undefined') data.email = email;
  if (typeof address !== 'undefined') data.address = address;
  if (typeof tax_number !== 'undefined') data.taxNumber = tax_number;
  if (typeof notes !== 'undefined') data.notes = notes;

  try {
    return await prisma.supplier.update({
      where: { id: Number(id) },
      data,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw createError('Supplier not found', 404);
    }

    throw error;
  }
};

export const createSupplierOpeningBalance = async (
  id,
  { type = 'payable', amount, balance_date = new Date(), notes = null },
  createdBy,
) => {
  const supplierId = Number(id);
  const parsedAmount = Number(amount);
  const balanceDate = new Date(balance_date);
  const balanceType = cleanText(type) || 'payable';

  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  if (!['payable', 'credit'].includes(balanceType)) {
    throw createError('Opening balance type must be payable or credit', 400);
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw createError('Opening balance amount must be greater than 0', 400);
  }

  if (Number.isNaN(balanceDate.getTime())) {
    throw createError('Opening balance date is invalid', 400);
  }

  try {
    await prisma.supplierOpeningBalance.create({
      data: {
        supplierId,
        type: balanceType,
        amount: parsedAmount,
        balanceDate,
        notes: cleanText(notes),
        createdBy: createdBy ? Number(createdBy) : null,
      },
    });

    return getSupplierDetails(supplierId);
  } catch (error) {
    if (error.code === 'P2003') {
      throw createError('Invalid supplier or user reference', 400);
    }

    throw error;
  }
};

const getPayablePurchases = async (supplierId, client) => {
  const purchases = await client.purchase.findMany({
    where: { supplierId },
    orderBy: [{ purchaseDate: 'asc' }, { id: 'asc' }],
  });

  const decoratedPurchases = await decoratePurchasesWithPayments(purchases, client);

  return decoratedPurchases.filter((purchase) => Number(purchase.remainingAmount) > 0);
};

const allocateProductSettlement = async (
  client,
  {
    supplierId,
    settlementId,
    purchaseId = null,
    amount,
  },
) => {
  if (purchaseId) {
    const purchase = await client.purchase.findFirst({
      where: { id: Number(purchaseId), supplierId },
    });

    if (!purchase) {
      throw createError('Purchase invoice not found for this supplier', 404);
    }

    const [decoratedPurchase] = await decoratePurchasesWithPayments([purchase], client);
    if (amount > Number(decoratedPurchase.remainingAmount)) {
      throw createError(
        'Product settlement cannot be greater than selected invoice remaining balance',
        400,
      );
    }

    await client.supplierProductSettlementAllocation.create({
      data: {
        settlementId,
        purchaseId: Number(purchaseId),
        amount,
      },
    });

    return;
  }

  let remainingAmount = amount;
  const payablePurchases = await getPayablePurchases(supplierId, client);

  for (const purchase of payablePurchases) {
    if (remainingAmount <= 0) break;

    const allocation = Math.min(remainingAmount, Number(purchase.remainingAmount));
    if (allocation <= 0) continue;

    await client.supplierProductSettlementAllocation.create({
      data: {
        settlementId,
        purchaseId: purchase.id,
        amount: allocation,
      },
    });

    remainingAmount -= allocation;
  }
};

export const createSupplierProductSettlement = async (
  id,
  {
    product_id,
    quantity,
    unit_cost = undefined,
    settlement_date = new Date(),
    notes = null,
    purchase_id = null,
  },
  createdBy,
) => {
  const supplierId = Number(id);
  const productId = Number(product_id);
  const parsedQuantity = Number(quantity);
  const selectedPurchaseId =
    purchase_id === undefined || purchase_id === null || purchase_id === ''
      ? null
      : Number(purchase_id);

  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  if (!Number.isInteger(productId)) {
    throw createError('Choose a product', 400);
  }

  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
    throw createError('Quantity must be a positive integer', 400);
  }

  if (selectedPurchaseId !== null && !Number.isInteger(selectedPurchaseId)) {
    throw createError('Invalid purchase invoice', 400);
  }

  const settlementDate = new Date(settlement_date);
  if (Number.isNaN(settlementDate.getTime())) {
    throw createError('Settlement date is invalid', 400);
  }

  try {
    await prisma.$transaction(async (client) => {
      const [supplier, product] = await Promise.all([
        client.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true },
        }),
        client.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            name: true,
            purchasePrice: true,
            stockQuantity: true,
          },
        }),
      ]);

      if (!supplier) {
        throw createError('Supplier not found', 404);
      }

      if (!product) {
        throw createError('Product not found', 404);
      }

      const parsedUnitCost =
        typeof unit_cost === 'undefined' || unit_cost === null || unit_cost === ''
          ? toMoneyNumber(product.purchasePrice)
          : Number(unit_cost);

      if (!Number.isFinite(parsedUnitCost) || parsedUnitCost <= 0) {
        throw createError('Unit cost must be greater than 0', 400);
      }

      if (parsedQuantity > Number(product.stockQuantity)) {
        throw createError('Insufficient stock for this product settlement', 400, {
          product_id: productId,
          available_quantity: product.stockQuantity,
          requested_quantity: parsedQuantity,
        });
      }

      const amount = Math.round(parsedQuantity * parsedUnitCost * 100) / 100;
      const settlement = await client.supplierProductSettlement.create({
        data: {
          supplierId,
          productId,
          purchaseId: selectedPurchaseId,
          quantity: parsedQuantity,
          unitCost: parsedUnitCost,
          amount,
          settlementDate,
          notes: cleanText(notes),
          createdBy: createdBy ? Number(createdBy) : null,
        },
        select: { id: true },
      });

      await allocateProductSettlement(client, {
        supplierId,
        settlementId: settlement.id,
        purchaseId: selectedPurchaseId,
        amount,
      });

      await recordStockMovement(client, {
        productId,
        movementType: 'PURCHASE_RETURN',
        quantityChange: -parsedQuantity,
        referenceType: 'supplier_product_settlement',
        referenceId: settlement.id,
        notes: cleanText(notes) || `Product settlement with supplier #${supplierId}`,
        createdBy,
      });
    });

    return getSupplierDetails(supplierId);
  } catch (error) {
    if (error.code === 'P2003') {
      throw createError('Invalid supplier, product, purchase, or user reference', 400);
    }

    throw error;
  }
};

export const createSupplierPayment = async (
  id,
  { amount, payment_date = new Date(), payment_method = null, notes = null, purchase_id = null, payments = undefined },
  createdBy,
) => {
  const supplierId = Number(id);
  const parsedPayments = normalizePayments({ payments, amount, payment_method, notes });
  const paymentAmount = parsedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const paymentDate = new Date(payment_date);

  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  if (paymentAmount <= 0) {
    throw createError('Payment amount must be greater than 0', 400);
  }

  if (Number.isNaN(paymentDate.getTime())) {
    throw createError('Payment date is invalid', 400);
  }

  try {
    await prisma.$transaction(async (client) => {
      const supplier = await client.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });

      if (!supplier) {
        throw createError('Supplier not found', 404);
      }

      const summary = await getSupplierPaymentSummary(supplierId, client);
      if (paymentAmount > summary.payableAmount) {
        throw createError('Payment cannot be greater than supplier remaining balance', 400);
      }

      const commonData = {
        supplierId,
        paymentDate,
        createdBy: createdBy ? Number(createdBy) : null,
      };

      if (purchase_id) {
        const purchaseId = Number(purchase_id);
        const purchase = await client.purchase.findFirst({
          where: { id: purchaseId, supplierId },
        });

        if (!purchase) {
          throw createError('Purchase invoice not found for this supplier', 404);
        }

        const [decoratedPurchase] = await decoratePurchasesWithPayments([purchase], client);
        if (paymentAmount > decoratedPurchase.remainingAmount) {
          throw createError('Payment cannot be greater than selected invoice remaining balance', 400);
        }

        for (const payment of parsedPayments) {
          await client.supplierPayment.create({
            data: {
              ...commonData,
              purchaseId,
              amount: payment.amount,
              paymentMethod: payment.payment_method,
              notes: payment.notes,
            },
          });
        }

        return;
      }

      let remainingPayment = paymentAmount;
      const payablePurchases = await getPayablePurchases(supplierId, client);

      for (const purchase of payablePurchases) {
        if (remainingPayment <= 0) break;

        const allocation = Math.min(remainingPayment, Number(purchase.remainingAmount));
        let allocationLeft = allocation;

        for (const payment of parsedPayments) {
          if (allocationLeft <= 0 || payment.amount <= 0) continue;

          const paymentAllocation = Math.min(allocationLeft, payment.amount);
          await client.supplierPayment.create({
            data: {
              ...commonData,
              purchaseId: purchase.id,
              amount: paymentAllocation,
              paymentMethod: payment.payment_method,
              notes: payment.notes,
            },
          });

          payment.amount -= paymentAllocation;
          allocationLeft -= paymentAllocation;
        }

        remainingPayment -= allocation;
      }

      for (const payment of parsedPayments) {
        if (payment.amount <= 0) continue;

        await client.supplierPayment.create({
          data: {
            ...commonData,
            amount: payment.amount,
            paymentMethod: payment.payment_method,
            notes: payment.notes || 'Opening balance / account payment',
          },
        });
      }
    });

    return getSupplierDetails(supplierId);
  } catch (error) {
    if (error.code === 'P2003') {
      throw createError('Invalid supplier, purchase, or user reference', 400);
    }

    throw error;
  }
};

export const createSupplierRefund = async (
  id,
  {
    type = 'credit_note',
    amount,
    refund_date = new Date(),
    payment_method = null,
    notes = null,
    purchase_id = null,
  },
  createdBy,
) => {
  const supplierId = Number(id);
  const parsedAmount = Number(amount);
  const refundDate = new Date(refund_date);
  const refundType = cleanText(type) || 'credit_note';
  const selectedPurchaseId =
    purchase_id === undefined || purchase_id === null || purchase_id === ''
      ? null
      : Number(purchase_id);

  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  if (!['credit_note', 'cash_refund'].includes(refundType)) {
    throw createError('Supplier refund type must be credit_note or cash_refund', 400);
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw createError('Refund amount must be greater than 0', 400);
  }

  if (Number.isNaN(refundDate.getTime())) {
    throw createError('Refund date is invalid', 400);
  }

  if (selectedPurchaseId !== null && !Number.isInteger(selectedPurchaseId)) {
    throw createError('Invalid purchase invoice', 400);
  }

  try {
    await prisma.$transaction(async (client) => {
      const supplier = await client.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });

      if (!supplier) {
        throw createError('Supplier not found', 404);
      }

      const summary = await getSupplierPaymentSummary(supplierId, client);

      if (refundType === 'cash_refund') {
        if (parsedAmount > summary.creditAmount) {
          throw createError('Cash refund cannot be greater than supplier credit balance', 400);
        }
      } else if (selectedPurchaseId) {
        const purchase = await client.purchase.findFirst({
          where: { id: selectedPurchaseId, supplierId },
        });

        if (!purchase) {
          throw createError('Purchase invoice not found for this supplier', 404);
        }

        const [decoratedPurchase] = await decoratePurchasesWithPayments([purchase], client);
        if (parsedAmount > Number(decoratedPurchase.remainingAmount)) {
          throw createError('Credit note cannot be greater than selected invoice remaining balance', 400);
        }
      } else if (parsedAmount > summary.payableAmount) {
        throw createError('Credit note cannot be greater than supplier payable balance', 400);
      }

      await client.supplierRefund.create({
        data: {
          supplierId,
          purchaseId: refundType === 'credit_note' ? selectedPurchaseId : null,
          type: refundType,
          amount: parsedAmount,
          refundDate,
          paymentMethod: refundType === 'cash_refund' ? cleanText(payment_method) || 'cash' : null,
          notes: cleanText(notes),
          createdBy: createdBy ? Number(createdBy) : null,
        },
      });
    });

    return getSupplierDetails(supplierId);
  } catch (error) {
    if (error.code === 'P2003') {
      throw createError('Invalid supplier, purchase, or user reference', 400);
    }

    throw error;
  }
};

export const deleteSupplier = async (id) => {
  try {
    return await prisma.supplier.delete({
      where: { id: Number(id) },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw createError('Supplier not found', 404);
    }

    if (error.code === 'P2003') {
      throw createError('Supplier cannot be deleted because it has linked history', 409);
    }

    throw error;
  }
};
