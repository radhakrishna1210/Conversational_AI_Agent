import multer from 'multer';
import path from 'path';
import { env } from '../config/env.js';

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const allowedMimeTypes = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
]);

const fileFilter = (req, file, cb) => {
  const lower = file.originalname.toLowerCase();
  if (allowedMimeTypes.has(file.mimetype) || /\.(pdf|txt|md|csv|json|html?|rtf)$/i.test(lower)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, TXT, MD, CSV, JSON, and HTML files are allowed'), false);
  }
};

export const uploadKnowledgeFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
}).single('file');
