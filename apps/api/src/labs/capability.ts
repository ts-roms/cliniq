/**
 * Laboratory service capability — DOH AO 2021-0037.
 *
 * Pure and Prisma-free, like ./flagging.ts and ./verification.ts.
 *
 * A licensed clinical laboratory **may not perform examinations beyond its
 * authorized service capability**. A primary laboratory does routine
 * haematology, urinalysis and faecalysis; a secondary adds routine chemistry
 * and cross-matching; a tertiary adds special chemistry, microbiology and
 * immunology. Running a test the licence does not cover is a finding
 * against the licence, not a preference.
 *
 * ## What this decides, and what it does not
 *
 * It answers one question: is this test within the declared capability? What
 * happens next — refer it, flag it, or refuse the order — belongs to
 * ./referral.ts, which knows about destinations and about whether the clinic
 * has asked for the gaps to be policed.
 *
 * Keeping the two apart matters because the answers have different
 * lifetimes. Whether a laboratory may run a test is a fact about its
 * licence; what to do when it may not is a workflow the clinic configures.
 */

export type LtoCategory = 'PRIMARY' | 'SECONDARY' | 'TERTIARY';

/** One declared capability: a whole section, or a single test within one. */
export interface CapabilityEntry {
  sectionId: string | null;
  testId: string | null;
  isEnabled: boolean;
}

/** A test as the check sees it. */
export interface TestRef {
  /**
   * The caller's handle for this test — an order item id.
   *
   * Carried through so results map back unambiguously. Matching on testId
   * would be wrong the moment an order contains the same test twice, which
   * is unusual but not impossible (a repeat on a different specimen).
   */
  ref: string;
  testId: string | null;
  sectionId: string | null;
  testName: string;
}

export type CapabilityVerdict =
  | { status: 'NOT_DECLARED' }
  | { status: 'WITHIN_SCOPE' }
  | { status: 'OUT_OF_SCOPE'; reason: string };

/**
 * Can this laboratory perform this test?
 *
 * Precedence is most-specific-first: an entry naming the test decides,
 * regardless of what its section says. That is what makes "we do chemistry
 * but we send out HbA1c" expressible, and equally "we do not do
 * microbiology except gram stain".
 *
 * An empty declaration means NOT_DECLARED rather than OUT_OF_SCOPE. A
 * laboratory that has not told us what it does has not told us it cannot do
 * anything, and treating silence as prohibition would flag every test in
 * every clinic that never opens this screen.
 */
export function checkCapability(
  test: TestRef,
  declared: readonly CapabilityEntry[],
): CapabilityVerdict {
  if (declared.length === 0) return { status: 'NOT_DECLARED' };

  if (test.testId !== null) {
    const byTest = declared.find((c) => c.testId === test.testId);
    if (byTest) {
      return byTest.isEnabled
        ? { status: 'WITHIN_SCOPE' }
        : {
            status: 'OUT_OF_SCOPE',
            reason: `${test.testName} is not within this laboratory's authorized capability`,
          };
    }
  }

  if (test.sectionId !== null) {
    const bySection = declared.find(
      (c) => c.testId === null && c.sectionId === test.sectionId,
    );
    if (bySection) {
      return bySection.isEnabled
        ? { status: 'WITHIN_SCOPE' }
        : {
            status: 'OUT_OF_SCOPE',
            reason: `${test.testName} belongs to a section this laboratory is not authorized to perform`,
          };
    }
  }

  // Ordered ad hoc, outside the catalogue: there is nothing to match against,
  // so the laboratory has not said it cannot do it.
  if (test.testId === null && test.sectionId === null) {
    return { status: 'NOT_DECLARED' };
  }

  // A declared laboratory that has said nothing about this section has not
  // claimed it. Reporting that is the point of declaring capability at all.
  return {
    status: 'OUT_OF_SCOPE',
    reason: `${test.testName} is not covered by any declared capability`,
  };
}

export interface LicenceStatus {
  /** False when there is no LTO number on file at all. */
  onFile: boolean;
  expired: boolean;
  /** Days until expiry; negative once past, null when open-ended. */
  daysRemaining: number | null;
}

/**
 * The state of the laboratory's licence to operate.
 *
 * Surfaced rather than enforced, for the same reason as capability: a lapsed
 * licence is a matter for the laboratory and the DOH, and refusing to record
 * results would destroy the record of what was actually done during the
 * lapse — which is the last thing an inspection wants missing.
 */
export function licenceStatus(
  lab: { dohLtoNumber: string | null; validUntil: Date | null },
  at: Date,
): LicenceStatus {
  const onFile =
    lab.dohLtoNumber !== null && lab.dohLtoNumber.trim().length > 0;
  if (lab.validUntil === null) {
    return { onFile, expired: false, daysRemaining: null };
  }
  const ms = lab.validUntil.getTime() - at.getTime();
  const days = Math.floor(ms / 86_400_000);
  return { onFile, expired: ms < 0, daysRemaining: days };
}

/**
 * The sections AO 2021-0037 associates with each licence category.
 *
 * Guidance for the person filling the form in, not a rule the code applies:
 * the authoritative list is what appears on the laboratory's own Licence to
 * Operate, and a licence can carry conditions this table knows nothing
 * about. Presented as a starting point precisely so nobody mistakes it for
 * the licence itself.
 */
export const CATEGORY_SECTION_GUIDANCE: Record<LtoCategory, string[]> = {
  PRIMARY: ['HEMATOLOGY', 'URINALYSIS', 'FECALYSIS', 'BLOOD_TYPING'],
  SECONDARY: [
    'HEMATOLOGY',
    'URINALYSIS',
    'FECALYSIS',
    'BLOOD_TYPING',
    'CLINICAL_CHEMISTRY',
    'CROSSMATCHING',
  ],
  TERTIARY: [
    'HEMATOLOGY',
    'URINALYSIS',
    'FECALYSIS',
    'BLOOD_TYPING',
    'CLINICAL_CHEMISTRY',
    'CROSSMATCHING',
    'MICROBIOLOGY',
    'IMMUNOLOGY',
    'SPECIAL_CHEMISTRY',
  ],
};
