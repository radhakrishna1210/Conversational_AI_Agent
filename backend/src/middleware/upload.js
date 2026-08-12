import multer from 'multer';
import path from 'path';
import { env } from '../config/env.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const csvFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

export const uploadCsv = multer({
  storage,
  fileFilter: csvFilter,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
}).single('file');

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const documentFilter = (req, file, cb) => {
  if (DOCUMENT_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Upload a PDF, JPEG or PNG'), false);
  }
};

/**
 * KYC / compliance documents (Certificate of Incorporation, PAN, GST, ...).
 *
 * NOTE: these land in UPLOAD_DIR alongside everything else, which is the
 * existing convention but not where identity documents belong long term. They
 * are personal data under the DPDP Act and should move to private object
 * storage with signed, expiring reads before this is exposed to real customers.
 */
export const uploadComplianceDocument = multer({
  storage,
  fileFilter: documentFilter,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
}).single('file');
