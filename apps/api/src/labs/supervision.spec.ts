import {
  DEFAULT_SUPERVISION_POLICY,
  canRelease,
  needsSupervision,
  readSupervisionPolicy,
  supervisionFor,
  supervisionNotice,
  type PathologistOfRecord,
  type ReleasingRole,
} from './supervision.js';

const onFile: PathologistOfRecord = {
  name: 'Dr. Maria Santos',
  licenseNumber: '0123456',
};

describe('supervision policy', () => {
  it('defaults to recording rather than refusing', () => {
    // A clinic that has not filled in its laboratory profile must still be
    // able to release results. The stamp is applied either way.
    expect(DEFAULT_SUPERVISION_POLICY.required).toBe(false);
    expect(readSupervisionPolicy(undefined).required).toBe(false);
    expect(readSupervisionPolicy({}).required).toBe(false);
  });

  it('reads the switch when it is set', () => {
    expect(
      readSupervisionPolicy({ labSupervision: { required: true } }).required,
    ).toBe(true);
  });

  it('treats a malformed settings blob as the default, not an error', () => {
    // A bad settings value must not make the laboratory unusable.
    for (const bad of [null, 7, 'yes', [], { labSupervision: 'yes' }]) {
      expect(() => readSupervisionPolicy(bad)).not.toThrow();
      expect(readSupervisionPolicy(bad).required).toBe(false);
    }
  });

  it('requires the switch to be exactly true, not merely truthy', () => {
    // Settings arrive as free-form JSON from an API client. "false" is a
    // non-empty string and would turn enforcement on if this were loose.
    for (const v of ['true', 'false', 1, {}]) {
      expect(
        readSupervisionPolicy({ labSupervision: { required: v } }).required,
      ).toBe(false);
    }
  });
});

describe('which roles need a supervising pathologist', () => {
  it('does not ask a pathologist to be supervised', () => {
    expect(needsSupervision('PATHOLOGIST')).toBe(false);
  });

  it('does not ask a physician to be supervised', () => {
    // RA 5527's own exception: a DOH-authorized physician may act where no
    // pathologist is available. A doctor releasing a result in their own
    // clinic is the authorised person, not someone needing authorisation.
    expect(needsSupervision('DOCTOR')).toBe(false);
  });

  it('asks a medical technologist to be supervised', () => {
    // This is the case the statute is actually about.
    expect(needsSupervision('MEDICAL_TECHNOLOGIST')).toBe(true);
  });

  it('asks an owner to be supervised', () => {
    // OWNER describes who pays for the subscription, not who holds a
    // licence, so a release performed as OWNER is exactly the case where the
    // responsible pathologist has to be named.
    expect(needsSupervision('OWNER')).toBe(true);
  });
});

describe('resolving the stamp', () => {
  it('records a pathologist as acting for themselves, not under themselves', () => {
    expect(supervisionFor('PATHOLOGIST', onFile)).toEqual({ kind: 'SELF' });
    // Even with nobody on file: the releaser carried the authority.
    expect(supervisionFor('PATHOLOGIST', null)).toEqual({ kind: 'SELF' });
  });

  it('snapshots the name and licence for a technologist', () => {
    expect(supervisionFor('MEDICAL_TECHNOLOGIST', onFile)).toEqual({
      kind: 'SUPERVISED',
      supervisorName: 'Dr. Maria Santos',
      supervisorLicense: '0123456',
    });
  });

  it('reports an unsupervised release when nobody is on file', () => {
    expect(supervisionFor('MEDICAL_TECHNOLOGIST', null)).toEqual({
      kind: 'UNSUPERVISED',
    });
    expect(
      supervisionFor('MEDICAL_TECHNOLOGIST', {
        name: null,
        licenseNumber: null,
      }),
    ).toEqual({ kind: 'UNSUPERVISED' });
  });

  it('treats a whitespace-only name as nobody', () => {
    // A profile field someone tabbed through is not a pathologist of record,
    // and a report naming "   " is worse than one naming nobody.
    expect(
      supervisionFor('MEDICAL_TECHNOLOGIST', {
        name: '   ',
        licenseNumber: '0123456',
      }),
    ).toEqual({ kind: 'UNSUPERVISED' });
  });

  it('records a missing licence as absent rather than empty', () => {
    // So "no licence on file" is one value and not two.
    expect(
      supervisionFor('MEDICAL_TECHNOLOGIST', {
        name: 'Dr. Santos',
        licenseNumber: '  ',
      }),
    ).toEqual({
      kind: 'SUPERVISED',
      supervisorName: 'Dr. Santos',
      supervisorLicense: null,
    });
  });

  it('trims the snapshot it takes', () => {
    expect(
      supervisionFor('MEDICAL_TECHNOLOGIST', {
        name: '  Dr. Santos  ',
        licenseNumber: ' 0123456 ',
      }),
    ).toEqual({
      kind: 'SUPERVISED',
      supervisorName: 'Dr. Santos',
      supervisorLicense: '0123456',
    });
  });
});

describe('whether the release is refused', () => {
  const off = { required: false };
  const on = { required: true };

  it('permits an unsupervised release while enforcement is off', () => {
    // Recorded, not refused. This is the default and most clinics run on it.
    expect(canRelease('MEDICAL_TECHNOLOGIST', null, off)).toEqual({ ok: true });
  });

  it('refuses an unsupervised release once enforcement is on', () => {
    const v = canRelease('MEDICAL_TECHNOLOGIST', null, on);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toMatch(/RA 5527/);
  });

  it('permits a supervised release with enforcement on', () => {
    expect(canRelease('MEDICAL_TECHNOLOGIST', onFile, on)).toEqual({
      ok: true,
    });
  });

  it('never blocks a pathologist, even with nobody on file', () => {
    // Enforcement must not lock out the very person it exists to involve.
    // A laboratory whose pathologist has an account but has not typed their
    // own name into the profile would otherwise be unable to release
    // anything, which would make turning the setting on unsafe.
    expect(canRelease('PATHOLOGIST', null, on)).toEqual({ ok: true });
  });

  it('never blocks a physician, even with nobody on file', () => {
    expect(canRelease('DOCTOR', null, on)).toEqual({ ok: true });
  });
});

describe('what the report says', () => {
  it('says nothing when the signer carried the authority', () => {
    // A pathologist does not need a line saying they supervised themselves.
    expect(supervisionNotice({ kind: 'SELF' })).toBeNull();
  });

  it('names the supervising pathologist and their PRC', () => {
    expect(
      supervisionNotice({
        kind: 'SUPERVISED',
        supervisorName: 'Dr. Maria Santos',
        supervisorLicense: '0123456',
      }),
    ).toBe('Released under the supervision of Dr. Maria Santos, PRC 0123456');
  });

  it('names them without a PRC when none is on file', () => {
    expect(
      supervisionNotice({
        kind: 'SUPERVISED',
        supervisorName: 'Dr. Maria Santos',
        supervisorLicense: null,
      }),
    ).toBe('Released under the supervision of Dr. Maria Santos');
  });

  it('states an unsupervised release on the document rather than omitting it', () => {
    // The same decision as printing an expired Licence to Operate in red. A
    // document that quietly omits this reads as compliance.
    expect(supervisionNotice({ kind: 'UNSUPERVISED' })).toBe(
      'Released without a supervising pathologist of record.',
    );
  });
});

describe('every releasing role is decided', () => {
  it('has an answer for each role, so a new one cannot slip through', () => {
    const roles: ReleasingRole[] = [
      'OWNER',
      'ADMIN',
      'DOCTOR',
      'NURSE',
      'RECEPTIONIST',
      'MEDICAL_TECHNOLOGIST',
      'PATHOLOGIST',
      'PATIENT',
    ];
    for (const r of roles) {
      expect(typeof needsSupervision(r)).toBe('boolean');
      expect(['SELF', 'SUPERVISED', 'UNSUPERVISED']).toContain(
        supervisionFor(r, onFile).kind,
      );
    }
  });
});
