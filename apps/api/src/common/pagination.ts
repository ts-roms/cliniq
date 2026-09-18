/**
 * Row limits for list endpoints that return plain arrays (no cursor
 * envelope). They used to be unbounded: a lab with a few thousand cases
 * returned them all, with includes, on every inbox load. Callers can pass
 * `limit` / `offset` to page; the default keeps a screen's worth and the
 * max stops a single request from pulling the whole table.
 */
export const DEFAULT_LIST_LIMIT = 200;
export const MAX_LIST_LIMIT = 500;

/** Clamp a client-supplied limit into [1, MAX_LIST_LIMIT], defaulting when absent. */
export function clampLimit(
  limit: number | undefined,
  fallback = DEFAULT_LIST_LIMIT,
  max = MAX_LIST_LIMIT,
): number {
  if (limit === undefined || Number.isNaN(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

/** Non-negative offset, defaulting to 0. */
export function clampOffset(offset: number | undefined): number {
  if (offset === undefined || Number.isNaN(offset)) return 0;
  return Math.max(Math.trunc(offset), 0);
}
