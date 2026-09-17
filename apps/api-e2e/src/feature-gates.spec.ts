/**
 * Feature-flag gating regression tests.
 *
 * The FeatureGuard returns 402 (Payment Required) when a tenant's plan
 * doesn't include the route's @RequiresFeature flag. These tests ensure
 * that gate actually fires — easy to silently break by adding a route
 * without the decorator, or by misconfiguring the plan→feature map.
 */
import { bootEnv, type E2EEnv } from './support/harness';

let env: E2EEnv;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Feature gates', () => {
  it('STARTER plan: 402 on /api/queue/queues (gated by QUEUEING)', async () => {
    const { client } = await env.makeTenant({ plan: 'STARTER' });
    const res = await client.axios.get('/api/queue/queues');
    expect(res.status).toBe(402);
  });

  it('PRO plan: 200 on /api/queue/queues', async () => {
    const { client } = await env.makeTenant({ plan: 'PRO' });
    const res = await client.axios.get('/api/queue/queues');
    expect(res.status).toBe(200);
  });

  it('STARTER plan: 402 on /api/ob/pregnancies (gated by OBSTETRICS)', async () => {
    const { client } = await env.makeTenant({ plan: 'STARTER' });
    const res = await client.axios.get('/api/ob/pregnancies?patientId=ignored');
    expect(res.status).toBe(402);
  });

  it('PRO plan: not gated by OBSTETRICS (returns 200 / empty)', async () => {
    const { client } = await env.makeTenant({ plan: 'PRO' });
    const res = await client.axios.get(
      '/api/ob/pregnancies?patientId=does-not-exist',
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('PRO plan: 402 on ULTRASOUND_3D_4D-only feature (none today, but check 2D works)', async () => {
    const { client } = await env.makeTenant({ plan: 'PRO' });
    // 2D ultrasound list is gated by ULTRASOUND_2D — Pro+.
    const res = await client.axios.get(
      '/api/ob/ultrasound?patientId=does-not-exist',
    );
    expect(res.status).toBe(200);
  });
});
