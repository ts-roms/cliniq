/**
 * Shared e2e harness. Spins up tenants + users via the public API, returns
 * an authenticated client per tenant. The harness intentionally does not
 * touch the database directly — it exercises the same surface area a
 * customer would, so a passing test suite is a stronger signal than unit
 * tests (which mock the boundary that's most likely to drift).
 *
 * Usage:
 *   const env = await bootEnv();
 *   const { tenant: tA, client: cA } = await env.makeTenant();
 *   const res = await cA.get('/api/patients');
 *
 * Run with the api up on http://localhost:4000:
 *   pnpm nx serve @org/api
 *   pnpm nx run @org/api-e2e:e2e
 */
import axios, { type AxiosInstance } from 'axios';

const API_URL = process.env['API_E2E_URL'] ?? 'http://localhost:4000';

export interface E2ETenant {
  id: string;
  slug: string;
  ownerEmail: string;
  ownerUserId: string;
}

export interface E2EClient {
  axios: AxiosInstance;
  accessToken: string;
  refreshToken: string;
}

export interface E2EEnv {
  baseUrl: string;
  /** Each call creates a fresh tenant + OWNER user + signed-in axios client. */
  makeTenant(opts?: { kind?: 'CLINIC' | 'LAB'; plan?: string; labPlan?: string }): Promise<{
    tenant: E2ETenant;
    client: E2EClient;
  }>;
  /** Tear down all tenants this env created. Best-effort. */
  cleanup(): Promise<void>;
}

/**
 * Boot a fresh harness. Verifies the api is reachable, returns the env.
 * Throws (with a clear hint) when the api isn't up so test runs fail
 * fast instead of timing out across every spec.
 */
export async function bootEnv(): Promise<E2EEnv> {
  try {
    await axios.get(`${API_URL}/api/health`);
  } catch (err) {
    throw new Error(
      `api unreachable at ${API_URL}. Start it with \`pnpm nx serve @org/api\` ` +
        `and re-run, or set API_E2E_URL to a deployed URL. (${(err as Error).message})`,
    );
  }
  const trackedTenantIds: string[] = [];

  const env: E2EEnv = {
    baseUrl: API_URL,

    async makeTenant({ kind = 'CLINIC', plan = 'PREMIUM', labPlan } = {}) {
      const ts = Date.now();
      const rand = Math.floor(Math.random() * 1_000_000);
      const slug = `e2e-${ts}-${rand}`.toLowerCase();
      const ownerEmail = `${slug}@e2e.local`;
      const ownerName = 'E2E Owner';
      const ownerPassword = 'TestPassword123!';

      // 1. Create the tenant (public route on TenantsController).
      const tenantRes = await axios.post(`${API_URL}/api/tenants`, {
        slug,
        name: `E2E Tenant ${rand}`,
        ownerEmail,
        ownerName,
        ownerPassword,
        kind,
        plan: kind === 'CLINIC' ? plan : undefined,
        labPlan: kind === 'LAB' ? (labPlan ?? 'LAB_PREMIUM') : undefined,
      });
      const tenantId = tenantRes.data.id as string;
      trackedTenantIds.push(tenantId);

      // 2. Login → JWT pair.
      const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
        email: ownerEmail,
        password: ownerPassword,
      });
      const accessToken = loginRes.data.accessToken as string;
      const refreshToken = loginRes.data.refreshToken as string;
      const ownerUserId = loginRes.data.user?.id as string;

      const client: E2EClient = {
        accessToken,
        refreshToken,
        axios: axios.create({
          baseURL: API_URL,
          headers: { authorization: `Bearer ${accessToken}` },
          // Don't throw on 4xx so tests can assert specific status codes.
          validateStatus: () => true,
        }),
      };

      return {
        tenant: { id: tenantId, slug, ownerEmail, ownerUserId },
        client,
      };
    },

    async cleanup() {
      // We can't delete tenants via the public API without a platform-admin
      // login. Test tenants accumulate in the dev DB; that's fine for a
      // dev / staging environment. Wipe with a one-liner against the DB
      // when needed:
      //   DELETE FROM tenants WHERE slug LIKE 'e2e-%';
      // No-op here — the goal is to never silently wipe prod data.
      void trackedTenantIds;
    },
  };
  return env;
}

/** Build a feature-flag-aware client that signs in to an arbitrary tenant.
 *  Useful for testing 402 (Payment Required) feature gates on plans. */
export async function loginAs(
  email: string,
  password: string,
): Promise<E2EClient> {
  const loginRes = await axios.post(`${API_URL}/api/auth/login`, { email, password });
  const accessToken = loginRes.data.accessToken as string;
  const refreshToken = loginRes.data.refreshToken as string;
  return {
    accessToken,
    refreshToken,
    axios: axios.create({
      baseURL: API_URL,
      headers: { authorization: `Bearer ${accessToken}` },
      validateStatus: () => true,
    }),
  };
}
