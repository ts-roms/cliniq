/**
 * How a service says what it changed.
 *
 * A free function rather than an injectable, because the alternative is
 * threading a collector through every mutating method in the application, and
 * a service that forgets to pass it records nothing without anyone noticing.
 * The request context this writes into is established by
 * TenantContextMiddleware, which is applied to every route.
 *
 * Outside a request — a background job, a unit test calling a service
 * directly — this is a no-op. There is no audit row to attach anything to, and
 * failing would make the audit trail able to break the thing it describes.
 */
import { TenantContext } from '../common/tenant-context.middleware.js';
import { diffFields } from './changes.js';

/**
 * Record the difference between what a record held and what the request set.
 *
 * Call this inside the transaction that makes the change, with the row as it
 * was read before the write. The audit interceptor attaches whatever has
 * accumulated to the row it writes when the request succeeds — so a request
 * that throws records no changes, which is correct: nothing changed.
 *
 * `after` should be the caller's intent (the DTO), not the row read back.
 * Diffing against the written row reports every column the database touched,
 * including `updatedAt` on every single update.
 */
export function auditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  reason?: string | null,
): void {
  TenantContext.addChanges(diffFields(before, after), reason ?? null);
}
