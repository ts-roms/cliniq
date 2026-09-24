import {
  canIssueReport,
  formatReportNumber,
  hashReportContent,
  reportIsCurrent,
  type ReportableResult,
} from './reporting.js';

const result = (over: Partial<ReportableResult> = {}): ReportableResult => ({
  testCode: 'K',
  testName: 'Potassium',
  resultValue: '4.1',
  resultUnit: 'mmol/L',
  abnormalFlag: 'NORMAL',
  resultStatus: 'FINAL',
  ...over,
});

describe('hashReportContent', () => {
  it('is stable for the same content', () => {
    expect(hashReportContent([result()])).toBe(hashReportContent([result()]));
  });

  it('does not depend on the order results come back in', () => {
    // A test re-collected onto a different specimen changes the query order
    // without changing what the report says.
    const a = [result({ testCode: 'K' }), result({ testCode: 'NA' })];
    const b = [result({ testCode: 'NA' }), result({ testCode: 'K' })];
    expect(hashReportContent(a)).toBe(hashReportContent(b));
  });

  it('changes when a value changes', () => {
    expect(hashReportContent([result({ resultValue: '6.8' })])).not.toBe(
      hashReportContent([result({ resultValue: '4.1' })]),
    );
  });

  it('changes when only the status changes', () => {
    // FINAL -> CORRECTED with the same number is still a different clinical
    // statement. A report signed before the correction must not validate
    // against it afterwards.
    expect(hashReportContent([result({ resultStatus: 'CORRECTED' })])).not.toBe(
      hashReportContent([result({ resultStatus: 'FINAL' })]),
    );
  });

  it('changes when the flag changes but the value does not', () => {
    // Re-flagging against a corrected reference interval is a real change to
    // what the report asserts.
    expect(hashReportContent([result({ abnormalFlag: 'HIGH' })])).not.toBe(
      hashReportContent([result({ abnormalFlag: 'NORMAL' })]),
    );
  });

  it('does not let adjacent fields run together', () => {
    // Without a separator, ("AB","C") and ("A","BC") would hash alike.
    const a = [result({ testCode: 'AB', testName: 'C' })];
    const b = [result({ testCode: 'A', testName: 'BC' })];
    expect(hashReportContent(a)).not.toBe(hashReportContent(b));
  });

  it('distinguishes one result from two', () => {
    expect(hashReportContent([result()])).not.toBe(
      hashReportContent([result(), result({ testCode: 'NA' })]),
    );
  });

  it('treats a null value and an empty string alike, and says so', () => {
    // Both mean "nothing here". This is deliberate, not an accident of
    // coalescing: a report cannot distinguish them either.
    expect(hashReportContent([result({ resultValue: null })])).toBe(
      hashReportContent([result({ resultValue: '' })]),
    );
  });
});

describe('reportIsCurrent', () => {
  it('holds while nothing has changed', () => {
    const results = [result()];
    expect(reportIsCurrent(hashReportContent(results), results)).toBe(true);
  });

  it('fails once a result is corrected', () => {
    const signed = hashReportContent([result({ resultValue: '6.8' })]);
    const now = [result({ resultValue: '4.2', resultStatus: 'CORRECTED' })];
    expect(reportIsCurrent(signed, now)).toBe(false);
  });

  it('fails on a hash from nowhere rather than throwing', () => {
    expect(reportIsCurrent('not-a-hash', [result()])).toBe(false);
  });
});

describe('formatReportNumber', () => {
  it('matches the LAB-/LR- family shape', () => {
    expect(formatReportNumber(new Date('2026-09-24T00:00:00Z'), 1)).toBe(
      'LR-202609-0001',
    );
  });

  it('does not truncate past 9999', () => {
    expect(formatReportNumber(new Date('2026-09-24T00:00:00Z'), 12345)).toBe(
      'LR-202609-12345',
    );
  });

  it('is UTC, so a late-evening local issue does not split the series', () => {
    // 23:00Z on the 30th is already October in Manila (UTC+8).
    expect(formatReportNumber(new Date('2026-09-30T23:00:00Z'), 7)).toBe(
      'LR-202609-0007',
    );
  });
});

describe('canIssueReport', () => {
  it('allows a fully released order', () => {
    expect(
      canIssueReport([result(), result({ resultStatus: 'CORRECTED' })]),
    ).toEqual({ ok: true });
  });

  it('refuses while anything is unreleased', () => {
    // Signing a report containing a value nobody has stood behind puts a PRC
    // licence against it — the exact thing verification exists to prevent.
    for (const status of ['PENDING', 'PRELIMINARY']) {
      const r = canIssueReport([result(), result({ resultStatus: status })]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/Potassium/);
    }
  });

  it('names every test still outstanding, not just the first', () => {
    const r = canIssueReport([
      result({ testName: 'Sodium', resultStatus: 'PRELIMINARY' }),
      result({ testName: 'Chloride', resultStatus: 'PRELIMINARY' }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Sodium/);
      expect(r.reason).toMatch(/Chloride/);
    }
  });

  it('refuses an order with no tests rather than issuing an empty report', () => {
    const r = canIssueReport([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no tests/);
  });
});
