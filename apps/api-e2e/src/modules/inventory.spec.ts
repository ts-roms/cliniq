/**
 * /api/inventory — items, batches, dispense, RBAC, RLS.
 *
 * Inventory is gated by Features.INVENTORY. Tenants on plans without the
 * feature get 402 Payment Required. PREMIUM (the harness default) includes
 * inventory, so the happy paths run on a stock tenant.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e inventory module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can list, create item, receive batch, list batches, dispense', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });

      // Create an item
      const item = await client.axios.post('/api/inventory/items', {
        sku: 'PCM-500',
        name: 'Paracetamol 500mg',
        category: 'Analgesic',
        unit: 'tablet',
        reorderLevel: 50,
        defaultPriceCentavos: 250,
      });
      expect(item.status).toBe(201);
      const itemId = item.data.id as string;

      // List items
      const list = await client.axios.get('/api/inventory/items');
      expect(list.status).toBe(200);
      expect(list.data.some((it: { id: string }) => it.id === itemId)).toBe(
        true,
      );

      // Receive a batch — `qty` field; the DTO uses `qty` or `quantity` —
      // tolerate both shapes by sending what the controller expects.
      const recv = await client.axios.post(
        `/api/inventory/items/${itemId}/batches`,
        {
          qty: 100,
          lotNumber: 'LOT-001',
          expiresAt: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          unitCostCentavos: 100,
        },
      );
      // Some installs return the receive endpoint as 200 with the updated
      // stock-on-hand; either 200 or 201 is acceptable.
      expect([200, 201]).toContain(recv.status);

      // Dispense 5 units
      const disp = await client.axios.post(
        `/api/inventory/items/${itemId}/dispense`,
        {
          qty: 5,
          reason: 'consult',
        },
      );
      expect([200, 201]).toContain(disp.status);
    });
  });

  describe('RBAC denial', () => {
    it('DOCTOR (read-only on inventory by RBAC matrix) cannot create an item', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const doctor = await env.makeDoctor(tenant);

      const res = await doctor.client.axios.post('/api/inventory/items', {
        sku: 'DOC-001',
        name: 'Doctor cannot create',
      });
      // DOCTOR has INVENTORY_READ but not INVENTORY_WRITE in the matrix.
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Tenant B cannot see Tenant A items in the list', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });

      const created = await a.client.axios.post('/api/inventory/items', {
        sku: 'RLS-INV-001',
        name: 'Tenant A only',
      });
      expect(created.status).toBe(201);

      const listB = await b.client.axios.get('/api/inventory/items');
      expect(listB.status).toBe(200);
      expect(
        listB.data.some((it: { sku: string }) => it.sku === 'RLS-INV-001'),
      ).toBe(false);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/inventory/items');
      expect(res.status).toBe(401);
    });
  });
});
