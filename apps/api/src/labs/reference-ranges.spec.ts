/**
 * Reference interval resolution — gap analysis §6.5.
 *
 * The interval used to live as two nullable floats on the order item with no
 * age or sex dimension, so a paediatric haemoglobin and an adult male
 * haemoglobin were flagged against the same numbers. These tests are mostly
 * about which of several configured intervals wins, because getting that wrong
 * does not throw — it silently reports a child's result as an adult's.
 */
import {
  deriveFlag,
  resolveReference,
  selectCriticalRule,
  selectReferenceRange,
  type PatientContext,
  type ReferenceRangeLike,
} from './flagging.js';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const NOW = new Date('2026-06-01T00:00:00.000Z');

const range = (over: Partial<ReferenceRangeLike> = {}): ReferenceRangeLike => ({
  ageMinDays: null,
  ageMaxDays: null,
  sex: null,
  lowerLimit: 13,
  upperLimit: 17,
  effectiveFrom: T0,
  effectiveTo: null,
  ...over,
});

const adultMale: PatientContext = { ageDays: 30 * 365, sex: 'MALE' };
const toddler: PatientContext = { ageDays: 2 * 365, sex: 'MALE' };
const noDob: PatientContext = { ageDays: null, sex: 'MALE' };

const EMPTY = { referenceLow: null, referenceHigh: null };

describe('the interval on the order item wins', () => {
  it('is used even when a configured interval exists', () => {
    // Those columns are how a referred-in report states the interval it
    // arrived with. Restating our own configuration over it would attribute
    // another laboratory's interval to us.
    const r = resolveReference(
      { referenceLow: 12, referenceHigh: 16 },
      [range()],
      adultMale,
      NOW,
    );
    expect(r.source).toBe('ORDER');
    expect(r.limits).toEqual({ referenceLow: 12, referenceHigh: 16 });
    expect(r.range).toBeNull();
  });

  it('counts a one-sided interval on the item as supplied', () => {
    const r = resolveReference(
      { referenceLow: null, referenceHigh: 16 },
      [range()],
      adultMale,
      NOW,
    );
    expect(r.source).toBe('ORDER');
    expect(r.limits.referenceHigh).toBe(16);
  });
});

describe('falling back to configuration', () => {
  it('uses the configured interval when the item carries none', () => {
    const r = resolveReference(EMPTY, [range()], adultMale, NOW);
    expect(r.source).toBe('CONFIGURED');
    expect(r.limits).toEqual({ referenceLow: 13, referenceHigh: 17 });
  });

  it('reports nothing configured rather than inventing an interval', () => {
    // deriveFlag then declines to call the result NORMAL, which is the same
    // principle that governs critical limits: saying nothing is safe.
    const r = resolveReference(EMPTY, [], adultMale, NOW);
    expect(r.source).toBe('NONE');
    expect(r.limits).toEqual(EMPTY);
    expect(deriveFlag('15', r.limits)).toBeUndefined();
  });

  it('ignores a configured row that carries no limits at all', () => {
    // Such a row narrows nothing and must not shadow a usable match. The
    // database refuses one outright; this covers the case where it arrives
    // some other way.
    const empty = range({ lowerLimit: null, upperLimit: null });
    const r = resolveReference(EMPTY, [empty], adultMale, NOW);
    expect(r.source).toBe('NONE');
  });

  it('still uses a usable row when an unusable one sits alongside it', () => {
    const empty = range({ lowerLimit: null, upperLimit: null, sex: 'MALE' });
    const usable = range({ lowerLimit: 13, upperLimit: 17 });
    const r = resolveReference(EMPTY, [empty, usable], adultMale, NOW);
    expect(r.source).toBe('CONFIGURED');
    expect(r.limits.referenceLow).toBe(13);
  });
});

describe('the case the gap analysis named', () => {
  // A paediatric and an adult haemoglobin interval, configured together.
  const paediatric = range({
    ageMaxDays: 12 * 365,
    lowerLimit: 11,
    upperLimit: 14,
  });
  const adult = range({ ageMinDays: 18 * 365, lowerLimit: 13, upperLimit: 17 });
  const ranges = [paediatric, adult];

  it('flags 11.5 g/dL as normal in a toddler', () => {
    const r = resolveReference(EMPTY, ranges, toddler, NOW);
    expect(r.limits).toEqual({ referenceLow: 11, referenceHigh: 14 });
    expect(deriveFlag('11.5', r.limits)).toBe('NORMAL');
  });

  it('flags the same 11.5 g/dL as low in an adult man', () => {
    // This is the defect: while the interval lived on the order item, both
    // read against whatever the orderer typed.
    const r = resolveReference(EMPTY, ranges, adultMale, NOW);
    expect(r.limits).toEqual({ referenceLow: 13, referenceHigh: 17 });
    expect(deriveFlag('11.5', r.limits)).toBe('LOW');
  });

  it('applies neither to a patient whose age falls between the bands', () => {
    // A 15-year-old matches no configured band. Picking the nearest one would
    // be a guess, and a guessed interval is what this work exists to remove.
    const teen: PatientContext = { ageDays: 15 * 365, sex: 'MALE' };
    expect(resolveReference(EMPTY, ranges, teen, NOW).source).toBe('NONE');
  });

  it('applies neither when the date of birth is unknown', () => {
    // An age-banded interval must not be applied to a patient whose age we do
    // not have. Same rule as critical limits.
    expect(resolveReference(EMPTY, ranges, noDob, NOW).source).toBe('NONE');
  });
});

describe('which configured interval wins', () => {
  it('prefers a sex-specific interval over an any-sex one', () => {
    const any = range({ lowerLimit: 12, upperLimit: 16 });
    const female = range({ sex: 'FEMALE', lowerLimit: 12, upperLimit: 15 });
    const r = resolveReference(
      EMPTY,
      [any, female],
      { ageDays: 9000, sex: 'FEMALE' },
      NOW,
    );
    expect(r.limits.referenceHigh).toBe(15);
  });

  it('prefers the tighter age band', () => {
    const wide = range({
      ageMinDays: 0,
      ageMaxDays: 30000,
      lowerLimit: 1,
      upperLimit: 2,
    });
    const tight = range({
      ageMinDays: 600,
      ageMaxDays: 900,
      lowerLimit: 3,
      upperLimit: 4,
    });
    const r = resolveReference(
      EMPTY,
      [wide, tight],
      { ageDays: 730, sex: 'MALE' },
      NOW,
    );
    expect(r.limits).toEqual({ referenceLow: 3, referenceHigh: 4 });
  });

  it('breaks a tie on the most recently effective row', () => {
    // Re-issuing an interval is inserting a row with a later effectiveFrom.
    const older = range({ lowerLimit: 13, upperLimit: 17, effectiveFrom: T0 });
    const newer = range({
      lowerLimit: 13.5,
      upperLimit: 17.5,
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
    });
    const r = resolveReference(EMPTY, [older, newer], adultMale, NOW);
    expect(r.limits.referenceLow).toBe(13.5);
  });

  it('ignores an interval whose window has closed', () => {
    const expired = range({
      lowerLimit: 1,
      upperLimit: 2,
      effectiveTo: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(resolveReference(EMPTY, [expired], adultMale, NOW).source).toBe(
      'NONE',
    );
  });

  it('ignores an interval that has not started yet', () => {
    const future = range({
      lowerLimit: 1,
      upperLimit: 2,
      effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
    });
    expect(resolveReference(EMPTY, [future], adultMale, NOW).source).toBe(
      'NONE',
    );
  });

  it('returns the row it chose, so the caller can record which one applied', () => {
    const chosen = range({ sex: 'MALE', lowerLimit: 13, upperLimit: 17 });
    const r = resolveReference(EMPTY, [range(), chosen], adultMale, NOW);
    expect(r.range).toBe(chosen);
  });
});

describe('shared selection with critical limits', () => {
  it('is literally the same function, so the two cannot disagree', () => {
    // Two selection rules that disagree about which row applies is exactly the
    // defect nobody notices until a paediatric result reads normal.
    expect(selectReferenceRange).toBe(selectCriticalRule);
  });
});
