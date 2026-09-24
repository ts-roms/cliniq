/**
 * Amending a signed consultation.
 *
 * `complete` sets lockedAt and `update` then refuses the note — correctly, a
 * signed note is a medico-legal record. But the refusal told clinicians to
 * "create a revision instead" while no revision mechanism existed anywhere,
 * so a note signed with the wrong diagnosis could never be corrected. The
 * practical workaround — never completing a consult — quietly destroys the
 * lock's value, which is why this is a patient-safety fix and not paperwork.
 *
 * The contract:
 *   - locked notes are amended, never edited
 *   - the original row is never rewritten
 *   - each amendment is a complete snapshot, carrying forward what was not restated
 *   - a reason is required
 *   - amendments stack, and are themselves append-only
 */
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness.js';

jest.setTimeout(120_000);

describe('@org/api-e2e consultation amendments', () => {
  let env: E2EEnv;
  let tenant: E2ETenant;
  let client: E2EClient;

  beforeAll(async () => {
    env = await bootEnv();
    const made = await env.makeTenant({ plan: 'PREMIUM' });
    tenant = made.tenant;
    client = made.client;
  });

  afterAll(async () => {
    await env.cleanup();
  });

  /** A patient + a completed (locked) consultation with content in it. */
  async function signedConsult(): Promise<{
    consultId: string;
    patientId: string;
  }> {
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-AMD-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Amend',
      lastName: 'Target',
      dateOfBirth: '1979-02-02',
      sex: 'FEMALE',
    });
    expect(patient.status).toBe(201);

    const consult = await client.axios.post('/api/consultations', {
      patientId: patient.data.id,
    });
    expect(consult.status).toBe(201);

    const updated = await client.axios.patch(
      `/api/consultations/${consult.data.id}`,
      {
        subjective: { text: 'Cough for three days' },
        assessment: { text: 'Left lower lobe pneumonia' },
      },
    );
    expect(updated.status).toBe(200);

    const done = await client.axios.post(
      `/api/consultations/${consult.data.id}/complete`,
    );
    expect(done.status).toBe(201);
    expect(done.data.lockedAt).toBeTruthy();

    return { consultId: consult.data.id, patientId: patient.data.id };
  }

  describe('the lock still holds', () => {
    it('a locked consultation cannot be edited, and says where to go', async () => {
      const { consultId } = await signedConsult();
      const res = await client.axios.patch(`/api/consultations/${consultId}`, {
        assessment: { text: 'quietly changed' },
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toContain('amendments');
    });

    it('an unlocked consultation cannot be amended — edit it instead', async () => {
      const patient = await client.axios.post('/api/patients', {
        mrn: `MRN-AMD-U-${Math.random().toString(36).slice(2, 10)}`,
        firstName: 'Open',
        lastName: 'Consult',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
      });
      const consult = await client.axios.post('/api/consultations', {
        patientId: patient.data.id,
      });
      const res = await client.axios.post(
        `/api/consultations/${consult.data.id}/amendments`,
        { reason: 'too early', assessment: { text: 'x' } },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('amending', () => {
    it('records a correction without touching the original', async () => {
      const { consultId } = await signedConsult();

      const amendment = await client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        {
          reason: 'Wrong laterality — radiology reported RIGHT lower lobe',
          assessment: { text: 'Right lower lobe pneumonia' },
        },
      );
      expect(amendment.status).toBe(201);
      expect(amendment.data.version).toBe(1);
      expect(amendment.data.reason).toContain('Wrong laterality');
      expect(amendment.data.assessment).toEqual({
        text: 'Right lower lobe pneumonia',
      });

      // Carried forward, not blanked, because it was not restated.
      expect(amendment.data.subjective).toEqual({
        text: 'Cough for three days',
      });

      // The signed note itself is untouched.
      const consult = await client.axios.get(`/api/consultations/${consultId}`);
      expect(consult.data.assessment).toEqual({
        text: 'Left lower lobe pneumonia',
      });
      expect(consult.data.amendments).toHaveLength(1);
    });

    it('attributes the amendment and snapshots the author', async () => {
      const { consultId } = await signedConsult();
      const res = await client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { reason: 'typo in dose', plan: { text: 'Amoxicillin 500mg TID' } },
      );
      expect(res.status).toBe(201);
      expect(res.data.authorId).toBeTruthy();
      expect(res.data.authorName).toBeTruthy();
      expect(res.data.signedAt).toBeTruthy();
    });

    it('stacks — a correction to a correction', async () => {
      const { consultId } = await signedConsult();
      const first = await client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { reason: 'first pass', assessment: { text: 'v2' } },
      );
      expect(first.data.version).toBe(1);

      const second = await client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { reason: 'second pass', plan: { text: 'admit' } },
      );
      expect(second.data.version).toBe(2);
      // v2 carried the assessment set by v1, not the original.
      expect(second.data.assessment).toEqual({ text: 'v2' });

      const trail = await client.axios.get(
        `/api/consultations/${consultId}/amendments`,
      );
      expect(trail.status).toBe(200);
      expect(trail.data.map((a: { version: number }) => a.version)).toEqual([
        1, 2,
      ]);
    });

    it('validates ICD-10 codes the same as the note itself', async () => {
      const { consultId } = await signedConsult();
      const res = await client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { reason: 'coding correction', diagnosisCodes: ['NOT-A-CODE'] },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('a reason is required', () => {
    it.each([
      ['missing', {}],
      ['blank', { reason: '   ' }],
      ['too short', { reason: 'x' }],
    ])('refuses a %s reason', async (_label, body) => {
      const { consultId } = await signedConsult();
      const res = await client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { ...body, assessment: { text: 'changed' } },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('isolation and authorization', () => {
    it("tenant B cannot amend or read tenant A's note", async () => {
      const { consultId } = await signedConsult();
      const b = await env.makeTenant({ plan: 'PREMIUM' });

      const write = await b.client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { reason: 'cross-tenant attempt', assessment: { text: 'nope' } },
      );
      expect([403, 404]).toContain(write.status);

      const read = await b.client.axios.get(
        `/api/consultations/${consultId}/amendments`,
      );
      expect([403, 404]).toContain(read.status);
    });

    it('RECEPTIONIST cannot amend a clinical note', async () => {
      const { consultId } = await signedConsult();
      const receptionist = await env.makeReceptionist(tenant);
      const res = await receptionist.client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { reason: 'not my place', assessment: { text: 'nope' } },
      );
      expect(res.status).toBe(403);
    });

    it('a portal patient cannot amend or read amendments', async () => {
      const { consultId } = await signedConsult();
      const patient = await env.makePatient(tenant);
      const write = await patient.client.axios.post(
        `/api/consultations/${consultId}/amendments`,
        { reason: 'nope', assessment: { text: 'nope' } },
      );
      expect(write.status).toBe(403);
      const read = await patient.client.axios.get(
        `/api/consultations/${consultId}/amendments`,
      );
      expect(read.status).toBe(403);
    });
  });
});
