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

  it('PATIENT is read-only on its own record and nothing else', () => {
    expect(can(Roles.PATIENT, Actions.PATIENT_READ)).toBe(true);
    for (const action of Object.values(Actions)) {
      if (action === Actions.PATIENT_READ) continue;
      expect(can(Roles.PATIENT, action)).toBe(false);
    }
  });

  it('unknown roles never pass', () => {
    expect(can('JANITOR' as never, Actions.PATIENT_READ)).toBe(false);
  });
});
