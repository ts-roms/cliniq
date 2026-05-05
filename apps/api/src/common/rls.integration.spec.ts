/**
 * Cross-tenant RLS leak test.
 *
 * Requires:
 *  - A live Postgres reachable via DATABASE_URL
 *  - Both migrations applied (init + rls_policies)
 *  - The DATABASE_URL_APP env pointing at the same DB but as the cliniq_app role
 *
 * Skipped automatically when DATABASE_URL_APP is unset so unit-test runs don't fail in CI
 * environments that don't provision a database.
 */

import { Logger } from '@nestjs/common';
import { PrismaService } from '@org/db';
import { execSync } from 'node:child_process';

const APP_URL = process.env['DATABASE_URL_APP'];
const DESCRIBE = APP_URL ? describe : describe.skip;

DESCRIBE('RLS — cross-tenant isolation', () => {
  let svc: PrismaService;
  let tenantA: { id: string };
  let tenantB: { id: string };
  let patientA: { id: string };

  beforeAll(async () => {
    // Ensure migrations are applied (no-op if already up to date)
    try {
      execSync('pnpm --dir libs/db exec prisma migrate deploy', { stdio: 'pipe' });
    } catch (err) {
      Logger.warn(`prisma migrate deploy failed (continuing): ${(err as Error).message}`);
    }

    process.env['DATABASE_URL'] = APP_URL!;
    svc = new PrismaService();
    await svc.onModuleInit();

    // Seed two tenants and a patient in tenant A. Use admin connection
    // (raw query bypassing the app service) — RLS only applies to cliniq_app role.
    tenantA = await svc.tenant.create({
      data: { slug: `rls-a-${Date.now()}`, name: 'Tenant A' },
    });
    tenantB = await svc.tenant.create({
      data: { slug: `rls-b-${Date.now()}`, name: 'Tenant B' },
    });
    patientA = await svc.patient.create({
      data: {
        tenantId: tenantA.id,
        mrn: 'MRN-1',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: new Date('1990-01-01'),
        sex: 'MALE',
      },
    });
  });

  afterAll(async () => {
    if (svc) {
      await svc.patient.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
      await svc.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
      await svc.onModuleDestroy();
    }
  });

  it('returns the patient when context = tenant A', async () => {
    const found = await svc.withTenant(tenantA.id, null, async (tx) => {
      // Must SET ROLE to apply RLS in this test
      await tx.$executeRawUnsafe('SET LOCAL ROLE cliniq_app');
      return tx.patient.findUnique({ where: { id: patientA.id } });
    });
    expect(found?.id).toBe(patientA.id);
  });

  it('returns NOTHING when context = tenant B', async () => {
    const found = await svc.withTenant(tenantB.id, null, async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE cliniq_app');
      return tx.patient.findUnique({ where: { id: patientA.id } });
    });
    expect(found).toBeNull();
  });

  it('blocks cross-tenant write attempts', async () => {
    await expect(
      svc.withTenant(tenantB.id, null, async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE cliniq_app');
        return tx.patient.update({
          where: { id: patientA.id },
          data: { firstName: 'Hacked' },
        });
      }),
    ).rejects.toThrow();
  });
});
