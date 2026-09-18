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
  ]),
  RECEPTIONIST: new Set([
    Actions.QUEUE_MANAGE,
    Actions.PATIENT_READ,
    Actions.PATIENT_WRITE,
    Actions.BILLING_READ,
    Actions.BILLING_WRITE,
    Actions.INVENTORY_READ,
  ]),
  PATIENT: new Set([Actions.PATIENT_READ]),
};

export function can(role: Role, action: Action): boolean {
  return matrix[role]?.has(action) ?? false;
}

export function rolesThatCan(action: Action): Role[] {
  return (Object.keys(matrix) as Role[]).filter((r) => can(r, action));
}
