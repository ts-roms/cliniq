import {
  ALL_CLINIC_MODULES,
  CLINIC_MODULE_META,
  ClinicModules,
  DEFAULT_MODULES_BY_CLINIC_TYPE,
  isClinicModule,
  resolveClinicModules,
  type ClinicType,
} from './clinic-modules.js';

describe('clinic module catalog', () => {
  it('every module has metadata', () => {
    for (const id of ALL_CLINIC_MODULES) {
      expect(CLINIC_MODULE_META[id]).toBeDefined();
      expect(CLINIC_MODULE_META[id].id).toBe(id);
      expect(CLINIC_MODULE_META[id].label).toBeTruthy();
    }
  });

  it('every clinic type has a default set drawn from the catalog', () => {
    for (const mods of Object.values(DEFAULT_MODULES_BY_CLINIC_TYPE)) {
      for (const m of mods) {
        expect(ALL_CLINIC_MODULES).toContain(m);
      }
      // No duplicates.
      expect(new Set(mods).size).toBe(mods.length);
    }
  });

  it('isClinicModule rejects anything not in the catalog', () => {
    expect(isClinicModule('dental')).toBe(true);
    expect(isClinicModule('telemedicine')).toBe(false);
    expect(isClinicModule(null)).toBe(false);
    expect(isClinicModule(42)).toBe(false);
  });
});

describe('resolveClinicModules', () => {
  it('a GENERAL clinic on PREMIUM keeps every module (today’s behaviour)', () => {
    const got = resolveClinicModules({
      clinicType: 'GENERAL',
      plan: 'PREMIUM',
    });
    expect(got.sort()).toEqual([...ALL_CLINIC_MODULES].sort());
  });

  it('a DENTAL clinic gets no obstetrics or ultrasound', () => {
    const got = resolveClinicModules({ clinicType: 'DENTAL', plan: 'PREMIUM' });
    expect(got).toContain(ClinicModules.DENTAL);
    expect(got).not.toContain(ClinicModules.OB);
    expect(got).not.toContain(ClinicModules.ULTRASOUND);
  });

  it('an OBGYN clinic gets no dental chart', () => {
    const got = resolveClinicModules({ clinicType: 'OBGYN', plan: 'PREMIUM' });
    expect(got).toContain(ClinicModules.OB);
    expect(got).not.toContain(ClinicModules.DENTAL);
  });

  it('an explicit configuration overrides the clinic-type default', () => {
    const got = resolveClinicModules({
      clinicType: 'DENTAL',
      plan: 'PREMIUM',
      configured: [ClinicModules.OB, ClinicModules.ULTRASOUND],
    });
    expect(got.sort()).toEqual(
      [ClinicModules.OB, ClinicModules.ULTRASOUND].sort(),
    );
  });

  it('an explicitly empty configuration means none — not "fall back to defaults"', () => {
    expect(
      resolveClinicModules({
        clinicType: 'GENERAL',
        plan: 'PREMIUM',
        configured: [],
      }),
    ).toEqual([]);
  });

  it('ignores unknown ids in a stored configuration', () => {
    const got = resolveClinicModules({
      clinicType: 'GENERAL',
      plan: 'PREMIUM',
      configured: ['dental', 'not_a_module', ''],
    });
    expect(got).toEqual([ClinicModules.DENTAL]);
  });

  it('the plan narrows the result — STARTER loses the gated modules', () => {
    const got = resolveClinicModules({
      clinicType: 'GENERAL',
      plan: 'STARTER',
    });
    // Dental carries no plan feature, so it survives; the rest need PRO+.
    expect(got).toEqual([ClinicModules.DENTAL]);
  });

  it('the plan never widens the result', () => {
    const got = resolveClinicModules({
      clinicType: 'PREMIUM' as unknown as ClinicType, // unknown type -> GENERAL
      plan: 'PREMIUM',
      configured: [ClinicModules.HMO],
    });
    expect(got).toEqual([ClinicModules.HMO]);
  });

  it('a missing plan drops every plan-gated module', () => {
    const got = resolveClinicModules({ clinicType: 'GENERAL', plan: null });
    expect(got).toEqual([ClinicModules.DENTAL]);
  });

  it('an unknown clinic type falls back to the GENERAL defaults', () => {
    const got = resolveClinicModules({
      clinicType: 'NOPE' as unknown as ClinicType,
      plan: 'PREMIUM',
    });
    expect(got.sort()).toEqual([...ALL_CLINIC_MODULES].sort());
  });
});
