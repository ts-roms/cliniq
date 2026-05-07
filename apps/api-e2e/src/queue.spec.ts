/**
 * Queue end-to-end happy path. Walks through the full life of a ticket:
 *   create queue → issue → call-next → close as SERVED.
 */
import { bootEnv, type E2EEnv } from './support/harness';

let env: E2EEnv;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Queue happy path', () => {
  it('issues, calls, and serves a ticket', async () => {
    const { client } = await env.makeTenant({ plan: 'PRO' });

    // 1. Create a walk-in queue.
    const q = await client.axios.post('/api/queue/queues', {
      kind: 'WALK_IN',
      name: 'General',
    });
    expect(q.status).toBe(201);
    expect(q.data.numberPrefix).toBe('A');

    // 2. Issue two tickets, second should auto-number A-002.
    const t1 = await client.axios.post('/api/queue/tickets', {
      queueId: q.data.id,
      label: 'Patient 1',
    });
    expect(t1.status).toBe(201);
    expect(t1.data.numberLabel).toBe('A-001');

    const t2 = await client.axios.post('/api/queue/tickets', {
      queueId: q.data.id,
      label: 'Patient 2',
    });
    expect(t2.status).toBe(201);
    expect(t2.data.numberLabel).toBe('A-002');

    // 3. Call next → t1 (FIFO with equal priority).
    const called = await client.axios.post(
      `/api/queue/queues/${q.data.id}/call-next`,
      {},
    );
    expect(called.status).toBe(200);
    expect(called.data.id).toBe(t1.data.id);
    expect(called.data.status).toBe('CALLED');
    expect(called.data.calledAt).toBeTruthy();

    // 4. Close as SERVED.
    const served = await client.axios.post(`/api/queue/tickets/${t1.data.id}/close`, {
      status: 'SERVED',
    });
    expect(served.status).toBe(200);
    expect(served.data.status).toBe('SERVED');
    expect(served.data.servedAt).toBeTruthy();
  });

  it('priority tickets jump the line', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });

    // Create both a walk-in and a priority queue (different kind, so the
    // unique (tenant, location, kind) constraint is satisfied).
    const walkIn = await client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
    expect(walkIn.status).toBe(201);

    // Issue normal walk-in tickets first.
    const a = await client.axios.post('/api/queue/tickets', {
      queueId: walkIn.data.id,
      label: 'A',
    });
    const b = await client.axios.post('/api/queue/tickets', {
      queueId: walkIn.data.id,
      label: 'B',
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    // Issue a priority ticket on the same walk-in queue (priority>0
    // bumps it). The dto allows overriding priority on any queue.
    const senior = await client.axios.post('/api/queue/tickets', {
      queueId: walkIn.data.id,
      label: 'Senior',
      priority: 100,
    });
    expect(senior.status).toBe(201);

    // call-next should pop the priority ticket first.
    const called = await client.axios.post(
      `/api/queue/queues/${walkIn.data.id}/call-next`,
      {},
    );
    expect(called.status).toBe(200);
    expect(called.data.id).toBe(senior.data.id);
  });

  it('returns 404 when calling next on an empty queue', async () => {
    const { client } = await env.makeTenant({ plan: 'PRO' });
    const q = await client.axios.post('/api/queue/queues', { kind: 'WALK_IN' });
    expect(q.status).toBe(201);

    const called = await client.axios.post(
      `/api/queue/queues/${q.data.id}/call-next`,
      {},
    );
    expect(called.status).toBe(404);
  });
});
