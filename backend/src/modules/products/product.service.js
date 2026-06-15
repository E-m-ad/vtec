import prisma from "../../config/db.js";
import createError from "../../utils/createError.js";
import {
  normalizePartNumber,
  normalizePartNumberSearch,
} from "../../utils/normalizePartNumber.js";
import { recordStockMovement } from "../stockMovements/stockMovement.service.js";

const handleProductWriteError = (error) => {
  if (error.code === "P2002") {
    throw createError("Product SKU or barcode already exists", 409);
  }

  if (error.code === "P2003") {
    throw createError("Invalid category, brand, or supplier reference", 400);
  }

  if (error.code === "P2025") {
    throw createError("Product not found", 404);
  }

  throw error;
};

const productInclude = {
  category: {
    select: {
      name: true,
    },
  },
  brand: {
    select: {
      name: true,
    },
  },
  supplier: {
    select: {
      name: true,
    },
  },
};

const withDerivedBarcode = (product) => {
  if (!product) return product;

  return {
    ...product,
    barcode: product.barcode || product.sku,
    part_number: product.sku,
  };
};

const buildProductWhere = ({
  search,
  category_id,
  brand_id,
  supplier_id,
  is_active,
  low_stock,
} = {}) => {
  const where = {};

  if (search) {
    const searchText = String(search).trim();
    const normalizedSearch = normalizePartNumberSearch(searchText);
    const partNumberSearches = [searchText, normalizedSearch].filter(
      (value, index, values) => value && values.indexOf(value) === index,
    );

    where.OR = [
      { name: { contains: searchText, mode: "insensitive" } },
      { description: { contains: searchText, mode: "insensitive" } },
      {
        category: {
          is: { name: { contains: searchText, mode: "insensitive" } },
        },
      },
      {
        brand: { is: { name: { contains: searchText, mode: "insensitive" } } },
      },
      {
        supplier: {
          is: { name: { contains: searchText, mode: "insensitive" } },
        },
      },
      ...partNumberSearches.flatMap((value) => [
        { sku: { contains: value, mode: "insensitive" } },
        { barcode: { contains: value, mode: "insensitive" } },
      ]),
    ];
  }

  if (category_id) {
    where.categoryId = Number(category_id);
  }

  if (brand_id) {
    where.brandId = Number(brand_id);
  }

  if (supplier_id) {
    where.supplierId = Number(supplier_id);
  }

  if (typeof is_active !== "undefined") {
    where.isActive = is_active === "true" || is_active === true;
  } else {
    where.isActive = true;
  }

  if (low_stock === "true" || low_stock === true) {
    where.stockQuantity = {
      lte: prisma.product.fields.minStockLevel,
    };
  }

  return where;
};

const normalizePagination = ({ limit = 50, offset = 0 } = {}) => {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), 1000)
      : 50;
  const safeOffset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? Math.floor(parsedOffset)
      : 0;

  return {
    limit: safeLimit,
    offset: safeOffset,
  };
};

export const listProducts = async ({
  search,
  category_id,
  brand_id,
  supplier_id,
  is_active,
  low_stock,
  limit = 50,
  offset = 0,
} = {}) => {
  const where = buildProductWhere({
    search,
    category_id,
    brand_id,
    supplier_id,
    is_active,
    low_stock,
  });
  const pagination = normalizePagination({ limit, offset });

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { name: "asc" },
      take: pagination.limit,
      skip: pagination.offset,
    }),
    prisma.product.count({ where }),
  ]);
  const page = Math.floor(pagination.offset / pagination.limit) + 1;
  const pageCount = Math.max(Math.ceil(total / pagination.limit), 1);

  return {
    products: products.map(withDerivedBarcode),
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

export const getProductById = async (id) => {
  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    include: productInclude,
  });

  if (!product) {
    throw createError("Product not found", 404);
  }

  return withDerivedBarcode(product);
};

export const getProductSupplierSources = async (id) => {
  const productId = Number(id);

  if (!Number.isInteger(productId)) {
    throw createError("Invalid product id", 400);
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      name: true,
    },
  });

  if (!product) {
    throw createError("Product not found", 404);
  }

  const purchaseItems = await prisma.purchaseItem.findMany({
    where: { productId },
    include: {
      purchase: {
        select: {
          id: true,
          invoiceNumber: true,
          purchaseDate: true,
          supplierId: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        purchase: {
          purchaseDate: "desc",
        },
      },
      { id: "desc" },
    ],
  });

  const sourcesBySupplier = new Map();

  purchaseItems.forEach((item) => {
    const purchase = item.purchase;
    const supplierId = purchase?.supplierId || 0;
    const key = String(supplierId || `unknown-${purchase?.id || item.id}`);
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCost || 0);
    const lineTotal = Number(item.lineTotal || 0);
    const purchaseDate = purchase?.purchaseDate || null;
    const invoiceNumber = purchase?.invoiceNumber || null;
    const supplierName = purchase?.supplier?.name || "Unknown supplier";

    const current = sourcesBySupplier.get(key) || {
      supplier_id: supplierId || null,
      supplierId: supplierId || null,
      supplier_name: supplierName,
      supplierName,
      total_quantity: 0,
      totalQuantity: 0,
      total_value: 0,
      totalValue: 0,
      invoice_count: 0,
      invoiceCount: 0,
      average_unit_cost: 0,
      averageUnitCost: 0,
      last_purchase_date: null,
      lastPurchaseDate: null,
      last_unit_cost: 0,
      lastUnitCost: 0,
      last_invoice_id: null,
      lastInvoiceId: null,
      last_invoice_number: null,
      lastInvoiceNumber: null,
      purchases: [],
      invoiceIds: new Set(),
    };

    current.total_quantity += quantity;
    current.totalQuantity = current.total_quantity;
    current.total_value += lineTotal;
    current.totalValue = current.total_value;

    if (purchase?.id) current.invoiceIds.add(purchase.id);

    const currentLastDate = current.last_purchase_date
      ? new Date(current.last_purchase_date).getTime()
      : 0;
    const nextDate = purchaseDate ? new Date(purchaseDate).getTime() : 0;

    if (nextDate >= currentLastDate) {
      current.last_purchase_date = purchaseDate;
      current.lastPurchaseDate = purchaseDate;
      current.last_unit_cost = unitCost;
      current.lastUnitCost = unitCost;
      current.last_invoice_id = purchase?.id || null;
      current.lastInvoiceId = purchase?.id || null;
      current.last_invoice_number = invoiceNumber;
      current.lastInvoiceNumber = invoiceNumber;
    }

    current.purchases.push({
      purchase_item_id: item.id,
      purchaseItemId: item.id,
      purchase_id: purchase?.id || null,
      purchaseId: purchase?.id || null,
      invoice_number: invoiceNumber,
      invoiceNumber,
      purchase_date: purchaseDate,
      purchaseDate,
      quantity,
      unit_cost: unitCost,
      unitCost,
      line_total: lineTotal,
      lineTotal,
    });

    sourcesBySupplier.set(key, current);
  });

  const sources = Array.from(sourcesBySupplier.values())
    .map(({ invoiceIds, ...source }) => {
      const invoiceCount = invoiceIds.size;
      const averageUnitCost =
        source.total_quantity > 0
          ? source.total_value / source.total_quantity
          : 0;

      return {
        ...source,
        total_value: Math.round(source.total_value * 100) / 100,
        totalValue: Math.round(source.total_value * 100) / 100,
        average_unit_cost: Math.round(averageUnitCost * 100) / 100,
        averageUnitCost: Math.round(averageUnitCost * 100) / 100,
        invoice_count: invoiceCount,
        invoiceCount,
        purchases: source.purchases.slice(0, 5),
      };
    })
    .sort((first, second) => {
      const firstDate = first.last_purchase_date
        ? new Date(first.last_purchase_date).getTime()
        : 0;
      const secondDate = second.last_purchase_date
        ? new Date(second.last_purchase_date).getTime()
        : 0;

      return (
        secondDate - firstDate ||
        first.supplier_name.localeCompare(second.supplier_name)
      );
    });

  return {
    product: withDerivedBarcode(product),
    sources,
    total_suppliers: sources.length,
    totalSuppliers: sources.length,
  };
};

export const createProduct = async (data, createdBy) => {
  const {
    sku: inputSku,
    name,
    description = null,
    category_id = null,
    brand_id = null,
    supplier_id = null,
    purchase_price = 0,
    sale_price = 0,
    min_stock_level = 0,
    location = null,
  } = data;
  const sku = inputSku ?? data.part_number;

  if (!sku || !name) {
    throw createError("Product SKU and name are required", 400);
  }

  const partNumber = normalizePartNumber(sku);

  if (!partNumber || !name.trim()) {
    throw createError("Product SKU and name are required", 400);
  }

  const initialStock = Number(
    data.initial_stock_quantity ?? data.stock_quantity ?? 0,
  );
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    throw createError(
      "Initial stock quantity must be a non-negative integer",
      400,
    );
  }

  const productId = await prisma
    .$transaction(async (client) => {
      const product = await client.product.create({
        data: {
          sku: partNumber,
          barcode: partNumber,
          name: name.trim(),
          description,
          categoryId: category_id ? Number(category_id) : null,
          brandId: brand_id ? Number(brand_id) : null,
          supplierId: supplier_id ? Number(supplier_id) : null,
          purchasePrice: purchase_price,
          salePrice: sale_price,
          stockQuantity: 0,
          minStockLevel: min_stock_level,
          location,
        },
        select: { id: true },
      });

      if (initialStock > 0) {
        await recordStockMovement(client, {
          productId: product.id,
          movementType: "ADJUSTMENT",
          quantityChange: initialStock,
          referenceType: "product_opening_balance",
          notes: "Opening stock balance",
          createdBy,
        });
      }

      return product.id;
    })
    .catch((error) => {
      handleProductWriteError(error);
    });

  return getProductById(productId);
};

export const updateProduct = async (id, data) => {
  if (
    Object.prototype.hasOwnProperty.call(data, "stock_quantity") ||
    Object.prototype.hasOwnProperty.call(data, "initial_stock_quantity")
  ) {
    throw createError(
      "Use purchases, sales, or stock movement adjustments to change stock quantity",
      400,
    );
  }

  const normalizedData = { ...data };
  if (
    Object.prototype.hasOwnProperty.call(normalizedData, "part_number") &&
    !Object.prototype.hasOwnProperty.call(normalizedData, "sku")
  ) {
    normalizedData.sku = normalizedData.part_number;
  }

  const fieldMap = {
    sku: "sku",
    name: "name",
    description: "description",
    category_id: "categoryId",
    brand_id: "brandId",
    supplier_id: "supplierId",
    purchase_price: "purchasePrice",
    sale_price: "salePrice",
    min_stock_level: "minStockLevel",
    location: "location",
    is_active: "isActive",
  };

  const updateData = {};

  Object.entries(fieldMap).forEach(([inputField, prismaField]) => {
    if (Object.prototype.hasOwnProperty.call(normalizedData, inputField)) {
      const value = normalizedData[inputField];
      updateData[prismaField] =
        typeof value === "string" ? value.trim() : value;
    }
  });

  if (
    Object.prototype.hasOwnProperty.call(updateData, "categoryId") &&
    updateData.categoryId !== null
  ) {
    updateData.categoryId = Number(updateData.categoryId);
  }

  if (
    Object.prototype.hasOwnProperty.call(updateData, "brandId") &&
    updateData.brandId !== null
  ) {
    updateData.brandId = Number(updateData.brandId);
  }

  if (
    Object.prototype.hasOwnProperty.call(updateData, "supplierId") &&
    updateData.supplierId !== null
  ) {
    updateData.supplierId = Number(updateData.supplierId);
  }

  if (Object.prototype.hasOwnProperty.call(updateData, "sku")) {
    updateData.sku = normalizePartNumber(updateData.sku);

    if (!updateData.sku) {
      throw createError("Product SKU is required", 400);
    }

    updateData.barcode = updateData.sku;
  }

  if (!Object.keys(updateData).length) {
    return getProductById(id);
  }

  try {
    await prisma.product.update({
      where: { id: Number(id) },
      data: updateData,
      select: { id: true },
    });
  } catch (error) {
    handleProductWriteError(error);
  }

  return getProductById(id);
};

export const deactivateProduct = async (id) => {
  try {
    await prisma.product.update({
      where: { id: Number(id) },
      data: { isActive: false },
      select: { id: true },
    });
  } catch (error) {
    handleProductWriteError(error);
  }

  return getProductById(id);
};
