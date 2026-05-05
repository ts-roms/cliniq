/**
 * Idempotent dev seed. Wipes and recreates the `demo` tenant with one user
 * per role (all sharing password `Password123!`) and a few patients, one of
 * which has a linked portal login (`patient1@demo.local`).
 *
 * Run with:  pnpm db:seed
 *
 * Re-runs are safe — anything tied to the `demo` slug is deleted first via
 * onDelete: Cascade on Tenant.id, so all child rows go with it.
 */
import { prisma, Role, MemberStatus, TenantStatus, Plan, Sex } from '@org/db';
import { hashPassword } from '@org/auth';

const TENANT_SLUG = 'demo';
const PASSWORD = 'Password123!';

interface StaffSpec {
  email: string;
  name: string;
  role: Role;
}

const STAFF: StaffSpec[] = [
  { email: 'owner@demo.local', name: 'Demo Owner', role: Role.OWNER },
  { email: 'doctor@demo.local', name: 'Dr. Juana Cruz', role: Role.DOCTOR },
  { email: 'nurse@demo.local', name: 'Nurse Pedro Reyes', role: Role.NURSE },
  { email: 'reception@demo.local', name: 'Reception Mae Santos', role: Role.RECEPTIONIST },
];

interface PatientSpec {
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  sex: Sex;
  email?: string;
  phone?: string;
  /** When set, also creates a User + TenantUser(role=PATIENT) linked to this patient. */
  portalLogin?: { email: string };
}

const PATIENTS: PatientSpec[] = [
  {
    mrn: 'MRN-001',
    firstName: 'Maria',
    lastName: 'Dela Cruz',
    dateOfBirth: new Date('1992-04-12'),
    sex: Sex.FEMALE,
    email: 'patient1@demo.local',
    phone: '+639171234567',
    portalLogin: { email: 'patient1@demo.local' },
  },
  {
    mrn: 'MRN-002',
    firstName: 'Jose',
    lastName: 'Rizal',
    dateOfBirth: new Date('1985-06-19'),
    sex: Sex.MALE,
    phone: '+639180000002',
  },
  {
    mrn: 'MRN-003',
    firstName: 'Andres',
    lastName: 'Bonifacio',
    dateOfBirth: new Date('1978-11-30'),
    sex: Sex.MALE,
  },
];

async function main() {
  // bcrypt is the bottleneck — hash once, reuse for every user.
  const passwordHash = await hashPassword(PASSWORD);

  // Wipe the demo tenant first. Cascade clears every child row (TenantUser,
  // Patient, etc.). Users that were ONLY in the demo tenant are also wiped
  // below to avoid orphaned accounts blocking re-seeding.
  console.log(`→ Resetting tenant "${TENANT_SLUG}"`);
  const existing = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existing) {
    const memberUserIds = (
      await prisma.tenantUser.findMany({
        where: { tenantId: existing.id },
        select: { userId: true },
      })
    ).map((m) => m.userId);
    await prisma.tenant.delete({ where: { id: existing.id } });
    if (memberUserIds.length) {
      // Only delete users with no remaining tenant memberships (some staff
      // could legitimately belong to multiple tenants in real use).
      const stillMembers = await prisma.tenantUser.findMany({
        where: { userId: { in: memberUserIds } },
        select: { userId: true },
      });
      const stillIn = new Set(stillMembers.map((m) => m.userId));
      const orphaned = memberUserIds.filter((id) => !stillIn.has(id));
      if (orphaned.length) {
        await prisma.user.deleteMany({ where: { id: { in: orphaned } } });
      }
    }
  }

  // Create the tenant.
  console.log(`→ Creating tenant "${TENANT_SLUG}"`);
  const tenant = await prisma.tenant.create({
    data: {
      slug: TENANT_SLUG,
      name: 'Demo Clinic',
      plan: Plan.GOLD,
      status: TenantStatus.TRIAL,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // Staff users — one per role.
  console.log(`→ Creating ${STAFF.length} staff accounts`);
  for (const spec of STAFF) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { passwordHash },
      create: { email: spec.email, name: spec.name, passwordHash },
    });
    await prisma.tenantUser.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: spec.role,
        status: MemberStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
    console.log(`  ${spec.role.padEnd(12)} ${spec.email}`);
  }

  // Patients (+ optional portal login).
  console.log(`→ Creating ${PATIENTS.length} patients`);
  for (const p of PATIENTS) {
    const patient = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        mrn: p.mrn,
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        email: p.email ?? null,
        phone: p.phone ?? null,
      },
    });

    if (p.portalLogin) {
      const portalUser = await prisma.user.upsert({
        where: { email: p.portalLogin.email },
        update: { passwordHash },
        create: {
          email: p.portalLogin.email,
          name: `${p.firstName} ${p.lastName}`,
          passwordHash,
        },
      });
      await prisma.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: portalUser.id,
          patientId: patient.id,
          role: Role.PATIENT,
          status: MemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      console.log(`  PATIENT      ${p.portalLogin.email} (linked to ${p.mrn})`);
    } else {
      console.log(`  patient      ${p.mrn} ${p.firstName} ${p.lastName}`);
    }
  }

  console.log('\n✓ Seed complete\n');
  console.log(`  Tenant slug: ${TENANT_SLUG}`);
  console.log(`  Password   : ${PASSWORD}`);
  console.log('  Logins     :');
  for (const s of STAFF) console.log(`    ${s.role.padEnd(12)} ${s.email}`);
  for (const p of PATIENTS) {
    if (p.portalLogin) console.log(`    PATIENT      ${p.portalLogin.email}`);
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error('✗ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
