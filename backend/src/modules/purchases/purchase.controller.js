import asyncHandler from '../../utils/asyncHandler.js';
import {
  createPurchase,
  createPurchaseReturn,
  getPurchaseById,
  listPurchases,
} from './purchase.service.js';

export const getPurchases = asyncHandler(async (req, res) => {
  const purchases = await listPurchases(req.query);

  res.json({
    success: true,
    data: purchases,
  });
});

export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await getPurchaseById(req.params.id);

  res.json({
    success: true,
    data: purchase,
  });
});

export const create = asyncHandler(async (req, res) => {
  const purchase = await createPurchase(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: purchase,
  });
});

export const returnItems = asyncHandler(async (req, res) => {
  const purchase = await createPurchaseReturn(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: purchase,
  });
});
