/**
 * /api/visit-types — the clinic's catalogue of checkups.
 *
 * A visit type says what a patient is coming in FOR. That is a different
 * question from `AppointmentType` (the modality: consult / follow-up /
 * procedure / telemed) and from `Service` (a billing price list), and it is
 * what lets the consult screen open the dental chart for a cleaning instead
 * of every form the product ships.
 *
 * Reading is open to any signed-in staff member (a receptionist books, a
 * doctor consults — both need the picker); managing the catalogue is
 * CLINIC_ADMIN.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e visit-types module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can create one and it comes back on the list', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/visit-types', {
        name: 'Dental cleaning',
        code: 'DENT-CLN',
        modules: ['dental'],
        description: 'Routine scale and polish',
      });
      expect(res.status).toBe(201);
      expect(res.data.modules).toEqual(['dental']);

      const list = await client.axios.get('/api/visit-types');
      expect(list.status).toBe(200);
      expect(
        list.data.some((v: { name: string }) => v.name === 'Dental cleaning'),
      ).toBe(true);
    });

    it('at most one default survives, whichever was set last', async () => {
      const { client } = await env.makeTenant();
      await client.axios.post('/api/visit-types', {
        name: 'First',
        isDefault: true,
      });
      await client.axios.post('/api/visit-types', {
        name: 'Second',
        isDefault: true,
      });

      const list = await client.axios.get('/api/visit-types');
      const defaults = list.data.filter(
        (v: { isDefault: boolean }) => v.isDefault,
      );
      expect(defaults).toHaveLength(1);
      expect(defaults[0].name).toBe('Second');
    });

    it('delete is soft — it leaves the list but keeps the row', async () => {
      const { client } = await env.makeTenant();
      const created = await client.axios.post('/api/visit-types', {
        name: 'Retired type',
      });
      const del = await client.axios.delete(
        `/api/visit-types/${created.data.id}`,
      );
      expect(del.status).toBe(200);

      const list = await client.axios.get('/api/visit-types');
      expect(
        list.data.some((v: { id: string }) => v.id === created.data.id),
      ).toBe(false);
      const gone = await client.axios.get(
        `/api/visit-types/${created.data.id}`,
      );
      expect(gone.status).toBe(404);
    });

    it('a receptionist can read the catalogue but not change it', async () => {
      const { tenant, client } = await env.makeTenant();
      await client.axios.post('/api/visit-types', { name: 'Walk-in triage' });
      const recep = await env.makeReceptionist(tenant);

      const list = await recep.client.axios.get('/api/visit-types');
      expect(list.status).toBe(200);
      expect(list.data.length).toBeGreaterThan(0);

      const denied = await recep.client.axios.post('/api/visit-types', {
        name: 'Should not exist',
      });
      expect(denied.status).toBe(403);
    });
  });

  describe('validation', () => {
    it('rejects a duplicate name in the same tenant', async () => {
      const { client } = await env.makeTenant();
      await client.axios.post('/api/visit-types', { name: 'Annual physical' });
      const dup = await client.axios.post('/api/visit-types', {
        name: 'Annual physical',
      });
      expect(dup.status).toBe(409);
    });

    it('rejects a module outside the catalogue', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/visit-types', {
        name: 'Bad modules',
        modules: ['telemedicine'],
      });
      expect(res.status).toBe(400);
    });

    it('404s for an unknown id', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/visit-types/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('tenant isolation', () => {
    it('one clinic catalogue is invisible to another', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const created = await a.client.axios.post('/api/visit-types', {
        name: 'A-only type',
      });
      expect(created.status).toBe(201);

      const listB = await b.client.axios.get('/api/visit-types');
      expect(
        listB.data.some((v: { name: string }) => v.name === 'A-only type'),
      ).toBe(false);

      const direct = await b.client.axios.get(
        `/api/visit-types/${created.data.id}`,
      );
      expect(direct.status).toBe(404);
    });
  });

  describe('the visit type follows the patient through the visit', () => {
    it('booking stores it and the consult inherits it', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const vt = await client.axios.post('/api/visit-types', {
        name: 'Dental cleaning',
        modules: ['dental'],
      });

      const patient = await client.axios.post('/api/patients', {
        mrn: `VT-${Date.now()}`,
        firstName: 'Visit',
        lastName: 'Type',
        dateOfBirth: '1990-01-01',
        sex: 'FEMALE',
      });
      expect(patient.status).toBe(201);

      const appt = await client.axios.post('/api/appointments', {
        patientId: patient.data.id,
        providerId: doctor.userId,
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 5_400_000).toISOString(),
        visitTypeId: vt.data.id,
      });
      expect(appt.status).toBe(201);
      expect(appt.data.visitTypeId).toBe(vt.data.id);

      const consult = await doctor.client.axios.post('/api/consultations', {
        appointmentId: appt.data.id,
      });
      expect(consult.status).toBe(201);
      expect(consult.data.visitTypeId).toBe(vt.data.id);
    });

    it('a walk-in consult can carry one directly', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const vt = await client.axios.post('/api/visit-types', {
        name: 'Walk-in dental',
        modules: ['dental'],
      });
      const patient = await client.axios.post('/api/patients', {
        mrn: `VT-W-${Date.now()}`,
        firstName: 'Walk',
        lastName: 'In',
        dateOfBirth: '1985-03-03',
        sex: 'MALE',
      });

      const consult = await doctor.client.axios.post('/api/consultations', {
        patientId: patient.data.id,
        visitTypeId: vt.data.id,
      });
      expect(consult.status).toBe(201);
      expect(consult.data.visitTypeId).toBe(vt.data.id);
    });
  });

  describe('authentication', () => {
    it('unauthenticated list → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/visit-types');
      expect(res.status).toBe(401);
    });
  });
});
