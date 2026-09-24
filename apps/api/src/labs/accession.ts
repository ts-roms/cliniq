import type { PrismaClient } from '@org/db';

/**
 * Document numbering.
 *
 * The old `nextOrderNumber` did count-then-format inside a transaction:
 *
 *     const n = await tx.labOrder.count({ where: { number: { startsWith } } });
 *     return `${prefix}-${n + 1}`;
 *
 * At READ COMMITTED two concurrent callers read the same count and format the
 * same number. The unique index then fails one insert, which the exception
 * filter reports as a 500 — a user-visible failure on a correct request.
 * Accession numbers are allocated far more often than order slips, so what
 * was an occasional collision becomes routine.
 *
 * Allocation is one atomic statement: concurrent callers serialise on the
 * sequence row rather than racing. The counter is per (tenant, kind, period),
 * so a daily accession series and a monthly order series coexist without
 * knowing about each other.
 */

/** The period key an accession series resets on: one per day, UTC. */
export function accessionPeriod(at: Date): string {
  return at.toISOString().slice(0, 10); // 2026-09-24
}

/** The period key the lab-order series resets on: one per month, UTC. */
export function orderPeriod(at: Date): string {
  return at.toISOString().slice(0, 7); // 2026-09
}

/**
 * Take the next value in a sequence.
 *
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` is atomic: the row is
 * created at 1 if this is the first call in the period, otherwise incremented
 * in place, and either way the caller gets back the value nobody else can
 * have. Two callers racing produce 1 and 2, never 1 and 1.
 */
export async function nextSequenceValue(
  tx: PrismaClient,
  tenantId: string,
  kind: string,
  period: string,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ nextValue: number }>>`
    INSERT INTO "document_sequences" ("id", "tenantId", "kind", "period", "nextValue", "updatedAt")
    VALUES (gen_random_uuid()::text, ${tenantId}, ${kind}, ${period}, 1, now())
    ON CONFLICT ("tenantId", "kind", "period")
    DO UPDATE SET "nextValue" = "document_sequences"."nextValue" + 1,
                  "updatedAt" = now()
    RETURNING "nextValue"
  `;
  const value = rows[0]?.nextValue;
  if (typeof value !== 'number') {
    throw new Error(`sequence ${kind}/${period} returned no value`);
  }
  return value;
}

/**
 * Format an accession number: `26-0924-0001`.
 *
 * Short enough to read off a label out loud and to write on a tube by hand,
 * and sorted chronologically as text. The year is two digits because the
 * series resets daily — the full date is already in the middle.
 */
export function formatAccessionNumber(at: Date, value: number): string {
  const yy = String(at.getUTCFullYear()).slice(-2);
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(at.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}${dd}-${String(value).padStart(4, '0')}`;
}

/** Format a lab order slip number: `LAB-202609-0001`. */
export function formatOrderNumber(at: Date, value: number): string {
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `LAB-${yyyy}${mm}-${String(value).padStart(4, '0')}`;
}

/**
 * Which specimen-status transitions are allowed.
 *
 * A specimen moves forward through collection and reception, can be rejected
 * or cancelled from any live state, and goes nowhere once it has reached a
 * terminal one. REJECTED is terminal on purpose: the replacement is a NEW
 * specimen with its own accession number, because a re-draw is a different
 * tube and conflating them loses the chain of custody.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  ORDERED: ['COLLECTED', 'CANCELLED', 'REJECTED'],
  COLLECTED: ['RECEIVED', 'REJECTED', 'CANCELLED', 'REFERRED'],
  RECEIVED: ['PROCESSING', 'REJECTED', 'CANCELLED', 'REFERRED'],
  PROCESSING: ['COMPLETED', 'REJECTED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  REFERRED: ['RECEIVED', 'COMPLETED', 'CANCELLED'],
};

export function canTransitionSpecimen(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedSpecimenTransitions(from: string): readonly string[] {
  return TRANSITIONS[from] ?? [];
}
