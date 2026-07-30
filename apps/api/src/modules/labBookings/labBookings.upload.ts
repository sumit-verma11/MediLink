import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { AppError } from '../../lib/errors';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'lab-reports');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, _file, cb) => cb(null, `${req.params.id}.pdf`),
});

export const labReportUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError(400, 'Report must be a PDF', 'BAD_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});
