import { Actions, Roles, can, rolesThatCan } from './roles.js';

describe('RBAC matrix', () => {
  it('only OWNER and ADMIN can invite or manage staff', () => {
    expect(rolesThatCan(Actions.USER_INVITE).sort()).toEqual([
      'ADMIN',
      'OWNER',
    ]);
    expect(rolesThatCan(Actions.USER_MANAGE).sort()).toEqual([
      'ADMIN',
      'OWNER',
    ]);
  });

  it('only OWNER can manage the tenant', () => {
    expect(rolesThatCan(Actions.TENANT_MANAGE)).toEqual(['OWNER']);
  });

  it('OWNER and ADMIN run clinic operations (locations, retention)', () => {
    expect(rolesThatCan(Actions.CLINIC_ADMIN)).toEqual(['OWNER', 'ADMIN']);
  });

  it('OWNER, ADMIN and RECEPTIONIST run the queue; clinicians do not', () => {
    expect(rolesThatCan(Actions.QUEUE_MANAGE)).toEqual([
      'OWNER',
      'ADMIN',
      'RECEPTIONIST',
    ]);
  });

  it('PATIENT holds PORTAL_READ and nothing else', () => {
    expect(can(Roles.PATIENT, Actions.PORTAL_READ)).toBe(true);
    for (const action of Object.values(Actions)) {
      if (action === Actions.PORTAL_READ) continue;
      expect(can(Roles.PATIENT, action)).toBe(false);
    }
  });

  it('PATIENT does NOT hold PATIENT_READ', () => {
    // Called out separately from the loop above because this single fact is
    // the whole portal-boundary fix. PATIENT_READ is the only gate on ~30
    // staff routes — GET /patients, /patients/:id/export, /lab-orders/:id,
    // /prescriptions/:id/pdf and the rest. While the PATIENT role held it, a
    // portal account could read every chart in its tenant: RLS stopped
    // cross-tenant reads and nothing stopped patient → patient.
    //
    // If a future change grants PATIENT_READ back to PATIENT, that hole
    // reopens, and this assertion is the one that should fail first.
    expect(can(Roles.PATIENT, Actions.PATIENT_READ)).toBe(false);
  });

  it('no role other than PATIENT holds PORTAL_READ', () => {
    // PORTAL_READ gates /api/me/*, which is self-scoped via the JWT `pid`
    // claim. Staff JWTs carry no `pid`, so granting it to a staff role would
    // buy nothing and would blur the portal boundary.
    for (const role of Object.values(Roles)) {
      if (role === Roles.PATIENT) continue;
      expect(can(role, Actions.PORTAL_READ)).toBe(false);
    }
  });

  it('unknown roles never pass', () => {
    expect(can('JANITOR' as never, Actions.PATIENT_READ)).toBe(false);
  });
});
