/**
 * Referral laboratories — the lawful route for a test this laboratory may
 * not perform.
 *
 * Pure and Prisma-free, like ./capability.ts and ./verification.ts.
 *
 * §6.10 landed capability as advice: an out-of-scope test was reported on
 * the order and nothing more, because refusing it with no referral path
 * would have left a clinic unable to order something it is perfectly
 * entitled to send out. This is that path, and with it the refusal becomes
 * defensible.
 *
 * Two rules from AO 2021-0037 shape the model:
 *
 *   1. A laboratory may refer only to a **licensed** laboratory. The
 *      destination's own LTO number is therefore part of the record, not
 *      decoration.
 *   2. The report must state **which tests were referred and to which
 *      laboratory**. A referred result that reads as though it were produced
 *      in-house misrepresents who is answerable for it.
 */

export type ReferralStatus = 'PENDING' | 'SENT' | 'RECEIVED' | 'CANCELLED';

/** What the clinic has chosen to do about out-of-scope tests. */
export interface ReferralPolicy {
  /**
   * Refuse an order containing an out-of-scope test that has nowhere to go.
   *
   * Off by default. Turning it on is a statement that the clinic has
   * finished declaring its capability and its send-out destinations — until
   * then, refusing would punish an incomplete configuration rather than a
   * real mistake.
   */
  enforce: boolean;
}

export const DEFAULT_REFERRAL_POLICY: ReferralPolicy = { enforce: false };

/** Read the policy out of the tenant's free-form settings JSON. */
export function readReferralPolicy(settings: unknown): ReferralPolicy {
  const root = isRecord(settings) ? settings : {};
  const cap = isRecord(root['labCapability']) ? root['labCapability'] : {};
  return { enforce: cap['enforce'] === true };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type RoutingDecision =
  /** Within scope, or nothing declared — run it here. */
  | { action: 'IN_HOUSE' }
  /** Out of scope, and a destination is on file. */
  | { action: 'REFER'; referralLaboratoryId: string }
  /** Out of scope with nowhere to go, and the clinic has not asked us to refuse. */
  | { action: 'FLAG'; reason: string }
  /** Out of scope with nowhere to go, and the clinic has. */
  | { action: 'REFUSE'; reason: string };

/**
 * What should happen to one ordered test.
 *
 * `destination` is the referral laboratory named on the capability row that
 * excluded this test, when there is one. Naming it there rather than at
 * order time is deliberate: "HbA1c goes to Hi-Precision" is a standing
 * arrangement, and asking the person placing the order to remember it every
 * time is how it ends up wrong.
 */
export function routeTest(
  outOfScope: { isOutOfScope: boolean; reason: string },
  destination: string | null,
  policy: ReferralPolicy,
): RoutingDecision {
  if (!outOfScope.isOutOfScope) return { action: 'IN_HOUSE' };
  if (destination !== null) {
    return { action: 'REFER', referralLaboratoryId: destination };
  }
  return policy.enforce
    ? {
        action: 'REFUSE',
        reason: `${outOfScope.reason}, and no referral laboratory is on file for it`,
      }
    : { action: 'FLAG', reason: outOfScope.reason };
}

/**
 * Which referral status transitions are allowed.
 *
 * A specimen that has left the building cannot un-leave it, so SENT does not
 * go back to PENDING. CANCELLED is reachable until the result is back;
 * afterwards the referral is a record of something that happened.
 */
const TRANSITIONS: Record<ReferralStatus, readonly ReferralStatus[]> = {
  PENDING: ['SENT', 'CANCELLED'],
  SENT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};

export function canTransitionReferral(
  from: ReferralStatus,
  to: ReferralStatus,
): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedReferralTransitions(
  from: ReferralStatus,
): readonly ReferralStatus[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * May this laboratory be referred to?
 *
 * AO 2021-0037 permits referral only to a licensed laboratory. An inactive
 * destination is refused for the ordinary reason; one with no LTO on file is
 * refused because referring to it cannot be justified if anyone asks.
 */
export function canReferTo(lab: {
  isActive: boolean;
  dohLtoNumber: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!lab.isActive) {
    return { ok: false, reason: 'this referral laboratory is not active' };
  }
  if (lab.dohLtoNumber === null || lab.dohLtoNumber.trim().length === 0) {
    return {
      ok: false,
      reason:
        'this referral laboratory has no DOH Licence to Operate number on file; referral is permitted only to a licensed laboratory',
    };
  }
  return { ok: true };
}
