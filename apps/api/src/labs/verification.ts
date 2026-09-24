/**
 * Result verification policy.
 *
 * Pure and Prisma-free so the rules can be tested without a database — the
 * same reason ./flagging.ts is.
 *
 * Two decisions a clinic makes for itself:
 *
 *   `required`                — does a result have to be released by someone
 *                               before it reaches the chart?
 *   `requireSeparateVerifier` — must that someone be a different person from
 *                               whoever keyed it in?
 *
 * Both default OFF. A single-technologist clinic — which is most of them
 * outside the cities — would otherwise be unable to release any result at
 * all, and results that never reach the ordering doctor are a worse patient
 * safety problem than self-verification. Identities are recorded either way,
 * so the audit trail is complete whichever way the settings are set; the
 * settings only decide what is *enforced*.
 */

export type LabResultStatus = 'PENDING' | 'PRELIMINARY' | 'FINAL' | 'CORRECTED';

export interface VerificationPolicy {
  required: boolean;
  requireSeparateVerifier: boolean;
}

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  required: false,
  requireSeparateVerifier: false,
};

/**
 * Read the policy out of the tenant's free-form settings JSON.
 *
 * Anything missing or the wrong shape falls back to the default rather than
 * throwing: a malformed settings blob must not make the laboratory
 * unusable, and the default is the permissive one.
 */
export function readVerificationPolicy(settings: unknown): VerificationPolicy {
  const root = isRecord(settings) ? settings : {};
  const lab = isRecord(root['labVerification']) ? root['labVerification'] : {};
  return {
    required: lab['required'] === true,
    requireSeparateVerifier: lab['requireSeparateVerifier'] === true,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The status a freshly-entered result lands in.
 *
 * With verification off, entering a result also releases it — so it goes
 * straight to FINAL and the enterer is recorded as the verifier. That is the
 * honest record of what happened: one person did both.
 */
export function statusOnEntry(policy: VerificationPolicy): LabResultStatus {
  return policy.required ? 'PRELIMINARY' : 'FINAL';
}

/** Has this result been released to the chart? */
export function isReleased(status: LabResultStatus): boolean {
  return status === 'FINAL' || status === 'CORRECTED';
}

export type VerifyRefusal = { ok: true } | { ok: false; reason: string };

/**
 * May `verifierId` release this result?
 *
 * PENDING is refused because there is nothing to release. An already-released
 * result is refused because re-releasing it is not a real act — changing it
 * is a correction, which is a different route with a different requirement
 * (a stated reason).
 */
export function canVerify(
  status: LabResultStatus,
  enteredById: string | null,
  verifierId: string,
  policy: VerificationPolicy,
): VerifyRefusal {
  if (status === 'PENDING') {
    return { ok: false, reason: 'this result has no value to release yet' };
  }
  if (isReleased(status)) {
    return {
      ok: false,
      reason:
        'this result is already released; correcting it is an amendment, not a re-verification',
    };
  }
  if (policy.requireSeparateVerifier && enteredById === verifierId) {
    return {
      ok: false,
      reason:
        'this clinic requires a result to be released by someone other than whoever entered it',
    };
  }
  return { ok: true };
}

/**
 * May this result be corrected?
 *
 * Only a released one. Changing a PRELIMINARY value is just re-entering it —
 * nobody has acted on it yet, so there is nothing to correct and no reason to
 * demand an explanation.
 */
export function canAmend(status: LabResultStatus): VerifyRefusal {
  if (!isReleased(status)) {
    return {
      ok: false,
      reason:
        'only a released result can be corrected; re-enter the value instead',
    };
  }
  return { ok: true };
}

/**
 * Is the order finished reporting?
 *
 * Previously this asked whether every item had a *value*, which reported
 * orders whose results nobody had released. It now asks whether every item
 * has been released.
 */
export function orderIsFullyReported(
  statuses: readonly LabResultStatus[],
): boolean {
  return statuses.length > 0 && statuses.every(isReleased);
}
