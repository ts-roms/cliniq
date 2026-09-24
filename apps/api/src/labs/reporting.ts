import { createHash } from 'node:crypto';

/**
 * Lab report integrity.
 *
 * Pure and Prisma-free, like ./flagging.ts and ./verification.ts, so the
 * rules can be tested without a database.
 *
 * A signed report is a legal artifact: someone put their PRC licence against
 * a set of values on a given day. The problem that creates is that results
 * can be corrected afterwards. A report that still says 6.8 when the result
 * now says 4.2 is not merely out of date — it is a signed document asserting
 * something untrue, and nothing in the row itself would reveal that.
 *
 * The content hash closes it. The hash is taken over exactly the values the
 * report was built from, and stored both on the report and on each signature.
 * Recomputing it against the current results answers "is this report still
 * what was signed?" without diffing anything, and without trusting a
 * timestamp.
 */

/** One released result, as it appears on a report. */
export interface ReportableResult {
  testCode: string | null;
  testName: string;
  resultValue: string | null;
  resultUnit: string | null;
  abnormalFlag: string | null;
  resultStatus: string;
}

/**
 * Hash the content of a report.
 *
 * Sorted by test code then name so that reordering the query — or a test
 * being re-collected onto a different specimen — does not invent a
 * difference where none exists. Field separators are characters that cannot
 * appear in the values themselves, so "AB" + "C" cannot collide with "A" +
 * "BC".
 *
 * `resultStatus` is part of the hash on purpose: a value that goes from
 * FINAL to CORRECTED without the number changing is still a different
 * clinical statement, and a report signed before the correction should not
 * silently validate afterwards.
 */
export function hashReportContent(
  results: readonly ReportableResult[],
): string {
  const canonical = [...results]
    .map((r) => ({
      code: r.testCode ?? '',
      name: r.testName,
      value: r.resultValue ?? '',
      unit: r.resultUnit ?? '',
      flag: r.abnormalFlag ?? '',
      status: r.resultStatus,
    }))
    .sort(
      (a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name),
    )
    .map((r) =>
      [r.code, r.name, r.value, r.unit, r.flag, r.status].join('\u001f'),
    )
    .join('\u001e');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Is a report still an accurate statement of the current results?
 *
 * False means a result changed after the report was signed. The report is not
 * corrected in place — it is superseded by a new version, because the old one
 * was genuinely issued and someone may hold a copy.
 */
export function reportIsCurrent(
  storedHash: string,
  results: readonly ReportableResult[],
): boolean {
  return storedHash === hashReportContent(results);
}

/** Format a lab report number: `LR-202609-0001`. */
export function formatReportNumber(at: Date, value: number): string {
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `LR-${yyyy}${mm}-${String(value).padStart(4, '0')}`;
}

export type IssueRefusal = { ok: true } | { ok: false; reason: string };

/**
 * May a report be issued for these results?
 *
 * Every result must be released. Signing a report that contains a value
 * nobody has stood behind would put a licence against it, which is precisely
 * the thing the verification chain exists to prevent — and unlike the portal,
 * where an unreleased value can simply be hidden, a report is a single
 * artifact that is either signed or not.
 *
 * Partial reports are real in laboratory practice; they are not this. A
 * preliminary report would need its own status and its own signature rules,
 * and issuing one by accident is worse than not having the feature.
 */
export function canIssueReport(
  results: readonly ReportableResult[],
): IssueRefusal {
  if (results.length === 0) {
    return { ok: false, reason: 'this order has no tests to report' };
  }
  const unreleased = results.filter(
    (r) => r.resultStatus !== 'FINAL' && r.resultStatus !== 'CORRECTED',
  );
  if (unreleased.length > 0) {
    return {
      ok: false,
      reason: `every result must be released before the report is issued; still waiting on: ${unreleased
        .map((r) => r.testName)
        .join(', ')}`,
    };
  }
  return { ok: true };
}
