// Non-destructive password reset for tenant staff accounts.
//
// The gap this fills: the only existing way to "reseed" tenant logins was
// seed-dev.ts, which DELETES the demo tenant and recreates it — patients,
// appointments and all. guard-destructive-seed refuses to let it near
// Railway for exactly that reason. So there was no way to rotate a
// production demo password without destroying the data behind it.
//
// This touches three columns on `users` and nothing else:
//   passwordHash, failedLoginCount, lockedUntil
//
// It also revokes live refresh sessions for the users it resets. A password
// change has to invalidate sessions minted with the old one — the api's own
// reset-password path does that (auth.service.ts), but a direct database
// write bypasses it and would leave old refresh tokens valid for their full
// TTL, which is the opposite of what a rotation is for.
//
// Inputs (read from env):
//   RESET_PASSWORD   (required) the new password
//   RESET_TENANTS    (optional) comma-separated tenant slugs; default: all
//   RESET_EMAILS     (optional) comma-separated emails; overrides
//                    RESET_TENANTS and resets exactly these
//   RESET_APPLY      (required) must be "yes" — a dry run otherwise
//
// Dry run first, always:
//   DATABASE_URL='…' RESET_PASSWORD='…' pnpm tsx tools/scripts/reset-tenant-passwords.ts
//   DATABASE_URL='…' RESET_PASSWORD='…' RESET_APPLY=yes pnpm tsx …

import { hashPassword } from '@org/auth';
import { prisma } from '@org/db';

function list(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const password = process.env['RESET_PASSWORD'];
  if (!password) {
    console.error('✗ RESET_PASSWORD is required');
    process.exit(1);
  }
  if (!process.env['DATABASE_URL']) {
    console.error('✗ DATABASE_URL not set');
    process.exit(1);
  }
  const apply = process.env['RESET_APPLY'] === 'yes';
  const emails = list('RESET_EMAILS');
  const slugs = list('RESET_TENANTS');

  // Resolve the target set explicitly, so the dry run shows exactly the rows
  // that would change rather than a count.
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails }, deletedAt: null },
        select: { id: true, email: true },
        orderBy: { email: 'asc' },
      })
    : await prisma.user.findMany({
        where: {
          deletedAt: null,
          tenants: slugs.length
            ? { some: { tenant: { slug: { in: slugs }, deletedAt: null } } }
            : { some: { tenant: { deletedAt: null } } },
        },
        select: { id: true, email: true },
        orderBy: { email: 'asc' },
      });

  if (users.length === 0) {
    console.error('✗ no matching users — check RESET_EMAILS / RESET_TENANTS');
    process.exit(1);
  }

  console.log(
    `${apply ? 'Resetting' : 'DRY RUN — would reset'} ${users.length} account(s):`,
  );
  for (const u of users) console.log(`  ${u.email}`);

  if (!apply) {
    console.log('\nRe-run with RESET_APPLY=yes to apply.');
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await hashPassword(password);
  const ids = users.map((u) => u.id);

  const updated = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
  });
  const revoked = await prisma.refreshSession.updateMany({
    where: { userId: { in: ids }, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log(`\n✓ reset ${updated.count} account(s)`);
  console.log(`✓ revoked ${revoked.count} live refresh session(s)`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('✗ reset failed:', err);
  process.exit(1);
});
