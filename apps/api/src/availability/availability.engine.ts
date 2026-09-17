import { instantAt, localParts, parseHHmm } from './tz.js';

/**
 * Pure availability maths. No Prisma here so it can be unit-tested with
 * plain objects; AvailabilityService loads the rows and calls in.
 */

export interface WeeklyRange {
  weekday: number; // 0-6
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm", exclusive
  slotMinutes?: number;
}

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export type Unavailable =
  | { reason: 'outside_hours'; detail: string }
  | { reason: 'time_off'; detail: string; timeOffId?: string };

/**
 * A slot is inside working hours when ONE weekly range on that local
 * weekday fully contains it (a slot can't straddle the lunch gap). The slot
 * must also start and end on the same local calendar day.
 */
export function isWithinWorkingHours(
  slot: Interval,
  ranges: readonly WeeklyRange[],
  tz: string,
): { ok: true } | { ok: false; detail: string } {
  const start = localParts(slot.startsAt, tz);
  // endsAt is exclusive: a 16:30–17:00 slot ends at "17:00", which reads as
  // minute 1020 of the same day, never as the next day.
  const endInstant = new Date(slot.endsAt.getTime() - 1);
  const end = localParts(endInstant, tz);
  if (
    start.year !== end.year ||
    start.month !== end.month ||
    start.day !== end.day
  ) {
    return {
      ok: false,
      detail: 'appointment must start and end on the same day',
    };
  }
  const endMinutes = end.minutes + 1;
  const dayRanges = ranges.filter((r) => r.weekday === start.weekday);
  if (dayRanges.length === 0) {
    return {
      ok: false,
      detail: `provider is not available on ${WEEKDAY_NAMES[start.weekday]}s`,
    };
  }
  const fits = dayRanges.some(
    (r) =>
      parseHHmm(r.startTime) <= start.minutes &&
      endMinutes <= parseHHmm(r.endTime),
  );
  if (!fits) {
    const hours = dayRanges
      .map((r) => `${r.startTime}–${r.endTime}`)
      .join(', ');
    return {
      ok: false,
      detail: `outside the provider's ${WEEKDAY_NAMES[start.weekday]} hours (${hours})`,
    };
  }
  return { ok: true };
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

/**
 * Free slots on one local calendar day: every weekly range on that weekday,
 * stepped by its slotMinutes, minus anything that overlaps time off or an
 * existing live appointment. `duration` overrides the step for the slot
 * length (the step still comes from the range so a 20-minute grid stays a
 * 20-minute grid).
 */
export function freeSlots(opts: {
  date: { year: number; month: number; day: number };
  tz: string;
  ranges: readonly WeeklyRange[];
  timeOff: readonly Interval[];
  booked: readonly Interval[];
  durationMinutes?: number;
  /** Slots that start before this instant are dropped (default: now). */
  notBefore?: Date;
}): Interval[] {
  const { date, tz } = opts;
  const notBefore = opts.notBefore ?? new Date();
  const weekday = localParts(
    instantAt(date.year, date.month, date.day, 12 * 60, tz),
    tz,
  ).weekday;
  const out: Interval[] = [];
  const dayRanges = [...opts.ranges]
    .filter((r) => r.weekday === weekday)
    .sort((a, b) => parseHHmm(a.startTime) - parseHHmm(b.startTime));

  for (const r of dayRanges) {
    const step = Math.max(5, r.slotMinutes ?? 30);
    const length = opts.durationMinutes ?? step;
    const from = parseHHmm(r.startTime);
    const to = parseHHmm(r.endTime);
    for (let m = from; m + length <= to; m += step) {
      const slot: Interval = {
        startsAt: instantAt(date.year, date.month, date.day, m, tz),
        endsAt: instantAt(date.year, date.month, date.day, m + length, tz),
      };
      if (slot.startsAt < notBefore) continue;
      if (opts.timeOff.some((t) => overlaps(slot, t))) continue;
      if (opts.booked.some((b) => overlaps(slot, b))) continue;
      out.push(slot);
    }
  }
  return out;
}

/** Validate a weekly schedule before it is stored. Returns problems (empty = ok). */
export function validateWeekly(ranges: readonly WeeklyRange[]): string[] {
  const problems: string[] = [];
  const byDay = new Map<number, WeeklyRange[]>();
  ranges.forEach((r, i) => {
    let s: number;
    let e: number;
    try {
      s = parseHHmm(r.startTime);
      e = parseHHmm(r.endTime);
    } catch {
      problems.push(`range ${i + 1}: times must be HH:mm`);
      return;
    }
    if (e <= s)
      problems.push(`range ${i + 1}: endTime must be after startTime`);
    if (r.weekday < 0 || r.weekday > 6)
      problems.push(`range ${i + 1}: weekday must be 0-6`);
    byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]);
  });
  for (const [day, list] of byDay) {
    const sorted = [...list].sort(
      (a, b) => parseHHmm(a.startTime) - parseHHmm(b.startTime),
    );
    for (let i = 1; i < sorted.length; i++) {
      if (parseHHmm(sorted[i].startTime) < parseHHmm(sorted[i - 1].endTime)) {
        problems.push(
          `${WEEKDAY_NAMES[day]}: ${sorted[i - 1].startTime}–${sorted[i - 1].endTime} overlaps ${sorted[i].startTime}–${sorted[i].endTime}`,
        );
      }
    }
  }
  return problems;
}

/** tenant.settings.operatingHours → weekly ranges (the fallback when a provider has none). */
export function operatingHoursToRanges(
  hours:
    | ReadonlyArray<{
        weekday: number;
        open: string;
        close: string;
        closed?: boolean;
      }>
    | undefined
    | null,
): WeeklyRange[] {
  if (!hours) return [];
  return hours
    .filter((h) => !h.closed && h.open && h.close)
    .map((h) => ({ weekday: h.weekday, startTime: h.open, endTime: h.close }));
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
