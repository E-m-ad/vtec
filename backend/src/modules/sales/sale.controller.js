import asyncHandler from '../../utils/asyncHandler.js';
import {
  createSale,
  createSalePayment,
  createSaleReturn,
  getSaleById,
  listSales,
} from './sale.service.js';

export const getSales = asyncHandler(async (req, res) => {
  const sales = await listSales(req.query);

  res.json({
    success: true,
    data: sales,
  });
});

export const getSale = asyncHandler(async (req, res) => {
  const sale = await getSaleById(req.params.id);

  res.json({
    success: true,
    data: sale,
  });
});

export const create = asyncHandler(async (req, res) => {
  const sale = await createSale(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: sale,
  });
});

export const pay = asyncHandler(async (req, res) => {
  const sale = await createSalePayment(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: sale,
  });
});

export const returnItems = asyncHandler(async (req, res) => {
  const sale = await createSaleReturn(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: sale,
  });
});
