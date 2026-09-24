/**
 * Philippine statutory discounts.
 *
 * Pure and Prisma-free, like labs/flagging.ts and labs/verification.ts, so
 * the arithmetic can be tested without a database. It belongs in a
 * `libs/billing-rules` package and moves there cleanly — Nx generators do
 * not run in this workspace's worktrees, so it lives beside its consumer for
 * now.
 *
 * ## What the law requires
 *
 * **RA 9994** (Expanded Senior Citizens Act) and **RA 10754** (PWD) each
 * grant a **20% discount** and **exemption from VAT** on medical and
 * laboratory services, on presentation of an OSCA/senior or PWD ID.
 *
 * ## Why the order of operations matters
 *
 * The final amount due is the same either way — multiplication commutes —
 * so it is tempting to take 20% off the gross and stop. It is the
 * *breakdown* that differs, and the breakdown is what the BIR requires on
 * the face of the invoice and what the establishment claims as a deduction.
 *
 * On a ₱1,120 VAT-inclusive charge:
 *
 *   correct:   VAT-exempt sale ₱1,000 · discount ₱200 · VAT ₱0 · due ₱800
 *   wrong:     discount 20% of ₱1,120 = ₱224 · due ₱896 → ₱800 after VAT
 *
 * Both collect ₱800. Only the first reports a ₱200 discount, which is the
 * deductible amount. The second overstates the deduction by ₱24 on every
 * transaction.
 *
 * ## What this does not decide
 *
 * Whether a given service is VAT-able at all. Medical and hospital services
 * are VAT-exempt under NIRC §109(G) except when rendered by professionals,
 * and a clinic may also be below the VAT threshold entirely. That is the
 * tenant's `vatPercent` setting, passed in — when it is zero there is no VAT
 * to strip and the 20% applies to the gross. Per-service VAT treatment is
 * not modelled yet; a clinic with a mix of VAT-able and VAT-exempt lines
 * needs that before this is complete for them.
 */

/** A statutory entitlement a patient can hold. */
export type EntitlementType = 'SENIOR_CITIZEN' | 'PWD';

export interface StatutoryRule {
  /** Percentage off the VAT-exempt sale. 20 for both RA 9994 and RA 10754. */
  percent: number;
  /** Whether the sale is exempt from VAT. True for both. */
  vatExempt: boolean;
}

export interface StatutoryBreakdown {
  /** The charge before anything is applied, VAT-inclusive where VAT applies. */
  grossCentavos: number;
  /** The sale with VAT removed — the base the discount is taken from. */
  vatExemptSaleCentavos: number;
  /** The statutory discount. This is the deductible figure. */
  discountCentavos: number;
  /** VAT actually charged. Zero whenever the entitlement exempts it. */
  vatCentavos: number;
  /** What the patient pays. */
  netCentavos: number;
}

/**
 * Round half away from zero, in centavos.
 *
 * `Math.round` rounds half *up* rather than half away from zero, so −0.5
 * becomes −0 rather than −1. Amounts here are non-negative in practice, but
 * a helper that only works for positives is a trap for the next caller.
 */
function roundCentavos(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Apply a statutory discount to a gross charge.
 *
 * `vatPercent` is the tenant's VAT rate (12 in the Philippines, 0 for a
 * non-VAT or VAT-exempt clinic). When the rule is not VAT-exempting, VAT is
 * charged on the discounted sale as normal.
 *
 * The components are computed so that they reconcile: vatExemptSale −
 * discount + vat === net, exactly, after rounding. Rounding each part
 * independently and hoping they add up is how an invoice ends up one
 * centavo short of itself.
 */
export function applyStatutoryDiscount(
  grossCentavos: number,
  vatPercent: number,
  rule: StatutoryRule,
): StatutoryBreakdown {
  if (grossCentavos < 0) {
    throw new RangeError('grossCentavos must not be negative');
  }
  if (vatPercent < 0) {
    throw new RangeError('vatPercent must not be negative');
  }
  if (rule.percent < 0 || rule.percent > 100) {
    throw new RangeError('rule.percent must be between 0 and 100');
  }

  // Strip VAT only when there is VAT in the price to strip. A clinic with
  // vatPercent = 0 quotes VAT-exclusive prices already.
  const divisor = 1 + vatPercent / 100;
  const vatExemptSale = rule.vatExempt
    ? roundCentavos(grossCentavos / divisor)
    : grossCentavos;

  const discount = roundCentavos((vatExemptSale * rule.percent) / 100);
  const discountedSale = vatExemptSale - discount;

  // A rule that grants a discount without exempting VAT still owes VAT on
  // what is actually sold.
  const vat = rule.vatExempt
    ? 0
    : roundCentavos((discountedSale * vatPercent) / 100);

  return {
    grossCentavos,
    vatExemptSaleCentavos: vatExemptSale,
    discountCentavos: discount,
    vatCentavos: vat,
    netCentavos: discountedSale + vat,
  };
}

/**
 * Which entitlement applies when a patient holds more than one.
 *
 * A senior citizen who is also a person with disability is entitled to
 * **one** 20% discount, not two. RA 10754's IRR is explicit that the
 * benefits are not cumulative for the same purchase.
 *
 * Returns the most favourable single entitlement, so the patient is never
 * worse off for holding both, and ties break toward SENIOR_CITIZEN only for
 * determinism — at equal percentages the choice has no effect on the money.
 */
export function selectEntitlement<
  T extends { type: EntitlementType; rule: StatutoryRule },
>(held: readonly T[]): T | null {
  if (held.length === 0) return null;
  return [...held].sort((a, b) => {
    if (b.rule.percent !== a.rule.percent) {
      return b.rule.percent - a.rule.percent;
    }
    if (a.rule.vatExempt !== b.rule.vatExempt) {
      return a.rule.vatExempt ? -1 : 1;
    }
    return a.type === 'SENIOR_CITIZEN' ? -1 : 1;
  })[0];
}

/** Is an entitlement usable on `at`? */
export function entitlementIsActive(
  e: { validFrom: Date | null; validUntil: Date | null },
  at: Date,
): boolean {
  if (e.validFrom !== null && at < e.validFrom) return false;
  if (e.validUntil !== null && at > e.validUntil) return false;
  return true;
}

/** The statutory defaults, used when a tenant has configured no rule. */
export const PH_DEFAULT_RULES: Record<EntitlementType, StatutoryRule> = {
  // RA 9994 §4(a) — 20% and VAT exemption on medical and dental services,
  // diagnostic and laboratory fees.
  SENIOR_CITIZEN: { percent: 20, vatExempt: true },
  // RA 10754 §1 — the same benefit for persons with disability.
  PWD: { percent: 20, vatExempt: true },
};
