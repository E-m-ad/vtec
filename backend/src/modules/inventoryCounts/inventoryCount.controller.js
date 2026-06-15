import asyncHandler from '../../utils/asyncHandler.js';
import {
  addInventoryCountItem,
  applyInventoryCount,
  cancelInventoryCount,
  createInventoryCount,
  deleteInventoryCount,
  getInventoryCountById,
  listInventoryCounts,
  scanInventoryCountItem,
  updateInventoryCountItem,
  updateInventoryCountStatus,
} from './inventoryCount.service.js';

export const getInventoryCounts = asyncHandler(async (req, res) => {
  const sessions = await listInventoryCounts(req.query);

  res.json({
    success: true,
    data: sessions,
  });
});

export const getInventoryCount = asyncHandler(async (req, res) => {
  const session = await getInventoryCountById(req.params.id);

  res.json({
    success: true,
    data: session,
  });
});

export const create = asyncHandler(async (req, res) => {
  const session = await createInventoryCount(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: session,
  });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const session = await updateInventoryCountStatus(req.params.id, req.body);

  res.json({
    success: true,
    data: session,
  });
});

export const scanItem = asyncHandler(async (req, res) => {
  const result = await scanInventoryCountItem(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const addItem = asyncHandler(async (req, res) => {
  const result = await addInventoryCountItem(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: result,
  });
});

export const updateItem = asyncHandler(async (req, res) => {
  const result = await updateInventoryCountItem(
    req.params.id,
    req.params.itemId,
    req.body,
    req.user.id,
  );

  res.json({
    success: true,
    data: result,
  });
});

export const apply = asyncHandler(async (req, res) => {
  const session = await applyInventoryCount(req.params.id, req.body, req.user.id);

  res.json({
    success: true,
    data: session,
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const session = await cancelInventoryCount(req.params.id);

  res.json({
    success: true,
    data: session,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const session = await deleteInventoryCount(req.params.id);

  res.json({
    success: true,
    data: session,
  });
});
