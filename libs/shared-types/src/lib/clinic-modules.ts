// Which clinical modules a clinic actually practises.
//
// This is a THIRD axis, distinct from the two that already existed and
// deliberately not a replacement for either:
//
//   - `Plan` / `Features` (features.ts) answers "what did this tenant PAY for".
//   - `Role` / `Actions` (roles.ts) answers "what is this USER allowed to do".
//   - This file answers "what does this clinic DO" — a cardiology clinic has
//     no use for a dental chart even on PREMIUM with an OWNER signed in.
//
// Before this existed the patient chart rendered every specialty card
// unconditionally, so a dental clinic got an obstetrics card and a male
// patient got an ultrasound card.
//
// Only specialty modules are listed. Vitals, allergies, medications,
// conditions, consents, consultations and prescriptions are universal to
// every clinic and are never toggleable — hiding them would be a clinical
// hazard, not a tidier UI.

import {
  Features,
  planHasFeature,
  type Feature,
  type Plan,
} from './features.js';

export const ClinicModules = {
  DENTAL: 'dental',
  OB: 'ob',
  ULTRASOUND: 'ultrasound',
  LAB_ORDERS: 'lab_orders',
  HMO: 'hmo',
} as const;

export type ClinicModule = (typeof ClinicModules)[keyof typeof ClinicModules];

export const ALL_CLINIC_MODULES: ClinicModule[] = [
  ClinicModules.DENTAL,
  ClinicModules.OB,
  ClinicModules.ULTRASOUND,
  ClinicModules.LAB_ORDERS,
  ClinicModules.HMO,
];

/** Mirrors the ClinicType enum in libs/db/prisma/schema.prisma. */
export type ClinicType =
  | 'GENERAL'
  | 'DENTAL'
  | 'PEDIATRIC'
  | 'DERMATOLOGY'
  | 'OBGYN'
  | 'CARDIOLOGY'
  | 'PSYCH'
  | 'OTHER';

export interface ClinicModuleMeta {
  id: ClinicModule;
  label: string;
  description: string;
  /**
   * Plan feature this module also needs. A clinic can enable the module in
   * settings, but a plan that does not include the feature still wins — the
   * api's FeatureGuard would 402 the underlying routes anyway, and showing a
   * card that only ever errors is worse than not showing it.
   */
  requiresFeature: Feature | null;
}

export const CLINIC_MODULE_META: Record<ClinicModule, ClinicModuleMeta> = {
  [ClinicModules.DENTAL]: {
    id: ClinicModules.DENTAL,
    label: 'Dental charting',
    description: 'Odontogram, tooth findings and dental history.',
    requiresFeature: null,
  },
  [ClinicModules.OB]: {
    id: ClinicModules.OB,
    label: 'Obstetrics',
    description: 'Pregnancy records, LMP/EDD and prenatal visits.',
    requiresFeature: Features.OBSTETRICS,
  },
  [ClinicModules.ULTRASOUND]: {
    id: ClinicModules.ULTRASOUND,
    label: 'Ultrasound',
    description: 'Ultrasound reports and attached imaging.',
    requiresFeature: Features.ULTRASOUND_2D,
  },
  [ClinicModules.LAB_ORDERS]: {
    id: ClinicModules.LAB_ORDERS,
    label: 'Laboratory orders',
    description: 'Order diagnostics and record results against a patient.',
    requiresFeature: Features.LABS,
  },
  [ClinicModules.HMO]: {
    id: ClinicModules.HMO,
    label: 'HMO / insurance',
    description: 'Member cards, coverage and claim eligibility.',
    requiresFeature: Features.HMO,
  },
};

/**
 * What a clinic of this type gets before anyone touches settings.
 *
 * GENERAL and OTHER keep everything on — that is the behaviour every existing
 * tenant already has, so an upgrade changes nothing for them until they opt in.
 * The specialty types start from the modules that specialty actually uses.
 */
export const DEFAULT_MODULES_BY_CLINIC_TYPE: Record<
  ClinicType,
  ClinicModule[]
> = {
  GENERAL: [...ALL_CLINIC_MODULES],
  OTHER: [...ALL_CLINIC_MODULES],
  DENTAL: [ClinicModules.DENTAL, ClinicModules.LAB_ORDERS, ClinicModules.HMO],
  PEDIATRIC: [ClinicModules.LAB_ORDERS, ClinicModules.HMO],
  DERMATOLOGY: [ClinicModules.LAB_ORDERS, ClinicModules.HMO],
  OBGYN: [
    ClinicModules.OB,
    ClinicModules.ULTRASOUND,
    ClinicModules.LAB_ORDERS,
    ClinicModules.HMO,
  ],
  CARDIOLOGY: [ClinicModules.LAB_ORDERS, ClinicModules.HMO],
  PSYCH: [ClinicModules.HMO],
};

export function isClinicModule(value: unknown): value is ClinicModule {
  return (
    typeof value === 'string' &&
    (ALL_CLINIC_MODULES as string[]).includes(value)
  );
}

/**
 * The modules a chart should offer.
 *
 * `configured` is `tenant.settings.modules`: undefined means "never chosen",
 * so the clinic type's defaults apply. An explicit array — including an empty
 * one — is the clinic's own answer and is taken literally.
 *
 * The plan then narrows the result. It never widens it: paying for obstetrics
 * does not put an OB card in a dental clinic's charts.
 */
export function resolveClinicModules(opts: {
  clinicType: ClinicType | null | undefined;
  plan: Plan | null | undefined;
  configured?: readonly string[] | null;
}): ClinicModule[] {
  const base: ClinicModule[] = opts.configured
    ? opts.configured.filter(isClinicModule)
    : (DEFAULT_MODULES_BY_CLINIC_TYPE[opts.clinicType ?? 'GENERAL'] ??
      DEFAULT_MODULES_BY_CLINIC_TYPE.GENERAL);

  return base.filter((id) => {
    const required = CLINIC_MODULE_META[id].requiresFeature;
    if (!required) return true;
    return opts.plan ? planHasFeature(opts.plan, required) : false;
  });
}
