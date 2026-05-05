// Role matrix shared between api (authorization) and web/mobile (UI gating).
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
  USER_INVITE: 'user:invite',
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
    Actions.USER_INVITE,
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
  ADMIN: new Set([
    Actions.USER_INVITE,
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
