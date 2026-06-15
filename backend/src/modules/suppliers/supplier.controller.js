import asyncHandler from '../../utils/asyncHandler.js';
import {
  createSupplier,
  createSupplierOpeningBalance,
  createSupplierPayment,
  createSupplierProductSettlement,
  createSupplierRefund,
  deleteSupplier,
  getSupplierById,
  getSupplierDetails,
  getSupplierPurchasedProducts,
  listSuppliers,
  updateSupplier,
} from './supplier.service.js';

export const getSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await listSuppliers(req.query);

  res.json({
    success: true,
    data: suppliers,
  });
});

export const getSupplier = asyncHandler(async (req, res) => {
  const supplier = await getSupplierById(req.params.id);

  res.json({
    success: true,
    data: supplier,
  });
});

export const getDetails = asyncHandler(async (req, res) => {
  const supplier = await getSupplierDetails(req.params.id);

  res.json({
    success: true,
    data: supplier,
  });
});

export const getPurchasedProducts = asyncHandler(async (req, res) => {
  const products = await getSupplierPurchasedProducts(req.params.id, req.query);

  res.json({
    success: true,
    data: products,
  });
});

export const create = asyncHandler(async (req, res) => {
  const supplier = await createSupplier(req.body);

  res.status(201).json({
    success: true,
    data: supplier,
  });
});

export const update = asyncHandler(async (req, res) => {
  const supplier = await updateSupplier(req.params.id, req.body);

  res.json({
    success: true,
    data: supplier,
  });
});

export const pay = asyncHandler(async (req, res) => {
  const supplier = await createSupplierPayment(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: supplier,
  });
});

export const addOpeningBalance = asyncHandler(async (req, res) => {
  const supplier = await createSupplierOpeningBalance(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: supplier,
  });
});

export const settleWithProduct = asyncHandler(async (req, res) => {
  const supplier = await createSupplierProductSettlement(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: supplier,
  });
});

export const refund = asyncHandler(async (req, res) => {
  const supplier = await createSupplierRefund(req.params.id, req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: supplier,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const supplier = await deleteSupplier(req.params.id);

  res.json({
    success: true,
    data: supplier,
  });
});
