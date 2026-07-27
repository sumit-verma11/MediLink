import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Schemas imported from @medlink/shared are parsed against that package's own
// separately-built copy of zod (its published dist is CJS), while this package's own
// code imports zod directly — a dual-package hazard where the two `ZodError` classes
// are not `instanceof`-compatible even though both errors genuinely come from zod. Duck
// type on `.name` as a fallback so a validation failure is recognised regardless of
// which zod realm produced it. Used by both `validate()` (the normal path) and
// `errorHandler` (so a `ZodError` thrown straight to `next()` is still mapped to a 400).
export function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError || (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'ZodError');
}
