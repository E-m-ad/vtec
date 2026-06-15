import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import { normalizePartNumber, normalizePartNumberSearch } from '../../utils/normalizePartNumber.js';
import { recordStockMovement } from '../stockMovements/stockMovement.service.js';

const countStatuses = new Set(['counting', 'reviewed', 'outdated', 'applied', 'cancelled']);
const countableStatuses = new Set(['counting', 'reviewed']);
const scopeTypes = new Set(['all', 'category', 'brand', 'supplier', 'location', 'search']);

const cleanText = (value) => {
  if (typeof value === 'undefined' || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const toInt = (value, label, { min = null, allowZero = false } = {}) => {
  const number = Number(value);
  const minimum = min ?? (allowZero ? 0 : 1);

  if (!Number.isInteger(number) || number < minimum) {
    throw createError(`${label} must be ${allowZero ? '0 or more' : 'greater than 0'}`, 400);
  }

  return number;
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const productSelect = {
  id: true,
  sku: true,
  barcode: true,
  name: true,
  stockQuantity: true,
  purchasePrice: true,
  location: true,
  isActive: true,
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

const itemInclude = {
  product: {
    select: productSelect,
  },
  counter: {
    select: {
      name: true,
    },
  },
};

const sessionInclude = {
  creator: {
    select: {
      name: true,
    },
  },
  items: {
    include: itemInclude,
    orderBy: [{ isCounted: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
  },
};

const buildProductWhere = ({ scope_type = 'all', scope_value = null } = {}) => {
  const scopeType = cleanText(scope_type) || 'all';
  const scopeValue = cleanText(scope_value);

  if (!scopeTypes.has(scopeType)) {
    throw createError('Inventory count scope is invalid', 400);
  }

  const where = { isActive: true };

  if (scopeType === 'category') {
    where.categoryId = toInt(scopeValue, 'Category', { min: 1 });
  }

  if (scopeType === 'brand') {
    where.brandId = toInt(scopeValue, 'Brand', { min: 1 });
  }

  if (scopeType === 'supplier') {
    where.supplierId = toInt(scopeValue, 'Supplier', { min: 1 });
  }

  if (scopeType === 'location') {
    if (!scopeValue) {
      throw createError('Location is required for a location inventory count', 400);
    }

    where.location = { contains: scopeValue, mode: 'insensitive' };
  }

  if (scopeType === 'search') {
    if (!scopeValue) {
      throw createError('Search text is required for a search inventory count', 400);
    }

    const normalizedSearch = normalizePartNumberSearch(scopeValue);
    const partNumberSearches = [scopeValue, normalizedSearch].filter(
      (value, index, values) => value && values.indexOf(value) === index,
    );

    where.OR = [
      { name: { contains: scopeValue, mode: 'insensitive' } },
      { category: { is: { name: { contains: scopeValue, mode: 'insensitive' } } } },
      { brand: { is: { name: { contains: scopeValue, mode: 'insensitive' } } } },
      { supplier: { is: { name: { contains: scopeValue, mode: 'insensitive' } } } },
      { location: { contains: scopeValue, mode: 'insensitive' } },
      ...partNumberSearches.flatMap((value) => [
        { sku: { contains: value, mode: 'insensitive' } },
        { barcode: { contains: value, mode: 'insensitive' } },
      ]),
    ];
  }

  return {
    where,
    scopeType,
    scopeValue,
  };
};

const findProductByScanCode = async (client, code) => {
  const rawCode = cleanText(code);

  if (!rawCode) {
    throw createError('Scan or enter a product barcode first', 400);
  }

  const normalizedCode = normalizePartNumber(rawCode);
  const lookupValues = [rawCode, normalizedCode].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );

  const product = await client.product.findFirst({
    where: {
      isActive: true,
      OR: lookupValues.flatMap((value) => [
        { sku: { equals: value, mode: 'insensitive' } },
        { barcode: { equals: value, mode: 'insensitive' } },
      ]),
    },
    select: productSelect,
  });

  if (!product) {
    throw createError('Product barcode or part number was not found', 404);
  }

  return product;
};

const ensureEditableSession = (session) => {
  if (!session) {
    throw createError('Inventory count session not found', 404);
  }

  if (!countableStatuses.has(session.status)) {
    throw createError('Only counting or reviewed inventory counts can be changed', 400);
  }
};

const addItemAliases = (item) => {
  if (!item) return item;

  const systemQuantity = Number(item.systemQuantitySnapshot || 0);
  const countedQuantity = Number(item.countedQuantity || 0);
  const varianceQuantity = item.isCounted ? countedQuantity - systemQuantity : null;
  const varianceValue = varianceQuantity === null ? null : roundMoney(varianceQuantity * toMoneyNumber(item.unitCost));

  return {
    ...item,
    session_id: item.sessionId,
    product_id: item.productId,
    system_quantity_snapshot: item.systemQuantitySnapshot,
    counted_quantity: item.countedQuantity,
    scanned_count: item.scannedCount,
    is_counted: item.isCounted,
    unit_cost: item.unitCost,
    added_from_scan: item.addedFromScan,
    last_scanned_at: item.lastScannedAt,
    counted_by: item.countedBy,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    product_name: item.product?.name || null,
    product_sku: item.product?.sku || null,
    product_barcode: item.product?.barcode || item.product?.sku || null,
    product_location: item.product?.location || null,
    category_name: item.product?.category?.name || null,
    brand_name: item.product?.brand?.name || null,
    supplier_name: item.product?.supplier?.name || null,
    variance_quantity: varianceQuantity,
    variance_value: varianceValue,
  };
};

const buildSummary = (items = []) => {
  const summary = {
    total_items: items.length,
    counted_items: 0,
    uncounted_items: 0,
    matched_items: 0,
    shortage_items: 0,
    extra_items: 0,
    total_shortage_quantity: 0,
    total_extra_quantity: 0,
    variance_quantity: 0,
    variance_value: 0,
  };

  items.forEach((item) => {
    if (!item.isCounted) {
      summary.uncounted_items += 1;
      return;
    }

    const systemQuantity = Number(item.systemQuantitySnapshot || 0);
    const countedQuantity = Number(item.countedQuantity || 0);
    const variance = countedQuantity - systemQuantity;
    const varianceValue = variance * toMoneyNumber(item.unitCost);

    summary.counted_items += 1;
    summary.variance_quantity += variance;
    summary.variance_value += varianceValue;

    if (variance === 0) {
      summary.matched_items += 1;
    } else if (variance < 0) {
      summary.shortage_items += 1;
      summary.total_shortage_quantity += Math.abs(variance);
    } else {
      summary.extra_items += 1;
      summary.total_extra_quantity += variance;
    }
  });

  summary.variance_value = roundMoney(summary.variance_value);

  return summary;
};

const decorateSession = (session) => {
  if (!session) return session;

  const items = Array.isArray(session.items) ? session.items.map(addItemAliases) : [];
  const summary = buildSummary(items);

  return {
    ...session,
    count_number: session.countNumber,
    scope_type: session.scopeType,
    scope_value: session.scopeValue,
    started_at: session.startedAt,
    reviewed_at: session.reviewedAt,
    applied_at: session.appliedAt,
    created_by: session.createdBy,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    item_count: session._count?.items ?? items.length,
    items,
    summary,
  };
};

const getSessionOrThrow = async (client, id, include = {}) => {
  const session = await client.inventoryCountSession.findUnique({
    where: { id: Number(id) },
    include,
  });

  if (!session) {
    throw createError('Inventory count session not found', 404);
  }

  return session;
};

const getSessionProductIds = async (client, sessionId) => {
  const items = await client.inventoryCountItem.findMany({
    where: { sessionId: Number(sessionId) },
    select: { productId: true },
  });

  return items.map((item) => item.productId);
};

const hasSnapshotStockMismatch = async (client, sessionId) => {
  const rows = await client.$queryRaw`
    SELECT ici.id
    FROM inventory_count_items ici
    JOIN products p ON p.id = ici.product_id
    WHERE ici.session_id = ${Number(sessionId)}
      AND (p.stock_quantity <> ici.system_quantity_snapshot OR p.is_active = false)
    LIMIT 1
  `;

  return rows.length > 0;
};

const hasMissingScopedProduct = async (client, session, productIds, allowedMissingProductIds = []) => {
  const { where } = buildProductWhere({
    scope_type: session.scopeType,
    scope_value: session.scopeValue,
  });
  const excludedProductIds = [...new Set([...productIds, ...allowedMissingProductIds].map(Number).filter(Boolean))];

  const missingProduct = await client.product.findFirst({
    where: {
      ...where,
      ...(excludedProductIds.length ? { id: { notIn: excludedProductIds } } : {}),
    },
    select: { id: true },
  });

  return Boolean(missingProduct);
};

const hasStockMovementAfterStart = async (client, session, productIds) => {
  if (!productIds.length) return false;

  const movement = await client.stockMovement.findFirst({
    where: {
      productId: { in: productIds },
      createdAt: { gt: session.startedAt },
      NOT: {
        referenceType: 'inventory_count',
        referenceId: session.id,
      },
    },
    select: { id: true },
  });

  return Boolean(movement);
};

const isSessionUnsynced = async (client, session, options = {}) => {
  const productIds = await getSessionProductIds(client, session.id);

  if (await hasMissingScopedProduct(client, session, productIds, options.allowedMissingProductIds)) {
    return true;
  }

  if (await hasSnapshotStockMismatch(client, session.id)) {
    return true;
  }

  return hasStockMovementAfterStart(client, session, productIds);
};

const markSessionOutdatedIfUnsynced = async (client, session, options = {}) => {
  if (!session || !countableStatuses.has(session.status)) {
    return session;
  }

  const unsynced = await isSessionUnsynced(client, session, options);
  if (!unsynced) {
    return session;
  }

  const result = await client.inventoryCountSession.updateMany({
    where: {
      id: session.id,
      status: { in: ['counting', 'reviewed'] },
    },
    data: {
      status: 'outdated',
    },
  });

  return result.count ? { ...session, status: 'outdated' } : session;
};

const refreshOutdatedSessions = async (client, sessions) => {
  return Promise.all(sessions.map((session) => markSessionOutdatedIfUnsynced(client, session)));
};

export const listInventoryCounts = async ({ status, limit = 50, offset = 0 } = {}) => {
  const where = {};
  const normalizedStatus = cleanText(status);

  if (normalizedStatus) {
    if (!countStatuses.has(normalizedStatus)) {
      throw createError('Inventory count status is invalid', 400);
    }

    where.status =
      normalizedStatus === 'outdated'
        ? { in: ['counting', 'reviewed', 'outdated'] }
        : normalizedStatus;
  }

  const sessions = await prisma.inventoryCountSession.findMany({
    where,
    include: {
      creator: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          items: true,
        },
      },
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Number(limit) || 50, 200),
    skip: Number(offset) || 0,
  });

  const refreshedSessions = await refreshOutdatedSessions(prisma, sessions);
  const filteredSessions = normalizedStatus
    ? refreshedSessions.filter((session) => session.status === normalizedStatus)
    : refreshedSessions;

  return filteredSessions.map(decorateSession);
};

export const getInventoryCountById = async (id) => {
  const session = await prisma.inventoryCountSession.findUnique({
    where: { id: Number(id) },
    include: sessionInclude,
  });

  if (!session) {
    throw createError('Inventory count session not found', 404);
  }

  const refreshedSession = await markSessionOutdatedIfUnsynced(prisma, session);

  return decorateSession(refreshedSession);
};

export const createInventoryCount = async (payload = {}, createdBy) => {
  const { where, scopeType, scopeValue } = buildProductWhere(payload);
  const notes = cleanText(payload.notes);

  const sessionId = await prisma.$transaction(async (client) => {
    const products = await client.product.findMany({
      where,
      select: {
        id: true,
        stockQuantity: true,
        purchasePrice: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 5000,
    });

    if (!products.length) {
      throw createError('No active products found for this inventory count scope', 400);
    }

    const session = await client.inventoryCountSession.create({
      data: {
        countNumber: `COUNT-${Date.now()}`,
        scopeType,
        scopeValue,
        notes,
        createdBy: createdBy ? Number(createdBy) : null,
      },
      select: { id: true },
    });

    await client.inventoryCountItem.createMany({
      data: products.map((product) => ({
        sessionId: session.id,
        productId: product.id,
        systemQuantitySnapshot: Number(product.stockQuantity || 0),
        countedQuantity: 0,
        scannedCount: 0,
        isCounted: false,
        unitCost: toMoneyNumber(product.purchasePrice),
      })),
    });

    return session.id;
  });

  return getInventoryCountById(sessionId);
};

export const scanInventoryCountItem = async (id, payload = {}, createdBy) => {
  const quantity = toInt(payload.quantity ?? 1, 'Scan quantity', { min: 1 });

  const result = await prisma.$transaction(async (client) => {
    let session = await getSessionOrThrow(client, id);
    session = await markSessionOutdatedIfUnsynced(client, session);
    ensureEditableSession(session);

    const product = await findProductByScanCode(client, payload.code ?? payload.barcode ?? payload.sku);
    const existingItem = await client.inventoryCountItem.findUnique({
      where: {
        sessionId_productId: {
          sessionId: session.id,
          productId: product.id,
        },
      },
      include: itemInclude,
    });
    const previousCountedQuantity = Number(existingItem?.countedQuantity || 0);

    const item = existingItem
      ? await client.inventoryCountItem.update({
          where: { id: existingItem.id },
          data: {
            countedQuantity: previousCountedQuantity + quantity,
            scannedCount: Number(existingItem.scannedCount || 0) + quantity,
            isCounted: true,
            lastScannedAt: new Date(),
            countedBy: createdBy ? Number(createdBy) : null,
          },
          include: itemInclude,
        })
      : await client.inventoryCountItem.create({
          data: {
            sessionId: session.id,
            productId: product.id,
            systemQuantitySnapshot: Number(product.stockQuantity || 0),
            countedQuantity: quantity,
            scannedCount: quantity,
            isCounted: true,
            unitCost: toMoneyNumber(product.purchasePrice),
            addedFromScan: true,
            lastScannedAt: new Date(),
            countedBy: createdBy ? Number(createdBy) : null,
          },
          include: itemInclude,
        });

    return {
      previous_counted_quantity: previousCountedQuantity,
      scan_quantity: quantity,
      item: addItemAliases(item),
    };
  });

  return result;
};

export const updateInventoryCountItem = async (id, itemId, payload = {}, createdBy) => {
  const countedQuantity = toInt(
    payload.counted_quantity ?? payload.countedQuantity,
    'Counted quantity',
    { allowZero: true },
  );

  const item = await prisma.$transaction(async (client) => {
    let session = await getSessionOrThrow(client, id);
    session = await markSessionOutdatedIfUnsynced(client, session);
    ensureEditableSession(session);

    const existingItem = await client.inventoryCountItem.findFirst({
      where: {
        id: Number(itemId),
        sessionId: session.id,
      },
      select: {
        id: true,
      },
    });

    if (!existingItem) {
      throw createError('Inventory count item not found', 404);
    }

    return client.inventoryCountItem.update({
      where: { id: Number(itemId) },
      data: {
        countedQuantity,
        isCounted: true,
        notes: cleanText(payload.notes),
        countedBy: createdBy ? Number(createdBy) : null,
      },
      include: itemInclude,
    });
  });

  return {
    item: addItemAliases(item),
  };
};

export const addInventoryCountItem = async (id, payload = {}, createdBy) => {
  const productId = toInt(payload.product_id ?? payload.productId, 'Product', { min: 1 });
  const countedQuantity = toInt(
    payload.counted_quantity ?? payload.countedQuantity ?? 0,
    'Counted quantity',
    { allowZero: true },
  );

  const item = await prisma.$transaction(async (client) => {
    let session = await getSessionOrThrow(client, id);
    session = await markSessionOutdatedIfUnsynced(client, session, {
      allowedMissingProductIds: [productId],
    });
    ensureEditableSession(session);

    const product = await client.product.findUnique({
      where: { id: productId },
      select: productSelect,
    });

    if (!product || !product.isActive) {
      throw createError('Product not found', 404);
    }

    return client.inventoryCountItem.upsert({
      where: {
        sessionId_productId: {
          sessionId: session.id,
          productId,
        },
      },
      create: {
        sessionId: session.id,
        productId,
        systemQuantitySnapshot: Number(product.stockQuantity || 0),
        countedQuantity,
        scannedCount: 0,
        isCounted: true,
        unitCost: toMoneyNumber(product.purchasePrice),
        addedFromScan: true,
        notes: cleanText(payload.notes),
        countedBy: createdBy ? Number(createdBy) : null,
      },
      update: {
        countedQuantity,
        isCounted: true,
        notes: cleanText(payload.notes),
        countedBy: createdBy ? Number(createdBy) : null,
      },
      include: itemInclude,
    });
  });

  return {
    item: addItemAliases(item),
  };
};

export const updateInventoryCountStatus = async (id, payload = {}) => {
  const status = cleanText(payload.status);

  if (!countStatuses.has(status)) {
    throw createError('Inventory count status is invalid', 400);
  }

  if (status === 'applied') {
    throw createError('Use apply to change stock from an inventory count', 400);
  }

  if (status === 'outdated') {
    throw createError('Outdated status is set automatically when the inventory count is no longer synced', 400);
  }

  let session = await prisma.inventoryCountSession.findUnique({
    where: { id: Number(id) },
  });

  if (!session) {
    throw createError('Inventory count session not found', 404);
  }

  session = await markSessionOutdatedIfUnsynced(prisma, session);

  if (session.status === 'applied' || session.status === 'cancelled' || session.status === 'outdated') {
    throw createError('Applied, cancelled, or outdated inventory counts cannot be changed', 400);
  }

  const updatedSession = await prisma.inventoryCountSession.update({
    where: { id: Number(id) },
    data: {
      status,
      reviewedAt: status === 'reviewed' ? new Date() : session.reviewedAt,
    },
    include: sessionInclude,
  });

  return decorateSession(updatedSession);
};

export const cancelInventoryCount = async (id) => {
  return updateInventoryCountStatus(id, { status: 'cancelled' });
};

export const deleteInventoryCount = async (id) => {
  const session = await prisma.inventoryCountSession.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      countNumber: true,
      status: true,
    },
  });

  if (!session) {
    throw createError('Inventory count session not found', 404);
  }

  await prisma.inventoryCountSession.delete({
    where: { id: session.id },
  });

  return {
    id: session.id,
    count_number: session.countNumber,
    countNumber: session.countNumber,
  };
};

export const applyInventoryCount = async (id, payload = {}, createdBy) => {
  const force = payload.force === true || payload.force === 'true';
  const sessionId = Number(id);

  await prisma.$transaction(async (client) => {
    let session = await getSessionOrThrow(client, sessionId, {
      items: {
        where: { isCounted: true },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              stockQuantity: true,
            },
          },
        },
      },
    });
    session = await markSessionOutdatedIfUnsynced(client, session);

    if (session.status === 'applied') {
      throw createError('Inventory count is already applied', 400);
    }

    if (session.status === 'cancelled' || session.status === 'outdated') {
      throw createError('Cancelled or outdated inventory counts cannot be applied', 400);
    }

    if (!session.items.length) {
      throw createError('Count at least one product before applying adjustments', 400);
    }

    const productIds = session.items.map((item) => item.productId);
    const movementsAfterStart = await client.stockMovement.findMany({
      where: {
        productId: { in: productIds },
        createdAt: { gt: session.startedAt },
      },
      include: {
        product: {
          select: {
            name: true,
            sku: true,
          },
        },
      },
      take: 12,
      orderBy: { createdAt: 'desc' },
    });

    if (movementsAfterStart.length && !force) {
      throw createError(
        'Some counted products changed stock after this count started. Review them before applying.',
        409,
        {
          movements_after_start: movementsAfterStart.map((movement) => ({
            product_id: movement.productId,
            product_name: movement.product?.name,
            product_sku: movement.product?.sku,
            movement_type: movement.movementType,
            quantity: movement.quantity,
            created_at: movement.createdAt,
          })),
        },
      );
    }

    for (const item of session.items) {
      if (!item.product) {
        throw createError('Product not found while applying inventory count', 404);
      }

      const currentQuantity = Number(item.product.stockQuantity || 0);
      const adjustmentQuantity = Number(item.countedQuantity || 0) - currentQuantity;

      if (adjustmentQuantity === 0) continue;

      await recordStockMovement(client, {
        productId: item.productId,
        movementType: 'ADJUSTMENT',
        quantityChange: adjustmentQuantity,
        referenceType: 'inventory_count',
        referenceId: session.id,
        notes: [
          `Inventory count ${session.countNumber}`,
          `Snapshot: ${item.systemQuantitySnapshot}`,
          `Current before apply: ${currentQuantity}`,
          `Counted: ${item.countedQuantity}`,
        ].join(' | '),
        createdBy,
      });
    }

    await client.inventoryCountSession.update({
      where: { id: session.id },
      data: {
        status: 'applied',
        reviewedAt: session.reviewedAt || new Date(),
        appliedAt: new Date(),
      },
    });
  });

  return getInventoryCountById(sessionId);
};
