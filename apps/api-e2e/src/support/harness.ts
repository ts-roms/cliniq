/**
 * Shared e2e harness. Spins up tenants + users via the public API, returns
 * an authenticated client per tenant. The harness intentionally does not
 * touch the database directly for the happy path — it exercises the same
 * surface area a customer would.
 *
 * For things the public API can't do (mint a Doctor without OWNER promote,
 * seed a PlatformAdmin), we reach into Postgres with the admin connection
 * (`DATABASE_URL`, NOT the RLS-bound `cliniq_app` role).
 *
 * Usage:
 *   const env = await bootEnv();
 *   const { tenant, client } = await env.makeTenant();
 *   const doctor = await env.makeDoctor(tenant);
 *   const res = await doctor.client.axios.get('/api/patients');
 *
 * Run with the api up on http://localhost:4005:
 *   pnpm nx serve @org/api
 *   pnpm nx run @org/api-e2e:e2e
 */
import axios, { type AxiosInstance } from 'axios';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';

const API_URL = process.env['API_E2E_URL'] ?? 'http://localhost:4005';
const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

export type E2ERole =
  | 'OWNER'
  | 'ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'RECEPTIONIST'
  | 'PATIENT';

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

export interface E2EUser {
  userId: string;
  email: string;
  role: E2ERole;
  tenantId: string;
  client: E2EClient;
}

export interface E2EPlatformAdmin {
  adminId: string;
  email: string;
  client: E2EClient;
}

export interface E2EEnv {
  baseUrl: string;
  /** Create a fresh tenant + OWNER user + signed-in axios client. */
  makeTenant(opts?: {
    kind?: 'CLINIC' | 'LAB';
    plan?: string;
    labPlan?: string;
  }): Promise<{ tenant: E2ETenant; client: E2EClient }>;
  /** Convenience wrappers — register a user with the given role inside `tenant`. */
  makeAdmin(tenant: E2ETenant): Promise<E2EUser>;
  makeDoctor(tenant: E2ETenant): Promise<E2EUser>;
  makeNurse(tenant: E2ETenant): Promise<E2EUser>;
  makeReceptionist(tenant: E2ETenant): Promise<E2EUser>;
  /** Register a patient via the public portal flow (creates Patient + User + TenantUser). */
  makePatient(tenant: E2ETenant): Promise<E2EUser & { patientId: string }>;
  /** Seed a platform admin (no API route exists for self-signup). */
  makePlatformAdmin(): Promise<E2EPlatformAdmin>;
  /** Tear down all rows this env created. Best-effort. */
  cleanup(): Promise<void>;
}

/**
 * Boot a fresh harness. Verifies the api is reachable, opens a long-lived
 * Postgres connection for role-promotion / platform-admin seeds, returns
 * the env.
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

  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();

  const trackedTenantIds: string[] = [];
  const trackedUserIds: string[] = [];
  const trackedPlatformAdminIds: string[] = [];

  /**
   * Add a staff member the way a clinic does: the OWNER (whose password the
   * harness minted) invites the address with the target role, and the new
   * user redeems the invite. /auth/register is invite-only, and the role
   * arrives in the JWT straight away — no SQL promotion, no re-login.
   */
  async function register(tenant: E2ETenant, role: E2ERole): Promise<E2EUser> {
    const rand = randomUUID().slice(0, 8);
    const email = `${role.toLowerCase()}-${rand}@e2e.local`;
    const password = 'TestPassword123!';

    const ownerLogin = await axios.post(
      `${API_URL}/api/auth/login`,
      { email: tenant.ownerEmail, password },
      { validateStatus: () => true, timeout: 20_000 },
    );
    if (ownerLogin.status !== 200) {
      throw new Error(
        `owner login failed: ${ownerLogin.status} ${JSON.stringify(ownerLogin.data).slice(0, 300)}`,
      );
    }
    const invite = await axios.post(
      `${API_URL}/api/members/invites`,
      { email, role },
      {
        headers: { authorization: `Bearer ${ownerLogin.data.accessToken}` },
        validateStatus: () => true,
        timeout: 20_000,
      },
    );
    if (invite.status !== 201 || !invite.data.inviteUrl) {
      throw new Error(
        `invite ${role} failed: ${invite.status} ${JSON.stringify(invite.data).slice(0, 300)}`,
      );
    }
    const inviteToken = new URL(
      invite.data.inviteUrl as string,
    ).searchParams.get('invite');

    const regRes = await axios.post(
      `${API_URL}/api/auth/register`,
      {
        email,
        name: `E2E ${role}`,
        password,
        tenantSlug: tenant.slug,
        inviteToken,
      },
      { validateStatus: () => true, timeout: 20_000 },
    );
    if (regRes.status !== 201) {
      throw new Error(
        `register ${role} failed: ${regRes.status} ${JSON.stringify(regRes.data).slice(0, 300)}`,
      );
    }
    const userId = regRes.data.user.id as string;
    const tenantId = regRes.data.user.tenantId as string;
    trackedUserIds.push(userId);

    const accessToken = regRes.data.accessToken as string;
    const refreshToken = regRes.data.refreshToken as string;
    if (role === 'DOCTOR') {
      // Prescriptions refuse to issue without a PRC license on the
      // provider. There is no staff profile endpoint to set it through
      // yet, so seed it the way the other harness fixtures are seeded.
      await pg.query(
        `UPDATE "users" SET "prcLicenseNumber" = $2, "prcLicenseExpiry" = NOW() + INTERVAL '1 year' WHERE "id" = $1`,
        [userId, `PRC-E2E-${rand}`],
      );
    }
    const client: E2EClient = {
      accessToken,
      refreshToken,
      axios: axios.create({
        baseURL: API_URL,
        headers: { authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
        timeout: 20_000,
      }),
    };
    return { userId, email, role, tenantId, client };
  }

  const env: E2EEnv = {
    baseUrl: API_URL,

    async makeTenant({ kind = 'CLINIC', plan = 'PREMIUM', labPlan } = {}) {
      const ts = Date.now();
      const rand = Math.floor(Math.random() * 1_000_000);
      const slug = `e2e-${ts}-${rand}`.toLowerCase();
      const ownerEmail = `${slug}@e2e.local`;
      const ownerName = 'E2E Owner';
      const ownerPassword = 'TestPassword123!';

      const tenantRes = await axios.post(
        `${API_URL}/api/tenants`,
        {
          slug,
          name: `E2E Tenant ${rand}`,
          ownerEmail,
          ownerName,
          ownerPassword,
          kind,
          plan: kind === 'CLINIC' ? plan : undefined,
          labPlan: kind === 'LAB' ? (labPlan ?? 'LAB_PREMIUM') : undefined,
        },
        { validateStatus: () => true, timeout: 20_000 },
      );
      if (tenantRes.status !== 201) {
        throw new Error(
          `tenant create failed: ${tenantRes.status} ${JSON.stringify(tenantRes.data).slice(0, 300)}`,
        );
      }
      const tenantId = tenantRes.data.id as string;
      trackedTenantIds.push(tenantId);

      const loginRes = await axios.post(
        `${API_URL}/api/auth/login`,
        { email: ownerEmail, password: ownerPassword },
        { validateStatus: () => true, timeout: 20_000 },
      );
      if (loginRes.status !== 200 && loginRes.status !== 201) {
        throw new Error(
          `login failed: ${loginRes.status} ${JSON.stringify(loginRes.data).slice(0, 300)}`,
        );
      }
      const accessToken = loginRes.data.accessToken as string;
      const refreshToken = loginRes.data.refreshToken as string;
      const ownerUserId = loginRes.data.user?.id as string;
      if (!accessToken) {
        throw new Error(
          `login returned 2xx but no accessToken in body: ${JSON.stringify(loginRes.data).slice(0, 300)}`,
        );
      }
      trackedUserIds.push(ownerUserId);

      const client: E2EClient = {
        accessToken,
        refreshToken,
        axios: axios.create({
          baseURL: API_URL,
          headers: { authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
          timeout: 20_000,
        }),
      };

      return {
        tenant: { id: tenantId, slug, ownerEmail, ownerUserId },
        client,
      };
    },

    makeAdmin: (tenant) => register(tenant, 'ADMIN'),
    makeDoctor: (tenant) => register(tenant, 'DOCTOR'),
    makeNurse: (tenant) => register(tenant, 'NURSE'),
    makeReceptionist: (tenant) => register(tenant, 'RECEPTIONIST'),

    async makePatient(tenant) {
      const rand = randomUUID().slice(0, 8);
      const email = `patient-${rand}@e2e.local`;
      const password = 'TestPassword123!';
      const mrn = `MRN-E2E-${rand}`;

      // Portal signup is claim-by-MRN: the clinic must already hold a patient
      // record whose email matches. Create it as the owner first.
      const ownerLogin = await axios.post(
        `${API_URL}/api/auth/login`,
        { email: tenant.ownerEmail, password },
        { validateStatus: () => true, timeout: 20_000 },
      );
      if (ownerLogin.status !== 200) {
        throw new Error(`owner login failed: ${ownerLogin.status}`);
      }
      const record = await axios.post(
        `${API_URL}/api/patients`,
        {
          mrn,
          firstName: 'E2E',
          lastName: 'Patient',
          dateOfBirth: '1990-05-05',
          sex: 'FEMALE',
          email,
        },
        {
          headers: { authorization: `Bearer ${ownerLogin.data.accessToken}` },
          validateStatus: () => true,
          timeout: 20_000,
        },
      );
      if (record.status !== 201) {
        throw new Error(
          `patient record create failed: ${record.status} ${JSON.stringify(record.data).slice(0, 300)}`,
        );
      }

      const res = await axios.post(
        `${API_URL}/api/auth/patient-register`,
        { email, password, tenantSlug: tenant.slug, mrn },
        { validateStatus: () => true, timeout: 20_000 },
      );
      if (res.status !== 201 && res.status !== 200) {
        throw new Error(
          `patient register failed: ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`,
        );
      }
      const accessToken = res.data.accessToken as string;
      const refreshToken = res.data.refreshToken as string;
      const userId = res.data.user.id as string;
      const patientId = res.data.user.patientId as string;
      trackedUserIds.push(userId);
      const client: E2EClient = {
        accessToken,
        refreshToken,
        axios: axios.create({
          baseURL: API_URL,
          headers: { authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
          timeout: 20_000,
        }),
      };
      return {
        userId,
        email,
        role: 'PATIENT',
        tenantId: tenant.id,
        patientId,
        client,
      };
    },
    async makePlatformAdmin() {
      const rand = randomUUID().slice(0, 8);
      const email = `platform-${rand}@e2e.local`;
      const password = 'TestPassword123!';
      const passwordHash = await bcrypt.hash(password, 12);
      const id = randomUUID();
      // Insert directly — there's no public route to self-register a platform
      // admin, and the seed script targets the same dev DB so it would clash.
      await pg.query(
        `INSERT INTO "platform_admins" ("id", "email", "name", "passwordHash", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [id, email, 'E2E Platform Admin', passwordHash],
      );
      trackedPlatformAdminIds.push(id);

      const loginRes = await axios.post(
        `${API_URL}/api/platform/auth/login`,
        { email, password },
        { validateStatus: () => true, timeout: 20_000 },
      );
      if (loginRes.status !== 200 && loginRes.status !== 201) {
        throw new Error(
          `platform login failed: ${loginRes.status} ${JSON.stringify(loginRes.data).slice(0, 300)}`,
        );
      }
      const accessToken = loginRes.data.accessToken as string;
      const refreshToken = loginRes.data.refreshToken as string;
      const client: E2EClient = {
        accessToken,
        refreshToken,
        axios: axios.create({
          baseURL: API_URL,
          headers: { authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
          timeout: 20_000,
        }),
      };
      return { adminId: id, email, client };
    },

    async cleanup() {
      // Best-effort. IDs are TEXT (Prisma cuid), not uuid — so cast to
      // text[]. The Tenant FK relations cascade deletes via Prisma's
      // onDelete: Cascade, so wiping the tenant tears down the test data
      // without us tracking every child row.
      try {
        if (trackedTenantIds.length > 0) {
          await pg.query(`DELETE FROM "tenants" WHERE "id" = ANY($1::text[])`, [
            trackedTenantIds,
          ]);
        }
      } catch {
        /* swallow — leftover dev data is acceptable */
      }
      try {
        if (trackedPlatformAdminIds.length > 0) {
          await pg.query(
            `DELETE FROM "platform_admins" WHERE "id" = ANY($1::text[])`,
            [trackedPlatformAdminIds],
          );
        }
      } catch {
        /* swallow */
      }
      try {
        await pg.end();
      } catch {
        /* swallow */
      }
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
  const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
    email,
    password,
  });
  const accessToken = loginRes.data.accessToken as string;
  const refreshToken = loginRes.data.refreshToken as string;
  return {
    accessToken,
    refreshToken,
    axios: axios.create({
      baseURL: API_URL,
      headers: { authorization: `Bearer ${accessToken}` },
      validateStatus: () => true,
      timeout: 20_000,
    }),
  };
}
