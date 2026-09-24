import {
  DEFAULT_REFERRAL_POLICY,
  allowedReferralTransitions,
  canReferTo,
  canTransitionReferral,
  readReferralPolicy,
  routeTest,
} from './referral.js';

const OFF = DEFAULT_REFERRAL_POLICY;
const ON = { enforce: true };
const inScope = { isOutOfScope: false, reason: '' };
const outOfScope = {
  isOutOfScope: true,
  reason: 'HbA1c is not performed here',
};

describe('readReferralPolicy', () => {
  it('defaults to not enforcing', () => {
    expect(readReferralPolicy(null)).toEqual(OFF);
    expect(readReferralPolicy({})).toEqual(OFF);
    expect(readReferralPolicy({ labCapability: {} })).toEqual(OFF);
  });

  it('reads the switch', () => {
    expect(readReferralPolicy({ labCapability: { enforce: true } })).toEqual(
      ON,
    );
  });

  it('falls back rather than throwing on a malformed blob', () => {
    for (const junk of ['nonsense', 7, [], { labCapability: 'yes' }]) {
      expect(readReferralPolicy(junk)).toEqual(OFF);
    }
  });

  it('treats only a real boolean true as on', () => {
    expect(
      readReferralPolicy({ labCapability: { enforce: 'true' } }).enforce,
    ).toBe(false);
  });
});

describe('routeTest', () => {
  it('runs an in-scope test here, destination or not', () => {
    expect(routeTest(inScope, null, ON)).toEqual({ action: 'IN_HOUSE' });
    expect(routeTest(inScope, 'ref-1', ON)).toEqual({ action: 'IN_HOUSE' });
  });

  it('refers an out-of-scope test that has a destination', () => {
    expect(routeTest(outOfScope, 'ref-1', OFF)).toEqual({
      action: 'REFER',
      referralLaboratoryId: 'ref-1',
    });
  });

  it('refers regardless of whether enforcement is on', () => {
    // A standing send-out arrangement is not a punishment, so it applies
    // whether or not the clinic has asked us to police the gaps.
    expect(routeTest(outOfScope, 'ref-1', ON)).toEqual({
      action: 'REFER',
      referralLaboratoryId: 'ref-1',
    });
  });

  it('flags, not refuses, when nothing is on file and enforcement is off', () => {
    const d = routeTest(outOfScope, null, OFF);
    expect(d.action).toBe('FLAG');
  });

  it('refuses when nothing is on file and enforcement is on', () => {
    const d = routeTest(outOfScope, null, ON);
    expect(d.action).toBe('REFUSE');
    if (d.action === 'REFUSE') {
      expect(d.reason).toMatch(/HbA1c/);
      // The message has to say what is missing, or the clinic cannot fix it.
      expect(d.reason).toMatch(/no referral laboratory/);
    }
  });
});

describe('canReferTo', () => {
  it('allows an active, licensed laboratory', () => {
    expect(canReferTo({ isActive: true, dohLtoNumber: 'LTO-9' })).toEqual({
      ok: true,
    });
  });

  it('refuses an inactive one', () => {
    const r = canReferTo({ isActive: false, dohLtoNumber: 'LTO-9' });
    expect(r.ok).toBe(false);
  });

  it('refuses one with no LTO on file', () => {
    // AO 2021-0037 permits referral only to a licensed laboratory. Referring
    // to one we cannot evidence is licensed is indefensible if asked.
    const r = canReferTo({ isActive: true, dohLtoNumber: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Licence to Operate/);
  });

  it('does not accept whitespace as an LTO number', () => {
    expect(canReferTo({ isActive: true, dohLtoNumber: '   ' }).ok).toBe(false);
  });
});

describe('referral state machine', () => {
  it('walks the happy path', () => {
    expect(canTransitionReferral('PENDING', 'SENT')).toBe(true);
    expect(canTransitionReferral('SENT', 'RECEIVED')).toBe(true);
  });

  it('does not let a specimen un-leave the building', () => {
    expect(canTransitionReferral('SENT', 'PENDING')).toBe(false);
  });

  it('allows cancellation until the result is back', () => {
    expect(canTransitionReferral('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransitionReferral('SENT', 'CANCELLED')).toBe(true);
    expect(canTransitionReferral('RECEIVED', 'CANCELLED')).toBe(false);
  });

  it('treats RECEIVED and CANCELLED as terminal', () => {
    expect(allowedReferralTransitions('RECEIVED')).toEqual([]);
    expect(allowedReferralTransitions('CANCELLED')).toEqual([]);
  });

  it('does not skip SENT', () => {
    expect(canTransitionReferral('PENDING', 'RECEIVED')).toBe(false);
  });
});
