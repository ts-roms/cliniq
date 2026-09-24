import type { APIRequestContext } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { Client as PgClient } from 'pg';
import { randomUUID } from 'node:crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://cliniq:cliniq@127.0.0.1:5432/cliniq_test?schema=public';

export interface SeedUser {
  email: string;
  password: string;
  userId: string;
  role: string;
}

export interface SeedTenant {
  id: string;
  slug: string;
  owner: SeedUser;
  doctor: SeedUser;
  receptionist: SeedUser;
  patient: SeedUser & { patientId: string };
}

export interface SeedLab {
  id: string;
  slug: string;
  owner: SeedUser;
}

export interface SeedPlatform {
  adminId: string;
  email: string;
  password: string;
  /** Platform JWT from the sanity-check login; used to set tenant plans. */
  accessToken: string;
}

/**
 * The clinic<->lab marketplace fixture: an accepted link plus one case that
 * has been walked all the way to an issued invoice. Without this the lab and
 * clinic lab-* pages render empty shells and the specs can only assert that
 * the chrome painted.
 */
export interface SeedMarketplace {
  categoryId: string;
  productId: string;
  /** Case walked to DELIVERED; visible from both the clinic and the lab. */
  caseId: string;
  /** Invoice generated from that case and ISSUED (so the clinic sees it). */
  invoiceId: string;
}

/**
 * The clinic's checkup catalogue. Both the booking dialog's visit-type field
 * and the consult's "Visit focus" panel render nothing when a clinic has none,
 * so without this the specs could only assert their absence.
 */
export interface SeedVisitTypes {
  /** "Dental cleaning" — focuses the dental module. */
  dentalId: string;
  dentalName: string;
  /** "General consultation" — the clinic default, focuses nothing. */
  generalId: string;
  generalName: string;
}

export interface ProvisionedSeed {
  clinic: SeedTenant;
  lab: SeedLab;
  platform: SeedPlatform;
  marketplace: SeedMarketplace;
  visitTypes: SeedVisitTypes;
}

const PASSWORD = 'WebE2EPassword123!';

/**
 * Hits the same public api routes the e2e harness uses. Staff join the way a
 * clinic adds them: the owner invites the address with the target role and
 * the new user redeems the invite (`/auth/register` is invite-only). We reach
 * into Postgres only to insert a PlatformAdmin row (no signup endpoint).
 */
export async function provisionTenants(
  api: APIRequestContext,
): Promise<ProvisionedSeed> {
  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();

  try {
    const platform = await provisionPlatformAdmin(api, pg);
    const clinic = await provisionClinic(api);
    const lab = await provisionLab(api);
    // Signup lands every tenant on the basic tier; the specs exercise the
    // gated modules, so upgrade them the way production does — as the
    // platform admin.
    await setPlanAsPlatform(api, platform, clinic.id, { plan: 'PREMIUM' });
    await setPlanAsPlatform(api, platform, lab.id, { labPlan: 'LAB_PREMIUM' });
    // Must come after the plan upgrade — the lab catalog and case routes are
    // gated on LAB_CATALOG / LAB_ORDERS, which LAB_BASIC signup doesn't carry.
    const marketplace = await provisionMarketplace(api, clinic, lab);
    const visitTypes = await provisionVisitTypes(api, clinic);
    return { clinic, lab, platform, marketplace, visitTypes };
  } finally {
    await pg.end().catch(() => undefined);
  }
}

async function provisionClinic(api: APIRequestContext): Promise<SeedTenant> {
  const ts = Date.now();
  const slug =
    `webe2e-clinic-${ts}-${Math.floor(Math.random() * 100_000)}`.toLowerCase();
  const owner = await createTenantWithOwner(api, slug, 'CLINIC');

  // Invites and patient creation need an authed clinic-staff call (the owner).
  const ownerToken = await loginToken(api, owner.user.email);
  const doctor = await inviteAndRegister(api, slug, ownerToken, 'DOCTOR');
  const receptionist = await inviteAndRegister(
    api,
    slug,
    ownerToken,
    'RECEPTIONIST',
  );
  const patient = await registerPatient(api, slug, ownerToken);

  return {
    id: owner.tenantId,
    slug,
    owner: owner.user,
    doctor,
    receptionist,
    patient,
  };
}

async function provisionLab(api: APIRequestContext): Promise<SeedLab> {
  const ts = Date.now();
  const slug =
    `webe2e-lab-${ts}-${Math.floor(Math.random() * 100_000)}`.toLowerCase();
  const owner = await createTenantWithOwner(api, slug, 'LAB');
  return { id: owner.tenantId, slug, owner: owner.user };
}

async function createTenantWithOwner(
  api: APIRequestContext,
  slug: string,
  kind: 'CLINIC' | 'LAB',
): Promise<{ tenantId: string; user: SeedUser }> {
  const email = `${slug}-owner@e2e.local`;
  const tenantRes = await api.post('/api/tenants', {
    data: {
      slug,
      name: `WebE2E ${kind} ${slug}`,
      ownerEmail: email,
      ownerName: 'E2E Owner',
      ownerPassword: PASSWORD,
      kind,
    },
  });
  if (tenantRes.status() !== 201) {
    throw new Error(
      `tenant create failed: ${tenantRes.status()} ${await tenantRes.text()}`,
    );
  }
  const tenant = await tenantRes.json();
  const loginRes = await api.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `owner login failed: ${loginRes.status()} ${await loginRes.text()}`,
    );
  }
  const login = await loginRes.json();
  return {
    tenantId: tenant.id as string,
    user: {
      email,
      password: PASSWORD,
      userId: login.user.id as string,
      role: 'OWNER',
    },
  };
}

async function loginToken(
  api: APIRequestContext,
  email: string,
): Promise<string> {
  const res = await api.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(
      `loginToken(${email}) failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = await res.json();
  return body.accessToken as string;
}

async function inviteAndRegister(
  api: APIRequestContext,
  tenantSlug: string,
  ownerToken: string,
  role: 'DOCTOR' | 'RECEPTIONIST',
): Promise<SeedUser> {
  const rand = randomUUID().slice(0, 8);
  const email = `${role.toLowerCase()}-${rand}@e2e.local`;

  const invite = await api.post('/api/members/invites', {
    headers: { authorization: `Bearer ${ownerToken}` },
    data: { email, role },
  });
  if (invite.status() !== 201) {
    throw new Error(
      `invite ${role} failed: ${invite.status()} ${await invite.text()}`,
    );
  }
  const inviteUrl = (await invite.json()).inviteUrl as string | undefined;
  const inviteToken = inviteUrl
    ? new URL(inviteUrl).searchParams.get('invite')
    : null;
  if (!inviteToken) {
    throw new Error(`invite ${role} returned no inviteUrl`);
  }

  const reg = await api.post('/api/auth/register', {
    data: {
      email,
      name: `E2E ${role}`,
      password: PASSWORD,
      tenantSlug,
      inviteToken,
    },
  });
  if (reg.status() !== 201 && reg.status() !== 200) {
    throw new Error(
      `register ${role} failed: ${reg.status()} ${await reg.text()}`,
    );
  }
  const body = await reg.json();
  return { email, password: PASSWORD, userId: body.user.id as string, role };
}

async function registerPatient(
  api: APIRequestContext,
  tenantSlug: string,
  ownerToken: string,
): Promise<SeedUser & { patientId: string }> {
  // Patient portal flow has two steps:
  //  1. Clinic staff create a Patient row (with an MRN + email).
  //  2. The patient self-registers a portal account using that MRN + email;
  //     the api links the new User to the existing Patient.
  const rand = randomUUID().slice(0, 8);
  const email = `patient-${rand}@e2e.local`;
  const mrn = `E2E-${rand}`.toUpperCase();

  // Step 1: clinic owner creates the Patient.
  const createRes = await api.post('/api/patients', {
    headers: { authorization: `Bearer ${ownerToken}` },
    data: {
      mrn,
      firstName: 'E2E',
      lastName: 'Patient',
      dateOfBirth: '1990-01-01',
      sex: 'FEMALE',
      email,
    },
  });
  if (createRes.status() !== 201) {
    throw new Error(
      `patient create failed: ${createRes.status()} ${await createRes.text()}`,
    );
  }
  const patient = await createRes.json();

  // Step 2: patient self-registers the portal account.
  const res = await api.post('/api/auth/patient-register', {
    data: { tenantSlug, mrn, email, password: PASSWORD },
  });
  if (res.status() !== 201 && res.status() !== 200) {
    throw new Error(
      `patient register failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = await res.json();
  return {
    email,
    password: PASSWORD,
    userId: body.user.id as string,
    role: 'PATIENT',
    patientId: (body.user.patientId as string) ?? (patient.id as string),
  };
}

async function setPlanAsPlatform(
  api: APIRequestContext,
  platform: SeedPlatform,
  tenantId: string,
  body: { plan?: string; labPlan?: string },
): Promise<void> {
  const res = await api.patch(`/api/platform/tenants/${tenantId}`, {
    headers: { authorization: `Bearer ${platform.accessToken}` },
    data: body,
  });
  if (!res.ok()) {
    throw new Error(
      `tenant plan setup failed: ${res.status()} ${await res.text()}`,
    );
  }
}

async function provisionPlatformAdmin(
  api: APIRequestContext,
  pg: PgClient,
): Promise<SeedPlatform> {
  const rand = randomUUID().slice(0, 8);
  const email = `platform-${rand}@e2e.local`;
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const id = randomUUID();
  await pg.query(
    `INSERT INTO "platform_admins" ("id", "email", "name", "passwordHash", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [id, email, 'E2E Platform Admin', passwordHash],
  );
  // Sanity check the login works (catches schema or seeding regressions early).
  const loginRes = await api.post('/api/platform/auth/login', {
    data: { email, password: PASSWORD },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `platform login failed: ${loginRes.status()} ${await loginRes.text()}`,
    );
  }
  const login = (await loginRes.json()) as { accessToken: string };
  return {
    adminId: id,
    email,
    password: PASSWORD,
    accessToken: login.accessToken,
  };
}

/**
 * Walk the full clinic<->lab flow once, via the same public routes a real
 * lab and clinic use, so every lab-* page has a row to render:
 *
 *   lab: category -> product -> invite clinic
 *   clinic: accept invite -> draft case -> SUBMITTED
 *   lab: IN_PROGRESS -> AWAITING_PICKUP -> DELIVERED -> invoice -> ISSUED
 */
async function provisionMarketplace(
  api: APIRequestContext,
  clinic: SeedTenant,
  lab: SeedLab,
): Promise<SeedMarketplace> {
  const labToken = await loginToken(api, lab.owner.email);
  const clinicToken = await loginToken(api, clinic.owner.email);
  const asLab = { authorization: `Bearer ${labToken}` };
  const asClinic = { authorization: `Bearer ${clinicToken}` };

  const category = await post(api, '/api/dental-lab/categories', asLab, {
    name: 'Crowns',
  });
  const product = await post(api, '/api/dental-lab/products', asLab, {
    name: 'PFM crown',
    categoryId: category.id,
    defaultPrice: 350000,
    currency: 'PHP',
    pricingMode: 'FIXED',
    phases: ['Wax-up', 'Casting', 'Porcelain'],
  });

  const invite = await post(api, '/api/dental-lab/clinic-links/invite', asLab, {
    clinicSlug: clinic.slug,
  });
  await post(
    api,
    `/api/clinic/lab-invitations/${invite.id}/accept`,
    asClinic,
    {},
  );

  const dentalLabCase = await post(api, '/api/clinic/lab-cases', asClinic, {
    labTenantId: lab.id,
    productId: product.id,
    patientLabel: 'Maria Cruz',
    doctorLabel: 'Dr. Reyes',
    urgency: 'STANDARD',
  });
  await post(
    api,
    `/api/clinic/lab-cases/${dentalLabCase.id}/transitions`,
    asClinic,
    {
      status: 'SUBMITTED',
    },
  );
  for (const status of ['IN_PROGRESS', 'AWAITING_PICKUP', 'DELIVERED']) {
    await post(
      api,
      `/api/dental-lab/cases/${dentalLabCase.id}/transitions`,
      asLab,
      {
        status,
      },
    );
  }

  const invoice = await post(
    api,
    '/api/dental-lab/invoices/generate-from-cases',
    asLab,
    { clinicTenantId: clinic.id, caseIds: [dentalLabCase.id] },
  );
  await post(api, `/api/dental-lab/invoices/${invoice.id}/issue`, asLab, {});

  return {
    categoryId: category.id as string,
    productId: product.id as string,
    caseId: dentalLabCase.id as string,
    invoiceId: invoice.id as string,
  };
}

/** POST that throws with the server's own message — a silent seed failure
 *  turns into a dozen confusing spec failures later. */
async function post(
  api: APIRequestContext,
  path: string,
  headers: Record<string, string>,
  data: unknown,
): Promise<Record<string, unknown> & { id: string }> {
  const res = await api.post(path, { headers, data });
  if (!res.ok()) {
    throw new Error(
      `seed POST ${path} failed: ${res.status()} ${await res.text()}`,
    );
  }
  return res.json();
}

/**
 * A two-entry checkup catalogue for the clinic: one default that focuses no
 * particular module, and one that focuses dental so the consult's focus panel
 * has something concrete to link to.
 */
async function provisionVisitTypes(
  api: APIRequestContext,
  clinic: SeedTenant,
): Promise<SeedVisitTypes> {
  const token = await loginToken(api, clinic.owner.email);
  const asClinic = { authorization: `Bearer ${token}` };

  const general = await post(api, '/api/visit-types', asClinic, {
    name: 'General consultation',
    modules: [],
    isDefault: true,
    sortOrder: 0,
  });
  const dental = await post(api, '/api/visit-types', asClinic, {
    name: 'Dental cleaning',
    modules: ['dental'],
    description: 'Routine scale and polish',
    sortOrder: 1,
  });

  return {
    generalId: general.id as string,
    generalName: 'General consultation',
    dentalId: dental.id as string,
    dentalName: 'Dental cleaning',
  };
}
