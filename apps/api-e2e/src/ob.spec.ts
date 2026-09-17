/**
 * OB/GYN + Ultrasound happy paths.
 */
import { bootEnv, type E2EEnv } from './support/harness';

let env: E2EEnv;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('OB happy path', () => {
  it('creates a pregnancy with auto-EDD via Naegele\'s rule', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });

    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-${Date.now()}`,
      firstName: 'Sofia',
      lastName: 'Reyes',
      dateOfBirth: '1992-03-15',
      sex: 'FEMALE',
    });
    expect(patient.status).toBe(201);

    const lmp = '2026-01-01';
    const preg = await client.axios.post('/api/ob/pregnancies', {
      patientId: patient.data.id,
      lmp,
      gravida: 1,
      para: 0,
    });
    expect(preg.status).toBe(201);
    // EDD = LMP + 280 days = 2026-10-08.
    expect(String(preg.data.edd).slice(0, 10)).toBe('2026-10-08');
    expect(preg.data.eddSource).toBe('lmp');
    expect(preg.data.status).toBe('ACTIVE');
  });

  it('blocks a second active pregnancy on the same patient', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-${Date.now()}`,
      firstName: 'Anna',
      lastName: 'Bautista',
      dateOfBirth: '1991-07-20',
      sex: 'FEMALE',
    });

    const first = await client.axios.post('/api/ob/pregnancies', {
      patientId: patient.data.id,
      lmp: '2026-02-01',
    });
    expect(first.status).toBe(201);

    const second = await client.axios.post('/api/ob/pregnancies', {
      patientId: patient.data.id,
      lmp: '2026-03-01',
    });
    expect(second.status).toBe(400);
    expect(String(second.data.message)).toMatch(/already has an active pregnancy/i);
  });

  it('records a visit with auto-computed gestational age', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-${Date.now()}`,
      firstName: 'Lara',
      lastName: 'Garcia',
      dateOfBirth: '1993-11-11',
      sex: 'FEMALE',
    });

    // LMP 12 weeks ago — visit today should be ~12 weeks GA.
    const lmpDate = new Date();
    lmpDate.setDate(lmpDate.getDate() - 84); // 12 weeks
    const preg = await client.axios.post('/api/ob/pregnancies', {
      patientId: patient.data.id,
      lmp: lmpDate.toISOString().slice(0, 10),
    });
    expect(preg.status).toBe(201);

    const visit = await client.axios.post('/api/ob/visits', {
      pregnancyId: preg.data.id,
      fundalHeightCm: 12.5,
      fetalHeartRate: 145,
    });
    expect(visit.status).toBe(201);
    expect(visit.data.gaWeeks).toBe(12);
    // gaDays should be 0 ± 1 due to date math rounding.
    expect(visit.data.gaDays).toBeGreaterThanOrEqual(0);
    expect(visit.data.gaDays).toBeLessThanOrEqual(1);
    expect(Number(visit.data.fundalHeightCm)).toBeCloseTo(12.5);
    expect(visit.data.fetalHeartRate).toBe(145);
  });

  it('creates a 2D OB ultrasound report with biometry', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-${Date.now()}`,
      firstName: 'Tina',
      lastName: 'Lim',
      dateOfBirth: '1990-09-09',
      sex: 'FEMALE',
    });

    const preg = await client.axios.post('/api/ob/pregnancies', {
      patientId: patient.data.id,
      lmp: '2026-01-15',
    });

    const us = await client.axios.post('/api/ob/ultrasound', {
      patientId: patient.data.id,
      pregnancyId: preg.data.id,
      kind: 'OB_2D',
      indication: 'Anomaly scan',
      bpdMm: 65.2,
      hcMm: 240.5,
      acMm: 215.0,
      flMm: 50.3,
      estimatedFetalWeightG: 850,
      fetalHeartRate: 150,
      placentaLocation: 'anterior',
      findings: 'No gross anomalies detected.',
      impression: 'Normal anatomy scan at 24 weeks.',
    });
    expect(us.status).toBe(201);
    expect(us.data.kind).toBe('OB_2D');
    expect(Number(us.data.bpdMm)).toBeCloseTo(65.2);
    expect(us.data.estimatedFetalWeightG).toBe(850);

    // List should return the report.
    const list = await client.axios.get(
      `/api/ob/ultrasound?patientId=${patient.data.id}`,
    );
    expect(list.status).toBe(200);
    expect(list.data.length).toBeGreaterThanOrEqual(1);
  });
});
