/**
 * /api/tele — telemedicine sessions + signaling.
 *
 * We stay at the HTTP boundary: assert response status + envelope shape, no
 * actual SDP exchange or ICE candidate negotiation. WebRTC media is a
 * browser concern; the server just brokers tokens and signals.
 *
 * Covers:
 *  - Happy: DOCTOR creates session, /ice returns config (public),
 *    patient joins by joinToken, both sides can poll/post signals.
 *  - RBAC: roles without TELE_HOST (RECEPTIONIST, PATIENT) cannot create.
 *  - RLS: doctor in tenant B cannot see/end tenant A's session.
 *  - Auth: provider routes require JWT; signaling /signals (patient side)
 *    requires the X-Tele-Token header.
 */
import axios from 'axios';
import { bootEnv, type E2EEnv, type E2ETenant, type E2EClient } from '../support/harness';

async function seedPatient(_t: E2ETenant, client: E2EClient, mrn: string): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Tele',
    lastName: 'Patient',
    dateOfBirth: '1990-01-01',
    sex: 'FEMALE',
    phone: '+639170000000',
  });
  if (res.status !== 201) {
    throw new Error(
      `patient seed failed: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`,
    );
  }
  return res.data.id as string;
}

describe('@org/api-e2e tele module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR creates a session and gets joinToken + joinUrl', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const patientId = await seedPatient(tenant, client, `TELE-${Date.now()}`);

      const created = await doctor.client.axios.post('/api/tele/sessions', { patientId });
      expect(created.status).toBe(201);
      expect(created.data.id).toBeTruthy();
      expect(created.data.joinToken).toBeTruthy();
      expect(typeof created.data.joinUrl).toBe('string');
      expect(created.data.status).toBe('PENDING');

      const detail = await doctor.client.axios.get(`/api/tele/sessions/${created.data.id}`);
      expect(detail.status).toBe(200);
      expect(detail.data.id).toBe(created.data.id);
    });

    it('GET /api/tele/ice is public and returns iceServers', async () => {
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.get('/api/tele/ice');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.iceServers)).toBe(true);
      expect(res.data.iceServers.length).toBeGreaterThanOrEqual(1);
    });

    it('patient joins via /api/tele/join with joinToken (public route, no JWT)', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const patientId = await seedPatient(tenant, client, `JOIN-${Date.now()}`);

      const session = await doctor.client.axios.post('/api/tele/sessions', { patientId });
      expect(session.status).toBe(201);

      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const joined = await bare.post('/api/tele/join', {
        joinToken: session.data.joinToken,
      });
      expect(joined.status).toBe(200);
      expect(joined.data.id).toBe(session.data.id);
      expect(joined.data.status).toBe('ACTIVE');
      expect(joined.data.patientToken).toBeTruthy();
      expect(joined.data.patient.firstName).toBe('Tele');
    });

    it('provider can poll signaling on their own session', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const patientId = await seedPatient(tenant, client, `SIG-${Date.now()}`);

      const session = await doctor.client.axios.post('/api/tele/sessions', { patientId });
      expect(session.status).toBe(201);

      const polled = await doctor.client.axios.get(
        `/api/tele/sessions/${session.data.id}/signals/provider`,
      );
      expect(polled.status).toBe(200);
      expect(Array.isArray(polled.data)).toBe(true);
    });

    it('patient (via X-Tele-Token) and provider (via JWT) can both post signals', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const patientId = await seedPatient(tenant, client, `XSIG-${Date.now()}`);

      const created = await doctor.client.axios.post('/api/tele/sessions', { patientId });
      expect(created.status).toBe(201);

      // Patient picks up patientToken via join (public).
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const joined = await bare.post('/api/tele/join', {
        joinToken: created.data.joinToken,
      });
      expect(joined.status).toBe(200);
      const patientToken = joined.data.patientToken as string;

      // Provider posts an SDP-shaped opaque payload.
      const provPost = await doctor.client.axios.post(
        `/api/tele/sessions/${created.data.id}/signals/provider`,
        { kind: 'OFFER', payload: { sdp: 'fake-sdp-from-provider' } },
      );
      expect(provPost.status).toBe(201);
      expect(provPost.data.seq).toBeGreaterThanOrEqual(1);

      // Patient posts back.
      const patPost = await bare.post(
        `/api/tele/sessions/${created.data.id}/signals`,
        { kind: 'ANSWER', payload: { sdp: 'fake-sdp-from-patient' } },
        { headers: { 'X-Tele-Token': patientToken } },
      );
      expect(patPost.status).toBe(201);
      expect(patPost.data.seq).toBeGreaterThanOrEqual(2);

      // Patient polls — sees at least the provider's offer.
      const polled = await bare.get(
        `/api/tele/sessions/${created.data.id}/signals?since=0`,
        { headers: { 'X-Tele-Token': patientToken } },
      );
      expect(polled.status).toBe(200);
      expect(Array.isArray(polled.data)).toBe(true);
      expect(polled.data.length).toBeGreaterThanOrEqual(2);
    });

    it('DOCTOR ends a session — status flips to ENDED', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const patientId = await seedPatient(tenant, client, `END-${Date.now()}`);

      const session = await doctor.client.axios.post('/api/tele/sessions', { patientId });
      expect(session.status).toBe(201);

      const ended = await doctor.client.axios.post(
        `/api/tele/sessions/${session.data.id}/end`,
        {},
      );
      expect(ended.status).toBe(200);
      expect(ended.data.status).toBe('ENDED');
    });
  });

  describe('RBAC denial', () => {
    it('RECEPTIONIST cannot create a tele session (403 — lacks TELE_HOST)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(tenant, client, `RBAC-${Date.now()}`);

      const recept = await env.makeReceptionist(tenant);
      const res = await recept.client.axios.post('/api/tele/sessions', { patientId });
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot create a tele session (403)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(tenant, client, `RBAC-P-${Date.now()}`);

      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post('/api/tele/sessions', { patientId });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('tenant B doctor cannot view tenant A\'s session (403 or 404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const doctorA = await env.makeDoctor(a.tenant);
      const patientId = await seedPatient(a.tenant, a.client, `ISO-${Date.now()}`);

      const session = await doctorA.client.axios.post('/api/tele/sessions', { patientId });
      expect(session.status).toBe(201);

      const doctorB = await env.makeDoctor(b.tenant);
      const cross = await doctorB.client.axios.get(
        `/api/tele/sessions/${session.data.id}`,
      );
      expect([403, 404]).toContain(cross.status);
    });

    it('tenant B doctor cannot end tenant A\'s session', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const doctorA = await env.makeDoctor(a.tenant);
      const patientId = await seedPatient(a.tenant, a.client, `ISO-END-${Date.now()}`);
      const session = await doctorA.client.axios.post('/api/tele/sessions', { patientId });
      expect(session.status).toBe(201);

      const doctorB = await env.makeDoctor(b.tenant);
      const cross = await doctorB.client.axios.post(
        `/api/tele/sessions/${session.data.id}/end`,
        {},
      );
      expect([403, 404]).toContain(cross.status);
    });
  });

  describe('authentication', () => {
    it('POST /api/tele/sessions requires a JWT (401)', async () => {
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.post('/api/tele/sessions', { patientId: 'whatever' });
      expect(res.status).toBe(401);
    });

    it('GET /signals (patient side) requires X-Tele-Token (400 missing header)', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const patientId = await seedPatient(tenant, client, `AUTH-${Date.now()}`);
      const session = await doctor.client.axios.post('/api/tele/sessions', { patientId });
      expect(session.status).toBe(201);

      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.get(`/api/tele/sessions/${session.data.id}/signals?since=0`);
      expect(res.status).toBe(400);
    });

    it('GET /signals with bogus X-Tele-Token returns 401', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const patientId = await seedPatient(tenant, client, `AUTH-BAD-${Date.now()}`);
      const session = await doctor.client.axios.post('/api/tele/sessions', { patientId });
      expect(session.status).toBe(201);

      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.get(
        `/api/tele/sessions/${session.data.id}/signals?since=0`,
        { headers: { 'X-Tele-Token': 'not-a-real-token' } },
      );
      expect(res.status).toBe(401);
    });

    it('POST /api/tele/join with bogus joinToken returns 401', async () => {
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.post('/api/tele/join', { joinToken: 'fake' });
      expect(res.status).toBe(401);
    });
  });
});
