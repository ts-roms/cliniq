/**
 * P0 auth hardening (docs/audit-checklist.md):
 *
 *   - /auth/register is invite-only: a tenant slug alone no longer gets you in
 *   - the split signup flow still works via the one-shot bootstrap token
 *   - members module: invite → accept → role change → suspend → remove,
 *     with the last-owner and self-edit guards
 *   - refresh tokens rotate; replaying a rotated token revokes the family
 *   - logout revokes; suspension revokes
 *   - forgot / reset password (token surfaced via AUTH_EXPOSE_DEBUG_TOKENS)
 *   - lockout after repeated bad passwords
 *
 * Needs the api booted with THROTTLE_AUTH_LIMIT high enough for a test run
 * (CI sets 1000) and AUTH_EXPOSE_DEBUG_TOKENS=true for the reset case (it is
 * skipped otherwise).
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

const PASSWORD = 'TestPassword123!';
const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Registration is invite-only', () => {
  it('rejects a register call that only knows the tenant slug', async () => {
    const { tenant } = await env.makeTenant();
    const res = await http().post('/api/auth/register', {
      email: `intruder-${uniq()}@e2e.local`,
      name: 'Intruder',
      password: PASSWORD,
      tenantSlug: tenant.slug,
    });
    expect(res.status).toBe(403);
  });

  it('rejects a bogus invite token', async () => {
    const { tenant } = await env.makeTenant();
    const res = await http().post('/api/auth/register', {
      email: `intruder-${uniq()}@e2e.local`,
      name: 'Intruder',
      password: PASSWORD,
      tenantSlug: tenant.slug,
      inviteToken: 'definitely-not-a-real-token-0000000000',
    });
    expect(res.status).toBe(403);
  });

  it('split signup: tenant create without a password returns a bootstrap token that registers the first OWNER once', async () => {
    const slug = `e2e-boot-${uniq()}`;
    const ownerEmail = `${slug}@e2e.local`;
    const created = await http().post('/api/tenants', {
      slug,
      name: 'Bootstrap Clinic',
      ownerEmail,
      ownerName: 'Dr. Boot',
    });
    expect(created.status).toBe(201);
    expect(typeof created.data.bootstrapToken).toBe('string');

    // Wrong email for the token → refused.
    const wrongEmail = await http().post('/api/auth/register', {
      email: `someone-else-${uniq()}@e2e.local`,
      name: 'Not The Owner',
      password: PASSWORD,
      tenantSlug: slug,
      bootstrapToken: created.data.bootstrapToken,
    });
    expect(wrongEmail.status).toBe(403);

    const registered = await http().post('/api/auth/register', {
      email: ownerEmail,
      name: 'Dr. Boot',
      password: PASSWORD,
      tenantSlug: slug,
      bootstrapToken: created.data.bootstrapToken,
    });
    expect(registered.status).toBe(201);
    expect(registered.data.user.role).toBe('OWNER');

    // Second use of the same token → refused (tenant now has an owner).
    const again = await http().post('/api/auth/register', {
      email: `second-${uniq()}@e2e.local`,
      name: 'Second',
      password: PASSWORD,
      tenantSlug: slug,
      bootstrapToken: created.data.bootstrapToken,
    });
    expect(again.status).toBe(403);
  });
});

describe('Members: invite → accept → manage', () => {
  it('runs the full staff lifecycle with the owner/admin guards', async () => {
    const { client: owner, tenant } = await env.makeTenant();

    // Owner invites a doctor.
    const docEmail = `doc-${uniq()}@e2e.local`;
    const invite = await owner.axios.post('/api/members/invites', {
      email: docEmail,
      role: 'DOCTOR',
    });
    expect(invite.status).toBe(201);
    expect(invite.data.inviteUrl).toContain('/signup?invite=');
    const token = new URL(invite.data.inviteUrl).searchParams.get('invite')!;
    expect(token).toBeTruthy();

    // Pending list shows it, without the token.
    const pending = await owner.axios.get('/api/members/invites');
    expect(pending.status).toBe(200);
    expect(
      pending.data.some((i: { id: string }) => i.id === invite.data.id),
    ).toBe(true);
    expect(JSON.stringify(pending.data)).not.toContain(token);

    // Public preview works for the accept page.
    const preview = await http().get('/api/members/invites/preview', {
      params: { token },
    });
    expect(preview.status).toBe(200);
    expect(preview.data).toMatchObject({
      email: docEmail,
      role: 'DOCTOR',
      tenantSlug: tenant.slug,
    });

    // Wrong email on accept → refused.
    const wrong = await http().post('/api/auth/register', {
      email: `other-${uniq()}@e2e.local`,
      name: 'Wrong Person',
      password: PASSWORD,
      tenantSlug: tenant.slug,
      inviteToken: token,
    });
    expect(wrong.status).toBe(403);

    // Right email → joins as DOCTOR.
    const accepted = await http().post('/api/auth/register', {
      email: docEmail,
      name: 'Dr. Invited',
      password: PASSWORD,
      tenantSlug: tenant.slug,
      inviteToken: token,
    });
    expect(accepted.status).toBe(201);
    expect(accepted.data.user.role).toBe('DOCTOR');
    const doctorAccess = accepted.data.accessToken as string;
    const doctorRefresh = accepted.data.refreshToken as string;

    // Invite is single-use.
    const replay = await http().post('/api/auth/register', {
      email: docEmail,
      name: 'Dr. Invited',
      password: PASSWORD,
      tenantSlug: tenant.slug,
      inviteToken: token,
    });
    expect([403, 409]).toContain(replay.status);
    const previewAfter = await http().get('/api/members/invites/preview', {
      params: { token },
    });
    expect(previewAfter.status).toBe(404);

    // Doctor can't invite (no USER_INVITE).
    const docClient = axios.create({
      baseURL: env.baseUrl,
      headers: { authorization: `Bearer ${doctorAccess}` },
      validateStatus: () => true,
    });
    const docInvite = await docClient.post('/api/members/invites', {
      email: `x-${uniq()}@e2e.local`,
      role: 'NURSE',
    });
    expect(docInvite.status).toBe(403);

    // Member list shows both; find the doctor's membership id.
    const members = await owner.axios.get('/api/members');
    expect(members.status).toBe(200);
    const docMember = members.data.find(
      (m: { user: { email: string } }) => m.user.email === docEmail,
    );
    expect(docMember).toBeTruthy();
    const ownerMember = members.data.find(
      (m: { role: string }) => m.role === 'OWNER',
    );

    // Owner cannot edit own membership; cannot demote the last owner.
    const selfEdit = await owner.axios.patch(
      `/api/members/${ownerMember.id}/role`,
      { role: 'ADMIN' },
    );
    expect(selfEdit.status).toBe(400);

    // Promote doctor → ADMIN; their old refresh token is now dead.
    const promote = await owner.axios.patch(
      `/api/members/${docMember.id}/role`,
      { role: 'ADMIN' },
    );
    expect(promote.status).toBe(200);
    expect(promote.data.role).toBe('ADMIN');
    const deadRefresh = await http().post('/api/auth/refresh', {
      refreshToken: doctorRefresh,
    });
    expect(deadRefresh.status).toBe(401);

    // Fresh login as the now-ADMIN; ADMIN may not grant OWNER.
    const adminLogin = await http().post('/api/auth/login', {
      email: docEmail,
      password: PASSWORD,
    });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.data.user.role).toBe('ADMIN');
    const adminClient = axios.create({
      baseURL: env.baseUrl,
      headers: { authorization: `Bearer ${adminLogin.data.accessToken}` },
      validateStatus: () => true,
    });
    const grantOwner = await adminClient.post('/api/members/invites', {
      email: `o-${uniq()}@e2e.local`,
      role: 'OWNER',
    });
    expect(grantOwner.status).toBe(403);
    const touchOwner = await adminClient.patch(
      `/api/members/${ownerMember.id}/status`,
      { status: 'SUSPENDED' },
    );
    expect(touchOwner.status).toBe(403);

    // Suspend the admin → refresh dead, login refused.
    const suspend = await owner.axios.patch(
      `/api/members/${docMember.id}/status`,
      { status: 'SUSPENDED' },
    );
    expect(suspend.status).toBe(200);
    const refreshAfterSuspend = await http().post('/api/auth/refresh', {
      refreshToken: adminLogin.data.refreshToken,
    });
    expect(refreshAfterSuspend.status).toBe(401);
    const loginSuspended = await http().post('/api/auth/login', {
      email: docEmail,
      password: PASSWORD,
    });
    expect(loginSuspended.status).toBe(401);

    // Reactivate, then remove.
    const reactivate = await owner.axios.patch(
      `/api/members/${docMember.id}/status`,
      { status: 'ACTIVE' },
    );
    expect(reactivate.status).toBe(200);
    const remove = await owner.axios.delete(`/api/members/${docMember.id}`);
    expect(remove.status).toBe(200);
    const after = await owner.axios.get('/api/members');
    expect(after.data.some((m: { id: string }) => m.id === docMember.id)).toBe(
      false,
    );

    // Removing the last owner is refused (via a second owner path: none exists).
    const removeOwner = await owner.axios.delete(
      `/api/members/${ownerMember.id}`,
    );
    expect(removeOwner.status).toBe(400);
  });

  it('revoked invites cannot be redeemed', async () => {
    const { client: owner, tenant } = await env.makeTenant();
    const email = `rev-${uniq()}@e2e.local`;
    const invite = await owner.axios.post('/api/members/invites', {
      email,
      role: 'NURSE',
    });
    const token = new URL(invite.data.inviteUrl).searchParams.get('invite')!;
    const revoke = await owner.axios.delete(
      `/api/members/invites/${invite.data.id}`,
    );
    expect(revoke.status).toBe(200);
    const res = await http().post('/api/auth/register', {
      email,
      name: 'Nurse',
      password: PASSWORD,
      tenantSlug: tenant.slug,
      inviteToken: token,
    });
    expect(res.status).toBe(403);
  });

  it('invites are invisible across tenants', async () => {
    const A = await env.makeTenant();
    const B = await env.makeTenant();
    const invite = await A.client.axios.post('/api/members/invites', {
      email: `iso-${uniq()}@e2e.local`,
      role: 'NURSE',
    });
    expect(invite.status).toBe(201);
    const listB = await B.client.axios.get('/api/members/invites');
    expect(listB.status).toBe(200);
    expect(
      listB.data.some((i: { id: string }) => i.id === invite.data.id),
    ).toBe(false);
    const revokeB = await B.client.axios.delete(
      `/api/members/invites/${invite.data.id}`,
    );
    expect(revokeB.status).toBe(404);
  });
});

describe('Refresh rotation, replay detection, logout', () => {
  it('rotates on refresh and kills the family on replay', async () => {
    const { client } = await env.makeTenant();
    const first = await http().post('/api/auth/refresh', {
      refreshToken: client.refreshToken,
    });
    expect(first.status).toBe(200);
    expect(first.data.refreshToken).not.toBe(client.refreshToken);

    // Replaying the original (rotated) token → 401 AND the new one dies too.
    const replay = await http().post('/api/auth/refresh', {
      refreshToken: client.refreshToken,
    });
    expect(replay.status).toBe(401);
    const family = await http().post('/api/auth/refresh', {
      refreshToken: first.data.refreshToken,
    });
    expect(family.status).toBe(401);
  });

  it('logout revokes the presented session; logout-all revokes every session', async () => {
    const { client, tenant } = await env.makeTenant();
    const second = await http().post('/api/auth/login', {
      email: tenant.ownerEmail,
      password: PASSWORD,
    });
    expect(second.status).toBe(200);

    const out = await client.axios.post('/api/auth/logout', {
      refreshToken: client.refreshToken,
    });
    expect(out.status).toBe(200);
    expect(out.data.revoked).toBe(1);
    expect(
      (
        await http().post('/api/auth/refresh', {
          refreshToken: client.refreshToken,
        })
      ).status,
    ).toBe(401);
    // The other device still works…
    expect(
      (
        await http().post('/api/auth/refresh', {
          refreshToken: second.data.refreshToken,
        })
      ).status,
    ).toBe(200);

    // …until logout-all.
    const third = await http().post('/api/auth/login', {
      email: tenant.ownerEmail,
      password: PASSWORD,
    });
    const all = await axios.post(
      `${env.baseUrl}/api/auth/logout-all`,
      {},
      {
        headers: { authorization: `Bearer ${third.data.accessToken}` },
        validateStatus: () => true,
      },
    );
    expect(all.status).toBe(200);
    expect(all.data.revoked).toBeGreaterThanOrEqual(1);
    expect(
      (
        await http().post('/api/auth/refresh', {
          refreshToken: third.data.refreshToken,
        })
      ).status,
    ).toBe(401);
  });
});

describe('Forgot / reset password', () => {
  it('answers 200 for unknown emails (no enumeration)', async () => {
    const res = await http().post('/api/auth/forgot-password', {
      email: `nobody-${uniq()}@e2e.local`,
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
  });

  it('resets the password, revokes sessions, and burns the token', async () => {
    const { client, tenant } = await env.makeTenant();
    const forgot = await http().post('/api/auth/forgot-password', {
      email: tenant.ownerEmail,
    });
    expect(forgot.status).toBe(200);
    if (!forgot.data.debugToken) {
      console.warn(
        'AUTH_EXPOSE_DEBUG_TOKENS not set on the api — skipping reset assertions',
      );
      return;
    }
    const newPassword = 'BrandNewPassword456!';
    const reset = await http().post('/api/auth/reset-password', {
      token: forgot.data.debugToken,
      password: newPassword,
    });
    expect(reset.status).toBe(200);

    // Old password dead, new one works, old refresh session revoked, token single-use.
    expect(
      (
        await http().post('/api/auth/login', {
          email: tenant.ownerEmail,
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await http().post('/api/auth/login', {
          email: tenant.ownerEmail,
          password: newPassword,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await http().post('/api/auth/refresh', {
          refreshToken: client.refreshToken,
        })
      ).status,
    ).toBe(401);
    const again = await http().post('/api/auth/reset-password', {
      token: forgot.data.debugToken,
      password: newPassword,
    });
    expect(again.status).toBe(403);
  });
});

describe('Lockout', () => {
  it('locks the account after repeated bad passwords, even with the right password afterwards', async () => {
    // Default AUTH_LOCKOUT_THRESHOLD=5; CI may lower it, never raise it.
    const { tenant } = await env.makeTenant();
    for (let i = 0; i < 5; i++) {
      const r = await http().post('/api/auth/login', {
        email: tenant.ownerEmail,
        password: 'WrongPassword!!',
      });
      expect(r.status).toBe(401);
    }
    const locked = await http().post('/api/auth/login', {
      email: tenant.ownerEmail,
      password: PASSWORD,
    });
    expect(locked.status).toBe(401);
    expect(String(locked.data.message)).toMatch(/too many/i);
  });
});
