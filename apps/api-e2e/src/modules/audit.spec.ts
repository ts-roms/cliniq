/**
 * /api/audit — read the audit log. AUDIT_READ is OWNER/ADMIN only.
 *
 * The audit interceptor logs every mutating action automatically, so we
 * trigger a few writes and then read them back.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e audit module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can list audit entries (paginated)', async () => {
      const { client } = await env.makeTenant();

      // Trigger a mutating action so there's at least one row.
      await client.axios.post('/api/patients', {
        mrn: 'AUDIT-001',
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
      });

      const res = await client.axios.get('/api/audit');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.items.length).toBeGreaterThan(0);
      // Pagination envelope.
      expect(res.data).toMatchObject({
        total: expect.any(Number),
        limit: expect.any(Number),
      });
    });

    it('audit list can be filtered by action prefix', async () => {
      const { client } = await env.makeTenant();
      await client.axios.post('/api/patients', {
        mrn: 'AUDIT-FLT',
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
      });

      const res = await client.axios.get('/api/audit?action=patient');
      expect(res.status).toBe(200);
      expect(
        res.data.items.every((it: { action: string }) => it.action.startsWith('patient')),
      ).toBe(true);
    });
  });

  describe('RBAC denial', () => {
    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s cannot read audit log',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);
        const res = await user.client.axios.get('/api/audit');
        expect(res.status).toBe(403);
      },
    );
  });

  describe('multi-tenant isolation', () => {
    it('Tenant B audit list does not contain Tenant A actions', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      await a.client.axios.post('/api/patients', {
        mrn: 'AUDIT-A',
        firstName: 'A',
        lastName: 'A',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
      });

      const listB = await b.client.axios.get('/api/audit');
      expect(listB.status).toBe(200);
      // Even if A's row exists in the table, B's RLS-scoped query won't see it.
      // We only assert that nothing in B's list references A's tenant.
      for (const item of listB.data.items as Array<{ tenantId: string }>) {
        expect(item.tenantId).toBe(b.tenant.id);
      }
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/audit');
      expect(res.status).toBe(401);
    });
  });
});
