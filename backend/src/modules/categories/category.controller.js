import asyncHandler from '../../utils/asyncHandler.js';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory,
} from './category.service.js';

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await listCategories(req.query);

  res.json({
    success: true,
    data: categories,
  });
});

export const getCategory = asyncHandler(async (req, res) => {
  const category = await getCategoryById(req.params.id);

  res.json({
    success: true,
    data: category,
  });
});

export const create = asyncHandler(async (req, res) => {
  const category = await createCategory(req.body);

  res.status(201).json({
    success: true,
    data: category,
  });
});

export const update = asyncHandler(async (req, res) => {
  const category = await updateCategory(req.params.id, req.body);

  res.json({
    success: true,
    data: category,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const category = await deleteCategory(req.params.id);

  res.json({
    success: true,
    data: category,
  });
});
