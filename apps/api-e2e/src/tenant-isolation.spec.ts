/**
 * Cross-tenant isolation regression tests.
 *
 * These are the most important tests in the suite — every other module
 * test verifies happy paths, but this one specifically checks that data
 * created in tenant A is invisible to tenant B even when B tries to
 * fetch it directly. This is the kind of bug that doesn't surface in
 * dev (single-tenant flows look identical) but lands you on the front
 * page of a security blog.
 *
 * Required env: a running api with the cliniq_app DATABASE_URL (so RLS
 * is actually enforced — superuser connections silently bypass it).
 */
import { bootEnv, type E2EEnv } from './support/harness';

let env: E2EEnv;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Cross-tenant isolation', () => {
  it('Patients: tenant B cannot read tenant A\'s patient list', async () => {
    const A = await env.makeTenant();
    const B = await env.makeTenant();

    const create = await A.client.axios.post('/api/patients', {
      mrn: `MRN-${Date.now()}`,
      firstName: 'Maria',
      lastName: 'Cruz',
      dateOfBirth: '1990-01-01',
      sex: 'FEMALE',
    });
    expect(create.status).toBe(201);

    // Tenant A sees the patient.
    const listA = await A.client.axios.get('/api/patients');
    expect(listA.status).toBe(200);
    expect(listA.data.total).toBeGreaterThanOrEqual(1);

    // Tenant B does NOT.
    const listB = await B.client.axios.get('/api/patients');
    expect(listB.status).toBe(200);
    expect(listB.data.total).toBe(0);

    // Direct fetch by id from tenant B → 404 (not 200/403; we don't
    // confirm the row exists at all to a foreign tenant).
    const patientId = create.data.id as string;
    const directB = await B.client.axios.get(`/api/patients/${patientId}`);
    expect(directB.status).toBe(404);
  });

  it('Queue: tickets in tenant A invisible to tenant B', async () => {
    const A = await env.makeTenant();
    const B = await env.makeTenant();

    const queueA = await A.client.axios.post('/api/queue/queues', {
      kind: 'WALK_IN',
      name: 'Test queue',
    });
    expect(queueA.status).toBe(201);

    const ticket = await A.client.axios.post('/api/queue/tickets', {
      queueId: queueA.data.id,
      label: 'Patient X',
    });
    expect(ticket.status).toBe(201);

    // Tenant A's display feed sees the ticket.
    const feedA = await A.client.axios.get('/api/queue/display');
    expect(feedA.status).toBe(200);
    const allTicketsA = (feedA.data as Array<{ tickets: unknown[] }>).flatMap(
      (r) => r.tickets,
    );
    expect(allTicketsA.length).toBeGreaterThanOrEqual(1);

    // Tenant B's display feed sees nothing.
    const feedB = await B.client.axios.get('/api/queue/display');
    expect(feedB.status).toBe(200);
    const allTicketsB = (feedB.data as Array<{ tickets: unknown[] }>).flatMap(
      (r) => r.tickets,
    );
    expect(allTicketsB.length).toBe(0);

    // Tenant B trying to call-next on tenant A's queue → 404.
    const callB = await B.client.axios.post(
      `/api/queue/queues/${queueA.data.id}/call-next`,
      {},
    );
    expect(callB.status).toBe(404);
  });

  it('OB pregnancies: tenant B cannot read tenant A\'s', async () => {
    const A = await env.makeTenant();
    const B = await env.makeTenant();

    const patient = await A.client.axios.post('/api/patients', {
      mrn: `MRN-${Date.now()}`,
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1995-05-05',
      sex: 'FEMALE',
    });
    const patientId = patient.data.id as string;

    const preg = await A.client.axios.post('/api/ob/pregnancies', {
      patientId,
      lmp: '2026-01-01',
    });
    expect(preg.status).toBe(201);

    const listA = await A.client.axios.get(
      `/api/ob/pregnancies?patientId=${patientId}`,
    );
    expect(listA.status).toBe(200);
    expect(listA.data.length).toBeGreaterThanOrEqual(1);

    // Tenant B passing a known patient id from tenant A → empty list
    // (the patient itself is invisible; the OB query returns 0 rows).
    const listB = await B.client.axios.get(
      `/api/ob/pregnancies?patientId=${patientId}`,
    );
    expect(listB.status).toBe(200);
    expect(listB.data.length).toBe(0);
  });
});
