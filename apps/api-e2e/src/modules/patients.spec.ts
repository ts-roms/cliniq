/**
 * /api/patients — CRUD, RBAC, RLS.
 *
 * Covers (per Phase 1 plan):
 *  - Happy path read/write for every role that has PATIENT_READ/WRITE.
 *  - 403 from a role that lacks the capability (PATIENT for write).
 *  - 404/empty list for a sibling tenant (RLS).
 *  - Anonymous → 401 (no token, no cookie).
 */
import { bootEnv, type E2EEnv } from '../support/harness';

const PATIENT_FIXTURE = (mrn: string) => ({
  mrn,
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  dateOfBirth: '1990-06-15',
  sex: 'MALE' as const,
  email: `${mrn.toLowerCase()}@e2e.local`,
});

describe('@org/api-e2e patients module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path × role matrix', () => {
    it('OWNER can create, read, list, update, soft-delete', async () => {
      const { tenant, client } = await env.makeTenant();

      const created = await client.axios.post('/api/patients', PATIENT_FIXTURE('OWNER-001'));
      expect(created.status).toBe(201);
      expect(created.data.id).toBeTruthy();
      const id = created.data.id as string;

      const got = await client.axios.get(`/api/patients/${id}`);
      expect(got.status).toBe(200);
      expect(got.data.firstName).toBe('Juan');

      const list = await client.axios.get('/api/patients');
      expect(list.status).toBe(200);
      expect(list.data.items.some((p: { id: string }) => p.id === id)).toBe(true);

      const patched = await client.axios.patch(`/api/patients/${id}`, {
        firstName: 'Pedro',
      });
      expect(patched.status).toBe(200);
      expect(patched.data.firstName).toBe('Pedro');

      const deleted = await client.axios.delete(`/api/patients/${id}`);
      expect([200, 204]).toContain(deleted.status);

      void tenant;
    });

    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s can create + list patients',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);

        const created = await user.client.axios.post(
          '/api/patients',
          PATIENT_FIXTURE(`${role}-001`),
        );
        expect(created.status).toBe(201);

        const list = await user.client.axios.get('/api/patients');
        expect(list.status).toBe(200);
        expect(list.data.items.length).toBeGreaterThanOrEqual(1);
      },
    );
  });

  describe('RBAC denial', () => {
    it('PATIENT cannot create patients on /api/patients (403)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post('/api/patients', PATIENT_FIXTURE('PAT-001'));
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot see Tenant A patients via GET /api/patients/:id (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const created = await a.client.axios.post('/api/patients', PATIENT_FIXTURE('RLS-001'));
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      const cross = await b.client.axios.get(`/api/patients/${id}`);
      expect(cross.status).toBe(404);
    });

    it('Tenant B list does not include Tenant A rows', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      await a.client.axios.post('/api/patients', PATIENT_FIXTURE('RLS-A1'));
      await a.client.axios.post('/api/patients', PATIENT_FIXTURE('RLS-A2'));

      const listB = await b.client.axios.get('/api/patients');
      expect(listB.status).toBe(200);
      expect(
        listB.data.items.some((p: { mrn: string }) =>
          p.mrn === 'RLS-A1' || p.mrn === 'RLS-A2',
        ),
      ).toBe(false);
    });
  });

  describe('authentication', () => {
    it('unauthenticated request returns 401', async () => {
      // Use the env's base URL via a fresh axios with no auth header.
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/patients');
      expect(res.status).toBe(401);
    });

    it('malformed bearer token returns 401', async () => {
      const axiosBad = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        headers: { authorization: 'Bearer not-a-real-jwt' },
        validateStatus: () => true,
      });
      const res = await axiosBad.get('/api/patients');
      expect(res.status).toBe(401);
    });
  });
});
