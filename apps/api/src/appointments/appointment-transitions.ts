import { AppointmentStatus } from '@org/db';

/**
 * The appointment state machine, as data. Everything that moves an
 * appointment — the appointments controller, the consult that opens from a
 * slot, the no-show sweep — goes through `assertTransition` so there is one
 * place that says what is legal.
 *
 *   SCHEDULED ──check-in──▶ CHECKED_IN ──start──▶ IN_PROGRESS ──complete──▶ COMPLETED
 *       │  └──────────────start (walk straight in / telemed)──▶ IN_PROGRESS
 *       ├──▶ CANCELLED                 ├──▶ CANCELLED           └──▶ CANCELLED (abandoned)
 *       └──▶ NO_SHOW                   └──▶ NO_SHOW (checked in, then left)
 *
 * COMPLETED / CANCELLED / NO_SHOW are terminal for status changes; NO_SHOW
 * (and the two live pre-consult states) can be *rescheduled*, which is a
 * separate operation that lands back on SCHEDULED with a new slot.
 */
const ALLOWED: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  SCHEDULED: [
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ],
  CHECKED_IN: [
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ],
  IN_PROGRESS: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Statuses that may be moved to a new slot. */
export const RESCHEDULABLE: readonly AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.NO_SHOW,
];

/** Statuses that occupy the provider's calendar (used by the overlap check
 *  and mirrored by the DB exclusion constraint). */
export const LIVE_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
];

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: AppointmentStatus,
    public readonly to: AppointmentStatus,
  ) {
    super(`cannot move an appointment from ${from} to ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/**
 * Column updates for landing on `to` at `now`: the status plus the matching
 * lifecycle timestamp. Timestamps are only ever set, never cleared here —
 * reschedule handles the NO_SHOW → SCHEDULED reset itself.
 */
export function transitionData(
  to: AppointmentStatus,
  now: Date = new Date(),
): {
  status: AppointmentStatus;
  checkedInAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  noShowAt?: Date;
} {
  switch (to) {
    case AppointmentStatus.CHECKED_IN:
      return { status: to, checkedInAt: now };
    case AppointmentStatus.IN_PROGRESS:
      return { status: to, startedAt: now };
    case AppointmentStatus.COMPLETED:
      return { status: to, completedAt: now };
    case AppointmentStatus.CANCELLED:
      return { status: to, cancelledAt: now };
    case AppointmentStatus.NO_SHOW:
      return { status: to, noShowAt: now };
    default:
      return { status: to };
  }
}

/**
 * Prisma `where` for "another live appointment of this provider overlaps
 * [startsAt, endsAt)". Half-open so back-to-back slots don't collide.
 */
export function overlapWhere(
  providerId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
) {
  return {
    providerId,
    deletedAt: null,
    status: { in: [...LIVE_STATUSES] },
    startsAt: { lt: endsAt },
    endsAt: { gt: startsAt },
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
}
