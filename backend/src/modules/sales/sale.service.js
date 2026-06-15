import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import { recordStockMovement } from '../stockMovements/stockMovement.service.js';

const validLineTypes = new Set(['product', 'service']);

const parseSaleQuantity = (item) => {
  const quantity = Number(item.quantity);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw createError('Each sale item requires a positive integer quantity', 400);
  }

  return quantity;
};

const parseReturnQuantity = (item) => {
  const quantity = Number(item.quantity);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw createError('Each return item requires a positive integer quantity', 400);
  }

  return quantity;
};

const cleanText = (value) => {
  if (typeof value === 'undefined' || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => Math.round(toMoneyNumber(value) * 100) / 100;

const paymentMethodSummary = (payments) => {
  const methods = payments.map((payment) => cleanText(payment.payment_method)).filter(Boolean);
  const uniqueMethods = [...new Set(methods)];

  if (!uniqueMethods.length) return null;
  if (uniqueMethods.length === 1) return uniqueMethods[0];
  return 'mixed';
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
          payment_date: payment.payment_date ? new Date(payment.payment_date) : new Date(),
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
      payment_date: new Date(),
      payment_method: cleanText(payment_method) || 'cash',
      notes: null,
    },
  ];
};

const normalizeLineType = (item) => {
  const lineType = cleanText(item.line_type || item.item_type) || (item.product_id ? 'product' : 'service');

  if (!validLineTypes.has(lineType)) {
    throw createError('Each sale item must be a product or service line', 400);
  }

  return lineType;
};

const addSaleReturnItemAliases = (item) => ({
  ...item,
  sale_return_id: item.saleReturnId,
  sale_item_id: item.saleItemId,
  product_id: item.productId,
  unit_price: item.unitPrice,
  line_total: item.lineTotal,
  created_at: item.createdAt,
  product_name: item.product?.name || null,
  product_sku: item.product?.sku || null,
  sale_item: item.saleItem
    ? {
        ...item.saleItem,
        sale_id: item.saleItem.saleId,
        product_id: item.saleItem.productId,
        line_type: item.saleItem.lineType,
        unit_price: item.saleItem.unitPrice,
        line_total: item.saleItem.lineTotal,
      }
    : item.saleItem,
});

const addSaleReturnAliases = (saleReturn) => ({
  ...saleReturn,
  sale_id: saleReturn.saleId,
  customer_id: saleReturn.customerId,
  return_number: saleReturn.returnNumber,
  return_date: saleReturn.returnDate,
  total_amount: saleReturn.totalAmount,
  created_by: saleReturn.createdBy,
  created_at: saleReturn.createdAt,
  items: Array.isArray(saleReturn.items)
    ? saleReturn.items.map(addSaleReturnItemAliases)
    : saleReturn.items,
});

const addCustomerRefundAliases = (refund) => ({
  ...refund,
  customer_id: refund.customerId,
  sale_id: refund.saleId,
  refund_date: refund.refundDate,
  payment_method: refund.paymentMethod,
  created_by: refund.createdBy,
  created_at: refund.createdAt,
});

const saleReturnSummary = (sale) => {
  const returns = Array.isArray(sale?.returns) ? sale.returns : [];
  const returnedAmount = returns.reduce(
    (sum, saleReturn) => sum + toMoneyNumber(saleReturn.totalAmount),
    0,
  );

  return {
    returnedAmount: roundMoney(returnedAmount),
    returnCount: returns.length,
  };
};

const decorateSale = (sale) => {
  if (!sale) return sale;

  const totalAmount = toMoneyNumber(sale.totalAmount);
  const paidAmount = toMoneyNumber(sale.paidAmount);
  const { returnedAmount, returnCount } = saleReturnSummary(sale);
  const refundedAmount = Array.isArray(sale.refunds)
    ? sale.refunds.reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0)
    : 0;
  const netTotalAmount = Math.max(totalAmount - returnedAmount, 0);
  const effectivePaidAmount = Math.max(paidAmount - refundedAmount, 0);
  const remainingAmount = Math.max(netTotalAmount - effectivePaidAmount, 0);
  const creditAmount = Math.max(effectivePaidAmount - netTotalAmount, 0);

  return {
    ...sale,
    customer_name: sale.customerName || sale.customer?.name || null,
    customer_id: sale.customerId,
    car_id: sale.carId,
    car: sale.car
      ? {
          ...sale.car,
          customer_id: sale.car.customerId,
          plate_number: sale.car.plateNumber,
        }
      : sale.car,
    sale_number: sale.saleNumber,
    sale_date: sale.saleDate,
    total_amount: totalAmount,
    originalTotalAmount: totalAmount,
    original_total_amount: totalAmount,
    returnedAmount,
    returned_amount: returnedAmount,
    returnCount,
    return_count: returnCount,
    netTotalAmount,
    net_total_amount: netTotalAmount,
    paid_amount: paidAmount,
    refundedAmount,
    refunded_amount: refundedAmount,
    effectivePaidAmount,
    effective_paid_amount: effectivePaidAmount,
    remaining_amount: remainingAmount,
    remainingAmount,
    creditAmount,
    credit_amount: creditAmount,
    payment_method: sale.paymentMethod,
    payment_status: sale.paymentStatus,
    created_by: sale.createdBy,
    created_at: sale.createdAt,
    updated_at: sale.updatedAt,
    items: Array.isArray(sale.items)
      ? sale.items.map((item) => ({
          ...item,
          sale_id: item.saleId,
          product_id: item.productId,
          line_type: item.lineType,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
          created_at: item.createdAt,
          product_name: item.product?.name || item.description || null,
          product_sku: item.product?.sku || null,
          returnedQuantity: Array.isArray(item.returnItems)
            ? item.returnItems.reduce((sum, returnItem) => sum + Number(returnItem.quantity || 0), 0)
            : 0,
          returned_quantity: Array.isArray(item.returnItems)
            ? item.returnItems.reduce((sum, returnItem) => sum + Number(returnItem.quantity || 0), 0)
            : 0,
          returnableQuantity:
            item.lineType === 'product'
              ? Math.max(
                  Number(item.quantity || 0) -
                    (Array.isArray(item.returnItems)
                      ? item.returnItems.reduce(
                          (sum, returnItem) => sum + Number(returnItem.quantity || 0),
                          0,
                        )
                      : 0),
                  0,
                )
              : 0,
          returnable_quantity:
            item.lineType === 'product'
              ? Math.max(
                  Number(item.quantity || 0) -
                    (Array.isArray(item.returnItems)
                      ? item.returnItems.reduce(
                          (sum, returnItem) => sum + Number(returnItem.quantity || 0),
                          0,
                        )
                      : 0),
                  0,
                )
              : 0,
        }))
      : sale.items,
    payments: Array.isArray(sale.payments)
      ? sale.payments.map((payment) => ({
          ...payment,
          sale_id: payment.saleId,
          payment_date: payment.paymentDate,
          payment_method: payment.paymentMethod,
          created_by: payment.createdBy,
          created_at: payment.createdAt,
        }))
      : sale.payments,
    returns: Array.isArray(sale.returns)
      ? sale.returns.map(addSaleReturnAliases)
      : sale.returns,
    refunds: Array.isArray(sale.refunds)
      ? sale.refunds.map(addCustomerRefundAliases)
      : sale.refunds,
  };
};

const derivePaymentStatus = (paidAmount, totalAmount) => {
  if (totalAmount <= 0) return 'paid';
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount >= totalAmount) return 'paid';
  return 'partial';
};

export const listSales = async ({ customer_id, car_id, from, to, search, limit = 50, offset = 0 } = {}) => {
  const where = {};
  const query = cleanText(search);

  if (customer_id) {
    where.customerId = Number(customer_id);
  }

  if (car_id) {
    where.carId = Number(car_id);
  }

  if (from || to) {
    where.saleDate = {};
    if (from) where.saleDate.gte = new Date(from);
    if (to) where.saleDate.lte = new Date(to);
  }

  if (query) {
    const numericQuery = Number(query);
    const searchConditions = [
      { saleNumber: { contains: query, mode: 'insensitive' } },
      { customerName: { contains: query, mode: 'insensitive' } },
      {
        customer: {
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
        car: {
          is: {
            OR: [
              { plateNumber: { contains: query, mode: 'insensitive' } },
              { vin: { contains: query, mode: 'insensitive' } },
              { make: { contains: query, mode: 'insensitive' } },
              { model: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
      },
      {
        items: {
          some: {
            OR: [
              { description: { contains: query, mode: 'insensitive' } },
              {
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
            ],
          },
        },
      },
    ];

    if (Number.isInteger(numericQuery)) {
      searchConditions.unshift({ id: numericQuery });
    }

    where.OR = searchConditions;
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: {
        select: {
          name: true,
        },
      },
      creator: {
        select: {
          name: true,
        },
      },
      car: {
        select: {
          id: true,
          customerId: true,
          plateNumber: true,
          make: true,
          model: true,
          year: true,
          color: true,
        },
      },
      returns: {
        select: {
          id: true,
          totalAmount: true,
        },
      },
      refunds: {
        select: {
          id: true,
          amount: true,
        },
      },
    },
    orderBy: [{ saleDate: 'desc' }, { id: 'desc' }],
    take: Math.min(Number(limit) || 50, 200),
    skip: Number(offset) || 0,
  });

  return sales.map(decorateSale);
};

export const getSaleById = async (id) => {
  const sale = await prisma.sale.findUnique({
    where: { id: Number(id) },
    include: {
      customer: {
        select: {
          name: true,
        },
      },
      creator: {
        select: {
          name: true,
        },
      },
      car: {
        select: {
          id: true,
          customerId: true,
          plateNumber: true,
          make: true,
          model: true,
          year: true,
          color: true,
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
        orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
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
              saleItem: {
                select: {
                  id: true,
                  saleId: true,
                  productId: true,
                  lineType: true,
                  description: true,
                  quantity: true,
                  unitPrice: true,
                  lineTotal: true,
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

  if (!sale) {
    throw createError('Sale not found', 404);
  }

  return decorateSale(sale);
};

export const createSale = async (
  {
    customer_id = null,
    car_id = null,
    customer_name = null,
    sale_number = null,
    sale_date = new Date(),
    paid_amount = 0,
    payment_method = null,
    payments = undefined,
    notes = null,
    items,
  },
  createdBy,
) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw createError('Sale must include at least one item', 400);
  }

  try {
    const saleId = await prisma.$transaction(async (client) => {
      const parsedItems = [];
      let customerId = customer_id ? Number(customer_id) : null;
      const carId = car_id ? Number(car_id) : null;
      let invoiceCustomerName = cleanText(customer_name);
      let selectedCar = null;

      if (customerId) {
        const customer = await client.customer.findUnique({
          where: { id: customerId },
          select: { name: true },
        });

        if (!customer) {
          throw createError('Customer not found', 404);
        }

        invoiceCustomerName = invoiceCustomerName || customer.name;
      }

      if (carId) {
        selectedCar = await client.car.findUnique({
          where: { id: carId },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        if (!selectedCar) {
          throw createError('Car not found', 404);
        }

        if (selectedCar.customerId && customerId && selectedCar.customerId !== customerId) {
          throw createError('Selected car belongs to a different customer', 400);
        }

        if (!customerId && selectedCar.customerId) {
          customerId = selectedCar.customerId;
          invoiceCustomerName = invoiceCustomerName || selectedCar.customer?.name || null;
        }
      }

      if (!customerId && !invoiceCustomerName) {
        throw createError('Choose a customer or enter customer name for the invoice', 400);
      }

      for (const item of items) {
        const quantity = parseSaleQuantity(item);
        const lineType = normalizeLineType(item);
        let unitPrice = item.unit_price === undefined ? null : Number(item.unit_price);
        let productId = null;
        let description = cleanText(item.description || item.name || item.title);

        if (lineType === 'product') {
          if (!item.product_id) {
            throw createError('Product sale lines require product_id', 400);
          }

          productId = Number(item.product_id);
          if (!Number.isInteger(productId)) {
            throw createError('Product sale lines require a valid product_id', 400);
          }

          const product = await client.product.findUnique({
            where: { id: productId },
            select: { name: true, salePrice: true },
          });

          if (!product) {
            throw createError('Product not found', 404);
          }

          if (unitPrice === null) {
            unitPrice = Number(product.salePrice);
          }

          description = description || product.name;
        } else {
          if (!description) {
            throw createError('Service sale lines require a description', 400);
          }

          if (unitPrice === null) {
            throw createError('Service sale lines require unit_price', 400);
          }
        }

        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw createError('Each sale item requires a valid unit_price', 400);
        }

        parsedItems.push({
          line_type: lineType,
          product_id: productId,
          description,
          quantity,
          unit_price: unitPrice,
          line_total: quantity * unitPrice,
        });
      }

      const totalAmount = parsedItems.reduce((sum, item) => sum + item.line_total, 0);
      const parsedPayments = normalizePayments({ payments, paid_amount, payment_method });
      const paidAmount = parsedPayments.reduce((sum, payment) => sum + payment.amount, 0);

      if (paidAmount > totalAmount) {
        throw createError('Paid amount cannot be greater than total amount', 400);
      }

      const finalSaleNumber = sale_number || `SALE-${Date.now()}`;

      const sale = await client.sale.create({
        data: {
          customerId,
          carId,
          customerName: invoiceCustomerName,
          saleNumber: finalSaleNumber,
          saleDate: new Date(sale_date),
          totalAmount,
          paidAmount,
          paymentMethod: paymentMethodSummary(parsedPayments),
          paymentStatus: derivePaymentStatus(paidAmount, totalAmount),
          notes,
          createdBy: createdBy ? Number(createdBy) : null,
        },
        select: { id: true },
      });

      for (const payment of parsedPayments) {
        await client.salePayment.create({
          data: {
            saleId: sale.id,
            amount: payment.amount,
            paymentDate: payment.payment_date,
            paymentMethod: payment.payment_method,
            notes: payment.notes,
            createdBy: createdBy ? Number(createdBy) : null,
          },
        });
      }

      for (const item of parsedItems) {
        await client.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.product_id,
            lineType: item.line_type,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
          },
        });

        if (item.line_type === 'product') {
          await recordStockMovement(client, {
            productId: item.product_id,
            movementType: 'SALE',
            quantityChange: -item.quantity,
            referenceType: 'sale',
            referenceId: sale.id,
            notes: `Sale ${finalSaleNumber}`,
            createdBy,
          });
        }
      }

      return sale.id;
    });

    return getSaleById(saleId);
  } catch (error) {
    if (error.code === 'P2002') {
      throw createError('Sale number already exists', 409);
    }

    if (error.code === 'P2003') {
      throw createError('Invalid customer, product, or user reference', 400);
    }

    throw error;
  }
};

export const createSalePayment = async (
  id,
  { amount, payment_date = new Date(), payment_method = null, notes = null, payments = undefined },
  createdBy,
) => {
  const saleId = Number(id);
  const parsedPayments = normalizePayments({ payments, paid_amount: amount, payment_method });
  const paymentAmount = parsedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const defaultPaymentDate = new Date(payment_date);

  if (!Number.isInteger(saleId)) {
    throw createError('Invalid sale id', 400);
  }

  if (paymentAmount <= 0) {
    throw createError('Payment amount must be greater than 0', 400);
  }

  if (Number.isNaN(defaultPaymentDate.getTime())) {
    throw createError('Payment date is invalid', 400);
  }

  if (
    parsedPayments.some(
      (payment) => payment.payment_date && Number.isNaN(new Date(payment.payment_date).getTime()),
    )
  ) {
    throw createError('Payment date is invalid', 400);
  }

  try {
    await prisma.$transaction(async (client) => {
      const sale = await client.sale.findUnique({
        where: { id: saleId },
        include: {
          payments: {
            select: {
              paymentMethod: true,
            },
          },
          returns: {
            select: {
              totalAmount: true,
            },
          },
          refunds: {
            select: {
              amount: true,
            },
          },
        },
      });

      if (!sale) {
        throw createError('Sale not found', 404);
      }

      const totalAmount = toMoneyNumber(sale.totalAmount);
      const returnedAmount = sale.returns.reduce(
        (sum, saleReturn) => sum + toMoneyNumber(saleReturn.totalAmount),
        0,
      );
      const refundedAmount = sale.refunds.reduce(
        (sum, refund) => sum + toMoneyNumber(refund.amount),
        0,
      );
      const netTotalAmount = Math.max(totalAmount - returnedAmount, 0);
      const currentPaid = toMoneyNumber(sale.paidAmount);
      const effectivePaidAmount = Math.max(currentPaid - refundedAmount, 0);
      const remainingAmount = Math.max(netTotalAmount - effectivePaidAmount, 0);

      if (paymentAmount > remainingAmount) {
        throw createError('Payment cannot be greater than invoice remaining amount', 400);
      }

      const nextPaidAmount = currentPaid + paymentAmount;
      const nextPaymentMethods = [
        ...sale.payments.map((payment) => ({
          payment_method: payment.paymentMethod,
        })),
        ...parsedPayments,
      ];

      for (const payment of parsedPayments) {
        await client.salePayment.create({
          data: {
            saleId,
            amount: payment.amount,
            paymentDate: payment.payment_date || defaultPaymentDate,
            paymentMethod: payment.payment_method,
            notes: payment.notes || cleanText(notes),
            createdBy: createdBy ? Number(createdBy) : null,
          },
        });
      }

      await client.sale.update({
        where: { id: saleId },
        data: {
          paidAmount: nextPaidAmount,
          paymentMethod: paymentMethodSummary(nextPaymentMethods),
          paymentStatus: derivePaymentStatus(effectivePaidAmount + paymentAmount, netTotalAmount),
        },
      });
    });

    return getSaleById(saleId);
  } catch (error) {
    if (error.code === 'P2003') {
      throw createError('Invalid sale or user reference', 400);
    }

    throw error;
  }
};

const normalizeSaleReturnItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw createError('Sale return must include at least one item', 400);
  }

  const itemMap = new Map();

  for (const item of items) {
    const saleItemId = Number(item.sale_item_id ?? item.saleItemId ?? item.id);

    if (!Number.isInteger(saleItemId)) {
      throw createError('Each return item requires a valid sale item', 400);
    }

    const quantity = parseReturnQuantity(item);
    const current = itemMap.get(saleItemId) || { sale_item_id: saleItemId, quantity: 0 };

    current.quantity += quantity;
    itemMap.set(saleItemId, current);
  }

  return Array.from(itemMap.values());
};

export const createSaleReturn = async (
  id,
  {
    return_number = null,
    return_date = new Date(),
    notes = null,
    items,
  },
  createdBy,
) => {
  const saleId = Number(id);
  const parsedItems = normalizeSaleReturnItems(items);
  const returnDate = new Date(return_date);

  if (!Number.isInteger(saleId)) {
    throw createError('Invalid sale id', 400);
  }

  if (Number.isNaN(returnDate.getTime())) {
    throw createError('Return date is invalid', 400);
  }

  try {
    await prisma.$transaction(async (client) => {
      const sale = await client.sale.findUnique({
        where: { id: saleId },
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
          returns: {
            select: {
              totalAmount: true,
            },
          },
          refunds: {
            select: {
              amount: true,
            },
          },
        },
      });

      if (!sale) {
        throw createError('Sale not found', 404);
      }

      const saleItemMap = new Map(sale.items.map((item) => [item.id, item]));
      const returnedQuantities = await client.saleReturnItem.groupBy({
        by: ['saleItemId'],
        where: {
          saleReturn: {
            saleId,
          },
        },
        _sum: {
          quantity: true,
        },
      });
      const returnedQuantityMap = new Map(
        returnedQuantities.map((entry) => [entry.saleItemId, Number(entry._sum.quantity || 0)]),
      );
      const returnItems = parsedItems.map((item) => {
        const saleItem = saleItemMap.get(item.sale_item_id);

        if (!saleItem) {
          throw createError('Return item does not belong to this sale', 400);
        }

        if (saleItem.lineType !== 'product' || !saleItem.productId) {
          throw createError('Only product lines can be returned in a sale return', 400);
        }

        const alreadyReturned = returnedQuantityMap.get(saleItem.id) || 0;
        const returnableQuantity = Number(saleItem.quantity) - alreadyReturned;

        if (item.quantity > returnableQuantity) {
          throw createError(
            `Return quantity cannot be greater than remaining returnable quantity for ${saleItem.product?.name || saleItem.description || `item #${saleItem.id}`}`,
            400,
            {
              sale_item_id: saleItem.id,
              sold_quantity: saleItem.quantity,
              already_returned_quantity: alreadyReturned,
              returnable_quantity: returnableQuantity,
              requested_quantity: item.quantity,
            },
          );
        }

        const unitPrice = toMoneyNumber(saleItem.unitPrice);
        const lineTotal = roundMoney(item.quantity * unitPrice);

        return {
          sale_item_id: saleItem.id,
          product_id: saleItem.productId,
          quantity: item.quantity,
          unit_price: unitPrice,
          line_total: lineTotal,
          product: saleItem.product,
        };
      });
      const totalAmount = roundMoney(
        returnItems.reduce((sum, item) => sum + item.line_total, 0),
      );

      if (totalAmount <= 0) {
        throw createError('Sale return total must be greater than 0', 400);
      }

      const finalReturnNumber =
        cleanText(return_number) ||
        `SRET-${Date.now()}`;

      const saleReturn = await client.saleReturn.create({
        data: {
          saleId,
          customerId: sale.customerId,
          returnNumber: finalReturnNumber,
          returnDate,
          totalAmount,
          notes: cleanText(notes),
          createdBy: createdBy ? Number(createdBy) : null,
        },
        select: { id: true },
      });

      for (const item of returnItems) {
        await client.saleReturnItem.create({
          data: {
            saleReturnId: saleReturn.id,
            saleItemId: item.sale_item_id,
            productId: item.product_id,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
          },
        });

        await recordStockMovement(client, {
          productId: item.product_id,
          movementType: 'SALE_RETURN',
          quantityChange: item.quantity,
          referenceType: 'sale_return',
          referenceId: saleReturn.id,
          notes: `Sale return ${finalReturnNumber} for ${sale.saleNumber}`,
          createdBy,
        });
      }

      const previousReturnedAmount = sale.returns.reduce(
        (sum, saleReturnEntry) => sum + toMoneyNumber(saleReturnEntry.totalAmount),
        0,
      );
      const refundedAmount = sale.refunds.reduce(
        (sum, refund) => sum + toMoneyNumber(refund.amount),
        0,
      );
      const netTotalAmount = Math.max(
        toMoneyNumber(sale.totalAmount) - previousReturnedAmount - totalAmount,
        0,
      );
      const effectivePaidAmount = Math.max(toMoneyNumber(sale.paidAmount) - refundedAmount, 0);

      await client.sale.update({
        where: { id: saleId },
        data: {
          paymentStatus: derivePaymentStatus(effectivePaidAmount, netTotalAmount),
        },
      });
    });

    return getSaleById(saleId);
  } catch (error) {
    if (error.code === 'P2002') {
      throw createError('Sale return number already exists', 409);
    }

    if (error.code === 'P2003') {
      throw createError('Invalid sale, sale item, product, customer, or user reference', 400);
    }

    throw error;
  }
};
