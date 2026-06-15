import asyncHandler from '../../utils/asyncHandler.js';
import {
  createSupplierLegacyWorkbook,
  deleteSupplierLegacyWorkbook,
  getSupplierLegacyWorkbook,
  listSupplierLegacyWorkbooks,
} from './supplierLegacyWorkbook.service.js';

export const getLegacyWorkbooks = asyncHandler(async (req, res) => {
  const workbooks = await listSupplierLegacyWorkbooks(req.params.id);

  res.json({
    success: true,
    data: {
      workbooks,
    },
  });
});

export const uploadLegacyWorkbook = asyncHandler(async (req, res) => {
  const workbook = await createSupplierLegacyWorkbook(req.params.id, {
    fileName: req.get('x-file-name'),
    buffer: req.body,
    uploadedBy: req.user.id,
  });

  res.status(201).json({
    success: true,
    data: workbook,
  });
});

export const getLegacyWorkbook = asyncHandler(async (req, res) => {
  const workbook = await getSupplierLegacyWorkbook(req.params.id, req.params.workbookId);

  res.json({
    success: true,
    data: workbook,
  });
});

export const removeLegacyWorkbook = asyncHandler(async (req, res) => {
  const workbook = await deleteSupplierLegacyWorkbook(req.params.id, req.params.workbookId);

  res.json({
    success: true,
    data: workbook,
  });
});
