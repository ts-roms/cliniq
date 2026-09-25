// Which specialty modules a given PATIENT'S chart should show.
//
// clinic-modules.ts answers "what does this clinic do". This answers the
// narrower question the chart actually asks: "of that, what is relevant to
// the person in front of me". A general clinic practises dental and OB, but
// a 40-year-old man walking in with a cough needs neither card open, and can
// never need an OB card at all.
//
// Every enabled module ends up in exactly one of four places:
//
//   shown        rendered on the chart
//   out_of_scope clinic switched it off but this patient has records —
//                rendered, flagged (see ModuleSection)
//   offered      one click away in the chart's "Add a service" bar
//   hidden       not applicable to this patient (or the clinic)
//
// The rule that outranks every other: a module holding records for this
// patient is ALWAYS rendered. Relevance only decides what to open by default
// for modules that are still empty — it never hides existing history.

import {
  ALL_CLINIC_MODULES,
  ClinicModules,
  type ClinicModule,
  type ClinicType,
} from './clinic-modules.js';

export type PatientModulePlacement =
  | 'shown'
  | 'out_of_scope'
  | 'offered'
  | 'hidden';

export interface PatientModuleDecision {
  module: ClinicModule;
  placement: PatientModulePlacement;
  /** An offered module worth drawing attention to. */
  suggested: boolean;
  /** Short, clinician-facing reason for the placement. */
  reason: string;
}

/** Mirrors the Sex enum in libs/db/prisma/schema.prisma. */
export type PatientSex = 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';

/**
 * Childbearing-age window for offering an OB record. Deliberately wide: the
 * cost of offering the card to someone who does not need it is one chip; the
 * cost of not offering it to someone who does is a missed pregnancy record.
 */
export const OB_MIN_AGE = 10;
export const OB_MAX_AGE = 55;

/**
 * Empty modules each clinic type opens by default. Anything enabled but not
 * listed here starts in the "Add a service" bar instead. Lab orders are
 * routine enough in every clinic that they stay open everywhere.
 */
export const PRIMARY_MODULES_BY_CLINIC_TYPE: Record<
  ClinicType,
  ClinicModule[]
> = {
  GENERAL: [ClinicModules.LAB_ORDERS],
  OTHER: [ClinicModules.LAB_ORDERS],
  DENTAL: [ClinicModules.DENTAL, ClinicModules.LAB_ORDERS],
  PEDIATRIC: [ClinicModules.LAB_ORDERS],
  DERMATOLOGY: [ClinicModules.LAB_ORDERS],
  OBGYN: [ClinicModules.OB, ClinicModules.ULTRASOUND, ClinicModules.LAB_ORDERS],
  CARDIOLOGY: [ClinicModules.LAB_ORDERS],
  PSYCH: [],
};

/** Whole years between `dob` and `now`; null when the date is unusable. */
export function ageInYears(
  dob: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/**
 * Why a module can never apply to this patient, or null if it can.
 *
 * Only a recorded MALE sex rules OB out. OTHER and UNDISCLOSED stay eligible:
 * the recorded value need not describe anatomy, and hiding a pregnancy record
 * on a guess is the worse mistake. An unreadable birth date keeps it eligible
 * for the same reason.
 */
export function patientIneligibility(
  module: ClinicModule,
  patient: { sex: PatientSex | string; dateOfBirth: string | Date | null },
  now: Date = new Date(),
): string | null {
  if (module !== ClinicModules.OB) return null;
  if (patient.sex === 'MALE') return 'Not applicable to a male patient';
  const age = ageInYears(patient.dateOfBirth, now);
  if (age !== null && (age < OB_MIN_AGE || age > OB_MAX_AGE)) {
    return `Outside childbearing age (${age} yrs)`;
  }
  return null;
}

export function resolvePatientModules(opts: {
  /** The clinic's resolved modules (tenant settings `modules`). */
  enabled: readonly ClinicModule[];
  /** Which modules hold records for this patient (`GET /patients/:id/modules`). */
  hasData: Partial<Record<ClinicModule, boolean>>;
  patient: { sex: PatientSex | string; dateOfBirth: string | Date | null };
  clinicType?: ClinicType | null;
  /** Modules the clinician explicitly opened (Add-a-service, visit focus link). */
  opened?: readonly ClinicModule[];
  now?: Date;
}): PatientModuleDecision[] {
  const now = opts.now ?? new Date();
  const primary =
    PRIMARY_MODULES_BY_CLINIC_TYPE[opts.clinicType ?? 'GENERAL'] ??
    PRIMARY_MODULES_BY_CLINIC_TYPE.GENERAL;
  const opened = opts.opened ?? [];
  const hasPregnancy = opts.hasData[ClinicModules.OB] === true;

  return ALL_CLINIC_MODULES.map((module): PatientModuleDecision => {
    const enabled = opts.enabled.includes(module);
    const hasData = opts.hasData[module] === true;

    if (hasData) {
      return enabled
        ? {
            module,
            placement: 'shown',
            suggested: false,
            reason: 'Has records on file',
          }
        : {
            module,
            placement: 'out_of_scope',
            suggested: false,
            reason: 'Has records, but the clinic no longer offers this service',
          };
    }
    if (!enabled) {
      return {
        module,
        placement: 'hidden',
        suggested: false,
        reason: 'Not offered by this clinic',
      };
    }

    const ineligible = patientIneligibility(module, opts.patient, now);
    if (ineligible) {
      return {
        module,
        placement: 'hidden',
        suggested: false,
        reason: ineligible,
      };
    }

    if (opened.includes(module)) {
      return {
        module,
        placement: 'shown',
        suggested: false,
        reason: 'Opened for this visit',
      };
    }
    if (primary.includes(module)) {
      return {
        module,
        placement: 'shown',
        suggested: false,
        reason: "Part of this clinic's core services",
      };
    }

    // An empty module this patient could use. Recommend the ones the rest of
    // the record points at; offer the others quietly.
    if (module === ClinicModules.ULTRASOUND && hasPregnancy) {
      return {
        module,
        placement: 'offered',
        suggested: true,
        reason: 'Pregnancy on file',
      };
    }
    if (module === ClinicModules.OB) {
      const age = ageInYears(opts.patient.dateOfBirth, now);
      return {
        module,
        placement: 'offered',
        suggested: false,
        reason:
          age === null ? 'Eligible patient' : `Eligible patient, ${age} yrs`,
      };
    }
    return {
      module,
      placement: 'offered',
      suggested: false,
      reason: 'Available at this clinic',
    };
  });
}
