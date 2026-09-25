/**
 * Westgard multirule evaluation for internal quality control.
 *
 * Pure and Prisma-free, like ./flagging.ts and ./capability.ts. The gap
 * analysis asked for exactly this — an evaluator function with unit tests
 * rather than rules scattered through a service — because these rules are
 * the part a laboratory inspector will ask you to demonstrate, and a rule
 * you cannot demonstrate in isolation is a rule you cannot defend.
 *
 * ## What the rules are for
 *
 * A control material with a known concentration is run alongside patient
 * samples. Its result is expressed as a **z-score**: how many standard
 * deviations from the established mean. Random noise puts about 5% of runs
 * beyond 2 SD even when nothing is wrong, so a single 2 SD result is a
 * warning, not a failure — rejecting on it would have a laboratory chasing
 * one run in twenty for no reason. The multirules exist to separate that
 * noise from real drift.
 *
 * ## The rules implemented
 *
 *   1-2s   one control beyond 2 SD            WARNING — inspect, do not reject
 *   1-3s   one control beyond 3 SD            reject (random error)
 *   2-2s   two consecutive beyond 2 SD, same side   reject (systematic)
 *   R-4s   two controls in a run differing by 4 SD  reject (random)
 *   4-1s   four consecutive beyond 1 SD, same side  reject (systematic)
 *   10x    ten consecutive on the same side of mean reject (systematic)
 *
 * ## What this does not decide
 *
 * Whether to release patient results. That is the laboratory's call and the
 * clinic's configuration — see the `enforce` setting. A rejected run means
 * the analytical process was out of control when those samples ran, which
 * is information the bench needs, but automatically withholding results
 * that may already have been phoned to a doctor is its own hazard.
 */

/** One control observation, newest last. */
export interface QcObservation {
  /** Standard deviations from the target mean. Signed. */
  z: number;
  /** Which control level this was — rules only chain within a level. */
  level: string;
}

export type QcOutcome = 'ACCEPTED' | 'WARNING' | 'REJECTED';

export interface QcEvaluation {
  outcome: QcOutcome;
  /** Rule codes that fired, e.g. ['1-3s']. Empty when accepted. */
  violations: string[];
  /** Plain-language reason, for the bench rather than the log. */
  reason: string | null;
}

/**
 * Evaluate the most recent observation against its history.
 *
 * `history` is every prior observation for the same test and material, oldest
 * first, NOT including `current`. Rules that look back (2-2s, 4-1s, 10x) only
 * chain within the same control level, because a high control drifting says
 * nothing about a normal one.
 *
 * `peers` are the other levels run alongside `current` in the same run, which
 * is what R-4s compares against.
 */
export function evaluateWestgard(
  current: QcObservation,
  history: readonly QcObservation[],
  peers: readonly QcObservation[] = [],
): QcEvaluation {
  const violations: string[] = [];

  // 1-3s — a single wild result. Random error, reject.
  if (Math.abs(current.z) > 3) violations.push('1-3s');

  // R-4s — two levels in the same run four SD apart, even if each is within
  // its own limits. Catches random error a single-level view misses.
  for (const p of peers) {
    if (Math.abs(current.z - p.z) > 4) {
      violations.push('R-4s');
      break;
    }
  }

  // Same-level history, newest last, with `current` appended. Rules that
  // look back chain within one control level: a high control drifting says
  // nothing about a normal one.
  const series = [...history.filter((h) => h.level === current.level), current];

  // 2-2s — two consecutive beyond 2 SD on the same side. Systematic error.
  //
  // This is the ACROSS-RUNS variant (same level, consecutive runs). The
  // within-run variant — both levels in one run beyond 2 SD on the same side
  // — is the other reading of 2-2s and is not implemented; a laboratory that
  // wants it would be relying on something this does not do, so it is said
  // here rather than left to be discovered from behaviour.
  if (beyondSameSide(series, 2, 2)) violations.push('2-2s');

  // 4-1s — four consecutive beyond 1 SD, same side.
  if (beyondSameSide(series, 4, 1)) violations.push('4-1s');

  // 10x — ten consecutive on one side of the mean, however small. A shift
  // this persistent is not chance.
  if (sameSide(series, 10)) violations.push('10x');

  if (violations.length > 0) {
    return {
      outcome: 'REJECTED',
      violations,
      reason: `out of control: ${violations.join(', ')}`,
    };
  }

  // 1-2s — warning only. About one run in twenty lands here by chance; a
  // laboratory that rejects on it is chasing noise.
  if (Math.abs(current.z) > 2) {
    return {
      outcome: 'WARNING',
      violations: ['1-2s'],
      reason: 'beyond 2 SD — inspect before accepting',
    };
  }

  return { outcome: 'ACCEPTED', violations: [], reason: null };
}

/** Are the last `n` observations all beyond `sd` and all on one side? */
function beyondSameSide(
  series: readonly QcObservation[],
  n: number,
  sd: number,
): boolean {
  if (series.length < n) return false;
  const tail = series.slice(-n);
  if (!tail.every((o) => Math.abs(o.z) > sd)) return false;
  return tail.every((o) => o.z > 0) || tail.every((o) => o.z < 0);
}

/** Are the last `n` observations all on the same side of the mean? */
function sameSide(series: readonly QcObservation[], n: number): boolean {
  if (series.length < n) return false;
  const tail = series.slice(-n);
  return tail.every((o) => o.z > 0) || tail.every((o) => o.z < 0);
}

/**
 * The z-score of an observed value against its target.
 *
 * Throws on a non-positive SD rather than returning Infinity: a target with
 * no spread is a configuration error, and silently producing an infinite
 * z-score would reject every run with a rule violation nobody can explain.
 */
export function zScore(value: number, mean: number, sd: number): number {
  if (!(sd > 0)) {
    throw new RangeError('target SD must be greater than zero');
  }
  return (value - mean) / sd;
}

/** Coefficient of variation, as a percentage. The usual precision measure. */
export function coefficientOfVariation(mean: number, sd: number): number {
  if (mean === 0) {
    throw new RangeError('cannot compute CV against a zero mean');
  }
  return Math.abs((sd / mean) * 100);
}
