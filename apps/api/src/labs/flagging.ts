/**
 * Result flagging: reference ranges and critical limits.
 *
 * Everything here is pure so it can be unit-tested hard. A silent arithmetic
 * error in this file is a patient-safety incident, not a cosmetic bug.
 *
 * WHY THIS EXISTS
 * ---------------
 * Critical limits used to be *derived* from the reference range:
 *
 *     criticalHigh = referenceHigh * 1.5
 *     criticalLow  = referenceLow  * 0.5
 *
 * That is not how critical values work. They are per-analyte clinical
 * thresholds set by the laboratory, unrelated to the width of the reference
 * interval. Serum potassium (reference 3.5–5.1 mmol/L) shows the damage:
 *
 *                       derived          clinically accepted
 *     CRITICAL_HIGH     >= 7.65          >= 6.0–6.5
 *     CRITICAL_LOW      <= 1.75          <= 2.5
 *
 * so a potassium of 6.8 — a result someone should be telephoned about — came
 * back merely HIGH, and 2.2 came back merely LOW. The rule under-flagged in
 * the direction that hurts.
 *
 * The replacement rule is: **a critical limit is only ever a configured
 * number.** With none configured, a result can still be HIGH or LOW against
 * its reference range, but it is never called CRITICAL. Saying nothing is
 * safe; inventing a threshold is not.
 *
 * SCOPE
 * -----
 * Numeric results only. A qualitative critical ("Reactive", "Positive",
 * a growth on culture) is a real thing this does not yet model — the caller
 * must pass an explicit `abnormalFlag` for those, exactly as before. Doing it
 * properly needs a coded-result type and belongs with the test catalogue.
 */

/** Mirrors the `Sex` enum in the Prisma schema. */
export type PatientSex = 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';

export type ResultFlag =
  | 'NORMAL'
  | 'LOW'
  | 'HIGH'
  | 'CRITICAL_LOW'
  | 'CRITICAL_HIGH'
  | 'ABNORMAL';

export interface ReferenceLimits {
  referenceLow: number | null;
  referenceHigh: number | null;
}

export interface CriticalLimits {
  criticalLow: number | null;
  criticalHigh: number | null;
}

/**
 * A configured critical-limit rule, narrowed by patient demographics and
 * bounded in time. Shaped to match the `CriticalValueRule` row but kept as a
 * plain interface so this module never imports Prisma.
 */
export interface CriticalValueRuleLike extends CriticalLimits {
  /** Inclusive lower bound on age in days. Null = no lower bound. */
  ageMinDays: number | null;
  /** Exclusive upper bound on age in days. Null = no upper bound. */
  ageMaxDays: number | null;
  /** Null = applies to any sex. */
  sex: PatientSex | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface PatientContext {
  /** Null when the patient's date of birth is unknown. */
  ageDays: number | null;
  sex: PatientSex | null;
}

/**
 * Normalise a test identifier into the key rules are matched on.
 *
 * `LabOrderItem` has a free-text `testName` and an optional `testCode`, so
 * "CBC", " cbc " and "C.B.C" must land on one key. This is a stopgap: once a
 * real test catalogue exists, rules hang off a component id and this function
 * goes away. Until then it is the join, so it must be applied identically when
 * a rule is written and when a result is flagged — always call it, never
 * hand-roll the comparison.
 */
export function normaliseTestKey(
  testCode: string | null | undefined,
  testName?: string | null,
): string {
  const raw = (testCode ?? '').trim() || (testName ?? '').trim();
  return raw
    .toUpperCase()
    .replace(/[.\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when `rule` applies to this patient at this moment.
 *
 * An unknown age or sex matches only rules that do not narrow on that
 * dimension — a rule written for neonates must not be applied to a patient
 * whose date of birth we do not have.
 */
export function ruleApplies(
  rule: CriticalValueRuleLike,
  patient: PatientContext,
  at: Date,
): boolean {
  if (rule.effectiveFrom.getTime() > at.getTime()) return false;
  if (rule.effectiveTo !== null && rule.effectiveTo.getTime() <= at.getTime()) {
    return false;
  }
  if (rule.sex !== null && rule.sex !== patient.sex) return false;
  if (rule.ageMinDays !== null || rule.ageMaxDays !== null) {
    if (patient.ageDays === null) return false;
    if (rule.ageMinDays !== null && patient.ageDays < rule.ageMinDays) {
      return false;
    }
    if (rule.ageMaxDays !== null && patient.ageDays >= rule.ageMaxDays) {
      return false;
    }
  }
  return true;
}

/**
 * Pick the single rule to apply from the candidates for one test.
 *
 * Most specific wins: a sex-specific rule beats an any-sex one, an age-banded
 * rule beats an unbanded one, and a narrower band beats a wider one. Ties go
 * to the most recently effective rule, so re-issuing limits is just inserting
 * a row with a later `effectiveFrom`.
 */
export function selectCriticalRule<T extends CriticalValueRuleLike>(
  rules: readonly T[],
  patient: PatientContext,
  at: Date,
): T | null {
  const applicable = rules.filter((r) => ruleApplies(r, patient, at));
  if (applicable.length === 0) return null;
  return applicable.reduce((best, r) =>
    compareSpecificity(r, best) > 0 ? r : best,
  );
}

/** >0 when `a` is more specific than `b`. */
function compareSpecificity(
  a: CriticalValueRuleLike,
  b: CriticalValueRuleLike,
): number {
  const score = (r: CriticalValueRuleLike) =>
    (r.sex !== null ? 2 : 0) +
    (r.ageMinDays !== null || r.ageMaxDays !== null ? 1 : 0);
  const byScore = score(a) - score(b);
  if (byScore !== 0) return byScore;

  // Both banded (or both not): the tighter band is the more specific.
  const span = (r: CriticalValueRuleLike) =>
    (r.ageMaxDays ?? Number.MAX_SAFE_INTEGER) - (r.ageMinDays ?? 0);
  const bySpan = span(b) - span(a);
  if (bySpan !== 0) return bySpan;

  return a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
}

/**
 * Flag a result value.
 *
 * Returns `undefined` when no judgement is possible — a non-numeric value, or
 * a numeric one with no limits of any kind configured. `undefined` means "not
 * flagged", which is honest; it is not the same as NORMAL, and callers must
 * not coerce it into one.
 *
 * Critical limits are checked before the reference range, and are inclusive
 * (`<= criticalLow`, `>= criticalHigh`) per the usual laboratory convention.
 * Reference bounds are exclusive (`< referenceLow`, `> referenceHigh`) so a
 * value sitting exactly on a bound reads as NORMAL.
 */
export function deriveFlag(
  value: string | number | null | undefined,
  reference: ReferenceLimits,
  critical: CriticalLimits = { criticalLow: null, criticalHigh: null },
): ResultFlag | undefined {
  if (value === null || value === undefined) return undefined;
  // Trim BEFORE parsing: Number('   ') is 0, not NaN, so a blank result would
  // otherwise parse as zero and flag LOW — or CRITICAL_LOW once limits exist.
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    n = Number(trimmed);
  }
  if (!Number.isFinite(n)) return undefined;

  const { criticalLow, criticalHigh } = critical;
  const { referenceLow, referenceHigh } = reference;

  // Critical first. If a misconfigured pair overlaps, the low side wins:
  // a critically low value is the more time-sensitive call.
  if (criticalLow !== null && n <= criticalLow) return 'CRITICAL_LOW';
  if (criticalHigh !== null && n >= criticalHigh) return 'CRITICAL_HIGH';

  if (referenceLow === null && referenceHigh === null) {
    // No reference interval and not critical: there is nothing to compare
    // against, so we decline to call it NORMAL.
    return undefined;
  }
  if (referenceHigh !== null && n > referenceHigh) return 'HIGH';
  if (referenceLow !== null && n < referenceLow) return 'LOW';
  return 'NORMAL';
}

/** Flags that mean "tell the ordering clinician now". */
export function isCritical(flag: ResultFlag | null | undefined): boolean {
  return flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
}

/** Flags that are worth surfacing at all. */
export function isAbnormal(flag: ResultFlag | null | undefined): boolean {
  return flag !== undefined && flag !== null && flag !== 'NORMAL';
}

/** Whole days elapsed, or null when the date of birth is unknown. */
export function ageInDays(
  dateOfBirth: Date | null | undefined,
  at: Date,
): number | null {
  if (!dateOfBirth) return null;
  const ms = at.getTime() - dateOfBirth.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}
