import asyncHandler from "../../utils/asyncHandler.js";
import {
  createProduct,
  deactivateProduct,
  getProductById,
  getProductSupplierSources,
  listProducts,
  updateProduct,
} from "./product.service.js";

export const getProducts = asyncHandler(async (req, res) => {
  const products = await listProducts(req.query);

  res.json({
    success: true,
    data: products,
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await getProductById(req.params.id);

  res.json({
    success: true,
    data: product,
  });
});

export const getProductSuppliers = asyncHandler(async (req, res) => {
  const sources = await getProductSupplierSources(req.params.id);

  res.json({
    success: true,
    data: sources,
  });
});

export const create = asyncHandler(async (req, res) => {
  const product = await createProduct(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: product,
  });
});

export const update = asyncHandler(async (req, res) => {
  const product = await updateProduct(req.params.id, req.body);

  res.json({
    success: true,
    data: product,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const product = await deactivateProduct(req.params.id);
  res.json({
    success: true,
    data: product,
  });
});
