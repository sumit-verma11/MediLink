import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { AppError, isZodError } from '../lib/errors';
import { logger } from '../lib/logger';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Duck-typed rather than `instanceof ZodError`: a ZodError raised by a schema from
  // @medlink/shared comes from that package's own zod copy and would fail an
  // `instanceof` check here. Most validation failures are already converted to an
  // AppError by `validate()`; this branch covers a ZodError thrown straight to `next()`.
  if (isZodError(err)) {
    res.status(400).json({ error: { message: 'Validation failed', code: 'VALIDATION_ERROR', issues: err.issues } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
    return;
  }
  // Mongoose raises a CastError when a route queries with a malformed ObjectId
  // (e.g. GET /api/doctors/public/not-an-id). A malformed id can never match a
  // document, so 404 is the honest answer — not the 500 this used to produce.
  if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'CastError') {
    res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
    return;
  }
  // Multer signals size/count limit violations as MulterError. These are client
  // mistakes, not server faults, so they belong in the 400 range.
  if (err instanceof MulterError) {
    res.status(400).json({ error: { message: err.message, code: err.code } });
    return;
  }
  logger.error(err, 'unhandled error');
  res.status(500).json({ error: { message: 'Internal server error' } });
}
