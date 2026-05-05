// Idempotent catalog seeder. Re-runs safely (uses upsert by natural key).
// Run with: pnpm --dir libs/db exec prisma db seed
//
// Seeds ONLY global / shared catalogs (drugs with tenantId=null, ICD-10
// codes). Tenant-scoped data (admin user, demo clinic) is NOT seeded here —
// that lives in the deploy provisioning step.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { SEED_DRUGS } from './drugs.js';
import { SEED_ICD } from './icd-codes.js';

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL not set');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  console.log('▶ seeding global catalogs');

  // Drugs — match by (generic, brand, strength, form) tuple. Idempotent.
  let drugUpserts = 0;
  for (const d of SEED_DRUGS) {
    const existing = await prisma.drug.findFirst({
      where: {
        tenantId: null,
        generic: d.generic,
        brand: d.brand ?? null,
        strength: d.strength ?? null,
        form: d.form ?? null,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.drug.update({
        where: { id: existing.id },
        data: {
          atcCode: d.atcCode ?? null,
          classes: d.classes ?? [],
          controlled: d.controlled ?? false,
        },
      });
    } else {
      await prisma.drug.create({
        data: {
          tenantId: null,
          generic: d.generic,
          brand: d.brand ?? null,
          strength: d.strength ?? null,
          form: d.form ?? null,
          atcCode: d.atcCode ?? null,
          classes: d.classes ?? [],
          controlled: d.controlled ?? false,
        },
      });
      drugUpserts++;
    }
  }
  console.log(`  drugs:    ${SEED_DRUGS.length} processed, ${drugUpserts} new`);

  // ICD-10 — code is the PK; raw upsert is fine.
  let icdUpserts = 0;
  for (const c of SEED_ICD) {
    const result = await prisma.icdCode.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        description: c.description,
        chapter: c.chapter ?? null,
        billable: c.billable ?? true,
      },
      update: {
        description: c.description,
        chapter: c.chapter ?? null,
        billable: c.billable ?? true,
      },
    });
    if (result) icdUpserts++;
  }
  console.log(`  icd10:    ${SEED_ICD.length} upserted`);

  await prisma.$disconnect();
  console.log('✔ seed complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
