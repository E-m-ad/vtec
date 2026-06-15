import asyncHandler from '../../utils/asyncHandler.js';
import { createBrand, deleteBrand, getBrandById, listBrands, updateBrand } from './brand.service.js';

export const getBrands = asyncHandler(async (req, res) => {
  const brands = await listBrands(req.query);

  res.json({
    success: true,
    data: brands,
  });
});

export const getBrand = asyncHandler(async (req, res) => {
  const brand = await getBrandById(req.params.id);

  res.json({
    success: true,
    data: brand,
  });
});

export const create = asyncHandler(async (req, res) => {
  const brand = await createBrand(req.body);

  res.status(201).json({
    success: true,
    data: brand,
  });
});

export const update = asyncHandler(async (req, res) => {
  const brand = await updateBrand(req.params.id, req.body);

  res.json({
    success: true,
    data: brand,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const brand = await deleteBrand(req.params.id);

  res.json({
    success: true,
    data: brand,
  });
});
