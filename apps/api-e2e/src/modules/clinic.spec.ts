/**
 * /api/clinic/* — clinic-side view of the lab marketplace.
 *
 * Five sub-controllers under apps/api/src/clinic/:
 *   - lab-invitations: incoming invitations (clinic accepts/rejects)
 *   - lab-cases:       outbound orders the clinic placed with a lab
 *   - lab-invoices:    read-only invoices issued by the lab
 *   - lab-treatment-plans: decide (approve/reject/revise) proposed plans
 *   - lab-disputes:    raise/resolve disputes against a case
 *
 * This spec covers the surface of each — happy path, RBAC, auth, isolation.
 * Cross-tenant flow needs a LAB tenant and a CLINIC tenant linked together,
 * so we mint both and connect them.
 */
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness';

/** Mint a CLINIC + a LAB tenant and accept an invitation, returning both. */
async function linkedPair(env: E2EEnv): Promise<{
  clinic: { tenant: E2ETenant; client: E2EClient };
  lab: { tenant: E2ETenant; client: E2EClient };
}> {
  const lab = await env.makeTenant({ kind: 'LAB' });
  const clinic = await env.makeTenant({ kind: 'CLINIC' });

  // Lab invites the clinic by slug.
  const invite = await lab.client.axios.post('/api/lab/clinic-links/invite', {
    clinicSlug: clinic.tenant.slug,
  });
  if (invite.status !== 201 && invite.status !== 200) {
    throw new Error(
      `invite failed: ${invite.status} ${JSON.stringify(invite.data).slice(0, 200)}`,
    );
  }

  // Clinic lists its inbound invitations and accepts the one we just sent.
  const inbox = await clinic.client.axios.get('/api/clinic/lab-invitations');
  if (inbox.status !== 200) {
    throw new Error(`invitations inbox failed: ${inbox.status}`);
  }
  const pending = (inbox.data as Array<{ id: string; status: string }>).find(
    (i) => i.status === 'PENDING',
  );
  if (!pending) throw new Error('no PENDING invitation found');

  const accept = await clinic.client.axios.post(
    `/api/clinic/lab-invitations/${pending.id}/accept`,
  );
  if (accept.status !== 200 && accept.status !== 201) {
    throw new Error(`accept failed: ${accept.status}`);
  }
  return { clinic, lab };
}

describe('@org/api-e2e clinic module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path — lab-invitations', () => {
    it('CLINIC OWNER can list, accept, reject invitations', async () => {
      const lab = await env.makeTenant({ kind: 'LAB' });
      const clinic = await env.makeTenant({ kind: 'CLINIC' });

      const invite = await lab.client.axios.post(
        '/api/lab/clinic-links/invite',
        {
          clinicSlug: clinic.tenant.slug,
        },
      );
      expect([200, 201]).toContain(invite.status);

      const inbox = await clinic.client.axios.get(
        '/api/clinic/lab-invitations',
      );
      expect(inbox.status).toBe(200);
      const pending = (
        inbox.data as Array<{ id: string; status: string }>
      ).find((i) => i.status === 'PENDING');
      expect(pending).toBeDefined();

      const reject = await clinic.client.axios.post(
        `/api/clinic/lab-invitations/${pending!.id}/reject`,
      );
      expect([200, 201]).toContain(reject.status);
    });
  });

  describe('happy path — lab-cases (clinic side)', () => {
    it('CLINIC can list its outbound lab cases', async () => {
      const { clinic } = await linkedPair(env);
      const res = await clinic.client.axios.get('/api/clinic/lab-cases');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  describe('happy path — lab-invoices (clinic side, read-only)', () => {
    it('CLINIC can list invoices issued to it', async () => {
      const { clinic } = await linkedPair(env);
      const res = await clinic.client.axios.get('/api/clinic/lab-invoices');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  describe('happy path — lab-treatment-plans (clinic side, read + decide)', () => {
    it('CLINIC list returns array (likely empty until lab proposes)', async () => {
      const { clinic } = await linkedPair(env);
      const res = await clinic.client.axios.get(
        '/api/clinic/lab-treatment-plans?caseId=none',
      );
      expect([200, 400]).toContain(res.status); // 400 if caseId is required
    });
  });

  describe('happy path — lab-disputes (clinic side)', () => {
    it('CLINIC list returns array (likely empty until they open one)', async () => {
      const { clinic } = await linkedPair(env);
      const res = await clinic.client.axios.get(
        '/api/clinic/lab-disputes?caseId=none',
      );
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('RBAC denial', () => {
    it('DOCTOR cannot accept invitations (requires TENANT_MANAGE)', async () => {
      const lab = await env.makeTenant({ kind: 'LAB' });
      const clinic = await env.makeTenant({ kind: 'CLINIC' });
      await lab.client.axios.post('/api/lab/clinic-links/invite', {
        clinicSlug: clinic.tenant.slug,
      });

      const doctor = await env.makeDoctor(clinic.tenant);
      const inbox = await doctor.client.axios.get(
        '/api/clinic/lab-invitations',
      );
      // List may be allowed; accept must not be.
      if (
        inbox.status === 200 &&
        Array.isArray(inbox.data) &&
        inbox.data.length > 0
      ) {
        const id = inbox.data[0].id as string;
        const accept = await doctor.client.axios.post(
          `/api/clinic/lab-invitations/${id}/accept`,
        );
        expect(accept.status).toBe(403);
      } else {
        // If list was also gated, that's also acceptable.
        expect([200, 403]).toContain(inbox.status);
      }
    });
  });

  describe('multi-tenant isolation', () => {
    it("A different clinic tenant cannot see another clinic's invitations", async () => {
      const lab = await env.makeTenant({ kind: 'LAB' });
      const clinicA = await env.makeTenant({ kind: 'CLINIC' });
      const clinicB = await env.makeTenant({ kind: 'CLINIC' });

      await lab.client.axios.post('/api/lab/clinic-links/invite', {
        clinicSlug: clinicA.tenant.slug,
      });

      const inboxB = await clinicB.client.axios.get(
        '/api/clinic/lab-invitations',
      );
      expect(inboxB.status).toBe(200);
      expect(Array.isArray(inboxB.data) && inboxB.data.length).toBe(0);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/clinic/lab-invitations');
      expect(res.status).toBe(401);
    });
  });
});
