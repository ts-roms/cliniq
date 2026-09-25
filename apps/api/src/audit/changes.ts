/**
 * What changed, and what must never be written down.
 *
 * The audit log was append-only and complete about *that* something happened —
 * who, when, from where, to which entity id. It recorded nothing about *what*
 * changed. "patient.update on p_123" does not answer the question an audit
 * trail exists to answer, which is whether a particular value was altered and
 * by whom. Reconstructing it meant diffing database backups.
 *
 * Pure and Prisma-free so the redaction rules can be tested exhaustively
 * without a database, for the reason ./../labs/verification.ts is. Redaction is
 * the part worth testing hardest: audit rows are append-only and long-retained,
 * so anything written here in error cannot be deleted afterwards — the
 * application role holds no UPDATE and no DELETE on the table, deliberately.
 */

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** What replaces a sensitive value. The field is still named. */
export const REDACTED = '[redacted]';
/** What replaces a value too large to be worth storing. */
export const TRUNCATED = '[truncated]';

/** Longest string value kept verbatim. */
const MAX_VALUE_LENGTH = 512;
/** Most fields recorded for one change. */
const MAX_FIELDS = 50;
/** Longest `reason` kept. */
const MAX_REASON_LENGTH = 1000;

/**
 * Field names whose values are never written to the audit log.
 *
 * Matched case-insensitively as a substring, so `passwordHash`,
 * `newPassword` and `password_confirmation` are all caught by `password`. A
 * substring match is deliberately over-eager: the cost of redacting a field
 * that did not need it is a less informative audit row, and the cost of
 * missing one is a credential in an append-only table that cannot be edited.
 *
 * The field name itself is always recorded. "The password changed" is exactly
 * what the trail should say; the value is what it must not say.
 */
const SENSITIVE_FRAGMENTS = [
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'credential',
  'mfa',
  'totp',
  'otp',
  'signature',
  'sessionid',
  'session_id',
  'cvv',
  'cardnumber',
  'card_number',
] as const;

export function isSensitiveField(name: string): boolean {
  const n = name.toLowerCase();
  return SENSITIVE_FRAGMENTS.some((f) => n.includes(f));
}

/**
 * Reduce a value to something comparable and storable.
 *
 * Dates are the reason this exists. Two `Date` objects for the same instant
 * are never `===`, and Prisma hands back `Date` where a DTO carries an ISO
 * string — so a naive comparison reports `dateOfBirth` as changed on every
 * update that does not touch it, and an audit log that cries wolf on every
 * row is worse than one that says nothing.
 */
function normalise(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  // Prisma Decimal and anything else with a meaningful toString, but not
  // plain objects (whose toString is "[object Object]").
  if (typeof v === 'object') {
    const o = v as { toJSON?: () => unknown };
    if (typeof o.toJSON === 'function') return normalise(o.toJSON());
    return v;
  }
  return v;
}

/** Are these the same value, as far as the trail is concerned? */
function sameValue(a: unknown, b: unknown): boolean {
  const x = normalise(a);
  const y = normalise(b);
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (typeof x === 'object' || typeof y === 'object') {
    try {
      return JSON.stringify(x) === JSON.stringify(y);
    } catch {
      // A cycle, or a BigInt. Treat as different rather than throwing: a
      // failed diff must not fail the request it is describing.
      return false;
    }
  }
  return false;
}

/** How deep redaction walks before giving up and storing nothing. */
const MAX_DEPTH = 6;

/**
 * Replace sensitive values anywhere inside a structure.
 *
 * Checking only the top-level field name is not enough. Tenant settings carry
 * a free-form `extras` blob and the diff is taken one level down, so the field
 * name is `extras` and the value is the whole object — anything a tenant chose
 * to keep in there would have been written verbatim into a table that cannot
 * be edited afterwards. The keys are what get matched, at every depth, so the
 * shape of the value survives and only the secrets are replaced.
 */
function redactDeep(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, depth + 1));
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = isSensitiveField(k) ? REDACTED : redactDeep(val, depth + 1);
    }
    return out;
  }
  return v;
}

/** Make a value safe and small enough to append. */
function storable(v: unknown): unknown {
  const n = normalise(v);
  if (n === null) return null;
  if (typeof n === 'string') {
    return n.length > MAX_VALUE_LENGTH
      ? `${n.slice(0, MAX_VALUE_LENGTH)}… ${TRUNCATED}`
      : n;
  }
  if (typeof n === 'number' || typeof n === 'boolean') return n;
  if (typeof n === 'bigint') return n.toString();
  try {
    // Redacted BEFORE the size check, so an oversized blob is never
    // serialised with its secrets intact even to measure it.
    const safe = redactDeep(n);
    const json = JSON.stringify(safe);
    if (json === undefined) return TRUNCATED;
    return json.length > MAX_VALUE_LENGTH
      ? TRUNCATED
      : (JSON.parse(json) as unknown);
  } catch {
    return TRUNCATED;
  }
}

/**
 * The fields the caller actually changed.
 *
 * Driven by the keys of `after`, not the union of both: `after` is typically a
 * validated DTO carrying only the fields the request set, and a request that
 * sends `firstName` alone is not an assertion that every other column should
 * read as cleared. A key explicitly present and `undefined` is treated as
 * absent for the same reason — that is how Prisma reads it too.
 *
 * `before` may be a whole database row; only the keys named in `after` are
 * ever looked up on it.
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldChange[] {
  if (!after) return [];
  const prev = before ?? {};
  const out: FieldChange[] = [];

  for (const field of Object.keys(after)) {
    if (out.length >= MAX_FIELDS) break;
    const next = after[field];
    // Not sent. Prisma omits an undefined field rather than nulling it, so
    // reporting it as a change to null would be a lie about what happened.
    if (next === undefined) continue;
    if (sameValue(prev[field], next)) continue;

    if (isSensitiveField(field)) {
      // Recorded as changed, with neither value. Whether a secret was
      // altered is auditable; what it was is not ours to keep.
      out.push({ field, before: REDACTED, after: REDACTED });
      continue;
    }
    out.push({ field, before: storable(prev[field]), after: storable(next) });
  }
  return out;
}

/**
 * The stated reason for a change, where the request carries one.
 *
 * Amendments and corrections already require one — a corrected result with no
 * stated reason is not reviewable — so this lifts it onto the audit row rather
 * than leaving it only on the domain record, where a reader of the trail would
 * have to go and find it.
 */
export function readReason(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const raw = (body as Record<string, unknown>)['reason'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_REASON_LENGTH
    ? trimmed.slice(0, MAX_REASON_LENGTH)
    : trimmed;
}
