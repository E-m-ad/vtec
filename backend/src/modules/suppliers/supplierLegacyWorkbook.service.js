import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';

import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../../uploads/legacy-supplier-workbooks');
const maxUploadBytes = 25 * 1024 * 1024;

const ensureUploadsDir = async () => {
  await fs.mkdir(uploadsDir, { recursive: true });
};

const cleanText = (value) => {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).trim();
};

const decodeFileName = (value) => {
  const text = cleanText(value);
  if (!text) return '';

  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const assertSupplierExists = async (supplierId) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true },
  });

  if (!supplier) {
    throw createError('Supplier not found', 404);
  }
};

const storedPathFor = (storedFileName) => {
  const resolvedPath = path.resolve(uploadsDir, storedFileName);

  if (!resolvedPath.startsWith(uploadsDir)) {
    throw createError('Legacy workbook file not found', 404);
  }

  return resolvedPath;
};

const workbookValue = (cell) => {
  const value = cell?.value;
  if (value === null || typeof value === 'undefined') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return value;
  if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result ?? '';
  if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text ?? '';
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || '').join('');
  }

  return cell.text || '';
};

const columnLabel = (columnNumber) => {
  let label = '';
  let number = columnNumber;

  while (number > 0) {
    const remainder = (number - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    number = Math.floor((number - remainder) / 26);
  }

  return label;
};

const workbookRecord = (workbook) => ({
  id: workbook.id,
  supplier_id: workbook.supplierId,
  supplierId: workbook.supplierId,
  original_file_name: workbook.originalFileName,
  originalFileName: workbook.originalFileName,
  stored_file_name: workbook.storedFileName,
  storedFileName: workbook.storedFileName,
  file_size_bytes: workbook.fileSizeBytes,
  fileSizeBytes: workbook.fileSizeBytes,
  checksum_sha256: workbook.checksumSha256,
  checksumSha256: workbook.checksumSha256,
  sheet_count: workbook.sheetCount,
  sheetCount: workbook.sheetCount,
  uploaded_by: workbook.uploadedBy,
  uploadedBy: workbook.uploadedBy,
  uploaded_at: workbook.uploadedAt,
  uploadedAt: workbook.uploadedAt,
  deleted_at: workbook.deletedAt,
  deletedAt: workbook.deletedAt,
  uploader: workbook.uploader || null,
});

const loadWorkbookMetadata = async (supplierId, workbookId) => {
  const workbook = await prisma.supplierLegacyWorkbook.findFirst({
    where: {
      id: Number(workbookId),
      supplierId,
      deletedAt: null,
    },
    include: {
      uploader: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!workbook) {
    throw createError('Legacy workbook not found', 404);
  }

  return workbook;
};

export const listSupplierLegacyWorkbooks = async (id) => {
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  await assertSupplierExists(supplierId);

  const workbooks = await prisma.supplierLegacyWorkbook.findMany({
    where: {
      supplierId,
      deletedAt: null,
    },
    include: {
      uploader: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
  });

  return workbooks.map(workbookRecord);
};

export const createSupplierLegacyWorkbook = async (
  id,
  { fileName: rawFileName, buffer, uploadedBy },
) => {
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  const originalFileName = path.basename(decodeFileName(rawFileName));
  if (!originalFileName || !/\.xlsx$/i.test(originalFileName)) {
    throw createError('Only .xlsx legacy workbooks can be imported', 400);
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError('Choose a workbook to import', 400);
  }

  if (buffer.length > maxUploadBytes) {
    throw createError('Workbook is larger than the 25 MB import limit', 400);
  }

  await assertSupplierExists(supplierId);

  const parsedWorkbook = new ExcelJS.Workbook();
  try {
    await parsedWorkbook.xlsx.load(buffer);
  } catch {
    throw createError('Uploaded file is not a valid Excel workbook', 400);
  }

  if (!parsedWorkbook.worksheets.length) {
    throw createError('Workbook has no sheets to browse', 400);
  }

  await ensureUploadsDir();

  const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const storedFileName = [
    `supplier-${supplierId}`,
    Date.now(),
    crypto.randomBytes(8).toString('hex'),
  ].join('-') + '.xlsx';
  const storedPath = storedPathFor(storedFileName);

  await fs.writeFile(storedPath, buffer);

  try {
    const workbook = await prisma.supplierLegacyWorkbook.create({
      data: {
        supplierId,
        originalFileName,
        storedFileName,
        fileSizeBytes: buffer.length,
        checksumSha256,
        sheetCount: parsedWorkbook.worksheets.length,
        uploadedBy: uploadedBy ? Number(uploadedBy) : null,
      },
      include: {
        uploader: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return workbookRecord(workbook);
  } catch (error) {
    await fs.rm(storedPath, { force: true });
    throw error;
  }
};

export const getSupplierLegacyWorkbook = async (id, workbookId) => {
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  const workbook = await loadWorkbookMetadata(supplierId, workbookId);
  const workbookPath = storedPathFor(workbook.storedFileName);
  const parsedWorkbook = new ExcelJS.Workbook();

  try {
    await parsedWorkbook.xlsx.readFile(workbookPath);
  } catch {
    throw createError('Legacy workbook file could not be opened', 500);
  }

  const sheets = parsedWorkbook.worksheets.map((worksheet) => {
    let maxColumn = 0;
    const sparseRows = [];

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];

      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = workbookValue(cell);
        const displayValue = value === null || typeof value === 'undefined' ? '' : String(value);

        if (displayValue !== '') {
          maxColumn = Math.max(maxColumn, cell.col);
          values.push([cell.col, displayValue]);
        }
      });

      if (values.length) {
        sparseRows.push({
          row_number: row.number,
          rowNumber: row.number,
          values,
        });
      }
    });

    const columns = Array.from({ length: maxColumn }, (_value, index) => columnLabel(index + 1));
    const rows = sparseRows.map((row) => {
      const cells = Array.from({ length: maxColumn }, () => '');

      row.values.forEach(([column, value]) => {
        cells[column - 1] = value;
      });

      return {
        row_number: row.row_number,
        rowNumber: row.rowNumber,
        cells,
      };
    });

    return {
      name: worksheet.name,
      columns,
      rows,
    };
  });

  return {
    workbook: workbookRecord(workbook),
    sheets,
  };
};

export const deleteSupplierLegacyWorkbook = async (id, workbookId) => {
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId)) {
    throw createError('Invalid supplier id', 400);
  }

  await loadWorkbookMetadata(supplierId, workbookId);

  const workbook = await prisma.supplierLegacyWorkbook.update({
    where: { id: Number(workbookId) },
    data: { deletedAt: new Date() },
    include: {
      uploader: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return workbookRecord(workbook);
};
