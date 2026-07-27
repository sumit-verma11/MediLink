import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError, isZodError } from '../lib/errors';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      // Translate to an AppError here (rather than relying on errorHandler's own
      // branch) so validation failures reliably map to a 400 regardless of which
      // zod realm produced the error. See `isZodError` in ../lib/errors.
      if (isZodError(err)) {
        next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR'));
        return;
      }
      next(err);
    }
  };
}
