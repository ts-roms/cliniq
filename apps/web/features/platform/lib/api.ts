// Platform admin API surface — now backed by the generated `@org/api-client`
// typed SDK, routed through a dedicated `platformClient` (see ./platform-client)
// so 401 handling redirects to `/platform/login` and refreshes against the
// platform auth endpoint, NOT the tenant ones.
//
// Public exports here are frozen: the rest of the platform feature
// (hooks/components) imports these and the existing signatures must hold.

import {
  platformAuthControllerLogin,
  platformTenantsControllerCatalog,
  platformTenantsControllerCreate,
  platformTenantsControllerFindOne,
  platformTenantsControllerList,
  platformTenantsControllerUpdate,
} from '@org/api-client';
import { clearPlatformSession } from '../session';
import { platformClient } from './platform-client';

export class PlatformApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

// Translates the SDK's `{ data, error, response }` shape into the historical
// "return data, throw PlatformApiError on non-2xx" contract that this
// module's consumers were built around.
async function unwrap<T>(
  promise: Promise<{ data?: unknown; error?: unknown; response?: Response }>,
): Promise<T> {
  const result = await promise;
  // No response = network/transport failure (fetch threw, DNS, CORS preflight,
  // etc.). Surface as a 0-status PlatformApiError so callers can branch on it
  // like any other failure.
  if (!result.response) {
    throw new PlatformApiError(
      0,
      result.error ?? null,
      'request failed: no response',
    );
  }
  if (result.response.ok) {
    return (result.data ?? null) as T;
  }
  const status = result.response.status;
  if (status === 401) clearPlatformSession();
  const body = (result.error ?? result.data) as unknown;
  const fromBody =
    body && typeof body === 'object'
      ? (body as { message?: string }).message
      : undefined;
  const message = fromBody ?? `request failed: ${status}`;
  throw new PlatformApiError(status, body, message);
}

// ── Auth ─────────────────────────────────────────────

export interface PlatformLoginInput {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface PlatformLoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
  admin: { id: string; email: string };
}

export function platformLogin(input: PlatformLoginInput) {
  return unwrap<PlatformLoginResponse>(
    platformAuthControllerLogin({
      client: platformClient,
      body: input as never,
    }),
  );
}

// ── Tenants ──────────────────────────────────────────

export type TenantStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED';
export type TenantPlan = 'STARTER' | 'PRO' | 'PREMIUM';
export type TenantLabPlan = 'LAB_BASIC' | 'LAB_STANDARD' | 'LAB_PREMIUM';
export type TenantKind = 'CLINIC' | 'LAB';

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: TenantStatus;
  kind: TenantKind;
  /** CLINIC tenants; null for a LAB. */
  plan: TenantPlan | null;
  /** LAB tenants; null for a CLINIC. */
  labPlan: TenantLabPlan | null;
  country: string;
  timezone: string;
  currency: string;
  trialEndsAt: string | null;
  createdAt: string;
  userCount: number;
  locationCount: number;
  patientCount: number;
}

export interface TenantDetail extends TenantSummary {
  planMeta: null | {
    id: TenantPlan | TenantLabPlan;
    label: string;
    tagline: string;
    features: string[];
    maxLocations: number;
  };
}

export interface ListTenantsResponse {
  items: TenantSummary[];
  nextCursor: string | null;
}

export interface ListTenantsQuery {
  search?: string;
  status?: TenantStatus;
  plan?: TenantPlan;
  cursor?: string;
  limit?: number;
}

export function listTenants(query: ListTenantsQuery = {}) {
  // Drop undefined/empty entries so they don't serialize as `key=undefined`.
  const cleaned: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') cleaned[k] = v as string | number;
  }
  return unwrap<ListTenantsResponse>(
    platformTenantsControllerList({
      client: platformClient,
      query: cleaned as never,
    }),
  );
}

export function getTenant(id: string) {
  return unwrap<TenantDetail>(
    platformTenantsControllerFindOne({
      client: platformClient,
      path: { id },
    }),
  );
}

export interface UpdateTenantInput {
  plan?: TenantPlan;
  labPlan?: TenantLabPlan;
  status?: TenantStatus;
  trialEndsAt?: string | null;
  name?: string;
}

export function updateTenant(id: string, input: UpdateTenantInput) {
  return unwrap<TenantSummary>(
    platformTenantsControllerUpdate({
      client: platformClient,
      path: { id },
      body: input as never,
    }),
  );
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  plan?: TenantPlan;
  ownerEmail?: string;
  ownerName?: string;
  ownerPassword?: string;
}

export function createTenant(input: CreateTenantInput) {
  return unwrap<TenantSummary>(
    platformTenantsControllerCreate({
      client: platformClient,
      body: input as never,
    }),
  );
}

export interface PlanCatalog {
  plans: Array<{
    id: TenantPlan;
    label: string;
    tagline: string;
    features: string[];
    maxLocations: number;
  }>;
}

export function getPlanCatalog() {
  return unwrap<PlanCatalog>(
    platformTenantsControllerCatalog({ client: platformClient }),
  );
}
