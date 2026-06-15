import asyncHandler from '../../utils/asyncHandler.js';
import {
  adjustStock,
  getStockMovementById,
  listStockMovements,
} from './stockMovement.service.js';

export const getStockMovements = asyncHandler(async (req, res) => {
  const movements = await listStockMovements(req.query);

  res.json({
    success: true,
    data: movements,
  });
});

export const getStockMovement = asyncHandler(async (req, res) => {
  const movement = await getStockMovementById(req.params.id);

  res.json({
    success: true,
    data: movement,
  });
});

export const createAdjustment = asyncHandler(async (req, res) => {
  const movement = await adjustStock({
    ...req.body,
    created_by: req.user.id,
  });

  res.status(201).json({
    success: true,
    data: movement,
  });
});
