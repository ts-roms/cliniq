#!/usr/bin/env node
// End-to-end smoke test against a running api binary.
//
// Used by CI's `api-integration` job:
//   1. Builds the api
//   2. Boots the bundled binary against a fresh Postgres
//   3. Boots the stub-ai-service on :4100
//   4. Runs this script — must exit 0
//
// Tests the golden path: health → register tenant → register user → login →
// /me → patient CRUD → promote to doctor → start consult → generate SOAP draft → accept.

import assert from 'node:assert/strict';
import pg from 'pg';

const API = process.env.API_URL ?? 'http://localhost:4000';
const DATABASE_URL = process.env.DATABASE_URL;
const slug = `pilot-${Date.now()}`;
const ownerEmail = `owner-${Date.now()}@cliniq.test`;
const userEmail = `user-${Date.now()}@cliniq.test`;
const password = 'integration-test-pw-1';

const log = (msg) => console.log(`[smoke] ${msg}`);
const fail = (msg, extra) => {
  console.error(`[smoke] FAIL ${msg}`, extra ?? '');
  process.exit(1);
};

async function jsonRequest(path, init = {}, expectedStatus = 200) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (res.status !== expectedStatus) {
    fail(`${path} expected ${expectedStatus} got ${res.status}`, body);
  }
  return body;
}

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) {
        log(`api healthy after ${i * 500}ms`);
        return;
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('api never became healthy within 30s');
}

async function setRole(userId, role) {
  if (!DATABASE_URL) {
    log(`DATABASE_URL unset — skipping role promotion to ${role}`);
    return false;
  }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE tenant_users SET role = $2 WHERE "userId" = $1`,
      [userId, role],
    );
  } finally {
    await client.end();
  }
  return true;
}

async function main() {
  await waitForApi();

  // ── Health ─────────────────────────────────────
  const health = await jsonRequest('/api/health');
  assert.equal(health.status, 'ok');
  assert.equal(health.checks?.db, 'up');
  log('health ok');

  // ── Bootstrap a tenant + owner ─────────────────
  const tenant = await jsonRequest(
    '/api/tenants',
    {
      method: 'POST',
      body: JSON.stringify({
        slug,
        name: 'Pilot Clinic',
        ownerEmail,
        ownerName: 'Dr. Integration',
      }),
    },
    201,
  );
  assert.equal(tenant.slug, slug);
  log(`tenant ${tenant.id} created`);

  // ── Register a regular user on that tenant ─────
  const registered = await jsonRequest(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({
        email: userEmail,
        name: 'Dr. Smoke',
        password,
        tenantSlug: slug,
      }),
    },
    201,
  );
  assert.ok(registered.accessToken);
  log('register ok');

  // ── Login + /me ────────────────────────────────
  const session = await jsonRequest(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email: userEmail, password }),
    },
    200,
  );
  assert.ok(session.accessToken);
  const authHeaders = { authorization: `Bearer ${session.accessToken}` };
  log('login ok');

  const me = await jsonRequest('/api/auth/me', { headers: authHeaders });
  assert.equal(me.email, userEmail);
  log('me ok');

  // ── Patient CRUD (RECEPTIONIST has PATIENT_WRITE) ──
  const patient = await jsonRequest(
    '/api/patients',
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        mrn: `SMOKE-${Date.now()}`,
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
        phone: '0917-555-0100',
      }),
    },
    201,
  );
  assert.ok(patient.id);
  log(`patient ${patient.id} created`);

  const list = await jsonRequest('/api/patients?limit=5', { headers: authHeaders });
  assert.ok(list.items.some((p) => p.id === patient.id));
  log(`patient list returned (total=${list.total})`);

  // ── Promote to DOCTOR for consult + AI permissions ──
  const promoted = await setRole(registered.user.id, 'DOCTOR');
  if (!promoted) {
    log('SMOKE OK (skipped consult/AI/billing flow — DATABASE_URL unset)');
    return;
  }
  log(`promoted ${registered.user.id} to DOCTOR`);

  // Re-login so the JWT carries the new role
  const session2 = await jsonRequest(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email: userEmail, password }),
    },
    200,
  );
  const docHeaders = { authorization: `Bearer ${session2.accessToken}` };
  log('re-login as doctor ok');

  // ── Start a consultation ───────────────────────
  const consult = await jsonRequest(
    '/api/consultations',
    {
      method: 'POST',
      headers: docHeaders,
      body: JSON.stringify({ patientId: patient.id }),
    },
    201,
  );
  assert.ok(consult.id);
  log(`consult ${consult.id} started`);

  // ── Generate SOAP draft (api → stub ai-service) ─
  const transcript =
    'Patient is a 34-year-old male presenting with itchy red patches on the right forearm for three days. ' +
    'No fever, no other systemic symptoms. Reports recent contact with new soap brand.';
  const draft = await jsonRequest(
    `/api/consultations/${consult.id}/drafts/soap`,
    {
      method: 'POST',
      headers: docHeaders,
      body: JSON.stringify({ transcript }),
    },
    201,
  );
  assert.ok(draft.id);
  assert.equal(draft.kind, 'SOAP_DRAFT');
  assert.equal(draft.status, 'PENDING');
  assert.ok(draft.draftJson);
  log(`SOAP draft ${draft.id} generated (model=${draft.model})`);

  // ── Accept the draft ───────────────────────────
  const accepted = await jsonRequest(
    `/api/consultations/${consult.id}/suggestions/${draft.id}`,
    {
      method: 'PATCH',
      headers: docHeaders,
      body: JSON.stringify({ decision: 'ACCEPT' }),
    },
    200,
  );
  assert.equal(accepted.status, 'ACCEPTED');
  assert.ok(accepted.acceptedAt);
  log('draft accepted');

  // ── Clinical: vitals + allergy ─────────────────
  const vital = await jsonRequest(
    `/api/patients/${patient.id}/vitals`,
    {
      method: 'POST',
      headers: docHeaders,
      body: JSON.stringify({
        systolic: 120,
        diastolic: 80,
        heartRate: 72,
        spo2: 98,
        weightKg: 70,
        heightCm: 170,
      }),
    },
    201,
  );
  assert.ok(vital.id);
  // BMI is auto-computed from weight/height (70 / 1.7^2 ≈ 24.22)
  assert.ok(vital.bmi && vital.bmi > 20 && vital.bmi < 30, `bmi out of expected range: ${vital.bmi}`);
  log(`vital ${vital.id} recorded (bmi=${vital.bmi})`);

  const allergy = await jsonRequest(
    `/api/patients/${patient.id}/allergies`,
    {
      method: 'POST',
      headers: docHeaders,
      body: JSON.stringify({
        substance: 'penicillin',
        type: 'DRUG',
        severity: 'SEVERE',
        reaction: 'anaphylaxis',
      }),
    },
    201,
  );
  assert.ok(allergy.id);
  log(`allergy ${allergy.id} recorded`);

  // ── Appointments (DOCTOR has PATIENT_WRITE) ────
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const tomorrowEnd = new Date(tomorrow.getTime() + 30 * 60 * 1000);
  const appt = await jsonRequest(
    '/api/appointments',
    {
      method: 'POST',
      headers: docHeaders,
      body: JSON.stringify({
        patientId: patient.id,
        providerId: registered.user.id,
        startsAt: tomorrow.toISOString(),
        endsAt: tomorrowEnd.toISOString(),
        type: 'CONSULT',
        reason: 'follow-up',
      }),
    },
    201,
  );
  assert.ok(appt.id);
  log(`appointment ${appt.id} scheduled`);

  const checkedIn = await jsonRequest(
    `/api/appointments/${appt.id}/check-in`,
    { method: 'PATCH', headers: docHeaders },
    200,
  );
  assert.equal(checkedIn.status, 'CHECKED_IN');
  log('appointment check-in ok');

  // ── Promote to OWNER for billing + DSR + audit ──
  await setRole(registered.user.id, 'OWNER');
  const session3 = await jsonRequest(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email: userEmail, password }) },
    200,
  );
  const ownerHeaders = { authorization: `Bearer ${session3.accessToken}` };
  log('re-login as owner ok');

  // ── Billing: service → invoice → payment ───────
  const service = await jsonRequest(
    '/api/services',
    {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'General consultation',
        code: 'CONSULT',
        category: 'consultation',
        priceCentavos: 50000,
      }),
    },
    201,
  );
  assert.ok(service.id);
  log(`service ${service.id} created`);

  const invoice = await jsonRequest(
    '/api/invoices',
    {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        patientId: patient.id,
        items: [
          {
            serviceId: service.id,
            description: 'Consultation 2026-05-02',
            quantity: 1,
            unitPriceCentavos: 50000,
          },
        ],
      }),
    },
    201,
  );
  assert.ok(invoice.id);
  assert.match(invoice.number, /^INV-\d{6}-\d{4}$/);
  assert.equal(invoice.totalCentavos, 50000);
  assert.equal(invoice.paidCentavos, 0);
  log(`invoice ${invoice.number} created (total=${invoice.totalCentavos})`);

  const payment = await jsonRequest(
    `/api/invoices/${invoice.id}/payments`,
    {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        amountCentavos: 50000,
        method: 'CASH',
        reference: `OR-${Date.now()}`,
      }),
    },
    201,
  );
  assert.ok(payment.id);
  log('payment recorded');

  const invoicesAfter = await jsonRequest(
    `/api/invoices?patientId=${patient.id}`,
    { headers: ownerHeaders },
  );
  const paid = invoicesAfter.find((i) => i.id === invoice.id);
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.paidCentavos, 50000);
  log('invoice marked PAID');

  // ── DSR: file → resolve ────────────────────────
  const dsr = await jsonRequest(
    '/api/dsr',
    {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        patientId: patient.id,
        type: 'ACCESS',
        details: 'Patient requested copy of full medical record',
      }),
    },
    201,
  );
  assert.ok(dsr.id);
  assert.equal(dsr.status, 'OPEN');
  log(`dsr ${dsr.id} filed`);

  const inbox = await jsonRequest('/api/dsr', { headers: ownerHeaders });
  assert.ok(inbox.some((d) => d.id === dsr.id));
  log(`dsr inbox returned (${inbox.length} items)`);

  const resolved = await jsonRequest(
    `/api/dsr/${dsr.id}/resolve`,
    {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ status: 'RESOLVED', resolution: 'Record exported via /api/patients/:id/export' }),
    },
    200,
  );
  assert.equal(resolved.status, 'RESOLVED');
  assert.ok(resolved.resolvedAt);
  log('dsr resolved');

  log('SMOKE OK (all flows including AI, clinical, billing, DSR)');
}

main().catch((err) => fail(err.message ?? String(err), err));
