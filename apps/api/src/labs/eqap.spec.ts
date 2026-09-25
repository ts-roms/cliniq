import {
  DEFAULT_SDI_LIMIT,
  enrolmentIsActive,
  evaluatePerformance,
  standardDeviationIndex,
  submissionState,
  summariseParticipation,
} from './eqap.js';

const AT = new Date('2026-09-25T12:00:00Z');
const days = (n: number) => new Date(AT.getTime() + n * 86_400_000);

describe('submissionState', () => {
  it('is pending before the deadline', () => {
    expect(
      submissionState({ dueOn: days(7), submittedAt: null, sdi: null }, AT),
    ).toBe('PENDING');
  });

  it('is overdue once the deadline passes unsubmitted', () => {
    expect(
      submissionState({ dueOn: days(-1), submittedAt: null, sdi: null }, AT),
    ).toBe('OVERDUE');
  });

  it('is submitted while awaiting the provider', () => {
    // Distinct from scored. A laboratory waiting for results has not failed.
    expect(
      submissionState(
        { dueOn: days(-1), submittedAt: days(-2), sdi: null },
        AT,
      ),
    ).toBe('SUBMITTED');
  });

  it('is scored once the provider returns an SDI', () => {
    expect(
      submissionState({ dueOn: days(-1), submittedAt: days(-2), sdi: 0.4 }, AT),
    ).toBe('SCORED');
  });

  it('counts a late submission as submitted, not overdue', () => {
    // A laboratory that submitted late still submitted. Recording that
    // honestly is more useful than a status that hides it — lateness shows
    // up in the participation summary instead.
    expect(
      submissionState(
        { dueOn: days(-5), submittedAt: days(-1), sdi: null },
        AT,
      ),
    ).toBe('SUBMITTED');
  });

  it('never goes overdue without a deadline', () => {
    expect(
      submissionState({ dueOn: null, submittedAt: null, sdi: null }, AT),
    ).toBe('PENDING');
  });
});

describe('evaluatePerformance', () => {
  it('accepts within two standard deviations of the peer consensus', () => {
    expect(evaluatePerformance(1.9)).toBe('ACCEPTABLE');
    expect(evaluatePerformance(-1.9)).toBe('ACCEPTABLE');
  });

  it('accepts exactly at the limit', () => {
    expect(evaluatePerformance(DEFAULT_SDI_LIMIT)).toBe('ACCEPTABLE');
    expect(evaluatePerformance(-DEFAULT_SDI_LIMIT)).toBe('ACCEPTABLE');
  });

  it('rejects beyond it', () => {
    expect(evaluatePerformance(2.1)).toBe('UNACCEPTABLE');
    expect(evaluatePerformance(-2.1)).toBe('UNACCEPTABLE');
  });

  it('returns nothing for an unscored submission', () => {
    // An unscored submission is not a failure. Conflating the two would make
    // a laboratory awaiting results look like one that failed.
    expect(evaluatePerformance(null)).toBeNull();
  });

  it('honours a scheme with a different limit', () => {
    expect(evaluatePerformance(2.5, 3)).toBe('ACCEPTABLE');
    expect(evaluatePerformance(2.5, 2)).toBe('UNACCEPTABLE');
  });

  it('refuses a non-positive limit', () => {
    expect(() => evaluatePerformance(1, 0)).toThrow(RangeError);
  });
});

describe('standardDeviationIndex', () => {
  it('measures distance from the PEER mean, not our own', () => {
    // The whole value of EQAP: internal QC measures against the
    // laboratory's own established mean and cannot see a whole-laboratory
    // bias. This mean comes from everyone else.
    expect(standardDeviationIndex(110, 100, 5)).toBe(2);
    expect(standardDeviationIndex(95, 100, 5)).toBe(-1);
  });

  it('refuses a non-positive peer SD', () => {
    expect(() => standardDeviationIndex(110, 100, 0)).toThrow(RangeError);
  });
});

describe('enrolmentIsActive', () => {
  it('accepts an open-ended enrolment', () => {
    expect(enrolmentIsActive({ validFrom: null, validUntil: null }, AT)).toBe(
      true,
    );
  });

  it('rejects one that has lapsed', () => {
    expect(
      enrolmentIsActive({ validFrom: null, validUntil: days(-1) }, AT),
    ).toBe(false);
  });

  it('rejects one that has not started', () => {
    expect(
      enrolmentIsActive({ validFrom: days(1), validUntil: null }, AT),
    ).toBe(false);
  });
});

describe('summariseParticipation', () => {
  const sub = (over: Record<string, unknown> = {}) => ({
    dueOn: days(-30),
    submittedAt: days(-31),
    sdi: 0.5 as number | null,
    correctiveAction: null as string | null,
    ...over,
  });

  it('counts an unblemished record', () => {
    const s = summariseParticipation([sub(), sub(), sub()], AT);
    expect(s).toEqual({
      total: 3,
      scored: 3,
      acceptable: 3,
      unacceptable: 0,
      missedOrLate: 0,
      unresolved: 0,
    });
  });

  it('flags an unacceptable result with no corrective action', () => {
    // The number an inspector cares about. Failing a survey is not itself a
    // finding — laboratories fail surveys. Failing one and recording nothing
    // is, because it says nobody looked into it.
    const s = summariseParticipation([sub({ sdi: 3.1 })], AT);
    expect(s.unacceptable).toBe(1);
    expect(s.unresolved).toBe(1);
  });

  it('does not flag one that was investigated', () => {
    const s = summariseParticipation(
      [sub({ sdi: 3.1, correctiveAction: 'Recalibrated; repeat in range' })],
      AT,
    );
    expect(s.unacceptable).toBe(1);
    expect(s.unresolved).toBe(0);
  });

  it('treats whitespace as no corrective action', () => {
    const s = summariseParticipation(
      [sub({ sdi: 3.1, correctiveAction: '   ' })],
      AT,
    );
    expect(s.unresolved).toBe(1);
  });

  it('counts a late submission and a missed one alike', () => {
    const s = summariseParticipation(
      [
        sub({ dueOn: days(-30), submittedAt: days(-20) }), // late
        sub({ dueOn: days(-5), submittedAt: null, sdi: null }), // missed
      ],
      AT,
    );
    expect(s.missedOrLate).toBe(2);
  });

  it('does not count an unscored submission as either outcome', () => {
    const s = summariseParticipation([sub({ sdi: null })], AT);
    expect(s.total).toBe(1);
    expect(s.scored).toBe(0);
    expect(s.acceptable).toBe(0);
    expect(s.unacceptable).toBe(0);
  });

  it('handles an empty record without dividing by anything', () => {
    expect(summariseParticipation([], AT)).toEqual({
      total: 0,
      scored: 0,
      acceptable: 0,
      unacceptable: 0,
      missedOrLate: 0,
      unresolved: 0,
    });
  });
});
