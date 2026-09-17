/**
 * /api/transcripts — STT bridge to ai-service.
 *
 * Single route: POST /api/transcripts — accepts { fileId }, confirms the
 * file landed in S3, then forwards to ai-service.
 *
 * Auth gate: Actions.AI_USE (DOCTOR/NURSE/ADMIN/OWNER hold it,
 * RECEPTIONIST/PATIENT do not — per libs/auth/src/lib/roles.ts).
 *
 * The full happy path requires:
 *   - S3 reachable (presign + actual upload)
 *   - ai-service running and reachable
 *   - Optional: AWS Transcribe / Whisper credentials
 * None of those are guaranteed in CI, so the happy-path it.skip'd below.
 * We assert auth and RBAC only — those don't require any infra.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

const BOGUS_BODY = { fileId: 'fake-file-id' };

describe('@org/api-e2e transcripts module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    // TODO: enable when ai-service + S3 are running in CI. Until then this
    // route is impossible to exercise end-to-end without seeding a real audio
    // file in the PHI bucket and standing up the STT stub.
    it.skip('DOCTOR can submit a CONSULT_AUDIO fileId and get a transcript back', async () => {
      // 1. presign + PUT a CONSULT_AUDIO file via /api/files/presign
      // 2. confirm + then POST /api/transcripts { fileId }
      // 3. expect 200 { transcript, provider, fileId }
    });
  });

  describe('RBAC denial', () => {
    it('RECEPTIONIST cannot call /api/transcripts (lacks AI_USE)', async () => {
      const { tenant } = await env.makeTenant();
      const recp = await env.makeReceptionist(tenant);
      const res = await recp.client.axios.post('/api/transcripts', BOGUS_BODY);
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot call /api/transcripts (lacks AI_USE)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post(
        '/api/transcripts',
        BOGUS_BODY,
      );
      expect(res.status).toBe(403);
    });

    it('DOCTOR passes the RBAC gate (NOT 403 — fileId is bogus so 400/404 expected)', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.post(
        '/api/transcripts',
        BOGUS_BODY,
      );
      // Anything except 403 proves AI_USE got through. 4xx (NotFound on file,
      // 429 on budget, 5xx from missing ai-service) are all acceptable here —
      // we're asserting the auth/RBAC layer alone.
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Tenant B cannot transcribe a Tenant A fileId (404 on file confirm)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      // Get a fileId from Tenant A via presign — no real upload needed for
      // the cross-tenant lookup test. confirm() will fail in B because the
      // file row is invisible under B's RLS context.
      const presign = await a.client.axios.post('/api/files/presign', {
        category: 'CONSULT_AUDIO',
        filename: 'rec.webm',
        mimeType: 'audio/webm',
        sizeBytes: 1024,
      });
      // Presign requires PATIENT_WRITE which OWNER has — expect 201.
      expect(presign.status).toBe(201);
      const aFileId = presign.data.fileId as string;

      const cross = await b.client.axios.post('/api/transcripts', {
        fileId: aFileId,
      });
      // ConfirmUploadDto resolution under B's tenant context can't see the
      // row → NotFound. Anything in [400, 403, 404] is acceptable; just not 200.
      expect(cross.status).not.toBe(200);
      expect([400, 403, 404, 500]).toContain(cross.status);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/transcripts', BOGUS_BODY);
      expect(res.status).toBe(401);
    });
  });
});
