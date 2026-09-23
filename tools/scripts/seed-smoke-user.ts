// Idempotent smoke-account seeder. Production-safe: it creates/updates ONE
// user and ONE membership and touches nothing else — no tenant wipe, no
// patient data. The opposite of seed-dev.ts, which deletes the demo tenant
// and recreates it (never run that against Railway — guard-destructive-seed
// refuses to).
//
// Why a script and not a person's login: tools/scripts/smoke-login.mjs runs
// every 30 minutes against production and signs in for real. Pointing that at
// a human's account means their password rotation silently stops the
// monitoring, and means the account can never enroll MFA (the script cannot
// do TOTP). A dedicated, least-privilege account avoids both.
//
// RECEPTIONIST is the default role because the check only needs to reach
// /patients and /api/auth/me. Do not give it more.
//
// Inputs (read from env):
//   SMOKE_USER_EMAIL     (required)
//   SMOKE_USER_PASSWORD  (required, 16+ chars — this is a production
//                         credential that lives in CI, not a placeholder)
//   SMOKE_USER_TENANT    (required, tenant slug)
//   SMOKE_USER_NAME      (optional, defaults to "Smoke Check")
//   SMOKE_USER_ROLE      (optional, defaults to RECEPTIONIST)
//
// Behavior:
//   - user row: upserted by email (password reset on re-run)
//   - membership: upserted by (tenantId, userId), forced back to ACTIVE
//   - refuses if the tenant does not exist or is soft-deleted
//
// Run against Railway (via the TCP proxy):
//   DATABASE_URL='postgresql://…@<proxy-host>:<port>/railway?schema=public' \
//   SMOKE_USER_EMAIL=smoke@cliniq.ph SMOKE_USER_PASSWORD='…' \
//   SMOKE_USER_TENANT=demo \
//   pnpm tsx tools/scripts/seed-smoke-user.ts

import { hashPassword } from '@org/auth';
import { prisma, MemberStatus, Role } from '@org/db';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const email = requireEnv('SMOKE_USER_EMAIL').toLowerCase().trim();
  const password = requireEnv('SMOKE_USER_PASSWORD');
  const slug = requireEnv('SMOKE_USER_TENANT').toLowerCase().trim();
  const name = (process.env['SMOKE_USER_NAME'] ?? 'Smoke Check').trim();
  const roleInput = (
    process.env['SMOKE_USER_ROLE'] ?? 'RECEPTIONIST'
  ).toUpperCase();

  // No placeholder default here, unlike seed-platform-admin.ts: a weak
  // password on an account that exists purely to be logged into on a
  // schedule is a standing invitation.
  if (password.length < 16) {
    console.error('✗ SMOKE_USER_PASSWORD must be at least 16 characters');
    process.exit(1);
  }
  if (!email.includes('@')) {
    console.error('✗ SMOKE_USER_EMAIL must be a valid email');
    process.exit(1);
  }
  if (!(roleInput in Role)) {
    console.error(
      `✗ SMOKE_USER_ROLE must be one of: ${Object.keys(Role).join(', ')}`,
    );
    process.exit(1);
  }
  const role = Role[roleInput as keyof typeof Role];

  if (!process.env['DATABASE_URL']) {
    console.error('✗ DATABASE_URL not set');
    process.exit(1);
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.deletedAt) {
      console.error(`✗ tenant "${slug}" not found (or soft-deleted)`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, deletedAt: null },
      create: { email, name, passwordHash },
    });

    const membership = await prisma.tenantUser.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      // Force ACTIVE: a suspended smoke account would fail every run with a
      // 401 that looks exactly like a real outage.
      update: { role, status: MemberStatus.ACTIVE },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        role,
        status: MemberStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    console.log(`✓ Smoke account ready: ${email}`);
    console.log(`  tenant     ${tenant.slug} (${tenant.id})`);
    console.log(`  role       ${membership.role}`);
    console.log(`  user id    ${user.id}`);
    console.log('');
    console.log('  Set SMOKE_EMAIL / SMOKE_PASSWORD to these in CI secrets.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ seed failed:', err);
  process.exit(1);
});
