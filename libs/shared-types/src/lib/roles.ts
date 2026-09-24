// Role matrix shared between api (authorization) and web/mobile (UI gating).
// Lives in shared-types (not @org/auth) so the browser bundles can import
// it without dragging in the server-only password / JWT helpers.
// Mirrors the Role enum in libs/db/prisma/schema.prisma.

export const Roles = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  RECEPTIONIST: 'RECEPTIONIST',
  // Laboratory roles. A medical technologist runs the bench and may release
  // results; a pathologist oversees and releases but does not key them in.
  // Both are distinct from DOCTOR/NURSE because releasing a result is a
  // professional act tied to a licence (RA 5527), and because separating
  // "entered" from "verified" is only meaningful if the two can be different
  // people with different privileges.
  MEDICAL_TECHNOLOGIST: 'MEDICAL_TECHNOLOGIST',
  PATHOLOGIST: 'PATHOLOGIST',
  PATIENT: 'PATIENT',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

// Action vocabulary. Add as features ship; keep this list short.
export const Actions = {
  TENANT_MANAGE: 'tenant:manage',
  // TENANT_MANAGE stays OWNER-only (settings, plan, broadcasts, the lab
  // module's back office). The two below carve out the day-to-day operations
  // an ADMIN / the front desk must be able to run without it.
  // Locations and retention runs: OWNER + ADMIN.
  CLINIC_ADMIN: 'clinic:admin',
  // Run the front-desk queue: create queues, issue / call / close tickets.
  // OWNER + ADMIN + RECEPTIONIST.
  QUEUE_MANAGE: 'queue:manage',
  USER_INVITE: 'user:invite',
  // Change roles / suspend / remove staff. OWNER + ADMIN; the members
  // service additionally stops ADMIN from granting or revoking OWNER.
  USER_MANAGE: 'user:manage',
  PATIENT_READ: 'patient:read',
  PATIENT_WRITE: 'patient:write',
  // Read one's OWN record through the patient portal (/api/me/*). Held by
  // PATIENT and by nobody else. Deliberately NOT patient:read — that one
  // means "read the clinic's patient records" and gates ~30 staff routes
  // (GET /patients, /patients/:id/export, /lab-orders/:id, /prescriptions/
  // :id/pdf, …). While PATIENT held patient:read, a portal account could
  // read every chart in its tenant; RLS stopped cross-tenant reads and
  // nothing stopped patient→patient. See portal-boundary.spec.ts.
  PORTAL_READ: 'portal:read',
  CONSULT_READ: 'consult:read',
  CONSULT_WRITE: 'consult:write',
  RX_WRITE: 'rx:write',
  RX_SIGN: 'rx:sign',
  BILLING_READ: 'billing:read',
  BILLING_WRITE: 'billing:write',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  TELE_HOST: 'tele:host',
  AI_USE: 'ai:use',
  AUDIT_READ: 'audit:read',
  // Key a result onto an order item. Deliberately broader than the lab roles:
  // DOCTOR and NURSE could already do this through CONSULT_WRITE, and a
  // clinic that keys in a referred-in report has to keep being able to.
  LAB_RESULT_ENTER: 'lab:result:enter',
  // Release a result to the chart. NURSE and RECEPTIONIST are excluded: this
  // is the act that makes a value clinically actionable.
  LAB_RESULT_VERIFY: 'lab:result:verify',
} as const;

export type Action = (typeof Actions)[keyof typeof Actions];

const matrix: Record<Role, ReadonlySet<Action>> = {
  OWNER: new Set([
    Actions.TENANT_MANAGE,
    Actions.CLINIC_ADMIN,
    Actions.QUEUE_MANAGE,
    Actions.USER_INVITE,
    Actions.USER_MANAGE,
    Actions.PATIENT_READ,
    Actions.PATIENT_WRITE,
    Actions.CONSULT_READ,
    Actions.CONSULT_WRITE,
    Actions.RX_WRITE,
    Actions.RX_SIGN,
    Actions.BILLING_READ,
    Actions.BILLING_WRITE,
    Actions.INVENTORY_READ,
    Actions.INVENTORY_WRITE,
    Actions.TELE_HOST,
    Actions.AI_USE,
    Actions.AUDIT_READ,
    Actions.LAB_RESULT_ENTER,
    Actions.LAB_RESULT_VERIFY,
  ]),
  // ADMIN runs the clinic day to day (staff, locations, queue, retention)
  // but cannot change tenant settings / plan — that is TENANT_MANAGE, OWNER
  // only (settings.spec / tenants.spec pin this down).
  ADMIN: new Set([
    Actions.CLINIC_ADMIN,
    Actions.QUEUE_MANAGE,
    Actions.USER_INVITE,
    Actions.USER_MANAGE,
    Actions.PATIENT_READ,
    Actions.PATIENT_WRITE,
    Actions.CONSULT_READ,
    Actions.BILLING_READ,
    Actions.BILLING_WRITE,
    Actions.INVENTORY_READ,
    Actions.INVENTORY_WRITE,
    Actions.AI_USE,
    Actions.AUDIT_READ,
  ]),
  DOCTOR: new Set([
    Actions.PATIENT_READ,
    Actions.PATIENT_WRITE,
    Actions.CONSULT_READ,
    Actions.CONSULT_WRITE,
    Actions.RX_WRITE,
    Actions.RX_SIGN,
    Actions.BILLING_READ,
    Actions.INVENTORY_READ,
    Actions.TELE_HOST,
    Actions.AI_USE,
    // A physician running tests in their own clinic both keys in and
    // releases them; there is no technologist to separate from.
    Actions.LAB_RESULT_ENTER,
    Actions.LAB_RESULT_VERIFY,
  ]),
  NURSE: new Set([
    Actions.PATIENT_READ,
    Actions.PATIENT_WRITE,
    Actions.CONSULT_READ,
    Actions.CONSULT_WRITE,
    Actions.INVENTORY_READ,
    Actions.INVENTORY_WRITE,
    Actions.TELE_HOST,
    Actions.AI_USE,
    // Enter, but not verify: releasing a result to the chart is not nursing
    // scope. A nurse keying in a referred-in report leaves it PRELIMINARY
    // for someone who can release it.
    Actions.LAB_RESULT_ENTER,
  ]),
  RECEPTIONIST: new Set([
    Actions.QUEUE_MANAGE,
    Actions.PATIENT_READ,
    Actions.PATIENT_WRITE,
    Actions.BILLING_READ,
    Actions.BILLING_WRITE,
    Actions.INVENTORY_READ,
  ]),
  // Runs the bench: keys results in and, where the clinic is not staffed to
  // separate the two acts, releases them. PATIENT_WRITE is absent — a
  // technologist works from the order, not the chart.
  MEDICAL_TECHNOLOGIST: new Set([
    Actions.PATIENT_READ,
    Actions.CONSULT_READ,
    Actions.CONSULT_WRITE,
    Actions.LAB_RESULT_ENTER,
    Actions.LAB_RESULT_VERIFY,
  ]),
  // Oversees and releases. No LAB_RESULT_ENTER on purpose: a pathologist who
  // could also key values in would defeat the separation the role exists to
  // provide.
  PATHOLOGIST: new Set([
    Actions.PATIENT_READ,
    Actions.CONSULT_READ,
    Actions.LAB_RESULT_VERIFY,
  ]),
  // Portal accounts only. PORTAL_READ reaches /api/me/* and nothing else;
  // the staff surface is closed to them both here and by PortalScopeGuard.
  PATIENT: new Set([Actions.PORTAL_READ]),
};

export function can(role: Role, action: Action): boolean {
  return matrix[role]?.has(action) ?? false;
}

export function rolesThatCan(action: Action): Role[] {
  return (Object.keys(matrix) as Role[]).filter((r) => can(r, action));
}
