// Direct fetcher for the platform admin API. We don't go through the
// generated @org/api-client because that pulls the tenant-scoped session;
// the platform admin runs against a separate JWT audience.
//
// This file is a small, focused surface — when openapi.json is regenerated
// after wiring the platform module, you can migrate to the typed client.

import { loadPlatformSession, clearPlatformSession } from '../session';

const API_BASE =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000';

export class PlatformApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json');
  }
  if (init.auth !== false) {
    const session = loadPlatformSession();
    if (session?.accessToken) {
      headers.set('authorization', `Bearer ${session.accessToken}`);
    }
  }
  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401) clearPlatformSession();
    const fromBody =
      body && typeof body === 'object'
        ? (body as { message?: string }).message
        : undefined;
    const message = fromBody ?? `request failed: ${res.status}`;
    throw new PlatformApiError(res.status, body, message);
  }
  return body as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
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
  return call<PlatformLoginResponse>('/platform/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: false,
  });
}

// ── Tenants ──────────────────────────────────────────

export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
export type TenantPlan = 'STARTER' | 'PRO' | 'PREMIUM';

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: TenantStatus;
  plan: TenantPlan;
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
  planMeta: {
    id: TenantPlan;
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
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return call<ListTenantsResponse>(`/platform/tenants${qs ? `?${qs}` : ''}`);
}

export function getTenant(id: string) {
  return call<TenantDetail>(`/platform/tenants/${id}`);
}

export interface UpdateTenantInput {
  plan?: TenantPlan;
  status?: TenantStatus;
  trialEndsAt?: string | null;
  name?: string;
}

export function updateTenant(id: string, input: UpdateTenantInput) {
  return call<TenantSummary>(`/platform/tenants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
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
  return call<TenantSummary>('/platform/tenants', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
  return call<PlanCatalog>('/platform/tenants/catalog');
}
