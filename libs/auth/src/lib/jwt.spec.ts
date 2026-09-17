import { describe, expect, it } from '@jest/globals';
import { JWT_AUDIENCES, signJwt, verifyJwt } from './jwt';

const secret = 'test-secret-that-is-definitely-32-chars-long';
const base = { sub: 'user_1', tid: 'tenant_1', role: 'DOCTOR' as const };

describe('jwt audiences', () => {
  it('a refresh token is not accepted as an access token, and vice versa', async () => {
    const refresh = await signJwt(
      { ...base, sid: 'sess_1' },
      { secret, audience: JWT_AUDIENCES.TENANT_REFRESH },
    );
    await expect(verifyJwt(refresh, { secret })).rejects.toThrow();
    const payload = await verifyJwt(refresh, {
      secret,
      audience: JWT_AUDIENCES.TENANT_REFRESH,
    });
    expect(payload.sid).toBe('sess_1');

    const access = await signJwt(base, { secret });
    await expect(
      verifyJwt(access, { secret, audience: JWT_AUDIENCES.TENANT_REFRESH }),
    ).rejects.toThrow();
  });

  it('a bootstrap token cannot be used as an access token', async () => {
    const boot = await signJwt(
      { sub: 'bootstrap', tid: 'tenant_1', role: 'OWNER', email: 'o@x.ph' },
      { secret, audience: JWT_AUDIENCES.BOOTSTRAP, expiresIn: '15m' },
    );
    await expect(verifyJwt(boot, { secret })).rejects.toThrow();
    const payload = await verifyJwt(boot, {
      secret,
      audience: JWT_AUDIENCES.BOOTSTRAP,
    });
    expect(payload.email).toBe('o@x.ph');
  });

  it('rejects a token signed with another secret', async () => {
    const t = await signJwt(base, {
      secret: 'another-secret-that-is-also-32-chars-long!',
    });
    await expect(verifyJwt(t, { secret })).rejects.toThrow();
  });
});
