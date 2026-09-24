import {
  CATEGORY_SECTION_GUIDANCE,
  checkCapability,
  licenceStatus,
  type CapabilityEntry,
} from './capability.js';

const test = (over: Partial<Parameters<typeof checkCapability>[0]> = {}) => ({
  ref: 'item-1',
  testId: 'test-cbc',
  sectionId: 'sec-heme',
  testName: 'Complete blood count',
  ...over,
});

const section = (id: string, isEnabled = true): CapabilityEntry => ({
  sectionId: id,
  testId: null,
  isEnabled,
});
const only = (id: string, isEnabled = true): CapabilityEntry => ({
  sectionId: null,
  testId: id,
  isEnabled,
});

describe('checkCapability', () => {
  it('treats silence as undeclared, not as prohibition', () => {
    // A laboratory that has never opened this screen has not told us it can
    // do nothing. Treating empty as OUT_OF_SCOPE would flag every test in
    // every clinic.
    expect(checkCapability(test(), [])).toEqual({ status: 'NOT_DECLARED' });
  });

  it('allows a test whose section is declared', () => {
    expect(checkCapability(test(), [section('sec-heme')])).toEqual({
      status: 'WITHIN_SCOPE',
    });
  });

  it('refuses a test whose section is declared as disabled', () => {
    const v = checkCapability(test(), [section('sec-heme', false)]);
    expect(v.status).toBe('OUT_OF_SCOPE');
    if (v.status === 'OUT_OF_SCOPE') expect(v.reason).toMatch(/section/);
  });

  it('refuses a test in a section nobody claimed', () => {
    // The laboratory declared chemistry and said nothing about haematology.
    const v = checkCapability(test(), [section('sec-chem')]);
    expect(v.status).toBe('OUT_OF_SCOPE');
    if (v.status === 'OUT_OF_SCOPE') expect(v.reason).toMatch(/not covered/);
  });

  it('lets a specific test override its section — the send-out case', () => {
    // "We do chemistry, but HbA1c goes out." Without per-test precedence
    // this is inexpressible and the section has to be turned off wholesale.
    const v = checkCapability(test({ testName: 'HbA1c' }), [
      section('sec-heme'),
      only('test-cbc', false),
    ]);
    expect(v.status).toBe('OUT_OF_SCOPE');
    if (v.status === 'OUT_OF_SCOPE') expect(v.reason).toMatch(/HbA1c/);
  });

  it('lets a specific test override a disabled section — the exception case', () => {
    // "We do not do microbiology, except gram stain."
    expect(
      checkCapability(test(), [section('sec-heme', false), only('test-cbc')]),
    ).toEqual({ status: 'WITHIN_SCOPE' });
  });

  it('does not flag an ad-hoc test ordered outside the catalogue', () => {
    // Nothing to match against, so the laboratory has not said it cannot do
    // it. Flagging here would punish clinics for ordering off-catalogue.
    expect(
      checkCapability(
        {
          ref: 'item-1',
          testId: null,
          sectionId: null,
          testName: 'Something unusual',
        },
        [section('sec-heme')],
      ),
    ).toEqual({ status: 'NOT_DECLARED' });
  });

  it('names the test in the reason, so the message is actionable', () => {
    const v = checkCapability(test({ testName: 'Blood culture' }), [
      section('sec-heme', false),
    ]);
    if (v.status === 'OUT_OF_SCOPE') {
      expect(v.reason).toContain('Blood culture');
    } else {
      throw new Error('expected OUT_OF_SCOPE');
    }
  });
});

describe('licenceStatus', () => {
  const at = new Date('2026-09-24T00:00:00Z');

  it('reports when no LTO is on file', () => {
    expect(licenceStatus({ dohLtoNumber: null, validUntil: null }, at)).toEqual(
      { onFile: false, expired: false, daysRemaining: null },
    );
  });

  it('does not count whitespace as an LTO number', () => {
    expect(
      licenceStatus({ dohLtoNumber: '   ', validUntil: null }, at).onFile,
    ).toBe(false);
  });

  it('reports an open-ended licence as unexpired', () => {
    expect(
      licenceStatus({ dohLtoNumber: 'LTO-1', validUntil: null }, at),
    ).toEqual({ onFile: true, expired: false, daysRemaining: null });
  });

  it('counts down to expiry', () => {
    const s = licenceStatus(
      { dohLtoNumber: 'LTO-1', validUntil: new Date('2026-10-24T00:00:00Z') },
      at,
    );
    expect(s.expired).toBe(false);
    expect(s.daysRemaining).toBe(30);
  });

  it('reports an expired licence, with days gone negative', () => {
    const s = licenceStatus(
      { dohLtoNumber: 'LTO-1', validUntil: new Date('2026-09-01T00:00:00Z') },
      at,
    );
    expect(s.expired).toBe(true);
    expect(s.daysRemaining).toBeLessThan(0);
  });
});

describe('CATEGORY_SECTION_GUIDANCE', () => {
  it('nests: each category covers everything the one below does', () => {
    const p = CATEGORY_SECTION_GUIDANCE.PRIMARY;
    const s = CATEGORY_SECTION_GUIDANCE.SECONDARY;
    const t = CATEGORY_SECTION_GUIDANCE.TERTIARY;
    expect(p.every((x) => s.includes(x))).toBe(true);
    expect(s.every((x) => t.includes(x))).toBe(true);
  });

  it('is guidance, not a rule the checker applies', () => {
    // checkCapability never consults it. The authoritative list is what is
    // printed on the laboratory's own Licence to Operate, which can carry
    // conditions this table knows nothing about.
    const v = checkCapability(
      {
        ref: 'item-1',
        testId: 't',
        sectionId: 'MICROBIOLOGY',
        testName: 'Culture',
      },
      [{ sectionId: 'MICROBIOLOGY', testId: null, isEnabled: true }],
    );
    expect(v).toEqual({ status: 'WITHIN_SCOPE' });
  });
});
