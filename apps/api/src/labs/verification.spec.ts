import {
  DEFAULT_VERIFICATION_POLICY,
  canAmend,
  canVerify,
  isReleased,
  orderIsFullyReported,
  readVerificationPolicy,
  statusOnEntry,
} from './verification.js';

const OFF = DEFAULT_VERIFICATION_POLICY;
const ON = { required: true, requireSeparateVerifier: false };
const FOUR_EYES = { required: true, requireSeparateVerifier: true };

describe('readVerificationPolicy', () => {
  it('defaults to off for a tenant that has never configured it', () => {
    expect(readVerificationPolicy(null)).toEqual(OFF);
    expect(readVerificationPolicy({})).toEqual(OFF);
    expect(readVerificationPolicy({ labVerification: {} })).toEqual(OFF);
  });

  it('reads both switches', () => {
    expect(
      readVerificationPolicy({
        labVerification: { required: true, requireSeparateVerifier: true },
      }),
    ).toEqual(FOUR_EYES);
  });

  it('falls back to off rather than throwing on a malformed blob', () => {
    // A settings JSON someone hand-edited must not take the laboratory down,
    // and the safe fallback is the one that still lets results out.
    for (const junk of ['nonsense', 42, [], { labVerification: 'yes' }]) {
      expect(readVerificationPolicy(junk)).toEqual(OFF);
    }
  });

  it('treats only a real boolean true as on', () => {
    // A stray "false" string or 0 must not read as enabled.
    expect(
      readVerificationPolicy({ labVerification: { required: 'true' } })
        .required,
    ).toBe(false);
    expect(
      readVerificationPolicy({ labVerification: { required: 1 } }).required,
    ).toBe(false);
  });
});

describe('statusOnEntry', () => {
  it('releases immediately when the clinic has not turned verification on', () => {
    expect(statusOnEntry(OFF)).toBe('FINAL');
  });

  it('holds the result back when it has', () => {
    expect(statusOnEntry(ON)).toBe('PRELIMINARY');
  });
});

describe('isReleased', () => {
  it('counts FINAL and CORRECTED, not PENDING or PRELIMINARY', () => {
    expect(isReleased('FINAL')).toBe(true);
    expect(isReleased('CORRECTED')).toBe(true);
    expect(isReleased('PRELIMINARY')).toBe(false);
    expect(isReleased('PENDING')).toBe(false);
  });
});

describe('canVerify', () => {
  it('releases a preliminary result', () => {
    expect(canVerify('PRELIMINARY', 'tech-1', 'path-1', ON)).toEqual({
      ok: true,
    });
  });

  it('refuses a result that has no value yet', () => {
    const r = canVerify('PENDING', null, 'path-1', ON);
    expect(r.ok).toBe(false);
  });

  it('refuses to re-release something already out', () => {
    // Re-verifying is not a real act. Changing a released value is a
    // correction, which has to carry a reason.
    for (const s of ['FINAL', 'CORRECTED'] as const) {
      const r = canVerify(s, 'tech-1', 'path-1', ON);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/amendment/);
    }
  });

  it('allows self-verification unless the clinic asked for four eyes', () => {
    expect(canVerify('PRELIMINARY', 'tech-1', 'tech-1', ON)).toEqual({
      ok: true,
    });
  });

  it('refuses self-verification when it did', () => {
    const r = canVerify('PRELIMINARY', 'tech-1', 'tech-1', FOUR_EYES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/other than/);
  });

  it('still lets a different person release it under four eyes', () => {
    expect(canVerify('PRELIMINARY', 'tech-1', 'path-1', FOUR_EYES)).toEqual({
      ok: true,
    });
  });

  it('does not treat a null enterer as matching the verifier', () => {
    // Legacy rows have no enteredById. Comparing null to a user id must not
    // block the release of results recorded before this existed.
    expect(canVerify('PRELIMINARY', null, 'path-1', FOUR_EYES)).toEqual({
      ok: true,
    });
  });
});

describe('canAmend', () => {
  it('allows correcting a released result', () => {
    expect(canAmend('FINAL')).toEqual({ ok: true });
    expect(canAmend('CORRECTED')).toEqual({ ok: true });
  });

  it('refuses to "correct" something nobody has seen', () => {
    // Nothing has been acted on, so there is nothing to correct — just
    // re-enter the value, without demanding an explanation for it.
    for (const s of ['PENDING', 'PRELIMINARY'] as const) {
      const r = canAmend(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/re-enter/);
    }
  });
});

describe('orderIsFullyReported', () => {
  it('needs every item released, not merely valued', () => {
    // This is the behaviour change: an order used to report as soon as every
    // item had a value, which pushed unreleased results to the chart.
    expect(orderIsFullyReported(['FINAL', 'PRELIMINARY'])).toBe(false);
    expect(orderIsFullyReported(['FINAL', 'FINAL'])).toBe(true);
    expect(orderIsFullyReported(['FINAL', 'CORRECTED'])).toBe(true);
  });

  it('is false for an order with no items rather than vacuously true', () => {
    expect(orderIsFullyReported([])).toBe(false);
  });

  it('is false while anything is still pending', () => {
    expect(orderIsFullyReported(['FINAL', 'PENDING'])).toBe(false);
  });
});
