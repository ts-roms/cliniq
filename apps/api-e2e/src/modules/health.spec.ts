/**
 * /api/health — liveness + lab-readiness probes.
 *
 * Both endpoints are @Public — they must work without any Authorization
 * header so load balancers and deploy hooks can ping them.
 */
import axios from 'axios';
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e health module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('GET /api/health is public and returns 200', async () => {
      const bare = axios.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await bare.get('/api/health');
      expect(res.status).toBe(200);
      // status is 'ok' when DB is up, 'degraded' otherwise — both are 200.
      expect(['ok', 'degraded']).toContain(res.data.status);
      expect(res.data.checks?.db).toBeDefined();
      expect(typeof res.data.uptime).toBe('number');
      expect(typeof res.data.timestamp).toBe('string');
    });

    it('GET /api/health/lab-readiness is public and returns 200', async () => {
      const bare = axios.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await bare.get('/api/health/lab-readiness');
      expect(res.status).toBe(200);
      expect(['ready', 'not-ready']).toContain(res.data.status);
      expect(res.data.env).toBeDefined();
      expect(Array.isArray(res.data.env.required.configured)).toBe(true);
      expect(Array.isArray(res.data.env.required.missing)).toBe(true);
      expect(res.data.migrations?.latest).toBeTruthy();
    });

    it('GET /api/health works with an authenticated client too (no auth required, but tolerated)', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/health');
      expect(res.status).toBe(200);
    });
  });
});
