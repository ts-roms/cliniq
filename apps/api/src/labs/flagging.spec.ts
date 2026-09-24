import {
  ageInDays,
  deriveFlag,
  isAbnormal,
  isCritical,
  normaliseTestKey,
  ruleApplies,
  selectCriticalRule,
  type CriticalValueRuleLike,
  type PatientContext,
} from './flagging.js';

const AT = new Date('2026-09-23T00:00:00Z');
const ADULT: PatientContext = { ageDays: 12_000, sex: 'MALE' };

function rule(
  over: Partial<CriticalValueRuleLike> = {},
): CriticalValueRuleLike {
  return {
    criticalLow: null,
    criticalHigh: null,
    ageMinDays: null,
    ageMaxDays: null,
    sex: null,
    effectiveFrom: new Date('2020-01-01T00:00:00Z'),
    effectiveTo: null,
    ...over,
  };
}

describe('deriveFlag', () => {
  const potassium = { referenceLow: 3.5, referenceHigh: 5.1 };

  describe('the regression this file exists for', () => {
    // The old rule derived criticalHigh = referenceHigh * 1.5 = 7.65 and
    // criticalLow = referenceLow * 0.5 = 1.75, so these two results — both
    // worth a phone call — came back merely HIGH / LOW.
    it('does NOT invent a critical limit from the reference range', () => {
      expect(deriveFlag('6.8', potassium)).toBe('HIGH');
      expect(deriveFlag('2.2', potassium)).toBe('LOW');
    });

    it('calls them critical once real limits are configured', () => {
      const limits = { criticalLow: 2.5, criticalHigh: 6.0 };
      expect(deriveFlag('6.8', potassium, limits)).toBe('CRITICAL_HIGH');
      expect(deriveFlag('2.2', potassium, limits)).toBe('CRITICAL_LOW');
    });

    it('still reads mid-range and near-range values correctly', () => {
      const limits = { criticalLow: 2.5, criticalHigh: 6.0 };
      expect(deriveFlag('4.2', potassium, limits)).toBe('NORMAL');
      expect(deriveFlag('5.4', potassium, limits)).toBe('HIGH');
      expect(deriveFlag('3.1', potassium, limits)).toBe('LOW');
    });
  });

  describe('boundaries', () => {
    it('treats reference bounds as inclusive of normal', () => {
      expect(deriveFlag('3.5', potassium)).toBe('NORMAL');
      expect(deriveFlag('5.1', potassium)).toBe('NORMAL');
    });

    it('treats critical limits as inclusive of critical', () => {
      const limits = { criticalLow: 2.5, criticalHigh: 6.0 };
      expect(deriveFlag('6.0', potassium, limits)).toBe('CRITICAL_HIGH');
      expect(deriveFlag('2.5', potassium, limits)).toBe('CRITICAL_LOW');
      expect(deriveFlag('5.99', potassium, limits)).toBe('HIGH');
      expect(deriveFlag('2.51', potassium, limits)).toBe('LOW');
    });
  });

  describe('partial and missing limits', () => {
    it('handles a one-sided reference range', () => {
      expect(deriveFlag('9', { referenceLow: null, referenceHigh: 5 })).toBe(
        'HIGH',
      );
      expect(deriveFlag('1', { referenceLow: null, referenceHigh: 5 })).toBe(
        'NORMAL',
      );
      expect(deriveFlag('1', { referenceLow: 3, referenceHigh: null })).toBe(
        'LOW',
      );
    });

    it('is undefined with no limits at all — not NORMAL', () => {
      // Declining to judge is the point: with nothing to compare against,
      // calling a result NORMAL asserts something we do not know.
      expect(
        deriveFlag('42', { referenceLow: null, referenceHigh: null }),
      ).toBeUndefined();
    });

    it('can still flag critical with no reference range', () => {
      expect(
        deriveFlag(
          '9',
          { referenceLow: null, referenceHigh: null },
          { criticalLow: null, criticalHigh: 7 },
        ),
      ).toBe('CRITICAL_HIGH');
    });
  });

  describe('non-numeric and empty input', () => {
    it.each(['Reactive', 'Negative', 'see comment', '', null, undefined])(
      'returns undefined for %p so the caller must flag it explicitly',
      (v) => {
        expect(deriveFlag(v as string, potassium)).toBeUndefined();
      },
    );

    it('accepts a number as well as a numeric string', () => {
      expect(deriveFlag(4.2, potassium)).toBe('NORMAL');
    });

    it('does not treat whitespace as zero', () => {
      // Number('   ') === 0, which would flag CRITICAL_LOW on any analyte.
      expect(deriveFlag('   ', potassium)).toBeUndefined();
    });
  });

  it('prefers the low side when a misconfigured pair overlaps', () => {
    const flag = deriveFlag(
      '5',
      { referenceLow: null, referenceHigh: null },
      { criticalLow: 8, criticalHigh: 3 },
    );
    expect(flag).toBe('CRITICAL_LOW');
  });
});

describe('normaliseTestKey', () => {
  it('collapses the ways one test gets typed', () => {
    const expected = 'CBC';
    expect(normaliseTestKey(null, 'cbc')).toBe(expected);
    expect(normaliseTestKey(null, '  CBC  ')).toBe(expected);
    expect(normaliseTestKey(null, 'C.B.C')).toBe('C B C');
    expect(normaliseTestKey('cbc', 'Complete Blood Count')).toBe(expected);
  });

  it('prefers the code, falling back to the name', () => {
    expect(normaliseTestKey('K', 'Potassium')).toBe('K');
    expect(normaliseTestKey('', 'Potassium')).toBe('POTASSIUM');
    expect(normaliseTestKey('   ', 'Potassium')).toBe('POTASSIUM');
  });

  it('collapses separators and repeated whitespace', () => {
    expect(normaliseTestKey(null, 'Hgb-A1c')).toBe('HGB A1C');
    expect(normaliseTestKey(null, 'Na   /   K')).toBe('NA K');
  });

  it('is empty for an empty identifier', () => {
    expect(normaliseTestKey(null, null)).toBe('');
  });
});

describe('ruleApplies', () => {
  it('respects the effective window', () => {
    const future = rule({ effectiveFrom: new Date('2027-01-01T00:00:00Z') });
    const expired = rule({ effectiveTo: new Date('2026-01-01T00:00:00Z') });
    expect(ruleApplies(future, ADULT, AT)).toBe(false);
    expect(ruleApplies(expired, ADULT, AT)).toBe(false);
    expect(ruleApplies(rule(), ADULT, AT)).toBe(true);
  });

  it('treats effectiveTo as exclusive', () => {
    expect(ruleApplies(rule({ effectiveTo: AT }), ADULT, AT)).toBe(false);
  });

  it('matches sex only when it matches, and any-sex always', () => {
    expect(ruleApplies(rule({ sex: 'MALE' }), ADULT, AT)).toBe(true);
    expect(ruleApplies(rule({ sex: 'FEMALE' }), ADULT, AT)).toBe(false);
    expect(ruleApplies(rule({ sex: null }), ADULT, AT)).toBe(true);
  });

  it('applies an age band inclusively at the bottom, exclusively at the top', () => {
    const neonate = rule({ ageMinDays: 0, ageMaxDays: 28 });
    expect(ruleApplies(neonate, { ageDays: 0, sex: null }, AT)).toBe(true);
    expect(ruleApplies(neonate, { ageDays: 27, sex: null }, AT)).toBe(true);
    expect(ruleApplies(neonate, { ageDays: 28, sex: null }, AT)).toBe(false);
  });

  it('never applies a demographic rule to an unknown age or sex', () => {
    const unknown: PatientContext = { ageDays: null, sex: null };
    expect(
      ruleApplies(rule({ ageMinDays: 0, ageMaxDays: 28 }), unknown, AT),
    ).toBe(false);
    expect(ruleApplies(rule({ sex: 'MALE' }), unknown, AT)).toBe(false);
    expect(ruleApplies(rule(), unknown, AT)).toBe(true);
  });
});

describe('selectCriticalRule', () => {
  it('returns null when nothing applies', () => {
    expect(selectCriticalRule([], ADULT, AT)).toBeNull();
    expect(selectCriticalRule([rule({ sex: 'FEMALE' })], ADULT, AT)).toBeNull();
  });

  it('prefers a sex-specific rule over an any-sex one', () => {
    const any = rule({ criticalHigh: 6 });
    const male = rule({ criticalHigh: 6.5, sex: 'MALE' });
    expect(selectCriticalRule([any, male], ADULT, AT)).toBe(male);
    expect(selectCriticalRule([male, any], ADULT, AT)).toBe(male);
  });

  it('prefers an age-banded rule over an unbanded one', () => {
    const any = rule({ criticalHigh: 6 });
    const banded = rule({ criticalHigh: 7, ageMinDays: 0, ageMaxDays: 30 });
    const neonate: PatientContext = { ageDays: 10, sex: 'MALE' };
    expect(selectCriticalRule([any, banded], neonate, AT)).toBe(banded);
  });

  it('prefers the narrower of two overlapping bands', () => {
    const wide = rule({ criticalHigh: 6, ageMinDays: 0, ageMaxDays: 6570 });
    const narrow = rule({ criticalHigh: 7, ageMinDays: 0, ageMaxDays: 28 });
    const neonate: PatientContext = { ageDays: 10, sex: 'MALE' };
    expect(selectCriticalRule([wide, narrow], neonate, AT)).toBe(narrow);
  });

  it('breaks a tie on the most recently effective rule', () => {
    const older = rule({
      criticalHigh: 6,
      effectiveFrom: new Date('2024-01-01T00:00:00Z'),
    });
    const newer = rule({
      criticalHigh: 6.5,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    });
    expect(selectCriticalRule([older, newer], ADULT, AT)).toBe(newer);
    expect(selectCriticalRule([newer, older], ADULT, AT)).toBe(newer);
  });
});

describe('isCritical / isAbnormal', () => {
  it('classifies each flag', () => {
    expect(isCritical('CRITICAL_HIGH')).toBe(true);
    expect(isCritical('CRITICAL_LOW')).toBe(true);
    expect(isCritical('HIGH')).toBe(false);
    expect(isCritical(undefined)).toBe(false);

    expect(isAbnormal('HIGH')).toBe(true);
    expect(isAbnormal('ABNORMAL')).toBe(true);
    expect(isAbnormal('NORMAL')).toBe(false);
    expect(isAbnormal(undefined)).toBe(false);
    expect(isAbnormal(null)).toBe(false);
  });
});

describe('ageInDays', () => {
  it('counts whole days', () => {
    expect(ageInDays(new Date('2026-09-13T00:00:00Z'), AT)).toBe(10);
    expect(ageInDays(new Date('2026-09-22T23:00:00Z'), AT)).toBe(0);
  });

  it('is null for an unknown or future date of birth', () => {
    expect(ageInDays(null, AT)).toBeNull();
    expect(ageInDays(undefined, AT)).toBeNull();
    expect(ageInDays(new Date('2027-01-01T00:00:00Z'), AT)).toBeNull();
  });
});
