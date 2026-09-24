/**
 * The patient portal must not show a result nobody has released.
 *
 * Regression test for a gap opened by the verification chain
 * (`20260924220000_lis_result_verification`). Before it, every lab value was
 * by definition reported: `recordResult` wrote the value and the order went
 * to REPORTED in the same call. The chain introduced PRELIMINARY — "a value
 * exists but nobody has stood behind it" — and `GET /api/me/records` was not
 * taught about it, so it kept returning `labOrder.items` unfiltered.
 *
 * The effect was backwards: a clinic that turned verification ON, which is
 * the safety-conscious choice, would send technologist-entered values
 * straight to the patient. A clinic that left it off was unaffected.
 *
 * The contract asserted here:
 *   - an unreleased result reaches the portal with its VALUE suppressed,
 *     not the row hidden — a patient should see that the test is pending
 *   - releasing it makes the value visible
 *   - a correction stays visible, because it is released
 *   - staff still see the unreleased value, which is the bench worklist
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

describe('portal: unreleased lab results', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  /** Turn the verification chain on for this tenant. */
  async function requireVerification(client: E2EClient) {
    const res = await client.axios.patch('/api/tenants/me/settings', {
      labVerification: { required: true },
    });
    expect(res.status).toBe(200);
  }

  /** An order on the portal patient's own record, with one item. */
  async function orderFor(client: E2EClient, patientId: string) {
    const order = await client.axios.post('/api/lab-orders', {
      patientId,
      items: [{ testName: 'Potassium', testCode: 'K', resultUnit: 'mmol/L' }],
    });
    expect(order.status).toBe(201);
    return { order: order.data, item: order.data.items[0] };
  }

  /** The portal's view of one order item. */
  async function portalItem(patient: { client: E2EClient }, itemId: string) {
    const res = await patient.client.axios.get('/api/me/records');
    expect(res.status).toBe(200);
    const items = (res.data.labOrders ?? []).flatMap(
      (o: { items: Array<Record<string, unknown>> }) => o.items ?? [],
    );
    return items.find((i: { id: string }) => i.id === itemId);
  }

  it('suppresses the value of a PRELIMINARY result', async () => {
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    await requireVerification(client);
    const patient = await env.makePatient(tenant);
    const { order, item } = await orderFor(client, patient.patientId);

    const entered = await client.axios.patch(
      `/api/lab-orders/${order.id}/items/${item.id}`,
      { resultValue: '6.8' },
    );
    expect(entered.status).toBe(200);
    expect(entered.data.resultStatus).toBe('PRELIMINARY');

    const shown = await portalItem(patient, item.id);
    expect(shown).toBeDefined();
    // The row is present — a patient should see the test is pending …
    expect(shown.testName).toBe('Potassium');
    expect(shown.resultStatus).toBe('PRELIMINARY');
    // … but the value nobody has released is not theirs to read yet.
    expect(shown.resultValue).toBeNull();
    expect(shown.abnormalFlag).toBeNull();
  });

  it('shows the value once it is released', async () => {
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    await requireVerification(client);
    const patient = await env.makePatient(tenant);
    const { order, item } = await orderFor(client, patient.patientId);

    await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
      resultValue: '4.1',
    });
    const released = await client.axios.patch(
      `/api/lab-orders/${order.id}/items/${item.id}/verify`,
      {},
    );
    expect(released.status).toBe(200);

    const shown = await portalItem(patient, item.id);
    expect(shown.resultStatus).toBe('FINAL');
    expect(shown.resultValue).toBe('4.1');
  });

  it('shows a corrected result, because a correction is released', async () => {
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patient = await env.makePatient(tenant);
    const { order, item } = await orderFor(client, patient.patientId);

    // Verification off: entry releases immediately.
    await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
      resultValue: '6.8',
    });
    const corrected = await client.axios.post(
      `/api/lab-orders/${order.id}/items/${item.id}/amend`,
      { resultValue: '4.2', reason: 'transcribed from the wrong tube' },
    );
    expect(corrected.status).toBe(200);

    const shown = await portalItem(patient, item.id);
    expect(shown.resultStatus).toBe('CORRECTED');
    expect(shown.resultValue).toBe('4.2');
  });

  it('is unaffected when the clinic has not turned verification on', async () => {
    // The default path must keep working exactly as before: entry releases,
    // and the patient sees the value.
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patient = await env.makePatient(tenant);
    const { order, item } = await orderFor(client, patient.patientId);

    await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
      resultValue: '4.1',
    });

    const shown = await portalItem(patient, item.id);
    expect(shown.resultStatus).toBe('FINAL');
    expect(shown.resultValue).toBe('4.1');
  });

  it('still shows staff the unreleased value — that is the bench worklist', async () => {
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    await requireVerification(client);
    const patient = await env.makePatient(tenant);
    const { order, item } = await orderFor(client, patient.patientId);

    await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
      resultValue: '6.8',
    });

    const staffView = await client.axios.get(`/api/lab-orders/${order.id}`);
    expect(staffView.status).toBe(200);
    const staffItem = staffView.data.items.find(
      (i: { id: string }) => i.id === item.id,
    );
    expect(staffItem.resultStatus).toBe('PRELIMINARY');
    // Suppression is a portal concern, not a database one.
    expect(staffItem.resultValue).toBe('6.8');
  });
});
