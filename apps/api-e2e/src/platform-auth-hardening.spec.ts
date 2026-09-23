/**
 * Platform-operator auth hardening.
 *
 * Platform admins are not tenant-scoped and can change any tenant's plan and
 * status, yet until this pass their login had neither of the protections the
 * tenant side got: no lockout (an ip-keyed throttle only, which one attacker
 * with a handful of addresses walks straight past) and stateless refresh
 * JWTs, so `logout` cleared a cookie while the token stayed good for 7 days.
 *
 * These mirror auth-hardening.spec.ts one-for-one, against /platform/auth.
 *
 * Needs the api booted with THROTTLE_AUTH_LIMIT high enough for the run
 * (CI sets 1000) — five deliberate bad logins would otherwise hit the
 * throttle's 429 before the lockout's 401.
 */
import axios from 'axios';
import { bootEnv, type E2EEnv } from './support/harness';

let env: E2EEnv;
const http = () =>
  axios.create({
    baseURL: env.baseUrl,
    validateStatus: () => true,
    timeout: 20_000,
  });

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Platform refresh rotation, replay detection', () => {
  it('rotates on refresh and kills the family on replay', async () => {
    const admin = await env.makePlatformAdmin();
    const first = await http().post('/api/platform/auth/refresh', {
      refreshToken: admin.client.refreshToken,
    });
    expect(first.status).toBe(200);
    expect(first.data.refreshToken).not.toBe(admin.client.refreshToken);

    // Replaying the rotated token is the stolen-token signature: it must 401
    // AND take the successor down with it, or a thief keeps the session.
    const replay = await http().post('/api/platform/auth/refresh', {
      refreshToken: admin.client.refreshToken,
    });
    expect(replay.status).toBe(401);
    const family = await http().post('/api/platform/auth/refresh', {
      refreshToken: first.data.refreshToken,
    });
    expect(family.status).toBe(401);
  });

  it('the rotated access token still authenticates the console', async () => {
    const admin = await env.makePlatformAdmin();
    const rotated = await http().post('/api/platform/auth/refresh', {
      refreshToken: admin.client.refreshToken,
    });
    expect(rotated.status).toBe(200);
    const me = await http().get('/api/platform/auth/me', {
      headers: { authorization: `Bearer ${rotated.data.accessToken}` },
    });
    expect(me.status).toBe(200);
    expect(me.data.email).toBe(admin.email);
  });
});

describe('Platform logout', () => {
  it('logout revokes the presented session; logout-all revokes every session', async () => {
    const admin = await env.makePlatformAdmin();
    const second = await http().post('/api/platform/auth/login', {
      email: admin.email,
      password: admin.password,
    });
    expect(second.status).toBe(200);

    const out = await http().post('/api/platform/auth/logout', {
      refreshToken: admin.client.refreshToken,
    });
    expect(out.status).toBe(200);
    expect(out.data.revoked).toBe(1);
    expect(
      (
        await http().post('/api/platform/auth/refresh', {
          refreshToken: admin.client.refreshToken,
        })
      ).status,
    ).toBe(401);

    // The other session is untouched…
    expect(
      (
        await http().post('/api/platform/auth/refresh', {
          refreshToken: second.data.refreshToken,
        })
      ).status,
    ).toBe(200);

    // …until logout-all. Re-login first: the refresh above rotated `second`.
    const third = await http().post('/api/platform/auth/login', {
      email: admin.email,
      password: admin.password,
    });
    const all = await http().post(
      '/api/platform/auth/logout-all',
      {},
      { headers: { authorization: `Bearer ${third.data.accessToken}` } },
    );
    expect(all.status).toBe(200);
    expect(all.data.revoked).toBeGreaterThanOrEqual(1);
    expect(
      (
        await http().post('/api/platform/auth/refresh', {
          refreshToken: third.data.refreshToken,
        })
      ).status,
    ).toBe(401);
  });

  it('logout-all requires a platform session', async () => {
    const res = await http().post('/api/platform/auth/logout-all', {});
    expect(res.status).toBe(401);
  });

  it('logout with no token is a no-op, not an error', async () => {
    const res = await http().post('/api/platform/auth/logout', {});
    expect(res.status).toBe(200);
    expect(res.data.revoked).toBe(0);
  });
});

describe('Platform lockout', () => {
  it('locks the admin after repeated bad passwords, even with the right one afterwards', async () => {
    // Default AUTH_LOCKOUT_THRESHOLD=5; CI may lower it, never raise it.
    const admin = await env.makePlatformAdmin();
    for (let i = 0; i < 5; i++) {
      const r = await http().post('/api/platform/auth/login', {
        email: admin.email,
        password: 'WrongPassword!!',
      });
      expect(r.status).toBe(401);
    }
    const locked = await http().post('/api/platform/auth/login', {
      email: admin.email,
      password: admin.password,
    });
    expect(locked.status).toBe(401);
    expect(String(locked.data.message)).toMatch(/too many/i);
  });

  it('a successful login clears the failure counter', async () => {
    const admin = await env.makePlatformAdmin();
    for (let i = 0; i < 4; i++) {
      const r = await http().post('/api/platform/auth/login', {
        email: admin.email,
        password: 'WrongPassword!!',
      });
      expect(r.status).toBe(401);
    }
    // Under the threshold — the right password still works…
    const ok = await http().post('/api/platform/auth/login', {
      email: admin.email,
      password: admin.password,
    });
    expect(ok.status).toBe(200);

    // …and the counter reset, so four more misses still don't lock it.
    for (let i = 0; i < 4; i++) {
      await http().post('/api/platform/auth/login', {
        email: admin.email,
        password: 'WrongPassword!!',
      });
    }
    const still = await http().post('/api/platform/auth/login', {
      email: admin.email,
      password: admin.password,
    });
    expect(still.status).toBe(200);
  });

  it('does not leak whether an unknown address exists', async () => {
    const res = await http().post('/api/platform/auth/login', {
      email: `nobody-${Date.now()}@e2e.local`,
      password: 'WrongPassword!!',
    });
    expect(res.status).toBe(401);
    expect(String(res.data.message)).toMatch(/invalid credentials/i);
  });
});
