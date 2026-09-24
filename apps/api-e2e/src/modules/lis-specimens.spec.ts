/**
 * Specimens, accession numbers and rejections.
 *
 * A lab order carried three nullable timestamps (collectedAt / receivedAt /
 * reportedAt) and nothing else — no collector, no container, no volume, no
 * rejection, and no way to tell one tube from another when an order needed
 * two. "Which tube produced this result" was unanswerable.
 *
 * The contract:
 *   - collection allocates an accession number, atomically
 *   - an order can split across tubes, and items follow the tube they are on
 *   - the state machine only moves forwards, and REJECTED is terminal
 *   - a rejection records reason, who and when, and is append-only
 *   - a re-draw is a NEW specimen, because reusing the number would conflate
 *     two draws under one identity
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

describe('@org/api-e2e LIS specimens', () => {
  let env: E2EEnv;
  let pg: PgClient;

  beforeAll(async () => {
    env = await bootEnv();
    pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
  });

  afterAll(async () => {
    await pg?.end().catch(() => undefined);
    await env.cleanup();
  });

  async function patientAndOrder(
    client: E2EClient,
    items: Array<Record<string, unknown>> = [
      { testName: 'Potassium', testCode: 'K' },
    ],
  ) {
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-SPC-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Spec',
      lastName: 'Imen',
      dateOfBirth: '1981-08-08',
      sex: 'FEMALE',
    });
    expect(patient.status).toBe(201);
    const order = await client.axios.post('/api/lab-orders', {
      patientId: patient.data.id,
      items,
    });
    expect(order.status).toBe(201);
    return { patientId: patient.data.id, order: order.data };
  }

  describe('collection and accessioning', () => {
    it('allocates an accession number and attaches the order items', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await patientAndOrder(client);

      const res = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        {
          specimenType: 'Serum',
          container: 'Red top',
          volumeMl: 5,
          collectionSite: 'Left antecubital',
        },
      );
      expect(res.status).toBe(201);
      expect(res.data.accessionNumber).toMatch(/^\d{2}-\d{4}-\d{4,}$/);
      expect(res.data.status).toBe('COLLECTED');
      expect(res.data.collectedById).toBeTruthy();
      expect(res.data.collectedAt).toBeTruthy();
      expect(res.data.items).toHaveLength(1);
    });

    it('numbers restart per tenant, so two clinics do not share a series', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const oa = await patientAndOrder(a.client);
      const ob = await patientAndOrder(b.client);

      const sa = await a.client.axios.post(
        `/api/lis/orders/${oa.order.id}/specimens`,
        {},
      );
      const sb = await b.client.axios.post(
        `/api/lis/orders/${ob.order.id}/specimens`,
        {},
      );
      // Both are the first accession of the day in their own tenant.
      expect(sa.data.accessionNumber).toBe(sb.data.accessionNumber);
      expect(sa.data.id).not.toBe(sb.data.id);
    });

    it('allocates unique numbers under concurrency', async () => {
      // The defect this replaces: count-then-format inside a transaction.
      // At READ COMMITTED two concurrent callers read the same count and
      // format the same number, and the unique index turned that into a 500.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const orders = await Promise.all(
        Array.from({ length: 8 }, () => patientAndOrder(client)),
      );

      const results = await Promise.all(
        orders.map((o) =>
          client.axios.post(`/api/lis/orders/${o.order.id}/specimens`, {}),
        ),
      );

      expect(results.every((r) => r.status === 201)).toBe(true);
      const numbers = results.map((r) => r.data.accessionNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('splits an order across tubes and keeps items with their own', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await patientAndOrder(client, [
        { testName: 'CBC', testCode: 'CBC' },
        { testName: 'Potassium', testCode: 'K' },
      ]);
      const [cbcItem, kItem] = order.items;

      const edta = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        { specimenType: 'Whole blood (EDTA)', itemIds: [cbcItem.id] },
      );
      expect(edta.status).toBe(201);
      expect(edta.data.items).toHaveLength(1);

      const serum = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        { specimenType: 'Serum', itemIds: [kItem.id] },
      );
      expect(serum.status).toBe(201);
      expect(serum.data.items).toHaveLength(1);

      expect(edta.data.accessionNumber).not.toBe(serum.data.accessionNumber);
    });

    it('refuses to collect an item already on another tube', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await patientAndOrder(client);
      await client.axios.post(`/api/lis/orders/${order.id}/specimens`, {});

      const again = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        { itemIds: [order.items[0].id] },
      );
      expect(again.status).toBe(400);
    });

    it('refuses an item that is not on the order', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const a = await patientAndOrder(client);
      const b = await patientAndOrder(client);

      const res = await client.axios.post(
        `/api/lis/orders/${a.order.id}/specimens`,
        { itemIds: [b.order.items[0].id] },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('the state machine', () => {
    async function collected(client: E2EClient) {
      const { order } = await patientAndOrder(client);
      const res = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        {},
      );
      return res.data;
    }

    it('walks collection → reception → processing → completed', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const s = await collected(client);

      const recv = await client.axios.patch(
        `/api/lis/specimens/${s.id}/receive`,
        { storageLocation: 'Fridge 2, rack B' },
      );
      expect(recv.status).toBe(200);
      expect(recv.data.status).toBe('RECEIVED');
      expect(recv.data.receivedById).toBeTruthy();
      expect(recv.data.storageLocation).toBe('Fridge 2, rack B');

      const proc = await client.axios.patch(
        `/api/lis/specimens/${s.id}/status`,
        { status: 'PROCESSING' },
      );
      expect(proc.data.status).toBe('PROCESSING');

      const done = await client.axios.patch(
        `/api/lis/specimens/${s.id}/status`,
        { status: 'COMPLETED' },
      );
      expect(done.data.status).toBe('COMPLETED');
    });

    it('refuses to skip reception', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const s = await collected(client);
      const res = await client.axios.patch(
        `/api/lis/specimens/${s.id}/status`,
        { status: 'COMPLETED' },
      );
      expect(res.status).toBe(400);
    });

    it('refuses to move a completed specimen', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const s = await collected(client);
      await client.axios.patch(`/api/lis/specimens/${s.id}/receive`, {});
      await client.axios.patch(`/api/lis/specimens/${s.id}/status`, {
        status: 'PROCESSING',
      });
      await client.axios.patch(`/api/lis/specimens/${s.id}/status`, {
        status: 'COMPLETED',
      });

      const back = await client.axios.patch(
        `/api/lis/specimens/${s.id}/status`,
        { status: 'PROCESSING' },
      );
      expect(back.status).toBe(400);
      expect(JSON.stringify(back.data)).toContain('terminal');
    });

    it('refuses receiving before collection times make sense', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const s = await collected(client);
      const res = await client.axios.patch(
        `/api/lis/specimens/${s.id}/receive`,
        { receivedAt: '2020-01-01T00:00:00.000Z' },
      );
      expect(res.status).toBe(400);
    });

    it('sends status-only moves through the right route', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const s = await collected(client);
      // RECEIVED records who and when, so it has its own route.
      const res = await client.axios.patch(
        `/api/lis/specimens/${s.id}/status`,
        { status: 'RECEIVED' },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('rejection', () => {
    async function collected(client: E2EClient) {
      const { order } = await patientAndOrder(client);
      const res = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        {},
      );
      return { specimen: res.data, order };
    }

    it('records reason, who and when, and releases the tests', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { specimen, order } = await collected(client);

      const res = await client.axios.post(
        `/api/lis/specimens/${specimen.id}/reject`,
        { reason: 'HEMOLYZED', remarks: 'Gross haemolysis on receipt' },
      );
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('REJECTED');
      expect(res.data.rejections).toHaveLength(1);
      expect(res.data.rejections[0].reason).toBe('HEMOLYZED');
      expect(res.data.rejections[0].rejectedById).toBeTruthy();

      // The tests are freed so they can be re-collected rather than stranded.
      const { rows } = await pg.query<{ specimenId: string | null }>(
        `SELECT "specimenId" FROM "lab_order_items" WHERE "orderId" = $1`,
        [order.id],
      );
      expect(rows.every((r) => r.specimenId === null)).toBe(true);
    });

    it('requires an explanation when the reason is OTHER', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { specimen } = await collected(client);
      const res = await client.axios.post(
        `/api/lis/specimens/${specimen.id}/reject`,
        { reason: 'OTHER' },
      );
      // 400, not the 500 a bare CHECK-constraint violation would produce.
      expect(res.status).toBe(400);
    });

    it('is terminal — the re-draw is a NEW specimen with its own number', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { specimen, order } = await collected(client);
      await client.axios.post(`/api/lis/specimens/${specimen.id}/reject`, {
        reason: 'CLOTTED',
      });

      // The rejected tube cannot be resurrected...
      const revive = await client.axios.patch(
        `/api/lis/specimens/${specimen.id}/receive`,
        {},
      );
      expect(revive.status).toBe(400);

      // ...but the order can be re-collected onto a fresh one.
      const redraw = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        {},
      );
      expect(redraw.status).toBe(201);
      expect(redraw.data.accessionNumber).not.toBe(specimen.accessionNumber);
      expect(redraw.data.items).toHaveLength(1);
    });

    it('cannot be edited or deleted by the application role', async () => {
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE table_name = 'specimen_rejections' AND grantee = 'cliniq_app'
          ORDER BY 1`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('SELECT');
      expect(privs).toContain('INSERT');
      // A rejection is a record of what happened to a patient's sample.
      expect(privs).not.toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });
  });

  describe('order numbering no longer races', () => {
    it('gives concurrent orders distinct slip numbers', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await client.axios.post('/api/patients', {
        mrn: `MRN-RACE-${Math.random().toString(36).slice(2, 10)}`,
        firstName: 'Race',
        lastName: 'Order',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
      });

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          client.axios.post('/api/lab-orders', {
            patientId: patient.data.id,
            items: [{ testName: 'Potassium' }],
          }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const numbers = results.map((r) => r.data.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    });
  });

  describe('isolation and authorization', () => {
    it('is tenant-scoped', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await patientAndOrder(a.client);
      await a.client.axios.post(`/api/lis/orders/${order.id}/specimens`, {});

      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const list = await b.client.axios.get('/api/lis/specimens');
      expect(list.status).toBe(200);
      expect(list.data).toEqual([]);
    });

    it('RECEPTIONIST cannot collect — it is not front-desk work', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await patientAndOrder(client);
      const receptionist = await env.makeReceptionist(tenant);

      const res = await receptionist.client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        {},
      );
      expect(res.status).toBe(403);
    });

    it('a portal patient cannot see the worklist', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.get('/api/lis/specimens');
      expect(res.status).toBe(403);
    });
  });
});
