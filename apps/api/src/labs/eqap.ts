/**
 * External Quality Assessment — proficiency testing.
 *
 * Pure and Prisma-free, like ./westgard.ts and ./fitness.ts.
 *
 * Internal QC (./westgard.ts) shows an analytical process is stable against
 * its own established mean. It cannot show the mean is *right*. A laboratory
 * can be beautifully in control around a value that is systematically wrong,
 * and internal QC will say nothing — every run agrees with every other run.
 *
 * EQAP closes that. A provider sends the same unknown specimen to every
 * enrolled laboratory, collects the results, and reports back how far each
 * sat from the peer consensus. It is the only routine check that catches a
 * whole-laboratory bias, and participation is what an inspection asks to
 * see evidence of.
 */

export type SubmissionState =
  /** Not yet submitted, deadline still ahead. */
  | 'PENDING'
  /** Not submitted and the deadline has passed. */
  | 'OVERDUE'
  /** Submitted, awaiting the provider's evaluation. */
  | 'SUBMITTED'
  /** Scored by the provider. */
  | 'SCORED';

export type Performance = 'ACCEPTABLE' | 'UNACCEPTABLE';

/**
 * The conventional acceptance limit, as a standard deviation index.
 *
 * |SDI| <= 2 is the usual threshold across EQAP schemes — the same two
 * standard deviations Westgard treats as a warning, but here it is an
 * acceptance decision rather than a flag, because a single survey result is
 * all the evidence there is for that round.
 */
export const DEFAULT_SDI_LIMIT = 2;

/**
 * Where a survey round stands.
 *
 * OVERDUE is distinct from missed-and-closed only by whether anything can
 * still be done about it, which is the provider's business rather than
 * ours; a laboratory that submits late still submitted, and recording that
 * honestly is more useful than a status that hides it.
 */
export function submissionState(
  s: { dueOn: Date | null; submittedAt: Date | null; sdi: number | null },
  at: Date,
): SubmissionState {
  if (s.submittedAt !== null) {
    return s.sdi !== null ? 'SCORED' : 'SUBMITTED';
  }
  if (s.dueOn !== null && at > s.dueOn) return 'OVERDUE';
  return 'PENDING';
}

/**
 * Did this result pass?
 *
 * Returns null when there is nothing to judge — an unscored submission is
 * not a failure, and conflating the two would make a laboratory awaiting
 * results look like one that failed.
 */
export function evaluatePerformance(
  sdi: number | null,
  limit: number = DEFAULT_SDI_LIMIT,
): Performance | null {
  if (sdi === null) return null;
  if (!(limit > 0)) {
    throw new RangeError('SDI limit must be greater than zero');
  }
  return Math.abs(sdi) <= limit ? 'ACCEPTABLE' : 'UNACCEPTABLE';
}

/**
 * Standard deviation index: how far a result sat from the peer consensus.
 *
 * Distinct from the z-score in ./westgard.ts, which measures against the
 * laboratory's OWN established mean. The whole value of EQAP is that this
 * mean comes from everyone else.
 */
export function standardDeviationIndex(
  value: number,
  peerMean: number,
  peerSd: number,
): number {
  if (!(peerSd > 0)) {
    throw new RangeError('peer SD must be greater than zero');
  }
  return (value - peerMean) / peerSd;
}

export interface EnrolmentWindow {
  validFrom: Date | null;
  validUntil: Date | null;
}

/** Is the laboratory currently enrolled? */
export function enrolmentIsActive(e: EnrolmentWindow, at: Date): boolean {
  if (e.validFrom !== null && at < e.validFrom) return false;
  if (e.validUntil !== null && at > e.validUntil) return false;
  return true;
}

export interface ParticipationSummary {
  total: number;
  scored: number;
  acceptable: number;
  unacceptable: number;
  /** Submitted after the deadline, or not submitted at all. */
  missedOrLate: number;
  /** Unacceptable results with no corrective action recorded. */
  unresolved: number;
}

/**
 * What an inspector actually asks for: the participation record.
 *
 * `unresolved` is the number that matters. An unacceptable EQAP result is
 * not itself a finding — laboratories fail surveys — but an unacceptable
 * result with no corrective action recorded against it is, because it says
 * nobody looked into it.
 */
export function summariseParticipation(
  submissions: ReadonlyArray<{
    dueOn: Date | null;
    submittedAt: Date | null;
    sdi: number | null;
    correctiveAction: string | null;
  }>,
  at: Date,
  limit: number = DEFAULT_SDI_LIMIT,
): ParticipationSummary {
  let scored = 0;
  let acceptable = 0;
  let unacceptable = 0;
  let missedOrLate = 0;
  let unresolved = 0;

  for (const s of submissions) {
    const state = submissionState(s, at);
    if (state === 'OVERDUE') missedOrLate += 1;
    else if (
      s.submittedAt !== null &&
      s.dueOn !== null &&
      s.submittedAt > s.dueOn
    ) {
      missedOrLate += 1;
    }

    const perf = evaluatePerformance(s.sdi, limit);
    if (perf !== null) {
      scored += 1;
      if (perf === 'ACCEPTABLE') acceptable += 1;
      else {
        unacceptable += 1;
        if ((s.correctiveAction ?? '').trim().length === 0) unresolved += 1;
      }
    }
  }

  return {
    total: submissions.length,
    scored,
    acceptable,
    unacceptable,
    missedOrLate,
    unresolved,
  };
}
