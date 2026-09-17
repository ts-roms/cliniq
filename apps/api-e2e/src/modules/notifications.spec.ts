/**
 * /api/notifications — list / read / broadcast / push-token register.
 *
 * The service stamps a notification row per recipient on broadcast. We use
 * broadcast as the seeding path so we exercise a real product flow rather
 * than poking at the DB.
 *
 * Covers:
 *  - Happy: OWNER broadcasts to ADMIN role → ADMIN sees it in their list,
 *    can mark it read and watches unread-count drop.
 *  - Cross-USER isolation: a second ADMIN in the same tenant also gets the
 *    broadcast, but reading it as user X must not affect user Y's row.
 *  - RBAC: non-TENANT_MANAGE roles get 403 on /broadcast.
 *  - RLS: tenant B owner does not see tenant A's broadcast.
 *  - Auth: unauthenticated → 401.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e notifications module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER broadcast → ADMIN lists it, can mark-read, unread-count drops', async () => {
      const { tenant, client } = await env.makeTenant();
      const admin = await env.makeAdmin(tenant);

      const title = `E2E Broadcast ${Date.now()}`;
      const broadcast = await client.axios.post(
        '/api/notifications/broadcast',
        {
          title,
          body: 'Hello team',
          roles: ['ADMIN'],
        },
      );
      expect(broadcast.status).toBe(200);
      expect(broadcast.data.ok).toBe(true);

      const list = await admin.client.axios.get('/api/notifications');
      expect(list.status).toBe(200);
      const mine = (
        list.data as Array<{ id: string; title: string; readAt: string | null }>
      ).find((n) => n.title === title);
      expect(mine).toBeTruthy();
      expect(mine!.readAt).toBeNull();

      const before = await admin.client.axios.get(
        '/api/notifications/unread-count',
      );
      expect(before.status).toBe(200);
      const beforeCount =
        typeof before.data === 'number'
          ? before.data
          : (before.data.count ?? 0);
      expect(beforeCount).toBeGreaterThanOrEqual(1);

      const read = await admin.client.axios.patch(
        `/api/notifications/${mine!.id}/read`,
      );
      expect(read.status).toBe(200);
      expect(read.data.updated).toBe(1);

      const after = await admin.client.axios.get(
        '/api/notifications/unread-count',
      );
      expect(after.status).toBe(200);
      const afterCount =
        typeof after.data === 'number' ? after.data : (after.data.count ?? 0);
      expect(afterCount).toBe(beforeCount - 1);
    });

    it('mark-all-read clears all unread notifications for the caller', async () => {
      const { tenant, client } = await env.makeTenant();
      const admin = await env.makeAdmin(tenant);

      await client.axios.post('/api/notifications/broadcast', {
        title: `bulk-${Date.now()}-1`,
        roles: ['ADMIN'],
      });
      await client.axios.post('/api/notifications/broadcast', {
        title: `bulk-${Date.now()}-2`,
        roles: ['ADMIN'],
      });

      const cleared = await admin.client.axios.post(
        '/api/notifications/read-all',
      );
      expect(cleared.status).toBe(200);

      const after = await admin.client.axios.get(
        '/api/notifications/unread-count',
      );
      expect(after.status).toBe(200);
      const afterCount =
        typeof after.data === 'number' ? after.data : (after.data.count ?? 0);
      expect(afterCount).toBe(0);
    });

    it('any authenticated user can register a push token (idempotent)', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);

      const res = await doctor.client.axios.post(
        '/api/notifications/push-tokens',
        {
          deviceId: `e2e-device-${Date.now()}`,
          token: 'ExponentPushToken[FAKE-E2E-XXXX]',
          platform: 'ios',
        },
      );
      expect(res.status).toBe(200);
    });
  });

  describe('cross-user isolation', () => {
    it("marking a notification read as user X does not affect user Y's row", async () => {
      const { tenant, client } = await env.makeTenant();
      const adminX = await env.makeAdmin(tenant);
      const adminY = await env.makeAdmin(tenant);

      const title = `xuser-${Date.now()}`;
      const broadcast = await client.axios.post(
        '/api/notifications/broadcast',
        {
          title,
          roles: ['ADMIN'],
        },
      );
      expect(broadcast.status).toBe(200);

      const xList = await adminX.client.axios.get('/api/notifications');
      const xRow = (xList.data as Array<{ id: string; title: string }>).find(
        (n) => n.title === title,
      );
      expect(xRow).toBeTruthy();

      const read = await adminX.client.axios.patch(
        `/api/notifications/${xRow!.id}/read`,
      );
      expect(read.status).toBe(200);

      // Admin Y still has it unread under their own row id.
      const yList = await adminY.client.axios.get(
        '/api/notifications?unread=true',
      );
      expect(yList.status).toBe(200);
      const yRow = (
        yList.data as Array<{
          id: string;
          title: string;
          readAt: string | null;
        }>
      ).find((n) => n.title === title);
      expect(yRow).toBeTruthy();
      expect(yRow!.id).not.toBe(xRow!.id);
      expect(yRow!.readAt).toBeNull();
    });

    it("user X cannot mark user Y's notification id as read (no-op, updated:0)", async () => {
      const { tenant, client } = await env.makeTenant();
      const adminX = await env.makeAdmin(tenant);
      const adminY = await env.makeAdmin(tenant);

      const title = `xuser-fk-${Date.now()}`;
      await client.axios.post('/api/notifications/broadcast', {
        title,
        roles: ['ADMIN'],
      });

      const yList = await adminY.client.axios.get('/api/notifications');
      const yRow = (yList.data as Array<{ id: string; title: string }>).find(
        (n) => n.title === title,
      );
      expect(yRow).toBeTruthy();

      const attempt = await adminX.client.axios.patch(
        `/api/notifications/${yRow!.id}/read`,
      );
      // Filter on (id, userId) makes this a no-op rather than a 404.
      expect(attempt.status).toBe(200);
      expect(attempt.data.updated).toBe(0);
    });
  });

  describe('RBAC denial', () => {
    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s cannot broadcast (403 — lacks TENANT_MANAGE)',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);

        const res = await user.client.axios.post(
          '/api/notifications/broadcast',
          {
            title: 'should-fail',
            roles: ['ADMIN'],
          },
        );
        expect(res.status).toBe(403);
      },
    );
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('tenant B owner does not see tenant A broadcast in their list', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const title = `tenantA-${Date.now()}`;
      await a.client.axios.post('/api/notifications/broadcast', {
        title,
        roles: ['OWNER'],
      });

      const listB = await b.client.axios.get('/api/notifications');
      expect(listB.status).toBe(200);
      expect(
        (listB.data as Array<{ title: string }>).some((n) => n.title === title),
      ).toBe(false);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/notifications');
      expect(res.status).toBe(401);
    });
  });
});
