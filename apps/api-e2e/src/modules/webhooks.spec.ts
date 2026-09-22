/**
 * /api/webhooks.
 *
 * Two unrelated things live under this prefix:
 *
 *   1. OUTBOUND — `apps/api/src/webhooks/` ships a `WebhooksService` with no
 *      controller. Other modules inject it to fan out signed appointment
 *      events to a tenant-configured endpoint. Its target/SSRF rules are unit
 *      tested in `apps/api/src/webhooks/webhook-target.spec.ts`; there is no
 *      HTTP surface to e2e here.
 *
 *   2. INBOUND — `POST /api/webhooks/paymongo` (PaymongoWebhookController).
 *      Unauthenticated by design: the HMAC signature is the auth, and it
 *      moves lab invoices to PAID. That makes it the highest-value public
 *      route in the api, so the rejection paths are asserted below.
 *
 * The happy path is deliberately absent: minting a valid signature needs
 * PAYMONGO_WEBHOOK_SECRET, and the api under test runs without it (which is
 * itself asserted — an unconfigured deploy must fail closed, never open).
 */
import axios from 'axios';
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e webhooks module', () => {
  let env: E2EEnv;
  let http: ReturnType<typeof axios.create>;

  beforeAll(async () => {
    env = await bootEnv();
    http = axios.create({
      baseURL: env.baseUrl,
      validateStatus: () => true,
      headers: { 'content-type': 'application/json' },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  const event = JSON.stringify({
    data: {
      id: 'evt_e2e',
      attributes: {
        type: 'link.payment.paid',
        data: { id: 'link_e2e', attributes: {} },
      },
    },
  });

  describe('POST /webhooks/paymongo', () => {
    it('rejects a payload with no signature header', async () => {
      const res = await http.post('/api/webhooks/paymongo', event);
      expect(res.status).toBe(401);
    });

    it('rejects a forged signature', async () => {
      const res = await http.post('/api/webhooks/paymongo', event, {
        headers: { 'paymongo-signature': 't=1,te=deadbeef,li=deadbeef' },
      });
      expect(res.status).toBe(401);
    });

    it('rejects a malformed signature header', async () => {
      const res = await http.post('/api/webhooks/paymongo', event, {
        headers: { 'paymongo-signature': 'garbage' },
      });
      expect(res.status).toBe(401);
    });

    it('rejects an empty body', async () => {
      // 400 from the body parser or 401 from the controller's raw-body
      // check — either way nothing reaches handlePaymongoEvent.
      const res = await http.post('/api/webhooks/paymongo', '', {
        headers: { 'paymongo-signature': 't=1,te=deadbeef' },
      });
      expect([400, 401]).toContain(res.status);
    });

    it('never returns 2xx without a valid signature', async () => {
      // The one invariant that matters: no unsigned/forged shape may be
      // accepted, whichever layer does the rejecting.
      const attempts = await Promise.all([
        http.post('/api/webhooks/paymongo', event),
        http.post('/api/webhooks/paymongo', event, {
          headers: { 'paymongo-signature': 't=1,te=deadbeef,li=deadbeef' },
        }),
        http.post('/api/webhooks/paymongo', event, {
          headers: {
            'paymongo-signature': `t=${Date.now()},te=${'0'.repeat(64)}`,
          },
        }),
        http.post('/api/webhooks/paymongo', '{ not json', {
          headers: { 'paymongo-signature': 't=1,te=deadbeef' },
        }),
      ]);
      for (const res of attempts) {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
