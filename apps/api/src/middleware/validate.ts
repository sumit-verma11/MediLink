import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from '../lib/errors';

// Schemas imported from @medlink/shared are parsed against that package's own
// separately-built copy of zod (its published dist is CJS), while this package's own
// code imports zod directly — a dual-package hazard where the two `ZodError` classes
// are not `instanceof`-compatible even though both errors genuinely come from zod. Duck
// type on `.name` as a fallback, and translate to an AppError here (rather than relying
// on errorHandler's `instanceof ZodError` branch) so validation failures reliably map to
// a 400 regardless of which zod realm produced the error.
function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError || (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'ZodError');
}

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (isZodError(err)) {
        next(new AppError(400, 'Validation failed', 'VALIDATION_ERROR'));
        return;
      }
      next(err);
    }
  };
}
