import { ALL_CLINIC_MODULES, ClinicModules } from './clinic-modules.js';
import {
  ageInYears,
  resolvePatientModules,
  type PatientModuleDecision,
} from './patient-modules.js';

const NOW = new Date('2026-09-24T00:00:00Z');
const ALL = [...ALL_CLINIC_MODULES];

function placements(ds: PatientModuleDecision[]) {
  return Object.fromEntries(ds.map((d) => [d.module, d.placement]));
}

const woman28 = { sex: 'FEMALE', dateOfBirth: '1998-03-01' };
const man40 = { sex: 'MALE', dateOfBirth: '1986-01-15' };

describe('ageInYears', () => {
  it('counts whole years and respects the birthday', () => {
    expect(ageInYears('2000-09-24', NOW)).toBe(26);
    expect(ageInYears('2000-09-25', NOW)).toBe(25);
  });

  it('returns null for an unusable date', () => {
    expect(ageInYears('not a date', NOW)).toBeNull();
    expect(ageInYears(null, NOW)).toBeNull();
  });
});

describe('resolvePatientModules', () => {
  it('never offers OB to a male patient', () => {
    const got = resolvePatientModules({
      enabled: ALL,
      hasData: {},
      patient: man40,
      clinicType: 'OBGYN',
      now: NOW,
    });
    const ob = got.find((d) => d.module === ClinicModules.OB);
    expect(ob?.placement).toBe('hidden');
    expect(ob?.reason).toMatch(/male/i);
  });

  it('hides OB outside the childbearing window but keeps OTHER / UNDISCLOSED eligible', () => {
    const child = resolvePatientModules({
      enabled: ALL,
      hasData: {},
      patient: { sex: 'FEMALE', dateOfBirth: '2020-01-01' },
      now: NOW,
    });
    expect(placements(child)[ClinicModules.OB]).toBe('hidden');

    for (const sex of ['OTHER', 'UNDISCLOSED']) {
      const got = resolvePatientModules({
        enabled: ALL,
        hasData: {},
        patient: { sex, dateOfBirth: '1998-03-01' },
        now: NOW,
      });
      expect(placements(got)[ClinicModules.OB]).toBe('offered');
    }
  });

  it('a GENERAL clinic opens only lab orders for an empty chart; the rest are offered', () => {
    const got = placements(
      resolvePatientModules({
        enabled: ALL,
        hasData: {},
        patient: woman28,
        clinicType: 'GENERAL',
        now: NOW,
      }),
    );
    expect(got).toEqual({
      [ClinicModules.LAB_ORDERS]: 'shown',
      [ClinicModules.DENTAL]: 'offered',
      [ClinicModules.OB]: 'offered',
      [ClinicModules.ULTRASOUND]: 'offered',
      [ClinicModules.HMO]: 'offered',
    });
  });

  it('a specialty clinic opens its own specialty by default', () => {
    const dental = placements(
      resolvePatientModules({
        enabled: ALL,
        hasData: {},
        patient: man40,
        clinicType: 'DENTAL',
        now: NOW,
      }),
    );
    expect(dental[ClinicModules.DENTAL]).toBe('shown');

    const obgyn = placements(
      resolvePatientModules({
        enabled: ALL,
        hasData: {},
        patient: woman28,
        clinicType: 'OBGYN',
        now: NOW,
      }),
    );
    expect(obgyn[ClinicModules.OB]).toBe('shown');
    expect(obgyn[ClinicModules.ULTRASOUND]).toBe('shown');
  });

  it('records always win — even over ineligibility and a disabled module', () => {
    // Sex mis-recorded as MALE, but a pregnancy is on file: it must render.
    const got = placements(
      resolvePatientModules({
        enabled: [ClinicModules.LAB_ORDERS],
        hasData: { [ClinicModules.OB]: true, [ClinicModules.LAB_ORDERS]: true },
        patient: man40,
        now: NOW,
      }),
    );
    expect(got[ClinicModules.OB]).toBe('out_of_scope');
    expect(got[ClinicModules.LAB_ORDERS]).toBe('shown');
  });

  it('a module the clinic does not offer and the patient has no records in is hidden', () => {
    const got = placements(
      resolvePatientModules({
        enabled: [],
        hasData: {},
        patient: woman28,
        now: NOW,
      }),
    );
    for (const m of ALL) expect(got[m]).toBe('hidden');
  });

  it('opening a module moves it onto the chart', () => {
    const got = placements(
      resolvePatientModules({
        enabled: ALL,
        hasData: {},
        patient: woman28,
        opened: [ClinicModules.DENTAL],
        now: NOW,
      }),
    );
    expect(got[ClinicModules.DENTAL]).toBe('shown');
  });

  it('opening cannot put an ineligible module on the chart', () => {
    const got = placements(
      resolvePatientModules({
        enabled: ALL,
        hasData: {},
        patient: man40,
        opened: [ClinicModules.OB],
        now: NOW,
      }),
    );
    expect(got[ClinicModules.OB]).toBe('hidden');
  });

  it('recommends ultrasound when a pregnancy is on file', () => {
    const got = resolvePatientModules({
      enabled: ALL,
      hasData: { [ClinicModules.OB]: true },
      patient: woman28,
      now: NOW,
    });
    const us = got.find((d) => d.module === ClinicModules.ULTRASOUND);
    expect(us).toMatchObject({ placement: 'offered', suggested: true });
  });
});
