import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import { normalizePartNumber } from '../../utils/normalizePartNumber.js';
import { recordStockMovement } from '../stockMovements/stockMovement.service.js';

const parsePurchaseItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw createError('Purchase must include at least one item', 400);
  }

  return items.map((item) => {
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unit_cost ?? item.cost_price);
    const hasExistingProduct = Boolean(item.product_id);
    const hasNewProduct = Boolean(item.new_product);

    if (!hasExistingProduct && !hasNewProduct) {
      throw createError('Each purchase item requires an existing product or a new product', 400);
    }

    if (hasExistingProduct && hasNewProduct) {
      throw createError('Each purchase item can use either an existing product or a new product, not both', 400);
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw createError('Each purchase item requires a positive integer quantity', 400);
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw createError('Each purchase item requires a valid unit_cost', 400);
    }

    if (hasNewProduct) {
      const sku = normalizePartNumber(item.new_product.sku ?? item.new_product.part_number);
      const { name } = item.new_product;

      if (!sku || !name || !String(name).trim()) {
        throw createError('New purchase products require SKU and name', 400);
      }
    }

    const productId = hasExistingProduct ? Number(item.product_id) : null;
    if (hasExistingProduct && !Number.isInteger(productId)) {
      throw createError('Existing purchase product_id must be a valid integer', 400);
    }

    return {
      product_id: productId,
      new_product: hasNewProduct ? item.new_product : null,
      quantity,
      unit_cost: unitCost,
      line_total: quantity * unitCost,
    };
  });
};

const parseOptionalNumber = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw createError(`New product ${fieldName} must be a valid number`, 400);
  }

  return number;
};

const createProductFromPurchaseItem = async (client, item, supplierId) => {
  const product = item.new_product;
  const sku = normalizePartNumber(product.sku ?? product.part_number);
  const name = String(product.name).trim();
  const categoryId = parseOptionalNumber(product.category_id, 'category_id');
  const brandId = parseOptionalNumber(product.brand_id, 'brand_id');
  const productSupplierId = parseOptionalNumber(product.supplier_id, 'supplier_id') ?? supplierId;
  const salePrice = Number(product.sale_price ?? product.selling_price ?? 0);
  const purchasePrice = Number(product.purchase_price ?? product.cost_price ?? item.unit_cost);
  const minStockLevel = Number(product.min_stock_level ?? product.min_stock ?? 0);

  if (categoryId !== null && !Number.isInteger(categoryId)) {
    throw createError('New product category_id must be a valid integer', 400);
  }

  if (brandId !== null && !Number.isInteger(brandId)) {
    throw createError('New product brand_id must be a valid integer', 400);
  }

  if (productSupplierId !== null && !Number.isInteger(productSupplierId)) {
    throw createError('New product supplier_id must be a valid integer', 400);
  }

  if (!Number.isFinite(salePrice) || salePrice < 0) {
    throw createError('New product sale_price must be 0 or greater', 400);
  }

  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    throw createError('New product purchase_price must be 0 or greater', 400);
  }

  if (!Number.isInteger(minStockLevel) || minStockLevel < 0) {
    throw createError('New product min_stock_level must be a non-negative integer', 400);
  }

  const createdProduct = await client.product.create({
    data: {
      sku,
      barcode: sku,
      name,
      description: product.description || null,
      categoryId,
      brandId,
      supplierId: productSupplierId,
      purchasePrice,
      salePrice,
      stockQuantity: 0,
      minStockLevel,
      location: product.location || null,
    },
    select: { id: true },
  });

  return createdProduct.id;
};

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => Math.round(toMoneyNumber(value) * 100) / 100;

const cleanText = (value) => {
  if (typeof value === 'undefined' || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const normalizePayments = ({ payments, paid_amount = 0, payment_method = null } = {}) => {
  if (Array.isArray(payments)) {
    return payments
      .map((payment) => {
        const amount = Number(payment.amount);

        if (!Number.isFinite(amount) || amount < 0) {
          throw createError('Payment amounts must be 0 or greater', 400);
        }

        return {
          amount,
          payment_method: cleanText(payment.payment_method || payment.method) || 'cash',
          notes: cleanText(payment.notes),
        };
      })
      .filter((payment) => payment.amount > 0);
  }

  const amount = Number(paid_amount ?? 0);

  if (!Number.isFinite(amount) || amount < 0) {
    throw createError('Paid amount must be 0 or greater', 400);
  }

  if (amount <= 0) return [];

  return [
    {
      amount,
      payment_method: cleanText(payment_method) || 'cash',
      notes: null,
    },
  ];
};

const addPurchasePaymentSummary = (purchase, paidAmountValue = 0) => {
  const settledAmount = toMoneyNumber(paidAmountValue);
  const totalAmount = toMoneyNumber(purchase.totalAmount);
  const remainingAmount = Math.max(totalAmount - settledAmount, 0);
  const returnedAmount = Array.isArray(purchase.returns)
    ? purchase.returns.reduce((sum, purchaseReturn) => sum + toMoneyNumber(purchaseReturn.totalAmount), 0)
    : 0;
  const supplierCreditAmount = Array.isArray(purchase.refunds)
    ? purchase.refunds
        .filter((refund) => refund.type === 'credit_note')
        .reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0)
    : 0;

  return {
    ...purchase,
    paidAmount: settledAmount,
    paid_amount: settledAmount,
    settledAmount,
    settled_amount: settledAmount,
    returnedAmount,
    returned_amount: returnedAmount,
    supplierCreditAmount,
    supplier_credit_amount: supplierCreditAmount,
    remainingAmount,
    remaining_amount: remainingAmount,
  };
};

const paymentTotalsByPurchase = async (purchaseIds, client = prisma) => {
  const ids = purchaseIds.map(Number).filter((id) => Number.isInteger(id));
  if (!ids.length) return new Map();

  const [paymentTotals, productSettlementTotals, purchaseReturnTotals, supplierCreditTotals] = await Promise.all([
    client.supplierPayment.groupBy({
      by: ['purchaseId'],
      where: {
        purchaseId: {
          in: ids,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    client.supplierProductSettlementAllocation.groupBy({
      by: ['purchaseId'],
      where: {
        purchaseId: {
          in: ids,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    client.purchaseReturn.groupBy({
      by: ['purchaseId'],
      where: {
        purchaseId: {
          in: ids,
        },
      },
      _sum: {
        totalAmount: true,
      },
    }),
    client.supplierRefund.groupBy({
      by: ['purchaseId'],
      where: {
        purchaseId: {
          in: ids,
        },
        type: 'credit_note',
      },
      _sum: {
        amount: true,
      },
    }),
  ]);
  const totals = new Map();

  paymentTotals.forEach((entry) => {
    totals.set(entry.purchaseId, toMoneyNumber(entry._sum.amount));
  });

  productSettlementTotals.forEach((entry) => {
    totals.set(
      entry.purchaseId,
      (totals.get(entry.purchaseId) || 0) + toMoneyNumber(entry._sum.amount),
    );
  });

  purchaseReturnTotals.forEach((entry) => {
    totals.set(
      entry.purchaseId,
      (totals.get(entry.purchaseId) || 0) + toMoneyNumber(entry._sum.totalAmount),
    );
  });

  supplierCreditTotals.forEach((entry) => {
    totals.set(
      entry.purchaseId,
      (totals.get(entry.purchaseId) || 0) + toMoneyNumber(entry._sum.amount),
    );
  });

  return totals;
};

const addPurchaseReturnItemAliases = (item) => ({
  ...item,
  purchase_return_id: item.purchaseReturnId,
  purchase_item_id: item.purchaseItemId,
  product_id: item.productId,
  unit_cost: item.unitCost,
  line_total: item.lineTotal,
  created_at: item.createdAt,
  product_name: item.product?.name || null,
  product_sku: item.product?.sku || null,
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
  items: Array.isArray(purchaseReturn.items)
    ? purchaseReturn.items.map(addPurchaseReturnItemAliases)
    : purchaseReturn.items,
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

const addPurchaseItemAliases = (item) => {
  const returnedQuantity = Array.isArray(item.returnItems)
    ? item.returnItems.reduce((sum, returnItem) => sum + Number(returnItem.quantity || 0), 0)
    : 0;

  return {
    ...item,
    purchase_id: item.purchaseId,
    product_id: item.productId,
    unit_cost: item.unitCost,
    line_total: item.lineTotal,
    created_at: item.createdAt,
    product_name: item.product?.name || null,
    product_sku: item.product?.sku || null,
    returnedQuantity,
    returned_quantity: returnedQuantity,
    returnableQuantity: Math.max(Number(item.quantity || 0) - returnedQuantity, 0),
    returnable_quantity: Math.max(Number(item.quantity || 0) - returnedQuantity, 0),
  };
};

export const decoratePurchasesWithPayments = async (purchases, client = prisma) => {
  if (!Array.isArray(purchases) || purchases.length === 0) return [];

  const totals = await paymentTotalsByPurchase(
    purchases.map((purchase) => purchase.id),
    client,
  );

  return purchases.map((purchase) => addPurchasePaymentSummary(purchase, totals.get(purchase.id) || 0));
};

export const listPurchases = async ({ supplier_id, from, to, search, limit = 50, offset = 0 } = {}) => {
  const where = {};
  const query = cleanText(search);

  if (supplier_id) {
    where.supplierId = Number(supplier_id);
  }

  if (from || to) {
    where.purchaseDate = {};
    if (from) where.purchaseDate.gte = new Date(from);
    if (to) where.purchaseDate.lte = new Date(to);
  }

  if (query) {
    const numericQuery = Number(query);
    const searchConditions = [
      { invoiceNumber: { contains: query, mode: 'insensitive' } },
      {
        supplier: {
          is: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
      },
      {
        items: {
          some: {
            product: {
              is: {
                OR: [
                  { sku: { contains: query, mode: 'insensitive' } },
                  { barcode: { contains: query, mode: 'insensitive' } },
                  { name: { contains: query, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      },
    ];

    if (Number.isInteger(numericQuery)) {
      searchConditions.unshift({ id: numericQuery });
    }

    where.OR = searchConditions;
  }

  const purchases = await prisma.purchase.findMany({
    where,
    include: {
      supplier: {
        select: {
          name: true,
        },
      },
      creator: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
    take: Math.min(Number(limit) || 50, 200),
    skip: Number(offset) || 0,
  });

  return decoratePurchasesWithPayments(purchases);
};

export const getPurchaseById = async (id) => {
  const purchase = await prisma.purchase.findUnique({
    where: { id: Number(id) },
    include: {
      supplier: {
        select: {
          name: true,
        },
      },
      creator: {
        select: {
          name: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              sku: true,
              name: true,
            },
          },
          returnItems: {
            select: {
              quantity: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      },
      payments: {
        include: {
          creator: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
      },
      productSettlements: {
        include: {
          product: {
            select: {
              sku: true,
              name: true,
            },
          },
          creator: {
            select: {
              name: true,
            },
          },
          allocations: {
            where: {
              purchaseId: Number(id),
            },
          },
        },
        orderBy: [{ settlementDate: 'desc' }, { id: 'desc' }],
      },
      productSettlementAllocations: {
        include: {
          settlement: {
            include: {
              product: {
                select: {
                  sku: true,
                  name: true,
                },
              },
              creator: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { id: 'desc' },
      },
      returns: {
        include: {
          creator: {
            select: {
              name: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  sku: true,
                  name: true,
                },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
        orderBy: [{ returnDate: 'desc' }, { id: 'desc' }],
      },
      refunds: {
        include: {
          creator: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ refundDate: 'desc' }, { id: 'desc' }],
      },
    },
  });

  if (!purchase) {
    throw createError('Purchase not found', 404);
  }

  const [paymentTotal, productSettlementTotal, purchaseReturnTotal, supplierCreditTotal] = await Promise.all([
    prisma.supplierPayment.aggregate({
      where: { purchaseId: Number(id) },
      _sum: { amount: true },
    }),
    prisma.supplierProductSettlementAllocation.aggregate({
      where: { purchaseId: Number(id) },
      _sum: { amount: true },
    }),
    prisma.purchaseReturn.aggregate({
      where: { purchaseId: Number(id) },
      _sum: { totalAmount: true },
    }),
    prisma.supplierRefund.aggregate({
      where: { purchaseId: Number(id), type: 'credit_note' },
      _sum: { amount: true },
    }),
  ]);

  const decoratedPurchase = addPurchasePaymentSummary(
    {
      ...purchase,
      items: Array.isArray(purchase.items) ? purchase.items.map(addPurchaseItemAliases) : purchase.items,
      returns: Array.isArray(purchase.returns)
        ? purchase.returns.map(addPurchaseReturnAliases)
        : purchase.returns,
      refunds: Array.isArray(purchase.refunds)
        ? purchase.refunds.map(addSupplierRefundAliases)
        : purchase.refunds,
    },
    toMoneyNumber(paymentTotal._sum.amount) +
      toMoneyNumber(productSettlementTotal._sum.amount) +
      toMoneyNumber(purchaseReturnTotal._sum.totalAmount) +
      toMoneyNumber(supplierCreditTotal._sum.amount),
  );

  return decoratedPurchase;
};

export const createPurchase = async (
  {
    supplier_id,
    invoice_number = null,
    purchase_date = new Date(),
    notes = null,
    paid_amount = 0,
    payment_method = null,
    payments = undefined,
    items,
  },
  createdBy,
) => {
  const parsedItems = parsePurchaseItems(items);
  const totalAmount = parsedItems.reduce((sum, item) => sum + item.line_total, 0);
  const parsedPayments = normalizePayments({ payments, paid_amount, payment_method });
  const paidAmount = parsedPayments.reduce((sum, payment) => sum + payment.amount, 0);

  if (paidAmount > totalAmount) {
    throw createError('Paid amount cannot be greater than purchase total', 400);
  }

  if (paidAmount > 0 && !supplier_id) {
    throw createError('Supplier is required when recording a supplier payment', 400);
  }

  try {
    const purchaseId = await prisma.$transaction(async (client) => {
      const purchase = await client.purchase.create({
        data: {
          supplierId: supplier_id ? Number(supplier_id) : null,
          invoiceNumber: invoice_number,
          purchaseDate: new Date(purchase_date),
          totalAmount,
          notes,
          createdBy: createdBy ? Number(createdBy) : null,
        },
        select: { id: true },
      });

      for (const item of parsedItems) {
        const productId = item.product_id || (await createProductFromPurchaseItem(
          client,
          item,
          supplier_id ? Number(supplier_id) : null,
        ));

        await client.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId,
            quantity: item.quantity,
            unitCost: item.unit_cost,
            lineTotal: item.line_total,
          },
        });

        await recordStockMovement(client, {
          productId,
          movementType: 'PURCHASE',
          quantityChange: item.quantity,
          referenceType: 'purchase',
          referenceId: purchase.id,
          notes: invoice_number ? `Purchase invoice ${invoice_number}` : 'Purchase',
          createdBy,
        });
      }

      if (parsedPayments.length) {
        for (const payment of parsedPayments) {
          await client.supplierPayment.create({
            data: {
              supplierId: Number(supplier_id),
              purchaseId: purchase.id,
              amount: payment.amount,
              paymentMethod: payment.payment_method,
              notes: payment.notes || (invoice_number
                ? `Initial payment for purchase invoice ${invoice_number}`
                : `Initial payment for purchase #${purchase.id}`),
              createdBy: createdBy ? Number(createdBy) : null,
            },
          });
        }
      }

      return purchase.id;
    });

    return getPurchaseById(purchaseId);
  } catch (error) {
    if (error.code === 'P2002') {
      throw createError('Product SKU or barcode already exists', 409);
    }

    if (error.code === 'P2003') {
      throw createError('Invalid supplier, product, or user reference', 400);
    }

    throw error;
  }
};

const normalizePurchaseReturnItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw createError('Purchase return must include at least one item', 400);
  }

  const itemMap = new Map();

  for (const item of items) {
    const purchaseItemId = Number(item.purchase_item_id ?? item.purchaseItemId ?? item.id);

    if (!Number.isInteger(purchaseItemId)) {
      throw createError('Each return item requires a valid purchase item', 400);
    }

    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw createError('Each return item requires a positive integer quantity', 400);
    }

    const current = itemMap.get(purchaseItemId) || {
      purchase_item_id: purchaseItemId,
      quantity: 0,
    };

    current.quantity += quantity;
    itemMap.set(purchaseItemId, current);
  }

  return Array.from(itemMap.values());
};

export const createPurchaseReturn = async (
  id,
  {
    return_number = null,
    return_date = new Date(),
    notes = null,
    items,
  },
  createdBy,
) => {
  const purchaseId = Number(id);
  const parsedItems = normalizePurchaseReturnItems(items);
  const returnDate = new Date(return_date);

  if (!Number.isInteger(purchaseId)) {
    throw createError('Invalid purchase id', 400);
  }

  if (Number.isNaN(returnDate.getTime())) {
    throw createError('Return date is invalid', 400);
  }

  try {
    await prisma.$transaction(async (client) => {
      const purchase = await client.purchase.findUnique({
        where: { id: purchaseId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                },
              },
            },
          },
        },
      });

      if (!purchase) {
        throw createError('Purchase not found', 404);
      }

      const purchaseItemMap = new Map(purchase.items.map((item) => [item.id, item]));
      const returnedQuantities = await client.purchaseReturnItem.groupBy({
        by: ['purchaseItemId'],
        where: {
          purchaseReturn: {
            purchaseId,
          },
        },
        _sum: {
          quantity: true,
        },
      });
      const returnedQuantityMap = new Map(
        returnedQuantities.map((entry) => [entry.purchaseItemId, Number(entry._sum.quantity || 0)]),
      );
      const returnItems = parsedItems.map((item) => {
        const purchaseItem = purchaseItemMap.get(item.purchase_item_id);

        if (!purchaseItem) {
          throw createError('Return item does not belong to this purchase invoice', 400);
        }

        const alreadyReturned = returnedQuantityMap.get(purchaseItem.id) || 0;
        const returnableQuantity = Number(purchaseItem.quantity) - alreadyReturned;

        if (item.quantity > returnableQuantity) {
          throw createError(
            `Return quantity cannot be greater than remaining returnable quantity for ${purchaseItem.product?.name || `item #${purchaseItem.id}`}`,
            400,
            {
              purchase_item_id: purchaseItem.id,
              purchased_quantity: purchaseItem.quantity,
              already_returned_quantity: alreadyReturned,
              returnable_quantity: returnableQuantity,
              requested_quantity: item.quantity,
            },
          );
        }

        const unitCost = toMoneyNumber(purchaseItem.unitCost);
        const lineTotal = roundMoney(item.quantity * unitCost);

        return {
          purchase_item_id: purchaseItem.id,
          product_id: purchaseItem.productId,
          quantity: item.quantity,
          unit_cost: unitCost,
          line_total: lineTotal,
          product: purchaseItem.product,
        };
      });
      const totalAmount = roundMoney(
        returnItems.reduce((sum, item) => sum + item.line_total, 0),
      );

      if (totalAmount <= 0) {
        throw createError('Purchase return total must be greater than 0', 400);
      }

      const finalReturnNumber = cleanText(return_number) || `PRET-${Date.now()}`;

      const purchaseReturn = await client.purchaseReturn.create({
        data: {
          purchaseId,
          supplierId: purchase.supplierId,
          returnNumber: finalReturnNumber,
          returnDate,
          totalAmount,
          notes: cleanText(notes),
          createdBy: createdBy ? Number(createdBy) : null,
        },
        select: { id: true },
      });

      for (const item of returnItems) {
        await client.purchaseReturnItem.create({
          data: {
            purchaseReturnId: purchaseReturn.id,
            purchaseItemId: item.purchase_item_id,
            productId: item.product_id,
            quantity: item.quantity,
            unitCost: item.unit_cost,
            lineTotal: item.line_total,
          },
        });

        await recordStockMovement(client, {
          productId: item.product_id,
          movementType: 'PURCHASE_RETURN',
          quantityChange: -item.quantity,
          referenceType: 'purchase_return',
          referenceId: purchaseReturn.id,
          notes: `Purchase return ${finalReturnNumber}${purchase.invoiceNumber ? ` for ${purchase.invoiceNumber}` : ''}`,
          createdBy,
        });
      }
    });

    return getPurchaseById(purchaseId);
  } catch (error) {
    if (error.code === 'P2002') {
      throw createError('Purchase return number already exists', 409);
    }

    if (error.code === 'P2003') {
      throw createError('Invalid purchase, purchase item, product, supplier, or user reference', 400);
    }

    throw error;
  }
};
