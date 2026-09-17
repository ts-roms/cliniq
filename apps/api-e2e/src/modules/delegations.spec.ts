/**
 * /api/delegations — DOCTOR/OWNER/ADMIN/NURSE grant authority, X-Acting-For
 * promotes the delegatee's effective role for that request.
 *
 * Covers:
 *  - Create delegation, list granted, list received-active.
 *  - X-Acting-For header lets the delegatee write where they couldn't before.
 *  - Revoke clears it — subsequent X-Acting-For → 403.
 *  - Validation: cannot delegate to self, end ≤ start → 400, end in past → 400,
 *    cross-tenant delegatee → 400.
 *  - RECEPTIONIST cannot grant a delegation (not in clinical-delegators set).
 *  - Anonymous → 401.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e delegations module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR grants delegation; delegatee shows up in received-active', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);

      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const created = await doctor.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt,
        endsAt,
        reason: 'On vacation',
      });
      expect(created.status).toBe(201);
      expect(created.data.id).toBeTruthy();
      expect(created.data.delegatorId).toBe(doctor.userId);
      expect(created.data.delegateeId).toBe(nurse.userId);

      const granted = await doctor.client.axios.get('/api/delegations/granted');
      expect(granted.status).toBe(200);
      expect(
        granted.data.some((d: { id: string }) => d.id === created.data.id),
      ).toBe(true);

      const received = await nurse.client.axios.get(
        '/api/delegations/received-active',
      );
      expect(received.status).toBe(200);
      expect(
        received.data.some((d: { id: string }) => d.id === created.data.id),
      ).toBe(true);
    });

    it('GET /api/delegations/eligible-delegatees lists staff in the same tenant', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);
      const receptionist = await env.makeReceptionist(tenant);

      const res = await doctor.client.axios.get(
        '/api/delegations/eligible-delegatees',
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      const ids = res.data.map((u: { id: string }) => u.id);
      expect(ids).toContain(nurse.userId);
      expect(ids).toContain(receptionist.userId);
      // Self never appears.
      expect(ids).not.toContain(doctor.userId);
    });

    it('X-Acting-For: nurse delegated by doctor can sign Rx-tier action on doctor’s behalf', async () => {
      // We don't test an Rx-sign endpoint directly here (covered in prescriptions
      // spec) — instead we verify the role override surfaces on /api/auth/me.
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);
      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const created = await nurse.client.axios; // (no-op — just for typing)
      void created;

      await doctor.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt,
        endsAt,
      });

      // Without X-Acting-For: nurse's role is NURSE.
      const baseline = await nurse.client.axios.get('/api/auth/me');
      expect(baseline.status).toBe(200);
      expect(baseline.data.role).toBe('NURSE');

      // With X-Acting-For: role is rewritten to DOCTOR (delegator's role).
      const acting = await nurse.client.axios.get('/api/auth/me', {
        headers: { 'x-acting-for': doctor.userId },
      });
      expect(acting.status).toBe(200);
      expect(acting.data.role).toBe('DOCTOR');
      expect(acting.data.onBehalfOfUserId).toBe(doctor.userId);
    });

    it('revoke clears the active delegation — X-Acting-For then fails 403', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);
      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const created = await doctor.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt,
        endsAt,
      });
      expect(created.status).toBe(201);

      // Confirm it works before revoke.
      const before = await nurse.client.axios.get('/api/auth/me', {
        headers: { 'x-acting-for': doctor.userId },
      });
      expect(before.status).toBe(200);
      expect(before.data.role).toBe('DOCTOR');

      const revoke = await doctor.client.axios.patch(
        `/api/delegations/${created.data.id}/revoke`,
      );
      expect(revoke.status).toBe(200);
      expect(revoke.data.status).toBe('REVOKED');

      // After revoke: header points at a delegator with no active delegation
      // → guard throws ForbiddenException.
      const after = await nurse.client.axios.get('/api/auth/me', {
        headers: { 'x-acting-for': doctor.userId },
      });
      expect(after.status).toBe(403);
    });

    it('scoped delegation grants only the listed actions (rx:sign yes, billing:write no)', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);

      // Doctor delegates ONLY rx:sign to nurse (not full proxy).
      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const grant = await doctor.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt,
        endsAt,
        scope: ['rx:sign'],
        reason:
          'Doctor stepping out for an hour, nurse can sign already-prepped Rx',
      });
      expect(grant.status).toBe(201);

      // Seed a patient under the doctor's tenant.
      const patient = await client.axios.post('/api/patients', {
        mrn: 'DELEG-SCOPE',
        firstName: 'Scope',
        lastName: 'Test',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
      });
      expect(patient.status).toBe(201);
      const patientId = patient.data.id as string;

      // In-scope: nurse acting as doctor can sign Rx (RX_SIGN ∈ scope).
      const rx = await nurse.client.axios.post(
        '/api/prescriptions',
        {
          patientId,
          items: [{ drugName: 'Paracetamol', dose: '500mg', frequency: 'BID' }],
        },
        { headers: { 'x-acting-for': doctor.userId } },
      );
      expect(rx.status).toBe(201);

      // Out-of-scope: doctor has BILLING_READ + can list invoices, but the
      // delegation only includes 'rx:sign'. Nurse acting as doctor must be
      // refused on /api/invoices because BILLING_READ is not in scope.
      const invoices = await nurse.client.axios.get('/api/invoices', {
        headers: { 'x-acting-for': doctor.userId },
      });
      expect(invoices.status).toBe(403);
      expect(String(invoices.data?.message ?? '')).toMatch(/scope/i);
    });
  });

  describe('RBAC denial', () => {
    it('RECEPTIONIST cannot create a delegation (not in clinical delegators set)', async () => {
      const { tenant } = await env.makeTenant();
      const receptionist = await env.makeReceptionist(tenant);
      const nurse = await env.makeNurse(tenant);
      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const res = await receptionist.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt,
        endsAt,
      });
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot create a delegation', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const nurse = await env.makeNurse(tenant);
      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const res = await patient.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt,
        endsAt,
      });
      expect(res.status).toBe(403);
    });

    it('non-admin non-delegator cannot revoke someone else’s delegation', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);
      const other = await env.makeNurse(tenant);
      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const created = await doctor.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt,
        endsAt,
      });
      expect(created.status).toBe(201);

      const res = await other.client.axios.patch(
        `/api/delegations/${created.data.id}/revoke`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('failure modes', () => {
    it('cannot delegate to yourself → 400', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.post('/api/delegations', {
        delegateeId: doctor.userId,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      expect(res.status).toBe(400);
    });

    it('endsAt <= startsAt → 400', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);
      const ts = new Date(Date.now() + 60 * 60_000).toISOString();
      const res = await doctor.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt: ts,
        endsAt: ts,
      });
      expect(res.status).toBe(400);
    });

    it('endsAt in the past → 400', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);
      const res = await doctor.client.axios.post('/api/delegations', {
        delegateeId: nurse.userId,
        startsAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        endsAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      });
      expect(res.status).toBe(400);
    });

    it('X-Acting-For with no active delegation → 403', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.get('/api/auth/me', {
        headers: { 'x-acting-for': doctor.userId },
      });
      expect(res.status).toBe(403);
    });

    it('X-Acting-For == self → 403', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.get('/api/auth/me', {
        headers: { 'x-acting-for': doctor.userId },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('cannot delegate to a user from a different tenant (400)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const doctorA = await env.makeDoctor(a.tenant);
      const nurseB = await env.makeNurse(b.tenant);
      const res = await doctorA.client.axios.post('/api/delegations', {
        delegateeId: nurseB.userId,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      // delegatee lookup is tenant-scoped → "not a member of this tenant".
      expect(res.status).toBe(400);
    });
  });

  describe('authentication', () => {
    it('unauthenticated POST /api/delegations → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/delegations', {
        delegateeId: 'x',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(res.status).toBe(401);
    });
  });
});
