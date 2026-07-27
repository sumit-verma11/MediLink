import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { AppError } from '../../lib/errors';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'verification-docs');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const verificationDocsUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      // An AppError (not a plain Error) so errorHandler maps this to a 400
      // rather than falling through to a generic 500.
      cb(new AppError(400, 'Unsupported file type', 'BAD_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});
