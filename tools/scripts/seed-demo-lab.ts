/**
 * Demo seed for the lab module. Creates a paired set of tenants — one LAB
 * and one CLINIC — with an active link between them, a small product
 * catalog, materials with lots, and a handful of cases in mixed states
 * (so the lab Cases inbox, Stats panel, and Billing page all show
 * something realistic to a prospect).
 *
 * Run with:  pnpm exec tsx --env-file=.env tools/scripts/seed-demo-lab.ts
 *
 * Re-runs are safe: anything tied to the demo slugs (`demo-lab` and
 * `demo-clinic`) is wiped first via Tenant cascade, then recreated.
 *
 * Login credentials after seeding:
 *   Lab owner:    lab-owner@demo.local    / Password123!
 *   Clinic owner: clinic-owner@demo.local / Password123!
 */
import {
  prisma,
  LabCaseStatus,
  LabCaseUrgency,
  LabClinicLinkStatus,
  LabInvoiceStatus,
  LabPlan,
  LabProductPricingMode,
  LabSpecialty,
  MemberStatus,
  Plan,
  Role,
  TenantKind,
  TenantStatus,
} from '@org/db';
import { hashPassword } from '@org/auth';

const LAB_SLUG = 'demo-lab';
const CLINIC_SLUG = 'demo-clinic';
const PASSWORD = 'Password123!';

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  // ── Wipe any existing demo tenants ─────────────────────
  for (const slug of [LAB_SLUG, CLINIC_SLUG]) {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (!existing) continue;
    const memberUserIds = (
      await prisma.tenantUser.findMany({
        where: { tenantId: existing.id },
        select: { userId: true },
      })
    ).map((m: { userId: string }) => m.userId);
    await prisma.tenant.delete({ where: { id: existing.id } });
    if (memberUserIds.length) {
      const stillMembers = await prisma.tenantUser.findMany({
        where: { userId: { in: memberUserIds } },
        select: { userId: true },
      });
      const stillIn = new Set(stillMembers.map((m: { userId: string }) => m.userId));
      const orphans = memberUserIds.filter((id: string) => !stillIn.has(id));
      if (orphans.length) {
        await prisma.user.deleteMany({ where: { id: { in: orphans } } });
      }
    }
    console.log(`  wiped tenant "${slug}"`);
  }

  // ── Tenants ─────────────────────────────────────────────
  console.log('→ Creating tenants');
  const lab = await prisma.tenant.create({
    data: {
      slug: LAB_SLUG,
      name: 'Cebu Dental Lab (demo)',
      kind: TenantKind.LAB,
      labSpecialty: LabSpecialty.FULL_SERVICE,
      labPlan: LabPlan.LAB_PREMIUM, // unlock all lab features for demo
      status: TenantStatus.ACTIVE,
    },
  });
  const clinic = await prisma.tenant.create({
    data: {
      slug: CLINIC_SLUG,
      name: 'Manila Smile Clinic (demo)',
      kind: TenantKind.CLINIC,
      plan: Plan.PRO,
      status: TenantStatus.ACTIVE,
    },
  });

  // ── Owner users ─────────────────────────────────────────
  const labOwner = await prisma.user.upsert({
    where: { email: 'lab-owner@demo.local' },
    update: { passwordHash },
    create: { email: 'lab-owner@demo.local', name: 'Lab Owner', passwordHash },
  });
  const clinicOwner = await prisma.user.upsert({
    where: { email: 'clinic-owner@demo.local' },
    update: { passwordHash },
    create: { email: 'clinic-owner@demo.local', name: 'Clinic Owner', passwordHash },
  });

  await prisma.tenantUser.create({
    data: {
      tenantId: lab.id,
      userId: labOwner.id,
      role: Role.OWNER,
      status: MemberStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await prisma.tenantUser.create({
    data: {
      tenantId: clinic.id,
      userId: clinicOwner.id,
      role: Role.OWNER,
      status: MemberStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });

  // ── Lab → Clinic link (ACTIVE) ──────────────────────────
  console.log('→ Linking lab and clinic');
  await prisma.labClinicLink.create({
    data: {
      labTenantId: lab.id,
      clinicTenantId: clinic.id,
      status: LabClinicLinkStatus.ACTIVE,
      invitedAt: daysAgo(45),
      respondedAt: daysAgo(44),
    },
  });

  // ── Catalog: categories + products ──────────────────────
  console.log('→ Seeding catalog');
  const crowns = await prisma.labProductCategory.create({
    data: { tenantId: lab.id, name: 'Crowns & Bridges', sortOrder: 1 },
  });
  const aligners = await prisma.labProductCategory.create({
    data: { tenantId: lab.id, name: 'Clear Aligners', sortOrder: 2 },
  });
  const dentures = await prisma.labProductCategory.create({
    data: { tenantId: lab.id, name: 'Removable Prosthetics', sortOrder: 3 },
  });

  const productSpecs = [
    {
      categoryId: crowns.id,
      sku: 'CROWN-PFM',
      name: 'PFM crown',
      description: 'Porcelain-fused-to-metal crown — 7 working days.',
      defaultPrice: 350000, // ₱3,500
      phases: ['Impression review', 'Wax-up', 'Casting', 'Porcelain', 'Finishing', 'QA'],
    },
    {
      categoryId: crowns.id,
      sku: 'CROWN-ZIRC',
      name: 'Zirconia crown',
      description: 'Full-zirconia crown — 5 working days.',
      defaultPrice: 580000, // ₱5,800
      phases: ['Scan review', 'CAD design', 'Milling', 'Sintering', 'Finishing', 'QA'],
    },
    {
      categoryId: aligners.id,
      sku: 'ALIGN-SET-10',
      name: 'Clear aligner set (10 stages)',
      description: 'Custom thermoformed aligners — 14 working days.',
      defaultPrice: 4500000, // ₱45,000
      pricingMode: LabProductPricingMode.ADJUST_ON_ORDER,
      phases: ['Scan review', 'Setup design', 'Doctor approval', 'Fabrication', 'QA'],
    },
    {
      categoryId: dentures.id,
      sku: 'DENT-FULL',
      name: 'Full denture',
      description: 'Complete upper or lower denture — 14 working days.',
      defaultPrice: 1500000, // ₱15,000
      phases: ['Impression', 'Bite registration', 'Try-in', 'Finishing', 'QA'],
    },
  ];

  const products: Record<string, { id: string; defaultPrice: number; currency: string }> = {};
  for (const p of productSpecs) {
    const created = await prisma.labProduct.create({
      data: {
        tenantId: lab.id,
        categoryId: p.categoryId,
        sku: p.sku,
        name: p.name,
        description: p.description,
        defaultPrice: p.defaultPrice,
        currency: 'PHP',
        pricingMode: p.pricingMode ?? LabProductPricingMode.FIXED,
        phases: p.phases,
        isActive: true,
      },
    });
    products[p.sku] = {
      id: created.id,
      defaultPrice: p.defaultPrice,
      currency: 'PHP',
    };
  }

  // ── Materials + lots ────────────────────────────────────
  console.log('→ Seeding materials');
  const zirconia = await prisma.labMaterial.create({
    data: {
      tenantId: lab.id,
      sku: 'MAT-ZIRC-A2',
      name: 'Zirconia disc A2',
      category: 'Ceramic',
      unitOfMeasure: 'disc',
      defaultSupplier: 'IPS e.max',
    },
  });
  await prisma.labMaterialLot.create({
    data: {
      materialId: zirconia.id,
      lotNumber: 'LOT-2026-04-Z101',
      manufacturer: 'IPS e.max',
      supplier: 'Local distributor',
      initialQty: 12,
      remainingQty: 9,
      unitPriceCents: 250000,
      receivedAt: daysAgo(30),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  });
  const acrylic = await prisma.labMaterial.create({
    data: {
      tenantId: lab.id,
      sku: 'MAT-PMMA',
      name: 'PMMA puck',
      category: 'Polymer',
      unitOfMeasure: 'puck',
    },
  });
  await prisma.labMaterialLot.create({
    data: {
      materialId: acrylic.id,
      lotNumber: 'LOT-2026-03-P204',
      initialQty: 20,
      remainingQty: 14,
      unitPriceCents: 80000,
      receivedAt: daysAgo(60),
      status: 'ACTIVE',
    },
  });

  // ── Cases in mixed states ───────────────────────────────
  console.log('→ Seeding cases');
  let nextRef = 1;
  type CaseSpec = {
    sku: keyof typeof products | string;
    status: LabCaseStatus;
    urgency?: LabCaseUrgency;
    patient: string;
    doctor: string;
    notes?: string;
    daysAgoCreated: number;
    daysAgoSubmitted?: number;
    daysAgoAccepted?: number;
    daysAgoCompleted?: number;
    daysAgoShipped?: number;
    daysAgoDelivered?: number;
    overrideUnitPrice?: number; // for ADJUST_ON_ORDER products
  };
  const caseSpecs: CaseSpec[] = [
    {
      sku: 'CROWN-PFM',
      status: LabCaseStatus.SUBMITTED,
      patient: 'M. Cruz',
      doctor: 'Dr. Reyes',
      notes: 'Tooth 36, shade A2.',
      daysAgoCreated: 2,
      daysAgoSubmitted: 2,
    },
    {
      sku: 'CROWN-ZIRC',
      status: LabCaseStatus.IN_PROGRESS,
      urgency: LabCaseUrgency.URGENT,
      patient: 'A. Bonifacio',
      doctor: 'Dr. Reyes',
      notes: 'Tooth 14, shade B1. Urgent — wedding next week.',
      daysAgoCreated: 4,
      daysAgoSubmitted: 4,
      daysAgoAccepted: 3,
    },
    {
      sku: 'CROWN-PFM',
      status: LabCaseStatus.AWAITING_PICKUP,
      patient: 'P. Garcia',
      doctor: 'Dr. Mendoza',
      daysAgoCreated: 9,
      daysAgoSubmitted: 9,
      daysAgoAccepted: 8,
      daysAgoCompleted: 1,
    },
    {
      sku: 'CROWN-ZIRC',
      status: LabCaseStatus.SHIPPED,
      patient: 'L. Aquino',
      doctor: 'Dr. Reyes',
      daysAgoCreated: 11,
      daysAgoSubmitted: 11,
      daysAgoAccepted: 10,
      daysAgoCompleted: 4,
      daysAgoShipped: 1,
    },
    {
      sku: 'CROWN-PFM',
      status: LabCaseStatus.DELIVERED,
      patient: 'J. Rizal',
      doctor: 'Dr. Mendoza',
      daysAgoCreated: 18,
      daysAgoSubmitted: 18,
      daysAgoAccepted: 17,
      daysAgoCompleted: 12,
      daysAgoShipped: 11,
      daysAgoDelivered: 9,
    },
    {
      sku: 'CROWN-ZIRC',
      status: LabCaseStatus.DELIVERED,
      patient: 'A. Luna',
      doctor: 'Dr. Reyes',
      daysAgoCreated: 22,
      daysAgoSubmitted: 22,
      daysAgoAccepted: 21,
      daysAgoCompleted: 16,
      daysAgoShipped: 15,
      daysAgoDelivered: 14,
    },
    {
      sku: 'DENT-FULL',
      status: LabCaseStatus.DELIVERED,
      patient: 'V. Diego',
      doctor: 'Dr. Mendoza',
      daysAgoCreated: 35,
      daysAgoSubmitted: 35,
      daysAgoAccepted: 34,
      daysAgoCompleted: 22,
      daysAgoShipped: 21,
      daysAgoDelivered: 20,
    },
    {
      sku: 'ALIGN-SET-10',
      status: LabCaseStatus.IN_PROGRESS,
      patient: 'C. Sotto',
      doctor: 'Dr. Reyes',
      notes: '10-stage upper. Custom price negotiated.',
      daysAgoCreated: 6,
      daysAgoSubmitted: 6,
      daysAgoAccepted: 5,
      overrideUnitPrice: 4200000, // ₱42,000
    },
  ];

  const deliveredCases: Array<{ id: string; unitPrice: number; productName: string; refNumber: number }> = [];
  for (const spec of caseSpecs) {
    const product = products[spec.sku];
    if (!product) continue;
    const ref = nextRef++;
    const unitPrice = spec.overrideUnitPrice ?? product.defaultPrice;
    const created = await prisma.labCase.create({
      data: {
        labTenantId: lab.id,
        clinicTenantId: clinic.id,
        productId: product.id,
        refNumber: ref,
        unitPrice,
        currency: product.currency,
        status: spec.status,
        urgency: spec.urgency ?? LabCaseUrgency.STANDARD,
        patientLabel: spec.patient,
        doctorLabel: spec.doctor,
        notes: spec.notes ?? null,
        createdByUserId: clinicOwner.id,
        acceptedByUserId:
          spec.daysAgoAccepted !== undefined ? labOwner.id : null,
        createdAt: daysAgo(spec.daysAgoCreated),
        submittedAt: spec.daysAgoSubmitted !== undefined ? daysAgo(spec.daysAgoSubmitted) : null,
        acceptedAt: spec.daysAgoAccepted !== undefined ? daysAgo(spec.daysAgoAccepted) : null,
        completedAt: spec.daysAgoCompleted !== undefined ? daysAgo(spec.daysAgoCompleted) : null,
        shippedAt: spec.daysAgoShipped !== undefined ? daysAgo(spec.daysAgoShipped) : null,
        deliveredAt: spec.daysAgoDelivered !== undefined ? daysAgo(spec.daysAgoDelivered) : null,
      },
      include: { product: { select: { name: true } } },
    });
    if (spec.status === LabCaseStatus.DELIVERED) {
      deliveredCases.push({
        id: created.id,
        unitPrice,
        productName: created.product.name,
        refNumber: ref,
      });
    }
  }

  // ── Invoices: one PAID, one ISSUED, one DRAFT ───────────
  if (deliveredCases.length >= 3) {
    console.log('→ Seeding invoices');
    const [paidCase, issuedCase, draftCase] = deliveredCases;

    const paidInvoice = await prisma.labInvoice.create({
      data: {
        labTenantId: lab.id,
        clinicTenantId: clinic.id,
        refNumber: 1,
        status: LabInvoiceStatus.PAID,
        currency: 'PHP',
        subtotalCents: paidCase.unitPrice,
        taxCents: 0,
        totalCents: paidCase.unitPrice,
        paidCents: paidCase.unitPrice,
        issuedAt: daysAgo(15),
        dueAt: daysAgo(0),
        paidAt: daysAgo(8),
        createdByUserId: labOwner.id,
        createdAt: daysAgo(15),
        items: {
          create: [
            {
              caseId: paidCase.id,
              description: `${paidCase.productName} — case #${paidCase.refNumber}`,
              qty: 1,
              unitPriceCents: paidCase.unitPrice,
              amountCents: paidCase.unitPrice,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    await prisma.labInvoice.create({
      data: {
        labTenantId: lab.id,
        clinicTenantId: clinic.id,
        refNumber: 2,
        status: LabInvoiceStatus.ISSUED,
        currency: 'PHP',
        subtotalCents: issuedCase.unitPrice,
        taxCents: 0,
        totalCents: issuedCase.unitPrice,
        paidCents: 0,
        issuedAt: daysAgo(3),
        dueAt: daysAgo(-12), // due in 12 days
        createdByUserId: labOwner.id,
        createdAt: daysAgo(3),
        items: {
          create: [
            {
              caseId: issuedCase.id,
              description: `${issuedCase.productName} — case #${issuedCase.refNumber}`,
              qty: 1,
              unitPriceCents: issuedCase.unitPrice,
              amountCents: issuedCase.unitPrice,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    await prisma.labInvoice.create({
      data: {
        labTenantId: lab.id,
        clinicTenantId: clinic.id,
        status: LabInvoiceStatus.DRAFT,
        currency: 'PHP',
        subtotalCents: draftCase.unitPrice,
        taxCents: 0,
        totalCents: draftCase.unitPrice,
        paidCents: 0,
        notes: 'Auto-generated draft for review.',
        createdByUserId: labOwner.id,
        createdAt: daysAgo(1),
        items: {
          create: [
            {
              caseId: draftCase.id,
              description: `${draftCase.productName} — case #${draftCase.refNumber}`,
              qty: 1,
              unitPriceCents: draftCase.unitPrice,
              amountCents: draftCase.unitPrice,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    void paidInvoice; // silence unused linter
  }

  console.log('\n✓ Demo lab seed complete\n');
  console.log(`  Lab tenant     : ${LAB_SLUG} (${lab.name})`);
  console.log(`  Clinic tenant  : ${CLINIC_SLUG} (${clinic.name})`);
  console.log(`  Password       : ${PASSWORD}`);
  console.log('  Logins         :');
  console.log('    LAB OWNER     lab-owner@demo.local');
  console.log('    CLINIC OWNER  clinic-owner@demo.local');
  console.log('');
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
