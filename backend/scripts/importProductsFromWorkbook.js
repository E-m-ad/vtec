import ExcelJS from "exceljs";

import prisma from "../src/config/db.js";
import { createProduct } from "../src/modules/products/product.service.js";
import { normalizePartNumber } from "../src/utils/normalizePartNumber.js";

const defaultInputPath = "../outputs/product-import/vtec_products_import_ready.xlsx";
const inputPath = process.argv[2] || defaultInputPath;
const isDryRun = process.argv.includes("--dry-run");

const arabicDigitMap = new Map(
  [..."٠١٢٣٤٥٦٧٨٩"].map((digit, index) => [digit, String(index)]),
);

const normalizeDigits = (value) =>
  String(value ?? "").replace(/[٠-٩]/g, (digit) => arabicDigitMap.get(digit));

const cleanText = (value) => {
  if (value === undefined || value === null) return "";

  if (typeof value === "object") {
    if ("text" in value) return cleanText(value.text);
    if ("result" in value) return cleanText(value.result);
    if ("richText" in value) {
      return cleanText(value.richText.map((part) => part.text).join(""));
    }
  }

  return String(value).replace(/\s+/g, " ").trim();
};

const parseNumber = (value, fallback = 0) => {
  const text = normalizeDigits(cleanText(value)).replace(/,/g, "");
  if (!text) return fallback;

  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
};

const parseInteger = (value, fallback = 0) => {
  const number = Math.trunc(parseNumber(value, fallback));
  return number >= 0 ? number : fallback;
};

const parseBoolean = (value) => {
  const text = cleanText(value).toLowerCase();
  if (!text) return true;
  return !["false", "0", "no", "inactive"].includes(text);
};

const truncate = (value, maxLength) => {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim();
};

const rowValue = (row, headers, key) => {
  const index = headers.get(key);
  return index ? row.getCell(index).value : "";
};

const readProducts = async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);

  const sheet = workbook.getWorksheet("Products_Import");
  if (!sheet) {
    throw new Error("Products_Import sheet is missing.");
  }

  const headers = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    headers.set(cleanText(cell.value), columnNumber);
  });

  const requiredHeaders = [
    "sku",
    "name",
    "purchase_price",
    "sale_price",
    "initial_stock_quantity",
    "min_stock_level",
  ];
  const missingHeaders = requiredHeaders.filter((header) => !headers.has(header));
  if (missingHeaders.length) {
    throw new Error(`Missing headers: ${missingHeaders.join(", ")}`);
  }

  const products = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rawSku = cleanText(rowValue(row, headers, "sku"));
    const rawName = cleanText(rowValue(row, headers, "name"));

    if (!rawSku && !rawName) continue;

    const sku = normalizePartNumber(rawSku);
    const name = truncate(rawName || sku, 180);

    products.push({
      rowNumber,
      sku,
      name,
      description: cleanText(rowValue(row, headers, "description")) || null,
      purchase_price: parseNumber(rowValue(row, headers, "purchase_price"), 0),
      sale_price: parseNumber(rowValue(row, headers, "sale_price"), 0),
      initial_stock_quantity: parseInteger(
        rowValue(row, headers, "initial_stock_quantity"),
        0,
      ),
      min_stock_level: parseInteger(rowValue(row, headers, "min_stock_level"), 0),
      location: truncate(rowValue(row, headers, "location"), 120) || null,
      is_active: parseBoolean(rowValue(row, headers, "is_active")),
      category_name: truncate(rowValue(row, headers, "category_name"), 120),
      brand_name: truncate(rowValue(row, headers, "brand_name"), 120),
      supplier_name: truncate(rowValue(row, headers, "supplier_name"), 160),
    });
  }

  return products;
};

const validateProducts = (products) => {
  const errors = [];
  const skuCounts = new Map();

  products.forEach((product) => {
    if (product.sku) {
      skuCounts.set(product.sku, (skuCounts.get(product.sku) || 0) + 1);
    }
  });

  products.forEach((product) => {
    if (!product.sku) {
      errors.push(`Row ${product.rowNumber}: SKU is required.`);
    }
    if (!product.name) {
      errors.push(`Row ${product.rowNumber}: name is required.`);
    }
    if (product.sku && skuCounts.get(product.sku) > 1) {
      errors.push(`Row ${product.rowNumber}: duplicate SKU ${product.sku}.`);
    }
    if (product.purchase_price < 0 || product.sale_price < 0) {
      errors.push(`Row ${product.rowNumber}: prices must be 0 or greater.`);
    }
    if (
      !Number.isInteger(product.initial_stock_quantity) ||
      product.initial_stock_quantity < 0
    ) {
      errors.push(`Row ${product.rowNumber}: stock must be a non-negative integer.`);
    }
  });

  return errors;
};

const getOrCreateLookup = async (model, name) => {
  const cleanName = cleanText(name);
  if (!cleanName) return null;

  return prisma[model].upsert({
    where: { name: cleanName },
    update: {},
    create: { name: cleanName },
    select: { id: true },
  });
};

const main = async () => {
  const products = await readProducts();
  const validationErrors = validateProducts(products);

  if (validationErrors.length) {
    throw new Error(
      `Import validation failed:\n${validationErrors.slice(0, 50).join("\n")}`,
    );
  }

  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: products.map((product) => product.sku) } },
    select: { sku: true },
  });
  const existingSkus = new Set(existingProducts.map((product) => product.sku));
  const productsToCreate = products.filter((product) => !existingSkus.has(product.sku));

  const importUser = await prisma.user.findFirst({
    where: { email: "admin@example.com" },
    select: { id: true },
  });

  const summary = {
    inputPath,
    dryRun: isDryRun,
    rowsRead: products.length,
    existingSkipped: existingSkus.size,
    rowsToCreate: productsToCreate.length,
    openingStockMovementsToCreate: productsToCreate.filter(
      (product) => product.initial_stock_quantity > 0,
    ).length,
    openingStockQuantity: productsToCreate.reduce(
      (sum, product) => sum + product.initial_stock_quantity,
      0,
    ),
    importUserId: importUser?.id || null,
  };

  if (isDryRun || productsToCreate.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  let created = 0;

  for (const product of productsToCreate) {
    const [category, brand, supplier] = await Promise.all([
      getOrCreateLookup("category", product.category_name),
      getOrCreateLookup("brand", product.brand_name),
      getOrCreateLookup("supplier", product.supplier_name),
    ]);

    await createProduct(
      {
        sku: product.sku,
        name: product.name,
        description: product.description,
        category_id: category?.id || null,
        brand_id: brand?.id || null,
        supplier_id: supplier?.id || null,
        purchase_price: product.purchase_price,
        sale_price: product.sale_price,
        min_stock_level: product.min_stock_level,
        location: product.location,
        initial_stock_quantity: product.initial_stock_quantity,
        is_active: product.is_active,
      },
      importUser?.id || null,
    );

    created += 1;
  }

  console.log(
    JSON.stringify(
      {
        ...summary,
        created,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
