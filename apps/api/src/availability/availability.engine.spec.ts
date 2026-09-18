import {
  freeSlots,
  isWithinWorkingHours,
  operatingHoursToRanges,
  validateWeekly,
} from './availability.engine';
import { instantAt, localParts, parseHHmm } from './tz';

const MNL = 'Asia/Manila'; // UTC+8, no DST
// Tuesday 2026-09-22
const TUE = { year: 2026, month: 9, day: 22 };
const at = (hhmm: string, d = TUE) =>
  instantAt(d.year, d.month, d.day, parseHHmm(hhmm), MNL);

const clinicWeek = [
  { weekday: 2, startTime: '08:00', endTime: '12:00', slotMinutes: 30 },
  { weekday: 2, startTime: '13:00', endTime: '17:00', slotMinutes: 30 },
  { weekday: 4, startTime: '09:00', endTime: '15:00', slotMinutes: 20 },
];

describe('tz helpers', () => {
  it('round-trips a Manila wall-clock time through UTC', () => {
    const d = at('08:30');
    expect(d.toISOString()).toBe('2026-09-22T00:30:00.000Z');
    const p = localParts(d, MNL);
    expect(p).toEqual({
      year: 2026,
      month: 9,
      day: 22,
      weekday: 2,
      minutes: 510,
    });
  });

  it('handles a DST zone without drifting', () => {
    // 2026-03-29 02:30 doesn't exist in Europe/Berlin (spring forward); the
    // helper must still land on a real instant on that date, not throw.
    const d = instantAt(2026, 3, 29, 12 * 60, 'Europe/Berlin');
    expect(localParts(d, 'Europe/Berlin')).toMatchObject({
      day: 29,
      minutes: 720,
    });
  });
});

describe('isWithinWorkingHours', () => {
  it('accepts a slot fully inside a range', () => {
    expect(
      isWithinWorkingHours(
        { startsAt: at('09:00'), endsAt: at('09:30') },
        clinicWeek,
        MNL,
      ),
    ).toEqual({ ok: true });
    // Ends exactly at close → still fine (exclusive end).
    expect(
      isWithinWorkingHours(
        { startsAt: at('16:30'), endsAt: at('17:00') },
        clinicWeek,
        MNL,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects the lunch gap, before-open, after-close, and straddling a range edge', () => {
    for (const [s, e] of [
      ['12:00', '12:30'],
      ['11:45', '12:15'],
      ['07:30', '08:00'],
      ['16:45', '17:15'],
    ] as const) {
      const r = isWithinWorkingHours(
        { startsAt: at(s), endsAt: at(e) },
        clinicWeek,
        MNL,
      );
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect(r.detail).toMatch(/outside the provider's Tuesday hours/);
    }
  });

  it('rejects a day with no ranges, naming it', () => {
    const wed = { year: 2026, month: 9, day: 23 };
    const r = isWithinWorkingHours(
      { startsAt: at('09:00', wed), endsAt: at('09:30', wed) },
      clinicWeek,
      MNL,
    );
    expect(r).toEqual({
      ok: false,
      detail: 'provider is not available on Wednesdays',
    });
  });

  it('rejects a slot that crosses midnight', () => {
    const r = isWithinWorkingHours(
      { startsAt: at('23:30'), endsAt: at('00:30', { ...TUE, day: 23 }) },
      clinicWeek,
      MNL,
    );
    expect(r.ok).toBe(false);
  });
});

describe('freeSlots', () => {
  const notBefore = at('00:00');

  it('grids each range by its own step and skips the gap', () => {
    const slots = freeSlots({
      date: TUE,
      tz: MNL,
      ranges: clinicWeek,
      timeOff: [],
      booked: [],
      notBefore,
    });
    // 8 in the morning (08:00..11:30) + 8 in the afternoon (13:00..16:30)
    expect(slots).toHaveLength(16);
    expect(localParts(slots[0].startsAt, MNL).minutes).toBe(8 * 60);
    expect(localParts(slots[7].startsAt, MNL).minutes).toBe(11 * 60 + 30);
    expect(localParts(slots[8].startsAt, MNL).minutes).toBe(13 * 60);
    expect(localParts(slots[15].startsAt, MNL).minutes).toBe(16 * 60 + 30);
  });

  it('removes booked + time-off collisions, keeps back-to-back neighbours', () => {
    const slots = freeSlots({
      date: TUE,
      tz: MNL,
      ranges: clinicWeek,
      timeOff: [{ startsAt: at('13:00'), endsAt: at('15:00') }],
      booked: [{ startsAt: at('09:10'), endsAt: at('09:40') }],
      notBefore,
    });
    const starts = slots.map((s) => localParts(s.startsAt, MNL).minutes);
    expect(starts).not.toContain(9 * 60); // 09:00-09:30 overlaps 09:10-09:40
    expect(starts).not.toContain(9 * 60 + 30); // 09:30-10:00 overlaps too
    expect(starts).toContain(10 * 60);
    expect(starts.filter((m) => m >= 13 * 60 && m < 15 * 60)).toHaveLength(0);
    expect(starts).toContain(15 * 60);
  });

  it('honours a longer duration than the grid step and drops past slots', () => {
    const slots = freeSlots({
      date: { year: 2026, month: 9, day: 24 }, // Thursday: 09:00-15:00 on a 20-min grid
      tz: MNL,
      ranges: clinicWeek,
      timeOff: [],
      booked: [],
      durationMinutes: 60,
      notBefore: instantAt(2026, 9, 24, 12 * 60 + 10, MNL),
    });
    // starts at 12:20 (first grid point ≥ 12:10), last start 14:00 (ends 15:00)
    const starts = slots.map((s) => localParts(s.startsAt, MNL).minutes);
    expect(starts[0]).toBe(12 * 60 + 20);
    expect(starts[starts.length - 1]).toBe(14 * 60);
    for (const s of slots)
      expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(60 * 60_000);
  });

  it('returns nothing on a closed day', () => {
    expect(
      freeSlots({
        date: { year: 2026, month: 9, day: 23 },
        tz: MNL,
        ranges: clinicWeek,
        timeOff: [],
        booked: [],
        notBefore,
      }),
    ).toEqual([]);
  });
});

describe('validateWeekly', () => {
  it('flags reversed, malformed and overlapping ranges', () => {
    const problems = validateWeekly([
      { weekday: 1, startTime: '09:00', endTime: '08:00' },
      { weekday: 1, startTime: '9am', endTime: '17:00' },
      { weekday: 3, startTime: '08:00', endTime: '12:00' },
      { weekday: 3, startTime: '11:30', endTime: '15:00' },
      { weekday: 7, startTime: '08:00', endTime: '09:00' },
    ]);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/range 1: endTime/),
        expect.stringMatching(/range 2: times must be HH:mm/),
        expect.stringMatching(/Wednesday: 08:00–12:00 overlaps 11:30–15:00/),
        expect.stringMatching(/range 5: weekday/),
      ]),
    );
    expect(validateWeekly(clinicWeek)).toEqual([]);
  });
});

describe('operatingHoursToRanges', () => {
  it('drops closed days and maps open/close', () => {
    expect(
      operatingHoursToRanges([
        { weekday: 0, open: '08:00', close: '17:00', closed: true },
        { weekday: 1, open: '08:00', close: '17:00' },
      ]),
    ).toEqual([{ weekday: 1, startTime: '08:00', endTime: '17:00' }]);
    expect(operatingHoursToRanges(undefined)).toEqual([]);
  });
});
