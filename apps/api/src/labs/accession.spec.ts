import {
  accessionPeriod,
  allowedSpecimenTransitions,
  canTransitionSpecimen,
  formatAccessionNumber,
  formatOrderNumber,
  orderPeriod,
} from './accession.js';

describe('period keys', () => {
  it('accessions reset daily, orders monthly', () => {
    const at = new Date('2026-09-24T22:30:00Z');
    expect(accessionPeriod(at)).toBe('2026-09-24');
    expect(orderPeriod(at)).toBe('2026-09');
  });

  it('are UTC, so a late-evening local draw does not split the series', () => {
    // 2026-09-24T23:00Z is already the 25th in Manila (UTC+8). The series key
    // is UTC on purpose: one laboratory day, one sequence, regardless of who
    // is looking at it from where.
    expect(accessionPeriod(new Date('2026-09-24T23:00:00Z'))).toBe(
      '2026-09-24',
    );
  });
});

describe('formatAccessionNumber', () => {
  it('renders a short, hand-writable, chronologically sortable number', () => {
    const at = new Date('2026-09-24T01:00:00Z');
    expect(formatAccessionNumber(at, 1)).toBe('26-0924-0001');
    expect(formatAccessionNumber(at, 147)).toBe('26-0924-0147');
  });

  it('sorts as text in the order specimens were accessioned', () => {
    const at = new Date('2026-09-24T01:00:00Z');
    const nums = [10, 2, 1000, 1].map((n) => formatAccessionNumber(at, n));
    expect([...nums].sort()).toEqual([
      '26-0924-0001',
      '26-0924-0002',
      '26-0924-0010',
      '26-0924-1000',
    ]);
  });

  it('pads day and month so the key is fixed-width', () => {
    expect(formatAccessionNumber(new Date('2026-01-05T00:00:00Z'), 7)).toBe(
      '26-0105-0007',
    );
  });

  it('does not truncate once the daily series passes 9999', () => {
    // Better a longer number than a duplicate one: the unique index is the
    // contract, not the width.
    expect(formatAccessionNumber(new Date('2026-09-24T00:00:00Z'), 12345)).toBe(
      '26-0924-12345',
    );
  });
});

describe('formatOrderNumber', () => {
  it('keeps the existing LAB-YYYYMM-NNNN shape', () => {
    expect(formatOrderNumber(new Date('2026-09-24T00:00:00Z'), 1)).toBe(
      'LAB-202609-0001',
    );
  });
});

describe('specimen state machine', () => {
  it('walks the happy path', () => {
    expect(canTransitionSpecimen('ORDERED', 'COLLECTED')).toBe(true);
    expect(canTransitionSpecimen('COLLECTED', 'RECEIVED')).toBe(true);
    expect(canTransitionSpecimen('RECEIVED', 'PROCESSING')).toBe(true);
    expect(canTransitionSpecimen('PROCESSING', 'COMPLETED')).toBe(true);
  });

  it('refuses to skip collection or reception', () => {
    expect(canTransitionSpecimen('ORDERED', 'RECEIVED')).toBe(false);
    expect(canTransitionSpecimen('ORDERED', 'PROCESSING')).toBe(false);
    expect(canTransitionSpecimen('COLLECTED', 'COMPLETED')).toBe(false);
  });

  it('never goes backwards', () => {
    expect(canTransitionSpecimen('RECEIVED', 'COLLECTED')).toBe(false);
    expect(canTransitionSpecimen('COMPLETED', 'PROCESSING')).toBe(false);
  });

  it('allows rejection from any live state', () => {
    for (const from of ['ORDERED', 'COLLECTED', 'RECEIVED', 'PROCESSING']) {
      expect(canTransitionSpecimen(from, 'REJECTED')).toBe(true);
    }
  });

  it('treats REJECTED as terminal — a re-draw is a NEW specimen', () => {
    // Reusing the accession number for a second tube would lose the chain of
    // custody: two different draws would share one identity.
    expect(allowedSpecimenTransitions('REJECTED')).toEqual([]);
    expect(canTransitionSpecimen('REJECTED', 'COLLECTED')).toBe(false);
    expect(canTransitionSpecimen('REJECTED', 'RECEIVED')).toBe(false);
  });

  it('treats COMPLETED and CANCELLED as terminal', () => {
    expect(allowedSpecimenTransitions('COMPLETED')).toEqual([]);
    expect(allowedSpecimenTransitions('CANCELLED')).toEqual([]);
  });

  it('lets a referred specimen come back or finish elsewhere', () => {
    expect(canTransitionSpecimen('COLLECTED', 'REFERRED')).toBe(true);
    expect(canTransitionSpecimen('REFERRED', 'RECEIVED')).toBe(true);
    expect(canTransitionSpecimen('REFERRED', 'COMPLETED')).toBe(true);
  });

  it('returns nothing for an unknown state rather than throwing', () => {
    expect(allowedSpecimenTransitions('NOT_A_STATE')).toEqual([]);
    expect(canTransitionSpecimen('NOT_A_STATE', 'COLLECTED')).toBe(false);
  });
});
