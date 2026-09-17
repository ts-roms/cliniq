/**
 * /api/files — presign + confirm flow.
 *
 * Routes:
 *   - POST /api/files/presign  → returns { fileId, s3Key, uploadUrl, headers }
 *   - POST /api/files/confirm  → flips PENDING → READY after S3 PUT lands
 *
 * Both guarded by Actions.PATIENT_WRITE.
 *
 * We deliberately do NOT actually PUT to S3 — CI has no AWS credentials and
 * the test would hang trying to reach a bucket. We assert:
 *   - presign returns a well-formed payload (URL string, fileId, headers)
 *   - RBAC: PATIENT is 403
 *   - RLS: Tenant B cannot confirm a fileId minted by Tenant A
 *   - confirm of an unknown fileId returns 404
 *
 * The PUT + confirm-success path is covered by the e2e contract tests that
 * run against a localstack S3 (out of scope for this spec).
 */
import { bootEnv, type E2EEnv } from '../support/harness';

const PRESIGN_AUDIO = {
  category: 'CONSULT_AUDIO',
  filename: 'rec.webm',
  mimeType: 'audio/webm',
  sizeBytes: 2048,
};

const PRESIGN_PUBLIC = {
  category: 'CLINIC_LOGO',
  filename: 'logo.png',
  mimeType: 'image/png',
  sizeBytes: 4096,
};

describe('@org/api-e2e files module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can presign a PHI upload', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/files/presign', PRESIGN_AUDIO);
      expect(res.status).toBe(201);
      expect(res.data.fileId).toBeTruthy();
      expect(typeof res.data.uploadUrl).toBe('string');
      expect(res.data.uploadUrl.length).toBeGreaterThan(0);
      expect(res.data.s3Key).toContain(`tenants/`);
      expect(res.data.expiresInSec).toBeGreaterThan(0);
      expect(res.data.headers['content-type']).toBe(PRESIGN_AUDIO.mimeType);
      // PHI categories should get KMS encryption header.
      expect(res.data.headers['x-amz-server-side-encryption']).toBe('aws:kms');
    });

    it('DOCTOR can presign a public (non-PHI) upload', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.post(
        '/api/files/presign',
        PRESIGN_PUBLIC,
      );
      expect(res.status).toBe(201);
      expect(res.data.fileId).toBeTruthy();
      // Non-PHI category should NOT carry the KMS header.
      expect(res.data.headers['x-amz-server-side-encryption']).toBeUndefined();
    });

    it('RECEPTIONIST can presign a clinic logo upload (PATIENT_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const recp = await env.makeReceptionist(tenant);
      const res = await recp.client.axios.post(
        '/api/files/presign',
        PRESIGN_PUBLIC,
      );
      expect(res.status).toBe(201);
    });

    // TODO: enable when localstack S3 is running in CI. Without an actual PUT,
    // FilesService.confirm()'s HeadObject call will 404 the file. Until then
    // the success path of confirm() lives in the contract suite.
    it.skip('OWNER can confirm a successfully uploaded file (requires S3 PUT)', async () => {
      // 1. POST /api/files/presign → { uploadUrl, fileId }
      // 2. PUT the bytes to uploadUrl with the returned headers
      // 3. POST /api/files/confirm { fileId } → 200 { status: 'READY' }
    });
  });

  describe('RBAC denial', () => {
    it('PATIENT cannot presign an upload (lacks PATIENT_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post(
        '/api/files/presign',
        PRESIGN_AUDIO,
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot confirm an upload (lacks PATIENT_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post('/api/files/confirm', {
        fileId: 'whatever',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot confirm a Tenant A fileId (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const presign = await a.client.axios.post(
        '/api/files/presign',
        PRESIGN_AUDIO,
      );
      expect(presign.status).toBe(201);
      const aFileId = presign.data.fileId as string;

      const cross = await b.client.axios.post('/api/files/confirm', {
        fileId: aFileId,
      });
      // The file row is invisible to Tenant B under RLS — NotFound (or
      // ForbiddenException depending on how confirm() handles it).
      expect([403, 404]).toContain(cross.status);
    });

    it('confirm of an unknown fileId returns 404', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/files/confirm', {
        fileId: 'definitely-not-real',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated presign returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/files/presign', PRESIGN_AUDIO);
      expect(res.status).toBe(401);
    });

    it('unauthenticated confirm returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/files/confirm', { fileId: 'x' });
      expect(res.status).toBe(401);
    });
  });
});
