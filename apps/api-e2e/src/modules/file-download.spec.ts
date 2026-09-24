/**
 * Authorized file download.
 *
 * FilesService implemented presign (PUT) and confirm, and nothing else —
 * there was no download route at all, so uploaded PHI was write-only through
 * the API. That hid a modelling gap: `files` had no patientId, so the only
 * question answerable about a file was "is it in your tenant?".
 *
 * Tenant scope is the right rule for staff, who may see any patient in their
 * clinic. It is NOT the rule for a portal account, which may see exactly one.
 * Shipping a download route without an owner column would have reproduced the
 * portal BOLA of #30 with a PDF as the payload.
 *
 * The contract:
 *   - staff download within their tenant, and not across tenants
 *   - a portal account downloads only files it owns
 *   - a file with a null owner is staff-only by construction
 *   - an unconfirmed (PENDING) upload is not downloadable
 *   - every download is audited
 *
 * These tests assert authorization, not S3 delivery: without real AWS
 * credentials the presign call fails with 503, which is itself a meaningful
 * assertion — reaching 503 means the caller got PAST the ownership check,
 * and 403/404 means they did not.
 */
import { Client as PgClient } from 'pg';
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

/** Reaching storage means authorization passed; 200 if AWS is configured. */
const PASSED_AUTHZ = [200, 503];

describe('@org/api-e2e file download authorization', () => {
  let env: E2EEnv;
  let pg: PgClient;

  beforeAll(async () => {
    env = await bootEnv();
    pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
  });

  afterAll(async () => {
    await pg?.end().catch(() => undefined);
    await env.cleanup();
  });

  async function makePatientRecord(client: E2EClient): Promise<string> {
    const res = await client.axios.post('/api/patients', {
      mrn: `MRN-FD-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'File',
      lastName: 'Owner',
      dateOfBirth: '1988-03-03',
      sex: 'FEMALE',
    });
    expect(res.status).toBe(201);
    return res.data.id;
  }

  /** Presign a file, optionally owned, and mark it READY in the DB. */
  async function makeFile(
    client: E2EClient,
    opts: { patientId?: string; ready?: boolean } = {},
  ): Promise<string> {
    const res = await client.axios.post('/api/files/presign', {
      category: 'PATIENT_DOC',
      filename: 'result.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      ...(opts.patientId ? { patientId: opts.patientId } : {}),
    });
    expect(res.status).toBe(201);
    const fileId = res.data.fileId;
    if (opts.ready !== false) {
      // confirm() does a HeadObject against S3, which cannot succeed without
      // a real upload, so flip the status directly — the point under test is
      // the authorization rule, not the S3 round-trip.
      await pg.query(`UPDATE "files" SET "status" = 'READY' WHERE "id" = $1`, [
        fileId,
      ]);
    }
    return fileId;
  }

  describe('ownership is recorded at upload', () => {
    it('stores the patient on the file row', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const fileId = await makeFile(client, { patientId });

      const { rows } = await pg.query<{ patientId: string | null }>(
        `SELECT "patientId" FROM "files" WHERE "id" = $1`,
        [fileId],
      );
      expect(rows[0].patientId).toBe(patientId);
    });

    it('refuses a patient from another tenant', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const patientInA = await makePatientRecord(a.client);

      const res = await b.client.axios.post('/api/files/presign', {
        category: 'PATIENT_DOC',
        filename: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        patientId: patientInA,
      });
      expect(res.status).toBe(400);
    });

    it('still accepts a file with no patient — not everything has one', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.post('/api/files/presign', {
        category: 'CLINIC_LOGO',
        filename: 'logo.png',
        mimeType: 'image/png',
        sizeBytes: 512,
      });
      expect(res.status).toBe(201);
    });
  });

  describe('staff', () => {
    it('can download a file in their own tenant', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const fileId = await makeFile(client, { patientId });

      const res = await client.axios.get(`/api/files/${fileId}/download`);
      expect(PASSED_AUTHZ).toContain(res.status);
    });

    it('cannot download across tenants', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(a.client);
      const fileId = await makeFile(a.client, { patientId });

      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await b.client.axios.get(`/api/files/${fileId}/download`);
      expect(res.status).toBe(404);
    });

    it('cannot download an unconfirmed upload', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const fileId = await makeFile(client, { patientId, ready: false });

      const res = await client.axios.get(`/api/files/${fileId}/download`);
      expect(res.status).toBe(400);
    });
  });

  describe('portal', () => {
    it('can download its OWN file', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const fileId = await makeFile(client, { patientId: patient.patientId });

      const res = await patient.client.axios.get(
        `/api/me/files/${fileId}/download`,
      );
      expect(PASSED_AUTHZ).toContain(res.status);
    });

    it("cannot download ANOTHER patient's file", async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const mine = await env.makePatient(tenant);
      const theirs = await env.makePatient(tenant);
      const fileId = await makeFile(client, { patientId: theirs.patientId });

      const res = await mine.client.axios.get(
        `/api/me/files/${fileId}/download`,
      );
      // 404, not 403: probing ids must not distinguish "exists but not yours"
      // from "does not exist".
      expect(res.status).toBe(404);
    });

    it('cannot download a file with no owner', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const fileId = await makeFile(client); // no patientId

      const res = await patient.client.axios.get(
        `/api/me/files/${fileId}/download`,
      );
      expect(res.status).toBe(404);
    });

    it('cannot use the staff route at all', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const fileId = await makeFile(client, { patientId: patient.patientId });

      // Even for a file it owns: PATIENT holds PORTAL_READ, not PATIENT_READ,
      // and PortalScopeGuard closes the staff surface regardless.
      const res = await patient.client.axios.get(
        `/api/files/${fileId}/download`,
      );
      expect(res.status).toBe(403);
    });

    it('a staff JWT cannot use the portal route', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const fileId = await makeFile(client, { patientId: patient.patientId });

      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.get(
        `/api/me/files/${fileId}/download`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('downloads are audited', () => {
    it('records the staff download', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const fileId = await makeFile(client, { patientId });
      await client.axios.get(`/api/files/${fileId}/download`);

      const audit = await client.axios.get(
        `/api/audit?entityId=${fileId}&action=file.download`,
      );
      expect(audit.status).toBe(200);
      const rows = Array.isArray(audit.data) ? audit.data : audit.data.items;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].action).toBe('file.download');
      expect(rows[0].entityId).toBe(fileId);
    });

    it('records the portal download separately', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const fileId = await makeFile(client, { patientId: patient.patientId });
      await patient.client.axios.get(`/api/me/files/${fileId}/download`);

      // Read the trail as the OWNER: audit is AUDIT_READ, which a portal
      // account does not hold.
      const audit = await client.axios.get(
        `/api/audit?entityId=${fileId}&action=me.file.download`,
      );
      const rows = Array.isArray(audit.data) ? audit.data : audit.data.items;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].action).toBe('me.file.download');
    });
  });
});
