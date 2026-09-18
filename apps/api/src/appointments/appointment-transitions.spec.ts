import { AppointmentStatus } from '@org/db';
import {
  LIVE_STATUSES,
  RESCHEDULABLE,
  assertTransition,
  canTransition,
  overlapWhere,
  transitionData,
} from './appointment-transitions';

const S = AppointmentStatus;

describe('appointment state machine', () => {
  it('walks the happy path', () => {
    expect(canTransition(S.SCHEDULED, S.CHECKED_IN)).toBe(true);
    expect(canTransition(S.CHECKED_IN, S.IN_PROGRESS)).toBe(true);
    expect(canTransition(S.IN_PROGRESS, S.COMPLETED)).toBe(true);
  });

  it('allows walking straight into a consult (telemed / no front desk)', () => {
    expect(canTransition(S.SCHEDULED, S.IN_PROGRESS)).toBe(true);
  });

  it('terminal states never move', () => {
    for (const from of [S.COMPLETED, S.CANCELLED, S.NO_SHOW]) {
      for (const to of Object.values(S)) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('cannot complete without starting, cannot check in twice', () => {
    expect(canTransition(S.SCHEDULED, S.COMPLETED)).toBe(false);
    expect(canTransition(S.CHECKED_IN, S.COMPLETED)).toBe(false);
    expect(canTransition(S.CHECKED_IN, S.CHECKED_IN)).toBe(false);
    expect(canTransition(S.IN_PROGRESS, S.NO_SHOW)).toBe(false);
  });

  it('assertTransition throws a typed error naming both ends', () => {
    expect(() => assertTransition(S.COMPLETED, S.CANCELLED)).toThrow(
      /COMPLETED to CANCELLED/,
    );
    expect(() => assertTransition(S.SCHEDULED, S.CANCELLED)).not.toThrow();
  });

  it('reschedulable = live pre-consult states + no-show; live = occupies the calendar', () => {
    expect([...RESCHEDULABLE].sort()).toEqual([
      'CHECKED_IN',
      'NO_SHOW',
      'SCHEDULED',
    ]);
    expect([...LIVE_STATUSES].sort()).toEqual([
      'CHECKED_IN',
      'IN_PROGRESS',
      'SCHEDULED',
    ]);
  });

  it('stamps exactly one lifecycle timestamp per transition', () => {
    const now = new Date('2026-09-17T09:00:00Z');
    expect(transitionData(S.CHECKED_IN, now)).toEqual({
      status: S.CHECKED_IN,
      checkedInAt: now,
    });
    expect(transitionData(S.IN_PROGRESS, now)).toEqual({
      status: S.IN_PROGRESS,
      startedAt: now,
    });
    expect(transitionData(S.COMPLETED, now)).toEqual({
      status: S.COMPLETED,
      completedAt: now,
    });
    expect(transitionData(S.CANCELLED, now)).toEqual({
      status: S.CANCELLED,
      cancelledAt: now,
    });
    expect(transitionData(S.NO_SHOW, now)).toEqual({
      status: S.NO_SHOW,
      noShowAt: now,
    });
  });

  it('overlap uses half-open intervals and ignores terminal rows + self', () => {
    const w = overlapWhere(
      'prov',
      new Date('2026-09-17T09:00Z'),
      new Date('2026-09-17T09:30Z'),
      'me',
    );
    expect(w.providerId).toBe('prov');
    expect(w.status.in.sort()).toEqual([
      'CHECKED_IN',
      'IN_PROGRESS',
      'SCHEDULED',
    ]);
    // existing.startsAt < newEnd AND existing.endsAt > newStart
    expect(w.startsAt).toEqual({ lt: new Date('2026-09-17T09:30Z') });
    expect(w.endsAt).toEqual({ gt: new Date('2026-09-17T09:00Z') });
    expect(w.id).toEqual({ not: 'me' });
    expect('id' in overlapWhere('prov', new Date(), new Date())).toBe(false);
  });
});
