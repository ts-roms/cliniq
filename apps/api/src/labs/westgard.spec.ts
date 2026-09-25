import {
  coefficientOfVariation,
  evaluateWestgard,
  zScore,
  type QcObservation,
} from './westgard.js';

/** A run at the NORMAL level unless said otherwise. */
const o = (z: number, level = 'NORMAL'): QcObservation => ({ z, level });
/** `n` observations at `z`, for building a history. */
const run = (n: number, z: number, level = 'NORMAL') =>
  Array.from({ length: n }, () => o(z, level));

describe('a run that is simply in control', () => {
  it('accepts a result near the mean', () => {
    expect(evaluateWestgard(o(0.4), [])).toEqual({
      outcome: 'ACCEPTED',
      violations: [],
      reason: null,
    });
  });

  it('accepts exactly 2 SD — the rule is "beyond", not "at"', () => {
    // Boundary matters: rejecting at exactly 2.0 would fire on rounding.
    expect(evaluateWestgard(o(2), []).outcome).toBe('ACCEPTED');
    expect(evaluateWestgard(o(-2), []).outcome).toBe('ACCEPTED');
  });
});

describe('1-2s — warning, not rejection', () => {
  it('warns beyond 2 SD without rejecting', () => {
    // About one run in twenty lands here by chance. A laboratory that
    // rejects on it is chasing noise, and will start ignoring the alarm.
    const e = evaluateWestgard(o(2.5), []);
    expect(e.outcome).toBe('WARNING');
    expect(e.violations).toEqual(['1-2s']);
  });

  it('warns on the negative side too', () => {
    expect(evaluateWestgard(o(-2.5), []).outcome).toBe('WARNING');
  });
});

describe('1-3s — random error', () => {
  it('rejects beyond 3 SD', () => {
    const e = evaluateWestgard(o(3.2), []);
    expect(e.outcome).toBe('REJECTED');
    expect(e.violations).toContain('1-3s');
  });

  it('rejects on either side', () => {
    expect(evaluateWestgard(o(-3.5), []).outcome).toBe('REJECTED');
  });

  it('accepts exactly 3 SD', () => {
    expect(evaluateWestgard(o(3), []).outcome).toBe('WARNING'); // 1-2s only
  });
});

describe('2-2s — systematic error across runs', () => {
  it('rejects two consecutive beyond 2 SD on the same side', () => {
    const e = evaluateWestgard(o(2.3), [o(2.1)]);
    expect(e.outcome).toBe('REJECTED');
    expect(e.violations).toContain('2-2s');
  });

  it('does not fire when the two are on opposite sides', () => {
    // One high then one low is noise, not drift. Firing here would be the
    // difference between a useful rule and an ignored one.
    const e = evaluateWestgard(o(2.3), [o(-2.1)]);
    expect(e.outcome).toBe('WARNING');
    expect(e.violations).not.toContain('2-2s');
  });

  it('does not chain across control levels', () => {
    // A high control drifting says nothing about a normal one.
    const e = evaluateWestgard(o(2.3, 'NORMAL'), [o(2.1, 'HIGH')]);
    expect(e.violations).not.toContain('2-2s');
  });

  it('needs a prior run — one observation cannot be two', () => {
    expect(evaluateWestgard(o(2.3), []).violations).not.toContain('2-2s');
  });
});

describe('4-1s — systematic error', () => {
  it('rejects four consecutive beyond 1 SD, same side', () => {
    const e = evaluateWestgard(o(1.2), run(3, 1.1));
    expect(e.outcome).toBe('REJECTED');
    expect(e.violations).toContain('4-1s');
  });

  it('does not fire on three', () => {
    expect(evaluateWestgard(o(1.2), run(2, 1.1)).violations).not.toContain(
      '4-1s',
    );
  });

  it('does not fire when one of the four crosses the mean', () => {
    const e = evaluateWestgard(o(1.2), [o(1.1), o(-1.1), o(1.1)]);
    expect(e.violations).not.toContain('4-1s');
  });
});

describe('10x — a persistent shift', () => {
  it('rejects ten consecutive on one side, however small', () => {
    // Each of these is well within limits. Ten in a row on one side is not
    // chance — it is the calibration having moved.
    const e = evaluateWestgard(o(0.2), run(9, 0.3));
    expect(e.outcome).toBe('REJECTED');
    expect(e.violations).toContain('10x');
  });

  it('does not fire on nine', () => {
    expect(evaluateWestgard(o(0.2), run(8, 0.3)).violations).not.toContain(
      '10x',
    );
  });

  it('resets when the series crosses the mean', () => {
    const history = [...run(5, 0.3), o(-0.1), ...run(3, 0.3)];
    expect(evaluateWestgard(o(0.2), history).violations).not.toContain('10x');
  });
});

describe('R-4s — random error across levels in one run', () => {
  it('rejects when two levels in a run differ by more than 4 SD', () => {
    // Each is within its own limits; the spread between them is not.
    const e = evaluateWestgard(o(2.2, 'NORMAL'), [], [o(-2.1, 'HIGH')]);
    expect(e.outcome).toBe('REJECTED');
    expect(e.violations).toContain('R-4s');
  });

  it('does not fire on a 4 SD spread exactly', () => {
    expect(
      evaluateWestgard(o(2, 'NORMAL'), [], [o(-2, 'HIGH')]).violations,
    ).not.toContain('R-4s');
  });

  it('does not fire when the levels agree', () => {
    expect(
      evaluateWestgard(o(0.5, 'NORMAL'), [], [o(0.3, 'HIGH')]).violations,
    ).not.toContain('R-4s');
  });

  it('reports each violated rule when several fire at once', () => {
    // A wild result that is also far from its peer violates both, and the
    // bench needs to see both to know what to investigate.
    const e = evaluateWestgard(o(3.5, 'NORMAL'), [], [o(-1.0, 'HIGH')]);
    expect(e.violations).toContain('1-3s');
    expect(e.violations).toContain('R-4s');
    expect(e.reason).toMatch(/1-3s/);
  });
});

describe('zScore', () => {
  it('measures distance from the mean in standard deviations', () => {
    expect(zScore(110, 100, 5)).toBe(2);
    expect(zScore(90, 100, 5)).toBe(-2);
    expect(zScore(100, 100, 5)).toBe(0);
  });

  it('refuses a non-positive SD rather than returning Infinity', () => {
    // A target with no spread is a configuration error. Returning Infinity
    // would reject every run with a violation nobody could explain.
    expect(() => zScore(110, 100, 0)).toThrow(RangeError);
    expect(() => zScore(110, 100, -1)).toThrow(RangeError);
  });
});

describe('coefficientOfVariation', () => {
  it('expresses SD as a percentage of the mean', () => {
    expect(coefficientOfVariation(100, 5)).toBe(5);
    expect(coefficientOfVariation(200, 5)).toBe(2.5);
  });

  it('refuses a zero mean', () => {
    expect(() => coefficientOfVariation(0, 5)).toThrow(RangeError);
  });
});
