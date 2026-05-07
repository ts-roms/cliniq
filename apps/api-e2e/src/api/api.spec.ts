import axios from 'axios';

describe('GET /api/health', () => {
  it('returns a health payload', async () => {
    const res = await axios.get(`/api/health`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      checks: { db: expect.stringMatching(/^(up|down)$/) },
    });
  });
});
