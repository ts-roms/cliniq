/**
 * Parse the `15m` / `7d` / `12h` / `3600s` shorthand jose accepts for
 * `expiresIn` into milliseconds, so a DB row can expire at the same instant
 * the JWT does. Falls back to 7 days on anything unparseable — a typo in
 * REFRESH_TOKEN_EXPIRES_IN must never yield an instant-expiry session.
 */
export function parseDurationMs(input: string): number {
  const FALLBACK = 7 * 86_400_000;
  const m = /^(\d+)\s*(ms|s|m|h|d|w)?$/i.exec(input.trim());
  if (!m) return FALLBACK;
  const n = Number(m[1]);
  switch ((m[2] ?? 's').toLowerCase()) {
    case 'ms':
      return n;
    case 's':
      return n * 1000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    case 'd':
      return n * 86_400_000;
    case 'w':
      return n * 7 * 86_400_000;
    default:
      return FALLBACK;
  }
}
