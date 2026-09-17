/**
 * Provider availability rules (docs/audit-checklist.md P1, plan wk 6):
 *
 *   - weekly schedule (several ranges a day = breaks) + dated time off
 *   - booking outside hours / during time off → 422 with a reason,
 *     `force: true` overrides; double-booking stays a 409 even with force
 *   - free-slot listing minus bookings and time off
 *   - fallback to the clinic's operating hours when a provider has no rules
 *   - permission: a doctor edits only their own rules
 */
import axios from 'axios';
import { bootEnv, type E2EEnv, type E2EClient } from './support/harness';

let env: E2EEnv;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

const TZ = 'Asia/Manila';

async function makePatient(client: E2EClient) {
  const res = await client.axios.post('/api/patients', {
    mrn: `MRN-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    firstName: 'Ana',
    lastName: 'Santos',
    dateOfBirth: '1988-03-14',
    sex: 'FEMALE',
  });
  expect(res.status).toBe(201);
  return res.data.id as string;
}

/** Next occurrence of `weekday` (0-6) at least 2 days out, as YYYY-MM-DD in Manila. */
function nextLocalDate(weekday: number): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  for (let i = 2; i < 10; i++) {
    const d = new Date(Date.now() + i * 86_400_000);
    const parts = Object.fromEntries(
      fmt.formatToParts(d).map((p) => [p.type, p.value]),
    );
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      parts.weekday,
    );
    if (wd === weekday) return `${parts.year}-${parts.month}-${parts.day}`;
  }
  throw new Error('unreachable');
}

/** `YYYY-MM-DD` + `HH:mm` in Manila → ISO instant (Manila is UTC+8, no DST). */
function manila(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00+08:00`).toISOString();
}

describe('Provider availability', () => {
  it('weekly rules gate booking; force overrides; double-booking never does', async () => {
    const { client, tenant } = await env.makeTenant();
    const provider = tenant.ownerUserId;
    const patientId = await makePatient(client);

    // Providers picker sees the owner.
    const providers = await client.axios.get('/api/providers');
    expect(providers.status).toBe(200);
    expect(providers.data.some((p: { id: string }) => p.id === provider)).toBe(
      true,
    );

    // No rules yet → unrestricted.
    const before = await client.axios.get(
      `/api/providers/${provider}/availability`,
    );
    expect(before.status).toBe(200);
    expect(before.data.source).toBe('none');

    // Mon 08:00-12:00 + 13:00-17:00 on 30-min slots; Wed 09:00-12:00.
    const set = await client.axios.put(
      `/api/providers/${provider}/availability/schedule`,
      {
        ranges: [
          { weekday: 1, startTime: '08:00', endTime: '12:00', slotMinutes: 30 },
          { weekday: 1, startTime: '13:00', endTime: '17:00', slotMinutes: 30 },
          { weekday: 3, startTime: '09:00', endTime: '12:00', slotMinutes: 20 },
        ],
      },
    );
    expect(set.status).toBe(200);
    expect(set.data).toHaveLength(3);

    // Overlapping ranges are refused with the offending pair named.
    const bad = await client.axios.put(
      `/api/providers/${provider}/availability/schedule`,
      {
        ranges: [
          { weekday: 1, startTime: '08:00', endTime: '12:00' },
          { weekday: 1, startTime: '11:00', endTime: '15:00' },
        ],
      },
    );
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.data.problems)).toMatch(/Monday/);

    const monday = nextLocalDate(1);

    // Lunch gap → 422 with a reason, and the body says it is overridable.
    const lunch = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(monday, '12:00'),
      endsAt: manila(monday, '12:30'),
    });
    expect(lunch.status).toBe(422);
    expect(lunch.data.reason).toBe('outside_hours');
    expect(lunch.data.overridable).toBe(true);

    // Same slot with force → booked.
    const forced = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(monday, '12:00'),
      endsAt: manila(monday, '12:30'),
      force: true,
    });
    expect(forced.status).toBe(201);

    // A Tuesday → not available that day.
    const tuesday = nextLocalDate(2);
    const tue = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(tuesday, '09:00'),
      endsAt: manila(tuesday, '09:30'),
    });
    expect(tue.status).toBe(422);
    expect(tue.data.message).toMatch(/Tuesdays/);

    // Inside hours → fine.
    const ok = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(monday, '09:00'),
      endsAt: manila(monday, '09:30'),
    });
    expect(ok.status).toBe(201);

    // Double-booking that slot is a 409 even with force.
    const dupe = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(monday, '09:00'),
      endsAt: manila(monday, '09:30'),
      force: true,
    });
    expect(dupe.status).toBe(409);

    // Free slots for that Monday: 16 grid points minus the two bookings
    // (09:00 and the forced 12:00 — which isn't on the grid anyway).
    const slots = await client.axios.get(
      `/api/providers/${provider}/availability/slots`,
      {
        params: { date: monday },
      },
    );
    expect(slots.status).toBe(200);
    expect(slots.data.timezone).toBe(TZ);
    expect(slots.data.unrestricted).toBe(false);
    const starts = slots.data.slots.map(
      (s: { startsAt: string }) => s.startsAt,
    );
    expect(starts).toHaveLength(15);
    expect(starts).not.toContain(manila(monday, '09:00'));
    expect(starts).toContain(manila(monday, '09:30'));
    expect(starts).toContain(manila(monday, '08:00'));
    expect(starts).toContain(manila(monday, '16:30'));
    expect(starts).not.toContain(manila(monday, '12:00'));

    // A 60-minute request on the Wednesday 20-min grid.
    const wednesday = nextLocalDate(3);
    const hour = await client.axios.get(
      `/api/providers/${provider}/availability/slots`,
      {
        params: { date: wednesday, durationMinutes: 60 },
      },
    );
    expect(hour.status).toBe(200);
    expect(hour.data.slots[0].startsAt).toBe(manila(wednesday, '09:00'));
    expect(hour.data.slots[hour.data.slots.length - 1].startsAt).toBe(
      manila(wednesday, '11:00'),
    );

    // Reschedule the 09:00 booking into the gap → 422; with force → ok.
    const move = await client.axios.patch(
      `/api/appointments/${ok.data.id}/reschedule`,
      {
        startsAt: manila(monday, '12:30'),
        endsAt: manila(monday, '13:00'),
      },
    );
    expect(move.status).toBe(422);
    const moveForced = await client.axios.patch(
      `/api/appointments/${ok.data.id}/reschedule`,
      {
        startsAt: manila(monday, '12:30'),
        endsAt: manila(monday, '13:00'),
        force: true,
      },
    );
    expect(moveForced.status).toBe(200);
  });

  it('time off blocks booking, refuses to cover live appointments, and drops from slots', async () => {
    const { client, tenant } = await env.makeTenant();
    const provider = tenant.ownerUserId;
    const patientId = await makePatient(client);
    await client.axios.put(`/api/providers/${provider}/availability/schedule`, {
      ranges: [
        { weekday: 4, startTime: '08:00', endTime: '17:00', slotMinutes: 60 },
      ],
    });
    const thursday = nextLocalDate(4);

    // Book 10:00 first, then try to take the afternoon off over it → 409.
    const booked = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(thursday, '14:00'),
      endsAt: manila(thursday, '15:00'),
    });
    expect(booked.status).toBe(201);
    const clash = await client.axios.post(
      `/api/providers/${provider}/availability/time-off`,
      {
        startsAt: manila(thursday, '13:00'),
        endsAt: manila(thursday, '17:00'),
        reason: 'conference',
      },
    );
    expect(clash.status).toBe(409);
    expect(clash.data.appointmentIds).toContain(booked.data.id);

    // Morning off is fine.
    const off = await client.axios.post(
      `/api/providers/${provider}/availability/time-off`,
      {
        startsAt: manila(thursday, '08:00'),
        endsAt: manila(thursday, '12:00'),
        reason: 'clinic rounds',
      },
    );
    expect(off.status).toBe(201);

    const inOff = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(thursday, '09:00'),
      endsAt: manila(thursday, '10:00'),
    });
    expect(inOff.status).toBe(422);
    expect(inOff.data.reason).toBe('time_off');
    expect(inOff.data.message).toMatch(/clinic rounds/);

    const slots = await client.axios.get(
      `/api/providers/${provider}/availability/slots`,
      {
        params: { date: thursday },
      },
    );
    const starts = slots.data.slots.map(
      (s: { startsAt: string }) => s.startsAt,
    );
    // 08..16 = 9 grid points, minus 4 in the morning off, minus the 14:00 booking.
    expect(starts).toEqual([
      manila(thursday, '12:00'),
      manila(thursday, '13:00'),
      manila(thursday, '15:00'),
      manila(thursday, '16:00'),
    ]);

    // Listed, then removed.
    const view = await client.axios.get(
      `/api/providers/${provider}/availability`,
    );
    expect(
      view.data.timeOff.some((t: { id: string }) => t.id === off.data.id),
    ).toBe(true);
    const gone = await client.axios.delete(
      `/api/providers/${provider}/availability/time-off/${off.data.id}`,
    );
    expect(gone.status).toBe(200);
    const again = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(thursday, '09:00'),
      endsAt: manila(thursday, '10:00'),
    });
    expect(again.status).toBe(201);
  });

  it('falls back to the clinic operating hours when a provider has no rules', async () => {
    const { client, tenant } = await env.makeTenant();
    const provider = tenant.ownerUserId;
    const patientId = await makePatient(client);

    const saved = await client.axios.patch('/api/tenants/me/settings', {
      operatingHours: [
        { weekday: 0, open: '08:00', close: '17:00', closed: true },
        { weekday: 1, open: '08:00', close: '17:00' },
        { weekday: 2, open: '08:00', close: '17:00' },
        { weekday: 3, open: '08:00', close: '17:00' },
        { weekday: 4, open: '08:00', close: '17:00' },
        { weekday: 5, open: '08:00', close: '12:00' },
        { weekday: 6, open: '08:00', close: '17:00', closed: true },
      ],
    });
    expect(saved.status).toBe(200);

    const view = await client.axios.get(
      `/api/providers/${provider}/availability`,
    );
    expect(view.data.source).toBe('clinic');

    const friday = nextLocalDate(5);
    const late = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(friday, '14:00'),
      endsAt: manila(friday, '14:30'),
    });
    expect(late.status).toBe(422);
    const sunday = nextLocalDate(0);
    const closed = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(sunday, '09:00'),
      endsAt: manila(sunday, '09:30'),
    });
    expect(closed.status).toBe(422);
    const morning = await client.axios.post('/api/appointments', {
      patientId,
      providerId: provider,
      startsAt: manila(friday, '09:00'),
      endsAt: manila(friday, '09:30'),
    });
    expect(morning.status).toBe(201);
  });

  it('a doctor can edit only their own availability; other tenants see nothing', async () => {
    const { client: owner, tenant } = await env.makeTenant();
    const docEmail = `doc-${Date.now()}@e2e.local`;
    const invite = await owner.axios.post('/api/members/invites', {
      email: docEmail,
      role: 'DOCTOR',
    });
    const token = new URL(invite.data.inviteUrl).searchParams.get('invite')!;
    const joined = await owner.axios.post('/api/auth/register', {
      email: docEmail,
      name: 'Dr. Rules',
      password: 'TestPassword123!',
      tenantSlug: tenant.slug,
      inviteToken: token,
    });
    expect(joined.status).toBe(201);
    const doctorId = joined.data.user.id as string;
    const docAxios = axios.create({
      baseURL: env.baseUrl,
      headers: { authorization: `Bearer ${joined.data.accessToken}` },
      validateStatus: () => true,
    });

    const own = await docAxios.put(
      `/api/providers/${doctorId}/availability/schedule`,
      {
        ranges: [{ weekday: 2, startTime: '10:00', endTime: '14:00' }],
      },
    );
    expect(own.status).toBe(200);
    const other = await docAxios.put(
      `/api/providers/${tenant.ownerUserId}/availability/schedule`,
      {
        ranges: [{ weekday: 2, startTime: '10:00', endTime: '14:00' }],
      },
    );
    expect(other.status).toBe(403);

    const B = await env.makeTenant();
    expect(
      (await B.client.axios.get(`/api/providers/${doctorId}/availability`))
        .status,
    ).toBe(404);
    const listB = await B.client.axios.get('/api/providers');
    expect(listB.data.some((p: { id: string }) => p.id === doctorId)).toBe(
      false,
    );
  });
});
