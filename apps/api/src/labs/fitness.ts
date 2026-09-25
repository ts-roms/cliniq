/**
 * Is the equipment and reagent fit to produce a result?
 *
 * Pure and Prisma-free, like ./westgard.ts and ./capability.ts.
 *
 * §6.13 names the point plainly: link the equipment and reagent lot to the
 * result "so a recalled lot can be traced to every result it produced. That
 * traceability is the whole point." Everything here serves that — the
 * fitness checks exist so the link is worth having, because knowing which
 * lot produced a result matters most when the lot turns out to have been
 * unfit.
 *
 * ## Why reagents are not inventory
 *
 * The clinic already has `InventoryItem` / `StockBatch` with FEFO
 * consumption, and it is the wrong shape for this. A reagent has two
 * expiries, not one: the manufacturer's date on the unopened vial, and a
 * much shorter **in-use stability** once it is opened and sitting on the
 * analyser. A lot that is three months from its printed expiry can be
 * unusable because it was opened four weeks ago. Inventory has no concept
 * of that, and bolting it on would make consumable stock and diagnostic
 * reagents share a model that serves neither.
 */

export type Fitness =
  | { ok: true; warnings: string[] }
  | { ok: false; reason: string; warnings: string[] };

export interface CalibrationStatus {
  /** No calibration has ever been recorded. */
  never: boolean;
  overdue: boolean;
  /** Days until due; negative once past, null when no interval is set. */
  daysRemaining: number | null;
}

const DAY_MS = 86_400_000;

/** Whole days between two instants, floored. */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * When is this analyser next due for calibration?
 *
 * A null interval means the laboratory has not set one, which is reported as
 * "no interval" rather than "never due". Silently treating unset as
 * compliant is how a machine goes two years without calibration and nothing
 * anywhere says so.
 */
export function calibrationStatus(
  last: { calibratedAt: Date | null; intervalDays: number | null },
  at: Date,
): CalibrationStatus {
  if (last.calibratedAt === null) {
    return { never: true, overdue: false, daysRemaining: null };
  }
  if (last.intervalDays === null || last.intervalDays <= 0) {
    return { never: false, overdue: false, daysRemaining: null };
  }
  const due = new Date(
    last.calibratedAt.getTime() + last.intervalDays * DAY_MS,
  );
  const remaining = daysBetween(at, due);
  return { never: false, overdue: remaining < 0, daysRemaining: remaining };
}

export interface ReagentLotState {
  expiresOn: Date | null;
  /** When the vial was first opened. Null while still sealed. */
  openedOn: Date | null;
  /** Days the reagent remains usable once opened. Null when not specified. */
  openStabilityDays: number | null;
}

export interface ReagentLotStatus {
  expired: boolean;
  /** Past its in-use stability, even though the printed date is in future. */
  openStabilityExceeded: boolean;
  /** Days until the earlier of the two limits. Null when neither is set. */
  daysRemaining: number | null;
}

/**
 * Is this reagent lot still usable?
 *
 * Two clocks run against a reagent and the earlier one wins: the printed
 * expiry, and the in-use stability that starts when the vial is opened. A
 * lot months from its printed date can be unusable because it was opened
 * weeks ago, and reporting only the printed date would say it was fine.
 */
export function reagentLotStatus(
  lot: ReagentLotState,
  at: Date,
): ReagentLotStatus {
  const expired = lot.expiresOn !== null && at > lot.expiresOn;

  let openUntil: Date | null = null;
  if (lot.openedOn !== null && (lot.openStabilityDays ?? 0) > 0) {
    openUntil = new Date(
      lot.openedOn.getTime() + (lot.openStabilityDays as number) * DAY_MS,
    );
  }
  const openStabilityExceeded = openUntil !== null && at > openUntil;

  const limits = [lot.expiresOn, openUntil].filter(
    (d): d is Date => d !== null,
  );
  const earliest =
    limits.length === 0
      ? null
      : limits.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));

  return {
    expired,
    openStabilityExceeded,
    daysRemaining: earliest === null ? null : daysBetween(at, earliest),
  };
}

/** How close to a limit counts as worth saying out loud. */
export const EXPIRY_WARNING_DAYS = 7;

/**
 * May this equipment and reagent be used to produce a result?
 *
 * Refuses on things that make a result meaningless — an expired reagent, a
 * lot past its in-use stability, equipment that is out of service. Warns on
 * things a person should know but which do not invalidate the number: a
 * calibration overdue, a lot about to expire.
 *
 * Calibration is a WARNING, not a refusal, and that is a deliberate
 * asymmetry. An expired reagent produces a number that means nothing; an
 * overdue calibration produces a number that is probably fine and possibly
 * drifting. Blocking the second would have a laboratory unable to report
 * anything the morning a service visit slips, which is how people learn to
 * work around the system rather than with it.
 */
export function fitnessForTesting(input: {
  equipment: { status: string; name: string } | null;
  calibration: CalibrationStatus | null;
  reagentLot: { name: string; lotNumber: string } | null;
  /** Precomputed by `reagentLotStatus` — the clock lives there, not here. */
  reagentStatus: ReagentLotStatus | null;
}): Fitness {
  const warnings: string[] = [];

  if (input.equipment !== null && input.equipment.status !== 'ACTIVE') {
    return {
      ok: false,
      reason: `${input.equipment.name} is ${input.equipment.status.toLowerCase()} and must not be used for patient testing`,
      warnings,
    };
  }

  if (input.reagentLot !== null && input.reagentStatus !== null) {
    const { name, lotNumber } = input.reagentLot;
    if (input.reagentStatus.expired) {
      return {
        ok: false,
        reason: `${name} lot ${lotNumber} has expired`,
        warnings,
      };
    }
    if (input.reagentStatus.openStabilityExceeded) {
      return {
        ok: false,
        reason: `${name} lot ${lotNumber} is past its in-use stability since opening`,
        warnings,
      };
    }
    const left = input.reagentStatus.daysRemaining;
    if (left !== null && left <= EXPIRY_WARNING_DAYS) {
      warnings.push(
        `${name} lot ${lotNumber} is usable for ${left} more day(s)`,
      );
    }
  }

  if (input.calibration !== null) {
    if (input.calibration.never) {
      warnings.push('this equipment has no calibration on record');
    } else if (input.calibration.overdue) {
      warnings.push(
        `calibration is overdue by ${Math.abs(input.calibration.daysRemaining ?? 0)} day(s)`,
      );
    }
  }

  return { ok: true, warnings };
}
