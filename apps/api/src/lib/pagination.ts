/**
 * Parse a `page`/`limit` style query param into a positive integer.
 *
 * `Number(req.query.page)` returns NaN for a malformed value, and NaN passes straight
 * through Math.max/Math.min — it then reaches Mongoose's .skip()/.limit() and throws,
 * turning a client typo into a 500. Anything that is not a finite positive number falls
 * back to the caller's default.
 */
export function toPositiveInt(raw: unknown, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}
