/**
 * Minimal IANA-timezone helpers on top of Intl — enough to turn "08:00 on
 * Tuesdays, Asia/Manila" into instants and back, without pulling in a date
 * library. Everything the availability engine needs:
 *
 *   localParts(instant, tz)          → { year, month, day, weekday, minutes }
 *   instantAt(year, month, day, "HH:mm", tz) → Date
 *   parseHHmm("08:30") → 510
 */

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0 = Sunday … 6 = Saturday
  /** minutes since local midnight */
  minutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Throws on an unknown zone so a bad tenant.timezone fails loudly, once. */
export function assertTimezone(tz: string): void {
  formatter(tz);
}

export function localParts(instant: Date, tz: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = Number(parts.hour) % 24; // some ICU builds emit "24" at midnight
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    minutes: hour * 60 + Number(parts.minute),
  };
}

/** "HH:mm" → minutes since midnight. Throws on garbage. */
export function parseHHmm(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`invalid HH:mm: ${value}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`invalid HH:mm: ${value}`);
  return h * 60 + min;
}

export function formatHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Offset (ms) of `tz` from UTC at the given instant: local = utc + offset.
 */
function offsetAt(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, 0, p.minutes);
  return asUtc - instant.getTime();
}

/**
 * The instant at local wall-clock `minutes` on the local calendar date
 * (year, month, day) in `tz`. Two-pass so DST edges resolve correctly; PH
 * has no DST but tenants elsewhere might.
 */
export function instantAt(
  year: number,
  month: number,
  day: number,
  minutes: number,
  tz: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  const guess = new Date(wall - offsetAt(new Date(wall), tz));
  return new Date(wall - offsetAt(guess, tz));
}

/** Parse "YYYY-MM-DD" into its numeric parts. Throws on garbage. */
export function parseIsoDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`invalid date: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31)
    throw new Error(`invalid date: ${value}`);
  return { year, month, day };
}
