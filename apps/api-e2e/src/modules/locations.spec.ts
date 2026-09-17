/**
 * /api/locations — branch / location CRUD.
 *
 * Covers:
 *  - Happy: OWNER and ADMIN can create, list, update, delete.
 *  - All authenticated roles can GET /api/locations (no extra gate).
 *  - RBAC: DOCTOR/NURSE/RECEPTIONIST/PATIENT cannot write (403 — they lack
 *    TENANT_MANAGE per libs/auth/src/lib/roles.ts).
 *  - RLS: tenant B cannot see, update, or delete tenant A's locations.
 *  - Auth: unauthenticated → 401.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e locations module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can create, list, update, and delete a location', async () => {
      const { client } = await env.makeTenant();

      // The owner-onboarding flow normally seeds a primary location, but we
      // also create a non-primary one explicitly here so we can delete it
      // safely (the service forbids deleting the primary).
      const created = await client.axios.post('/api/locations', {
        name: `Branch-${Date.now()}`,
        addressLine1: '123 E2E Ave',
        city: 'Manila',
      });
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      const list = await client.axios.get('/api/locations');
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
      expect(list.data.some((l: { id: string }) => l.id === id)).toBe(true);

      const updated = await client.axios.patch(`/api/locations/${id}`, {
        name: `Branch-Renamed-${Date.now()}`,
        city: 'Quezon City',
      });
      expect(updated.status).toBe(200);
      expect(updated.data.city).toBe('Quezon City');

      // Skip delete if this happened to become primary (first location auto-
      // promotes); otherwise verify soft delete returns 204.
      if (!updated.data.isPrimary) {
        const removed = await client.axios.delete(`/api/locations/${id}`);
        expect(removed.status).toBe(204);
      }
    });

    it('ADMIN can create a location (TENANT_MANAGE granted)', async () => {
      const { tenant } = await env.makeTenant();
      const admin = await env.makeAdmin(tenant);

      const res = await admin.client.axios.post('/api/locations', {
        name: `AdminBranch-${Date.now()}`,
      });
      expect(res.status).toBe(201);
    });

    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s can list locations (read is open to all authenticated users)',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);

        const res = await user.client.axios.get('/api/locations');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
      },
    );
  });

  describe('RBAC denial', () => {
    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s cannot create a location (403 — lacks TENANT_MANAGE)',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);

        const res = await user.client.axios.post('/api/locations', {
          name: `${role}-Denied-${Date.now()}`,
        });
        expect(res.status).toBe(403);
      },
    );

    it('PATIENT cannot create a location (403)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post('/api/locations', {
        name: `PatientDenied-${Date.now()}`,
      });
      expect(res.status).toBe(403);
    });

    it('DOCTOR cannot update or delete a location (403)', async () => {
      const { tenant, client } = await env.makeTenant();
      const created = await client.axios.post('/api/locations', {
        name: `RbacUpdate-${Date.now()}`,
      });
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      const doctor = await env.makeDoctor(tenant);
      const patched = await doctor.client.axios.patch(`/api/locations/${id}`, {
        city: 'Cebu',
      });
      expect(patched.status).toBe(403);

      const removed = await doctor.client.axios.delete(`/api/locations/${id}`);
      expect(removed.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('tenant B list does not include tenant A locations', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const created = await a.client.axios.post('/api/locations', {
        name: `RLS-${Date.now()}`,
      });
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      const listB = await b.client.axios.get('/api/locations');
      expect(listB.status).toBe(200);
      expect(listB.data.some((l: { id: string }) => l.id === id)).toBe(false);
    });

    it("tenant B cannot update tenant A's location (404)", async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const created = await a.client.axios.post('/api/locations', {
        name: `RLS-Update-${Date.now()}`,
      });
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      const cross = await b.client.axios.patch(`/api/locations/${id}`, {
        city: 'Hacked',
      });
      expect(cross.status).toBe(404);
    });

    it("tenant B cannot delete tenant A's location (404)", async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const created = await a.client.axios.post('/api/locations', {
        name: `RLS-Delete-${Date.now()}`,
      });
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      const cross = await b.client.axios.delete(`/api/locations/${id}`);
      expect(cross.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/locations');
      expect(res.status).toBe(401);
    });
  });
});
