/**
 * Escape regex metacharacters in user-supplied search input before it is interpolated
 * into a Mongo `$regex` filter. Without this, a query like `?city=.*` matches every
 * document regardless of the caller's intent, and a crafted pattern can cause
 * catastrophic backtracking (ReDoS) against the query engine.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
