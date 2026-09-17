// Idempotent platform admin seeder. Production-safe — does NOT touch any
// tenant data. Use this on Railway (or any prod-like env) to bootstrap the
// first SaaS-side superadmin so they can sign in at `/platform/login`.
//
// Inputs (all required, read from env):
//   PLATFORM_ADMIN_EMAIL
//   PLATFORM_ADMIN_NAME
//   PLATFORM_ADMIN_PASSWORD   (12+ chars enforced)
//
// Behavior:
//   - If a row with that email exists: name + passwordHash are UPDATED
//     (effectively a password reset). `lastLogin`, `mfaEnabled`,
//     `mfaSecret`, `mfaBackupCodes` are preserved.
//   - If not: a new row is created with the given email/name and
//     mfaEnabled=false. The admin should enroll MFA on first login.
//
// Run locally against Railway:
//   railway run --service api \
//     env PLATFORM_ADMIN_EMAIL=you@example.com \
//         PLATFORM_ADMIN_NAME='Your Name' \
//         PLATFORM_ADMIN_PASSWORD='<32-char-strong-pass>' \
//     pnpm tsx tools/scripts/seed-platform-admin.ts
//
// Run locally against `.env`:
//   pnpm seed:platform-admin

import { hashPassword } from '@org/auth';
import { prisma } from '@org/db';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const email = requireEnv('PLATFORM_ADMIN_EMAIL').toLowerCase().trim();
  const name = requireEnv('PLATFORM_ADMIN_NAME').trim();
  const password = requireEnv('PLATFORM_ADMIN_PASSWORD');

  if (password.length < 12) {
    console.error('✗ PLATFORM_ADMIN_PASSWORD must be at least 12 characters');
    process.exit(1);
  }
  if (!email.includes('@')) {
    console.error('✗ PLATFORM_ADMIN_EMAIL must be a valid email');
    process.exit(1);
  }

  if (!process.env['DATABASE_URL']) {
    console.error(
      '✗ DATABASE_URL not set. On Railway, prefix with `railway run --service api …`',
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  try {
    const existing = await prisma.platformAdmin.findUnique({ where: { email } });

    if (existing) {
      const updated = await prisma.platformAdmin.update({
        where: { email },
        data: {
          name,
          passwordHash,
          deletedAt: null, // un-soft-delete if it was deleted
        },
      });
      console.log(`✓ Updated platform admin ${updated.email} (id=${updated.id})`);
      console.log('  Password reset. MFA state preserved.');
    } else {
      const created = await prisma.platformAdmin.create({
        data: { email, name, passwordHash },
      });
      console.log(`✓ Created platform admin ${created.email} (id=${created.id})`);
      console.log('  Sign in at https://<web>/platform/login and enroll MFA on first session.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ seed failed:', err);
  process.exit(1);
});
