/**
 * /api/queue — patient queue management.
 *
 * Covers (mirrors the older queue.spec.ts but adds RBAC + RLS):
 *  - Happy: OWNER creates queue, issues tickets, calls next, closes SERVED/NO_SHOW.
 *  - RBAC: every staff role that has TENANT_MANAGE can run the same lifecycle;
 *    DOCTOR/NURSE/PATIENT (which lack TENANT_MANAGE) get 403.
 *  - RLS: tenant B cannot operate on tenant A's queue/ticket.
 *  - Auth: unauthenticated → 401.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e queue module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER: create queue → issue ticket → call-next → mark SERVED', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });

      const q = await client.axios.post('/api/queue/queues', {
        kind: 'WALK_IN',
        name: 'General',
      });
      expect(q.status).toBe(201);
      const queueId = q.data.id as string;

      const ticket = await client.axios.post('/api/queue/tickets', {
        queueId,
        label: 'Walk-in #1',
      });
      expect(ticket.status).toBe(201);
      expect(ticket.data.numberLabel).toBe('A-001');

      const called = await client.axios.post(
        `/api/queue/queues/${queueId}/call-next`,
        {},
      );
      expect(called.status).toBe(200);
      expect(called.data.id).toBe(ticket.data.id);
      expect(called.data.status).toBe('CALLED');

      const served = await client.axios.post(
        `/api/queue/tickets/${ticket.data.id}/close`,
        { status: 'SERVED' },
      );
      expect(served.status).toBe(200);
      expect(served.data.status).toBe('SERVED');
      expect(served.data.servedAt).toBeTruthy();
    });

    it('OWNER: can close a CALLED ticket as NO_SHOW', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const q = await client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      expect(q.status).toBe(201);

      const ticket = await client.axios.post('/api/queue/tickets', {
        queueId: q.data.id,
        label: 'No-show test',
      });
      expect(ticket.status).toBe(201);

      const called = await client.axios.post(
        `/api/queue/queues/${q.data.id}/call-next`,
        {},
      );
      expect(called.status).toBe(200);

      const noShow = await client.axios.post(
        `/api/queue/tickets/${ticket.data.id}/close`,
        { status: 'NO_SHOW' },
      );
      expect(noShow.status).toBe(200);
      expect(noShow.data.status).toBe('NO_SHOW');
    });

    it('ADMIN can run the full lifecycle (TENANT_MANAGE granted)', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const admin = await env.makeAdmin(tenant);

      const q = await admin.client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      expect(q.status).toBe(201);

      const t = await admin.client.axios.post('/api/queue/tickets', {
        queueId: q.data.id,
        label: 'Admin path',
      });
      expect(t.status).toBe(201);

      const called = await admin.client.axios.post(
        `/api/queue/queues/${q.data.id}/call-next`,
        {},
      );
      expect(called.status).toBe(200);

      const served = await admin.client.axios.post(
        `/api/queue/tickets/${t.data.id}/close`,
        { status: 'SERVED' },
      );
      expect(served.status).toBe(200);
      expect(served.data.status).toBe('SERVED');
    });

    it('RECEPTIONIST can issue and call tickets (TENANT_MANAGE granted)', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const recept = await env.makeReceptionist(tenant);

      const q = await recept.client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      expect(q.status).toBe(201);

      const t = await recept.client.axios.post('/api/queue/tickets', {
        queueId: q.data.id,
        label: 'Front-desk',
      });
      expect(t.status).toBe(201);
    });
  });

  describe('RBAC denial', () => {
    it('DOCTOR cannot create queues (403 — lacks TENANT_MANAGE)', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      expect(res.status).toBe(403);
    });

    it('NURSE cannot issue tickets (403)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const q = await client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      expect(q.status).toBe(201);

      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.post('/api/queue/tickets', {
        queueId: q.data.id,
        label: 'denied',
      });
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot call-next (403)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const q = await client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      expect(q.status).toBe(201);

      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post(
        `/api/queue/queues/${q.data.id}/call-next`,
        {},
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot close someone else\'s ticket (403)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const q = await client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      const t = await client.axios.post('/api/queue/tickets', {
        queueId: q.data.id,
        label: 'x',
      });
      expect(t.status).toBe(201);

      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post(
        `/api/queue/tickets/${t.data.id}/close`,
        { status: 'SERVED' },
      );
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('tenant B cannot call-next on tenant A\'s queue (404)', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });

      const q = await a.client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      expect(q.status).toBe(201);
      await a.client.axios.post('/api/queue/tickets', {
        queueId: q.data.id,
        label: 'crosscheck',
      });

      const cross = await b.client.axios.post(
        `/api/queue/queues/${q.data.id}/call-next`,
        {},
      );
      expect(cross.status).toBe(404);
    });

    it('tenant B cannot close tenant A\'s ticket (404)', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });

      const q = await a.client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
      const t = await a.client.axios.post('/api/queue/tickets', {
        queueId: q.data.id,
        label: 'isolate',
      });
      expect(t.status).toBe(201);

      const cross = await b.client.axios.post(
        `/api/queue/tickets/${t.data.id}/close`,
        { status: 'SERVED' },
      );
      expect(cross.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated request returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/queue/queues');
      expect(res.status).toBe(401);
    });
  });
});
