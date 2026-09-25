/**
 * Pathologist supervision — RA 5527.
 *
 * The Philippine Medical Technology Act is explicit: a medical technologist
 * practises **under the supervision of a pathologist**, or of a
 * DOH-authorized physician where no pathologist is available. Practising
 * without that supervision is penalised — it is the technologist who is
 * penalised, not the software, which is exactly why the software should not
 * make it easy to do.
 *
 * CLINIQ already had the roles. What it had no way to express was the
 * relationship between them: a `MEDICAL_TECHNOLOGIST` could release a result
 * to the chart and sign the report, and nothing anywhere recorded under whose
 * authority. An inspector asking "who supervised this" had no answer, and
 * neither did the technologist.
 *
 * Pure and Prisma-free for the same reason ./verification.ts and ./westgard.ts
 * are: these are the rules an inspection asks you to demonstrate, and a rule
 * that cannot be demonstrated in isolation cannot be defended.
 */

/**
 * The roles that can release a result. Narrower than the action matrix on
 * purpose — this module asks a different question from "is it permitted".
 */
export type ReleasingRole =
  | 'OWNER'
  | 'ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'RECEPTIONIST'
  | 'MEDICAL_TECHNOLOGIST'
  | 'PATHOLOGIST'
  | 'PATIENT';

/**
 * The pathologist of record, as the laboratory profile holds them.
 *
 * Free text rather than a user reference, and deliberately so: §6.10 records
 * that the pathologist of record is frequently a visiting consultant with no
 * account in the system. A supervision model that required one would be
 * unusable in precisely the common case.
 */
export interface PathologistOfRecord {
  name: string | null;
  licenseNumber: string | null;
}

export interface SupervisionPolicy {
  /**
   * Refuse a release that would be unsupervised, rather than merely recording
   * that it was.
   *
   * Defaults OFF, for the reason ./verification.ts defaults off: a clinic
   * that has not yet filled in its laboratory profile would otherwise be
   * unable to release any result at all, and results that never reach the
   * ordering doctor are a worse patient-safety problem than a supervision
   * record with a gap in it. The stamp below is applied either way, so the
   * evidence is complete whichever way this is set; the setting only decides
   * what is *refused*.
   */
  required: boolean;
}

export const DEFAULT_SUPERVISION_POLICY: SupervisionPolicy = {
  required: false,
};

/**
 * Read the policy out of the tenant's free-form settings JSON.
 *
 * Anything missing or the wrong shape falls back to the default rather than
 * throwing — a malformed settings blob must not make the laboratory
 * unusable, and the default is the permissive one.
 */
export function readSupervisionPolicy(settings: unknown): SupervisionPolicy {
  const root = isRecord(settings) ? settings : {};
  const sup = isRecord(root['labSupervision']) ? root['labSupervision'] : {};
  return { required: sup['required'] === true };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Does a release by this role need a supervising pathologist named against it?
 *
 * No for `PATHOLOGIST` — they are the supervision. No for `DOCTOR`, which is
 * RA 5527's own exception: a physician may authorise where no pathologist is
 * available, and a doctor releasing a result in their own clinic is the
 * authorised person rather than someone needing authorisation.
 *
 * Yes for everyone else who can release, including `OWNER`. An owner is not
 * necessarily a clinician — the role describes who pays for the subscription,
 * not who holds a licence — so a release performed as OWNER is exactly the
 * case where naming the responsible pathologist matters. Clinics whose owner
 * is also the physician should release as `DOCTOR`; the role is what is
 * recorded on the document either way.
 */
export function needsSupervision(role: ReleasingRole): boolean {
  return role !== 'PATHOLOGIST' && role !== 'DOCTOR';
}

/**
 * What to stamp on the act of releasing.
 *
 * `SELF` means the releaser carried the authority themselves, so naming a
 * supervisor would misstate what happened. `SUPERVISED` carries the snapshot
 * to record. `UNSUPERVISED` is a release nobody is answerable for, which is
 * the finding.
 */
export type SupervisionStamp =
  | { kind: 'SELF' }
  | {
      kind: 'SUPERVISED';
      supervisorName: string;
      supervisorLicense: string | null;
    }
  | { kind: 'UNSUPERVISED' };

/**
 * Resolve the supervision for one release.
 *
 * The name is snapshotted by the caller rather than read through a relation
 * later, for the reason `Prescription.providerLicense` and
 * `LabReportSignature.signerLicense` are: editing the laboratory profile next
 * year must not retroactively change who supervised a result last year.
 */
export function supervisionFor(
  role: ReleasingRole,
  pathologist: PathologistOfRecord | null,
): SupervisionStamp {
  if (!needsSupervision(role)) return { kind: 'SELF' };
  const name = pathologist?.name?.trim();
  if (!name) return { kind: 'UNSUPERVISED' };
  const licence = pathologist?.licenseNumber?.trim();
  return {
    kind: 'SUPERVISED',
    supervisorName: name,
    // An empty licence field is recorded as absent rather than as an empty
    // string, so "no licence on file" is one value and not two.
    supervisorLicense: licence ? licence : null,
  };
}

export type ReleaseRefusal = { ok: true } | { ok: false; reason: string };

/**
 * May this role release, given who is on file and what the clinic enforces?
 *
 * This is deliberately separate from `canVerify` in ./verification.ts, which
 * answers a different question — whether the *result* is in a state to be
 * released, and whether the clinic wants a second pair of eyes. Both must
 * pass. Keeping them apart means a clinic can require supervision without
 * requiring separate verification, which is the common arrangement: one
 * technologist on the bench, a pathologist answerable for the laboratory.
 */
export function canRelease(
  role: ReleasingRole,
  pathologist: PathologistOfRecord | null,
  policy: SupervisionPolicy,
): ReleaseRefusal {
  const stamp = supervisionFor(role, pathologist);
  if (policy.required && stamp.kind === 'UNSUPERVISED') {
    return {
      ok: false,
      reason:
        'this clinic requires results to be released under a pathologist, and no pathologist of record is on file for the laboratory (RA 5527)',
    };
  }
  return { ok: true };
}

/**
 * How the supervision reads on an issued report.
 *
 * Returned as a line rather than assembled in the renderer so the wording is
 * testable: pdfkit compresses its output streams, so a test cannot read text
 * back out of a generated PDF, and the same problem led `supersededNotice()`
 * in ./reporting.ts to be extracted for the same reason.
 *
 * Null means print nothing — a pathologist who signed their own report does
 * not need a line saying they supervised themselves.
 */
export function supervisionNotice(stamp: SupervisionStamp): string | null {
  switch (stamp.kind) {
    case 'SELF':
      return null;
    case 'SUPERVISED':
      return stamp.supervisorLicense
        ? `Released under the supervision of ${stamp.supervisorName}, PRC ${stamp.supervisorLicense}`
        : `Released under the supervision of ${stamp.supervisorName}`;
    case 'UNSUPERVISED':
      // Stated, not omitted — the same decision as printing an expired
      // Licence to Operate in red rather than leaving it off. A document that
      // quietly omits this is worse than one that says so, because the
      // omission reads as compliance.
      return 'Released without a supervising pathologist of record.';
  }
}
