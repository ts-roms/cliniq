// Feature catalog + plan→feature mapping. The single source of truth for
// "what does each subscription tier unlock?" — consumed by the api's
// FeatureGuard and by the web's plan-aware UI gating.
//
// Mirrors the Plan and LabPlan enums in libs/db/prisma/schema.prisma.
// Keep them in sync.

export const Plans = {
  STARTER: 'STARTER',
  PRO: 'PRO',
  PREMIUM: 'PREMIUM',
} as const;

export type Plan = (typeof Plans)[keyof typeof Plans];

// Lab-side plan tiers. See docs/lab-module-plan.md for the rationale.
export const LabPlans = {
  LAB_BASIC: 'LAB_BASIC',
  LAB_STANDARD: 'LAB_STANDARD',
  LAB_PREMIUM: 'LAB_PREMIUM',
} as const;

export type LabPlan = (typeof LabPlans)[keyof typeof LabPlans];

export const Features = {
  // ── Clinic features ─────────────────────────────────────────────
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

  // ── Lab features ────────────────────────────────────────────────
  // Basic+ (every paid lab tier)
  LAB_CATALOG: 'lab_catalog',           // custom product catalog
  LAB_DYNAMIC_FORMS: 'lab_dynamic_forms', // unlimited multi-language forms
  LAB_ORDERS: 'lab_orders',             // digital case/order requests
  LAB_FILE_UPLOADS: 'lab_file_uploads', // STL/ZIP/PDF/JPG, no size limit
  LAB_CALENDAR: 'lab_calendar',         // standard/urgent calendar
  LAB_PUBLIC_REQUEST: 'lab_public_request', // anonymous public request link
  LAB_LOYALTY: 'lab_loyalty',           // tiered loyalty discounts

  // Standard+
  LAB_PHASES: 'lab_phases',             // manufacturing phase tracking
  LAB_CHAT: 'lab_chat',                 // per-order chat
  LAB_INTERNAL_NOTES: 'lab_internal_notes',
  LAB_TAGS: 'lab_tags',
  LAB_MULTILAB: 'lab_multilab',         // multi-lab assignment
  LAB_CONFORMITY_DOCS: 'lab_conformity_docs',
  LAB_CONSENT_ESIGN: 'lab_consent_esign',
  LAB_MATERIALS_LOT: 'lab_materials_lot',
  LAB_SHIPMENTS: 'lab_shipments',
  LAB_PAYMENT_LINKS: 'lab_payment_links',
  LAB_STATS_PANEL: 'lab_stats_panel',

  // Premium-only
  LAB_EINVOICE: 'lab_einvoice',         // PH BIR e-invoice integration
  LAB_TREATMENT_PLAN: 'lab_treatment_plan',
  LAB_3D_VIEWER: 'lab_3d_viewer',       // OnyxCeph/3Shape
  LAB_AI_ASSIST: 'lab_ai_assist',       // GPT-4 / Bedrock
  LAB_MACHINE_CONTROL: 'lab_machine_control',
  LAB_DISPUTE_MANAGER: 'lab_dispute_manager',
  LAB_CUSTOM_DOMAIN: 'lab_custom_domain', // on-demand
  LAB_DEDICATED_SERVER: 'lab_dedicated_server', // on-demand
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

// ─────────────────────────────────────────────────────────────────
// Lab plan mapping
// ─────────────────────────────────────────────────────────────────

const LAB_BASIC_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  Features.LAB_CATALOG,
  Features.LAB_DYNAMIC_FORMS,
  Features.LAB_ORDERS,
  Features.LAB_FILE_UPLOADS,
  Features.LAB_CALENDAR,
  Features.LAB_PUBLIC_REQUEST,
  Features.LAB_LOYALTY,
]);

const LAB_STANDARD_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...LAB_BASIC_FEATURES,
  Features.LAB_PHASES,
  Features.LAB_CHAT,
  Features.LAB_INTERNAL_NOTES,
  Features.LAB_TAGS,
  Features.LAB_MULTILAB,
  Features.LAB_CONFORMITY_DOCS,
  Features.LAB_CONSENT_ESIGN,
  Features.LAB_MATERIALS_LOT,
  Features.LAB_SHIPMENTS,
  Features.LAB_PAYMENT_LINKS,
  Features.LAB_STATS_PANEL,
]);

const LAB_PREMIUM_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...LAB_STANDARD_FEATURES,
  Features.LAB_EINVOICE,
  Features.LAB_TREATMENT_PLAN,
  Features.LAB_3D_VIEWER,
  Features.LAB_AI_ASSIST,
  Features.LAB_MACHINE_CONTROL,
  Features.LAB_DISPUTE_MANAGER,
  Features.LAB_CUSTOM_DOMAIN,
  Features.LAB_DEDICATED_SERVER,
]);

export const LAB_PLAN_FEATURES: Record<LabPlan, ReadonlySet<Feature>> = {
  LAB_BASIC: LAB_BASIC_FEATURES,
  LAB_STANDARD: LAB_STANDARD_FEATURES,
  LAB_PREMIUM: LAB_PREMIUM_FEATURES,
};

export function labPlanHasFeature(plan: LabPlan, feature: Feature): boolean {
  return LAB_PLAN_FEATURES[plan]?.has(feature) ?? false;
}

// Per-plan caps for things billed by quantity (orders/month, users, GB).
// `null` means "unlimited" — UI should render as "Unlimited".
export interface LabPlanLimits {
  ordersPerMonth: number | null;
  usersPerLab: number | null;
  cloudStorageGb: number | null;
}

export const LAB_PLAN_LIMITS: Record<LabPlan, LabPlanLimits> = {
  LAB_BASIC:    { ordersPerMonth: 500,  usersPerLab: 200,  cloudStorageGb: 5 },
  LAB_STANDARD: { ordersPerMonth: 1000, usersPerLab: null, cloudStorageGb: 15 },
  LAB_PREMIUM:  { ordersPerMonth: null, usersPerLab: null, cloudStorageGb: null },
};

export function labPlanLimits(plan: LabPlan): LabPlanLimits {
  return LAB_PLAN_LIMITS[plan];
}

export interface LabPlanMeta {
  id: LabPlan;
  label: string;
  tagline: string;
  features: Feature[];
  limits: LabPlanLimits;
  /** Monthly price in minor units (centavos). null = "Talk to us / custom". */
  priceMonthly: number | null;
  currency: string;
  highlight?: boolean;
  cta?: string;
}

export const LAB_PLAN_META: Record<LabPlan, LabPlanMeta> = {
  LAB_BASIC: {
    id: 'LAB_BASIC',
    label: 'Basic',
    tagline: 'Solo labs and small teams getting started with digital ordering.',
    features: [...LAB_BASIC_FEATURES],
    limits: LAB_PLAN_LIMITS.LAB_BASIC,
    priceMonthly: 107900, // ₱1,079 / month
    currency: 'PHP',
    cta: 'Try it for free',
  },
  LAB_STANDARD: {
    id: 'LAB_STANDARD',
    label: 'Standard',
    tagline: 'Growing labs that need workflow phases, chat, and materials traceability.',
    features: [...LAB_STANDARD_FEATURES],
    limits: LAB_PLAN_LIMITS.LAB_STANDARD,
    priceMonthly: 165500, // ₱1,655 / month
    currency: 'PHP',
    highlight: true,
    cta: 'Try it for free',
  },
  LAB_PREMIUM: {
    id: 'LAB_PREMIUM',
    label: 'Premium',
    tagline: 'Multi-lab groups with treatment plans, 3D viewers, AI assist, and custom infra.',
    features: [...LAB_PREMIUM_FEATURES],
    limits: LAB_PLAN_LIMITS.LAB_PREMIUM,
    priceMonthly: 359900, // ₱3,599 / month
    currency: 'PHP',
    cta: 'Try it for free',
  },
};

/** Format the price field on either a clinic or lab plan meta. */
export function formatLabPlanPrice(meta: LabPlanMeta): string {
  if (meta.priceMonthly === null) return 'Custom';
  const formatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: meta.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(meta.priceMonthly / 100);
}

export const ALL_LAB_PLANS: LabPlan[] = ['LAB_BASIC', 'LAB_STANDARD', 'LAB_PREMIUM'];
