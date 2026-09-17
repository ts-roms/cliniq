/**
 * Appointment status machine (docs/audit-checklist.md P0):
 *
 *   book → check-in → start (opens a consult) → complete consult
 *   → appointment COMPLETED, with lifecycle timestamps.
 *   No-show (manual + sweep), reschedule from NO_SHOW back to SCHEDULED,
 *   provider double-booking → 409, illegal moves → 409.
 *
 * The harness owner is OWNER, which holds PATIENT_WRITE, CONSULT_WRITE and
 * TENANT_MANAGE, so one client covers the front-desk + doctor + admin roles.
 */
import { bootEnv, type E2EEnv, type E2EClient } from './support/harness';

let env: E2EEnv;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

const HOUR = 60 * 60 * 1000;

async function makePatient(client: E2EClient, suffix = '') {
  const res = await client.axios.post('/api/patients', {
    mrn: `MRN-${Date.now()}-${Math.floor(Math.random() * 1e6)}${suffix}`,
    firstName: 'Ana',
    lastName: 'Santos',
    dateOfBirth: '1988-03-14',
    sex: 'FEMALE',
  });
  expect(res.status).toBe(201);
  return res.data.id as string;
}

function slot(offsetHours: number, lengthMin = 30) {
  const startsAt = new Date(Date.now() + offsetHours * HOUR);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + lengthMin * 60_000).toISOString(),
  };
}

describe('Appointment lifecycle', () => {
  it('book → check-in → start → complete consult, stamping each step', async () => {
    const { client, tenant } = await env.makeTenant();
    const patientId = await makePatient(client);

    const booked = await client.axios.post('/api/appointments', {
      patientId,
      providerId: tenant.ownerUserId,
      ...slot(24),
      reason: 'Follow-up',
    });
    expect(booked.status).toBe(201);
    expect(booked.data.status).toBe('SCHEDULED');
    const id = booked.data.id as string;

    // Completing before starting is an illegal move.
    const early = await client.axios.patch(`/api/appointments/${id}/complete`);
    expect(early.status).toBe(409);

    const checkedIn = await client.axios.patch(
      `/api/appointments/${id}/check-in`,
    );
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.data.status).toBe('CHECKED_IN');
    expect(checkedIn.data.checkedInAt).toBeTruthy();

    // Checking in twice → 409, and the row is untouched.
    expect(
      (await client.axios.patch(`/api/appointments/${id}/check-in`)).status,
    ).toBe(409);

    const started = await client.axios.patch(`/api/appointments/${id}/start`);
    expect(started.status).toBe(200);
    expect(started.data.status).toBe('IN_PROGRESS');
    expect(started.data.startedAt).toBeTruthy();
    const consultId = started.data.consultation?.id as string;
    expect(consultId).toBeTruthy();

    // The consult is bound to the slot and the patient.
    const consult = await client.axios.get(`/api/consultations/${consultId}`);
    expect(consult.status).toBe(200);
    expect(consult.data.appointmentId).toBe(id);
    expect(consult.data.patientId).toBe(patientId);

    // Starting again → 409 (one consult per appointment).
    const again = await client.axios.patch(`/api/appointments/${id}/start`);
    expect(again.status).toBe(409);

    // A totally blank consult can't be completed (the doctor must document
    // something) — write one SOAP field, then close it.
    const blank = await client.axios.post(
      `/api/consultations/${consultId}/complete`,
    );
    expect(blank.status).toBe(400);
    const noted = await client.axios.patch(`/api/consultations/${consultId}`, {
      subjective: { chiefComplaint: 'Follow-up, feeling better' },
    });
    expect(noted.status).toBe(200);

    // Completing the consult completes the appointment.
    const done = await client.axios.post(
      `/api/consultations/${consultId}/complete`,
    );
    expect(done.status).toBe(201);
    const after = await client.axios.get(`/api/appointments/${id}`);
    expect(after.status).toBe(200);
    expect(after.data.status).toBe('COMPLETED');
    expect(after.data.completedAt).toBeTruthy();
    expect(after.data.consultation).toMatchObject({
      id: consultId,
      status: 'COMPLETED',
    });

    // Terminal: nothing moves it now.
    expect(
      (await client.axios.patch(`/api/appointments/${id}/cancel`)).status,
    ).toBe(409);
    expect(
      (await client.axios.patch(`/api/appointments/${id}/no-show`)).status,
    ).toBe(409);
    expect(
      (await client.axios.patch(`/api/appointments/${id}/reschedule`, slot(48)))
        .status,
    ).toBe(409);

    // And the list filter sees the terminal status.
    const list = await client.axios.get('/api/appointments', {
      params: { status: 'COMPLETED' },
    });
    expect(list.status).toBe(200);
    expect(list.data.some((a: { id: string }) => a.id === id)).toBe(true);
  });

  it('POST /consultations with appointmentId also opens the slot (walk straight in)', async () => {
    const { client, tenant } = await env.makeTenant();
    const patientId = await makePatient(client);
    const booked = await client.axios.post('/api/appointments', {
      patientId,
      providerId: tenant.ownerUserId,
      ...slot(2),
      type: 'TELEMED',
    });
    expect(booked.status).toBe(201);

    // Wrong patient for the slot → 400.
    const other = await makePatient(client, '-b');
    const mismatch = await client.axios.post('/api/consultations', {
      appointmentId: booked.data.id,
      patientId: other,
    });
    expect(mismatch.status).toBe(400);

    const consult = await client.axios.post('/api/consultations', {
      appointmentId: booked.data.id,
    });
    expect(consult.status).toBe(201);
    expect(consult.data.patientId).toBe(patientId);
    const appt = await client.axios.get(`/api/appointments/${booked.data.id}`);
    expect(appt.data.status).toBe('IN_PROGRESS');
  });

  it('refuses provider double-booking (overlap) but allows back-to-back', async () => {
    const { client, tenant } = await env.makeTenant();
    const p1 = await makePatient(client, '-1');
    const p2 = await makePatient(client, '-2');
    const base = Date.now() + 72 * HOUR;
    const iso = (ms: number) => new Date(ms).toISOString();

    const first = await client.axios.post('/api/appointments', {
      patientId: p1,
      providerId: tenant.ownerUserId,
      startsAt: iso(base),
      endsAt: iso(base + 30 * 60_000),
    });
    expect(first.status).toBe(201);

    // Overlaps by 10 minutes → 409 with the clashing id.
    const clash = await client.axios.post('/api/appointments', {
      patientId: p2,
      providerId: tenant.ownerUserId,
      startsAt: iso(base + 20 * 60_000),
      endsAt: iso(base + 50 * 60_000),
    });
    expect(clash.status).toBe(409);
    expect(clash.data.conflictingAppointmentId).toBe(first.data.id);

    // Starts exactly when the first ends → fine (half-open interval).
    const adjacent = await client.axios.post('/api/appointments', {
      patientId: p2,
      providerId: tenant.ownerUserId,
      startsAt: iso(base + 30 * 60_000),
      endsAt: iso(base + 60 * 60_000),
    });
    expect(adjacent.status).toBe(201);

    // Cancel the first → its slot is free again.
    expect(
      (
        await client.axios.patch(`/api/appointments/${first.data.id}/cancel`, {
          reason: 'patient request',
        })
      ).status,
    ).toBe(200);
    const reuse = await client.axios.post('/api/appointments', {
      patientId: p2,
      providerId: tenant.ownerUserId,
      startsAt: iso(base),
      endsAt: iso(base + 30 * 60_000),
    });
    expect(reuse.status).toBe(201);

    // Rescheduling the adjacent one onto the reused slot → 409.
    const bad = await client.axios.patch(
      `/api/appointments/${adjacent.data.id}/reschedule`,
      {
        startsAt: iso(base + 10 * 60_000),
        endsAt: iso(base + 40 * 60_000),
      },
    );
    expect(bad.status).toBe(409);
  });

  it('no-show: manual mark, admin sweep, and reschedule back to SCHEDULED', async () => {
    const { client, tenant } = await env.makeTenant();
    const patientId = await makePatient(client);

    // Manual no-show on a future slot.
    const a = await client.axios.post('/api/appointments', {
      patientId,
      providerId: tenant.ownerUserId,
      ...slot(5),
    });
    expect(a.status).toBe(201);
    const marked = await client.axios.patch(
      `/api/appointments/${a.data.id}/no-show`,
    );
    expect(marked.status).toBe(200);
    expect(marked.data.status).toBe('NO_SHOW');
    expect(marked.data.noShowAt).toBeTruthy();

    // A slot that ended an hour ago is picked up by the sweep; a future one is not.
    const stale = await client.axios.post('/api/appointments', {
      patientId,
      providerId: tenant.ownerUserId,
      ...slot(-2),
    });
    expect(stale.status).toBe(201);
    const future = await client.axios.post('/api/appointments', {
      patientId,
      providerId: tenant.ownerUserId,
      ...slot(30),
    });
    expect(future.status).toBe(201);

    const sweep = await client.axios.post('/api/appointments/no-show-sweep', {
      graceMinutes: 30,
    });
    expect(sweep.status).toBe(200);
    expect(sweep.data.marked).toBe(1);
    expect(
      (await client.axios.get(`/api/appointments/${stale.data.id}`)).data
        .status,
    ).toBe('NO_SHOW');
    expect(
      (await client.axios.get(`/api/appointments/${future.data.id}`)).data
        .status,
    ).toBe('SCHEDULED');

    // The no-show can be rebooked: back to SCHEDULED, marks cleared, old slot remembered.
    const next = slot(26);
    const moved = await client.axios.patch(
      `/api/appointments/${stale.data.id}/reschedule`,
      next,
    );
    expect(moved.status).toBe(200);
    expect(moved.data.status).toBe('SCHEDULED');
    expect(moved.data.noShowAt).toBeNull();
    expect(moved.data.startsAt).toBe(next.startsAt);
    expect(moved.data.rescheduledFromStartsAt).toBeTruthy();

    // The sweep is tenant-scoped: another tenant's stale slot is untouched.
    const B = await env.makeTenant();
    const pB = await makePatient(B.client);
    const staleB = await B.client.axios.post('/api/appointments', {
      patientId: pB,
      providerId: B.tenant.ownerUserId,
      ...slot(-3),
    });
    expect(staleB.status).toBe(201);
    const sweepA = await client.axios.post('/api/appointments/no-show-sweep', {
      graceMinutes: 0,
    });
    expect(sweepA.status).toBe(200);
    expect(
      (await B.client.axios.get(`/api/appointments/${staleB.data.id}`)).data
        .status,
    ).toBe('SCHEDULED');
  });

  it('cross-tenant: appointments and their transitions are invisible to another tenant', async () => {
    const A = await env.makeTenant();
    const B = await env.makeTenant();
    const patientId = await makePatient(A.client);
    const a = await A.client.axios.post('/api/appointments', {
      patientId,
      providerId: A.tenant.ownerUserId,
      ...slot(10),
    });
    expect(a.status).toBe(201);
    expect(
      (await B.client.axios.get(`/api/appointments/${a.data.id}`)).status,
    ).toBe(404);
    expect(
      (await B.client.axios.patch(`/api/appointments/${a.data.id}/check-in`))
        .status,
    ).toBe(404);
    expect(
      (await B.client.axios.patch(`/api/appointments/${a.data.id}/start`))
        .status,
    ).toBe(404);
  });
});
