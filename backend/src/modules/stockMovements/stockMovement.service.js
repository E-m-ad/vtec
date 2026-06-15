import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';

const movementTypes = ['PURCHASE', 'SALE', 'ADJUSTMENT', 'SALE_RETURN', 'PURCHASE_RETURN'];
const positiveMovementTypes = ['PURCHASE', 'SALE_RETURN'];
const negativeMovementTypes = ['SALE', 'PURCHASE_RETURN'];

const parseQuantityChange = (value) => {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity === 0) {
    throw createError('Stock movement quantity must be a non-zero integer', 400);
  }

  return quantity;
};

const validateMovementType = (movementType, quantity) => {
  if (!movementTypes.includes(movementType)) {
    throw createError('Invalid stock movement type', 400);
  }

  if (positiveMovementTypes.includes(movementType) && quantity < 0) {
    throw createError(`${movementType} stock movements must increase stock`, 400);
  }

  if (negativeMovementTypes.includes(movementType) && quantity > 0) {
    throw createError(`${movementType} stock movements must decrease stock`, 400);
  }
};

export const recordStockMovement = async (
  client,
  {
    productId,
    movementType,
    quantityChange,
    referenceType = null,
    referenceId = null,
    notes = null,
    createdBy = null,
  },
) => {
  const quantity = parseQuantityChange(quantityChange);
  validateMovementType(movementType, quantity);
  const numericProductId = Number(productId);

  const products = await client.$queryRaw`
    SELECT id, stock_quantity
    FROM products
    WHERE id = ${numericProductId}
    FOR UPDATE
  `;

  const product = products[0];
  if (!product) {
    throw createError('Product not found', 404);
  }

  const previousQuantity = Number(product.stock_quantity);
  const newQuantity = previousQuantity + quantity;

  if (newQuantity < 0) {
    throw createError('Insufficient stock for this movement', 400, {
      product_id: productId,
      available_quantity: previousQuantity,
      requested_change: quantity,
    });
  }

  await client.$executeRaw`SELECT set_config('app.stock_movement_context', 'enabled', true)`;

  await client.product.update({
    where: { id: numericProductId },
    data: { stockQuantity: newQuantity },
  });

  return client.stockMovement.create({
    data: {
      productId: numericProductId,
      movementType,
      quantity,
      previousQuantity,
      newQuantity,
      referenceType,
      referenceId: referenceId ? Number(referenceId) : null,
      notes,
      createdBy: createdBy ? Number(createdBy) : null,
    },
  });
};

export const listStockMovements = async ({
  product_id,
  movement_type,
  reference_type,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) => {
  const where = {};

  if (product_id) {
    where.productId = Number(product_id);
  }

  if (movement_type) {
    where.movementType = movement_type;
  }

  if (reference_type) {
    where.referenceType = reference_type;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  return prisma.stockMovement.findMany({
    where,
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
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Number(limit) || 50, 200),
    skip: Number(offset) || 0,
  });
};

export const getStockMovementById = async (id) => {
  const movement = await prisma.stockMovement.findUnique({
    where: { id: Number(id) },
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
  });

  if (!movement) {
    throw createError('Stock movement not found', 404);
  }

  return movement;
};

export const adjustStock = async ({ product_id, quantity_change, notes, created_by }) => {
  return prisma.$transaction(async (client) => {
    return recordStockMovement(client, {
      productId: product_id,
      movementType: 'ADJUSTMENT',
      quantityChange: quantity_change,
      referenceType: 'manual_adjustment',
      notes,
      createdBy: created_by,
    });
  });
};
