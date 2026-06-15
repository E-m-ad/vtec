import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import multer from 'multer';

import createError from '../utils/createError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, '../../uploads');
const serviceJobUploadDir = path.join(uploadRoot, 'service-jobs');

const allowedMimePrefixes = ['image/', 'video/'];
const maxFiles = 10;
const maxFileSizeBytes = 50 * 1024 * 1024;

fs.mkdirSync(serviceJobUploadDir, { recursive: true });

const safeExtension = (file) => {
  const originalExtension = path.extname(file.originalname || '').toLowerCase();
  if (originalExtension && /^[a-z0-9.]+$/.test(originalExtension)) return originalExtension;

  if (file.mimetype === 'image/jpeg') return '.jpg';
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  if (file.mimetype === 'video/mp4') return '.mp4';
  if (file.mimetype === 'video/webm') return '.webm';
  if (file.mimetype === 'video/quicktime') return '.mov';

  return '';
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, serviceJobUploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = safeExtension(file);
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const fileFilter = (_req, file, callback) => {
  if (allowedMimePrefixes.some((prefix) => file.mimetype?.startsWith(prefix))) {
    callback(null, true);
    return;
  }

  callback(createError('Only image and video files are allowed for service job inspection media', 400));
};

const inspectionMediaUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSizeBytes,
    files: maxFiles,
  },
}).array('inspection_media', maxFiles);

const mediaKind = (mimetype = '') => (mimetype.startsWith('video/') ? 'video' : 'image');

const uploadedInspectionMedia = (files = []) =>
  files.map((file) => ({
    kind: mediaKind(file.mimetype),
    original_name: file.originalname,
    stored_name: file.filename,
    mime_type: file.mimetype,
    size_bytes: file.size,
    url: `/uploads/service-jobs/${file.filename}`,
  }));

export const cleanupInspectionMediaFiles = async (media = []) => {
  await Promise.allSettled(
    media
      .map((item) => item?.stored_name)
      .filter(Boolean)
      .map((storedName) => fs.promises.unlink(path.join(serviceJobUploadDir, storedName))),
  );
};

export const serviceJobInspectionMediaUpload = (req, res, next) => {
  inspectionMediaUpload(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(createError('Each inspection photo or video must be 50 MB or smaller', 400));
      }

      if (error.code === 'LIMIT_FILE_COUNT') {
        return next(createError(`You can attach up to ${maxFiles} inspection files`, 400));
      }

      return next(error);
    }

    req.inspectionMedia = uploadedInspectionMedia(req.files);
    return next();
  });
};

export { serviceJobUploadDir };
