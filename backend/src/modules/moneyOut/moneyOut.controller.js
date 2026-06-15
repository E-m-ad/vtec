import asyncHandler from '../../utils/asyncHandler.js';
import { createMoneyOut, listMoneyOut } from './moneyOut.service.js';

export const getMoneyOut = asyncHandler(async (req, res) => {
  const report = await listMoneyOut(req.query);

  res.json({
    success: true,
    data: report,
  });
});

export const create = asyncHandler(async (req, res) => {
  const transaction = await createMoneyOut(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: transaction,
  });
});
