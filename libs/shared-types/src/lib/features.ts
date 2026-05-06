// Feature catalog + plan→feature mapping. The single source of truth for
// "what does each subscription tier unlock?" — consumed by the api's
// FeatureGuard and by the web's plan-aware UI gating.
//
// Mirrors the Plan enum in libs/db/prisma/schema.prisma. Keep them in sync.

export const Plans = {
  STARTER: 'STARTER',
  PRO: 'PRO',
  PREMIUM: 'PREMIUM',
} as const;

export type Plan = (typeof Plans)[keyof typeof Plans];

export const Features = {
  // Core EMR — included in every plan. Listed for completeness/UI display
  // even though no route gates against them.
  CORE_EMR: 'core_emr',
  REPORTS_BASIC: 'reports_basic',

  // Pro+
  REPORTS_ADVANCED: 'reports_advanced',
  INVENTORY: 'inventory',
  LABS: 'labs',
  HMO: 'hmo',
  TELEMEDICINE: 'telemedicine',
  AI_SOAP: 'ai_soap',

  // Premium-only
  AI_DERMATOLOGY: 'ai_dermatology',
  WEBHOOKS: 'webhooks',
  CALENDAR_SYNC: 'calendar_sync',
  CUSTOM_RETENTION: 'custom_retention',
} as const;

export type Feature = (typeof Features)[keyof typeof Features];

// Hard cap on Locations per tenant. Enforced in LocationsService.create.
export const MAX_LOCATIONS_PER_PLAN: Record<Plan, number> = {
  STARTER: 1,
  PRO: 3,
  PREMIUM: Number.POSITIVE_INFINITY,
};

// Plan → unlocked features. Higher tiers strictly include lower tiers'
// features (enforced in this file's tests).
const STARTER_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  Features.CORE_EMR,
  Features.REPORTS_BASIC,
]);

const PRO_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...STARTER_FEATURES,
  Features.REPORTS_ADVANCED,
  Features.INVENTORY,
  Features.LABS,
  Features.HMO,
  Features.TELEMEDICINE,
  Features.AI_SOAP,
]);

const PREMIUM_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...PRO_FEATURES,
  Features.AI_DERMATOLOGY,
  Features.WEBHOOKS,
  Features.CALENDAR_SYNC,
  Features.CUSTOM_RETENTION,
]);

export const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  STARTER: STARTER_FEATURES,
  PRO: PRO_FEATURES,
  PREMIUM: PREMIUM_FEATURES,
};

export function planHasFeature(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan]?.has(feature) ?? false;
}

export function maxLocationsForPlan(plan: Plan): number {
  return MAX_LOCATIONS_PER_PLAN[plan] ?? 1;
}

// Human-readable plan metadata for the platform admin UI + marketing pages.
// Pricing values are placeholders — wire to the real billing source-of-truth
// (Stripe/PayMongo/Maya) later. Stored in minor units (centavos for PHP)
// so we can do tax math without floats.
export interface PlanMeta {
  id: Plan;
  label: string;
  tagline: string;
  features: Feature[];
  maxLocations: number;
  /** Monthly price in minor units (centavos). null = "Talk to us / custom". */
  priceMonthly: number | null;
  currency: string;
  highlight?: boolean;
  cta?: string;
}

export const PLAN_META: Record<Plan, PlanMeta> = {
  STARTER: {
    id: 'STARTER',
    label: 'Starter',
    tagline: 'Solo practitioners and single-location clinics.',
    features: [...STARTER_FEATURES],
    maxLocations: 1,
    priceMonthly: 149900, // ₱1,499 / month — placeholder
    currency: 'PHP',
    cta: 'Start free trial',
  },
  PRO: {
    id: 'PRO',
    label: 'Pro',
    tagline: 'Growing clinics with telemedicine, labs, and HMO billing.',
    features: [...PRO_FEATURES],
    maxLocations: 3,
    priceMonthly: 499900, // ₱4,999 / month — placeholder
    currency: 'PHP',
    highlight: true,
    cta: 'Start free trial',
  },
  PREMIUM: {
    id: 'PREMIUM',
    label: 'Premium',
    tagline: 'Multi-location groups with full AI suite, integrations, and custom retention.',
    features: [...PREMIUM_FEATURES],
    maxLocations: Number.POSITIVE_INFINITY,
    priceMonthly: 1499900, // ₱14,999 / month — placeholder
    currency: 'PHP',
    cta: 'Start free trial',
  },
};

/** Format a minor-units price as "₱4,999" (or null → "Custom"). */
export function formatPlanPrice(meta: PlanMeta): string {
  if (meta.priceMonthly === null) return 'Custom';
  const major = meta.priceMonthly / 100;
  const formatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: meta.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(major);
}

export const ALL_PLANS: Plan[] = ['STARTER', 'PRO', 'PREMIUM'];
