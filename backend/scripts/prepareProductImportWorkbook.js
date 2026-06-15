import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

import { normalizePartNumber } from "../src/utils/normalizePartNumber.js";

const defaultInputPath = "C:/Users/FCIem/Downloads/جرد جديد 3 (1).xlsx";
const defaultOutputPath = path.resolve(
  "../outputs/product-import/vtec_products_import_ready.xlsx",
);

const inputPath = process.argv[2] || defaultInputPath;
const outputPath = process.argv[3] || defaultOutputPath;

const arabicDigitMap = new Map(
  [..."٠١٢٣٤٥٦٧٨٩"].map((digit, index) => [digit, String(index)]),
);

const normalizeDigits = (value) =>
  String(value ?? "").replace(/[٠-٩]/g, (digit) => arabicDigitMap.get(digit));

const cleanText = (value) => {
  if (value === undefined || value === null) return "";

  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    if ("text" in value) return cleanText(value.text);
    if ("result" in value) return cleanText(value.result);
    if ("richText" in value) {
      return cleanText(value.richText.map((part) => part.text).join(""));
    }
  }

  return String(value).replace(/\s+/g, " ").trim();
};

const readCell = (row, index) => cleanText(row.getCell(index).value);

const parseNumber = (value, fallback = 0) => {
  const text = normalizeDigits(cleanText(value)).replace(/,/g, "");
  if (!text) return fallback;

  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
};

const parseStock = (value) => {
  const stock = Math.trunc(parseNumber(value, 0));
  return stock > 0 ? stock : 0;
};

const truncate = (value, maxLength) => {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim();
};

const buildName = ({ sku, itemType, carType }) => {
  const cleanItemType = itemType === "-" ? "" : itemType;
  return truncate(cleanItemType || carType || sku, 180);
};

const buildDescription = ({ carType, alternatePartNumber, itemType, sourceRow }) => {
  const parts = [];

  if (carType) parts.push(`Car/type: ${carType}`);
  if (alternatePartNumber) parts.push(`Alternate number: ${alternatePartNumber}`);
  if (itemType && itemType !== "-") parts.push(`Item type: ${itemType}`);
  parts.push(`Imported from source row ${sourceRow}`);

  return parts.join(" | ");
};

const readSourceRows = async () => {
  const sourceWorkbook = new ExcelJS.Workbook();
  await sourceWorkbook.xlsx.readFile(inputPath);

  const sheet = sourceWorkbook.worksheets[0];
  if (!sheet) throw new Error("The source workbook does not contain any sheets.");

  const rows = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const raw = {
      sourceRow: rowNumber,
      originalPartNumber: readCell(row, 2),
      stock: readCell(row, 3),
      salePrice: readCell(row, 4),
      carType: readCell(row, 5),
      alternatePartNumber: readCell(row, 6),
      itemType: readCell(row, 8),
      purchasePrice: readCell(row, 9),
    };

    const hasMeaningfulData = [
      raw.originalPartNumber,
      raw.stock,
      raw.salePrice,
      raw.carType,
      raw.alternatePartNumber,
      raw.itemType,
      raw.purchasePrice,
    ].some(Boolean);

    if (!hasMeaningfulData) continue;

    rows.push({
      ...raw,
      sku: normalizePartNumber(raw.originalPartNumber),
      parsedStock: parseStock(raw.stock),
      parsedSalePrice: parseNumber(raw.salePrice, 0),
      parsedPurchasePrice: parseNumber(raw.purchasePrice, 0),
    });
  }

  return {
    sheetName: sheet.name,
    rows,
  };
};

const styleHeader = (worksheet, fill = "1F4E78") => {
  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fill },
  };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 24;
};

const addBorders = (worksheet) => {
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9E2EC" } },
        left: { style: "thin", color: { argb: "FFD9E2EC" } },
        bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
        right: { style: "thin", color: { argb: "FFD9E2EC" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
};

const applyWorksheetDefaults = (worksheet) => {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  };
  worksheet.properties.defaultRowHeight = 18;
};

const writeWorkbook = async ({ sheetName, rows }) => {
  const skuCounts = new Map();
  rows.forEach((row) => {
    if (!row.sku) return;
    skuCounts.set(row.sku, (skuCounts.get(row.sku) || 0) + 1);
  });

  const readyRows = [];
  const reviewRows = [];

  rows.forEach((row) => {
    const reasons = [];
    if (!row.sku) reasons.push("Missing part number");
    if (row.sku && skuCounts.get(row.sku) > 1) reasons.push("Duplicate part number");

    const shapedRow = {
      sku: row.sku,
      barcode: row.sku,
      name: buildName({
        sku: row.sku,
        itemType: row.itemType,
        carType: row.carType,
      }),
      description: buildDescription({
        carType: row.carType,
        alternatePartNumber: row.alternatePartNumber,
        itemType: row.itemType,
        sourceRow: row.sourceRow,
      }),
      purchase_price: row.parsedPurchasePrice,
      sale_price: row.parsedSalePrice,
      initial_stock_quantity: row.parsedStock,
      min_stock_level: 0,
      location: "",
      is_active: true,
      category_name: "",
      brand_name: "",
      supplier_name: "",
      source_row: row.sourceRow,
      original_part_number: row.originalPartNumber,
      item_type: row.itemType,
      car_type: row.carType,
      alternate_part_number: row.alternatePartNumber,
    };

    if (reasons.length) {
      reviewRows.push({
        reason: reasons.join("; "),
        ...shapedRow,
      });
      return;
    }

    readyRows.push(shapedRow);
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VTEC";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summary = workbook.addWorksheet("Import_Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 34 },
    { header: "Value", key: "value", width: 60 },
  ];
  const readyMissingSale = readyRows.filter((row) => row.sale_price === 0).length;
  const readyMissingPurchase = readyRows.filter((row) => row.purchase_price === 0).length;
  const readyZeroStock = readyRows.filter((row) => row.initial_stock_quantity === 0).length;
  const itemTypeCount = new Set(
    rows.map((row) => row.itemType).filter((value) => value && value !== "-"),
  ).size;

  summary.addRows([
    ["Source file", inputPath],
    ["Source sheet", sheetName],
    ["Generated at", new Date().toISOString()],
    ["Source data rows", rows.length],
    ["Ready rows in Products_Import", readyRows.length],
    ["Rows requiring review", reviewRows.length],
    ["Rows missing part number", rows.filter((row) => !row.sku).length],
    [
      "Rows with duplicate part number",
      rows.filter((row) => row.sku && skuCounts.get(row.sku) > 1).length,
    ],
    ["Ready rows with blank sale price set to 0", readyMissingSale],
    ["Ready rows with blank purchase price set to 0", readyMissingPurchase],
    ["Ready rows with zero stock", readyZeroStock],
    ["Distinct item types in source", itemTypeCount],
    [
      "Import policy",
      "Only Products_Import is safe to import. Needs_Review rows are excluded because the database requires a unique part number.",
    ],
  ]);
  styleHeader(summary, "305496");
  addBorders(summary);
  applyWorksheetDefaults(summary);

  const productSheet = workbook.addWorksheet("Products_Import");
  productSheet.columns = [
    { header: "sku", key: "sku", width: 20 },
    { header: "barcode", key: "barcode", width: 20 },
    { header: "name", key: "name", width: 32 },
    { header: "description", key: "description", width: 70 },
    { header: "purchase_price", key: "purchase_price", width: 16 },
    { header: "sale_price", key: "sale_price", width: 14 },
    { header: "initial_stock_quantity", key: "initial_stock_quantity", width: 22 },
    { header: "min_stock_level", key: "min_stock_level", width: 16 },
    { header: "location", key: "location", width: 16 },
    { header: "is_active", key: "is_active", width: 12 },
    { header: "category_name", key: "category_name", width: 20 },
    { header: "brand_name", key: "brand_name", width: 18 },
    { header: "supplier_name", key: "supplier_name", width: 22 },
    { header: "source_row", key: "source_row", width: 12 },
    { header: "original_part_number", key: "original_part_number", width: 22 },
    { header: "item_type", key: "item_type", width: 30 },
    { header: "car_type", key: "car_type", width: 50 },
    { header: "alternate_part_number", key: "alternate_part_number", width: 24 },
  ];
  productSheet.addRows(readyRows);
  styleHeader(productSheet, "0F766E");
  addBorders(productSheet);
  applyWorksheetDefaults(productSheet);
  productSheet.getColumn("purchase_price").numFmt = "0.00";
  productSheet.getColumn("sale_price").numFmt = "0.00";
  productSheet.getColumn("initial_stock_quantity").numFmt = "0";
  productSheet.getColumn("min_stock_level").numFmt = "0";

  const reviewSheet = workbook.addWorksheet("Needs_Review");
  reviewSheet.columns = [
    { header: "reason", key: "reason", width: 26 },
    ...productSheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width,
    })),
  ];
  reviewSheet.addRows(reviewRows);
  styleHeader(reviewSheet, "B45309");
  addBorders(reviewSheet);
  applyWorksheetDefaults(reviewSheet);
  reviewSheet.getColumn("purchase_price").numFmt = "0.00";
  reviewSheet.getColumn("sale_price").numFmt = "0.00";
  reviewSheet.getColumn("initial_stock_quantity").numFmt = "0";
  reviewSheet.getColumn("min_stock_level").numFmt = "0";

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);

  return {
    outputPath,
    sourceRows: rows.length,
    readyRows: readyRows.length,
    reviewRows: reviewRows.length,
    duplicateRows: reviewRows.filter((row) =>
      String(row.reason).includes("Duplicate"),
    ).length,
    missingPartRows: reviewRows.filter((row) =>
      String(row.reason).includes("Missing"),
    ).length,
    blankSalePricesSetToZero: readyMissingSale,
    blankPurchasePricesSetToZero: readyMissingPurchase,
    zeroStockRows: readyZeroStock,
  };
};

const result = await readSourceRows().then(writeWorkbook);
console.log(JSON.stringify(result, null, 2));
