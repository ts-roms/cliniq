-- What changed, not merely that something did.
--
-- The audit log was already append-only and complete about the act: who,
-- when, from where, which entity id. It recorded nothing about the content of
-- the change. "patient.update on p_123" does not answer the question an audit
-- trail exists to answer -- whether a particular value was altered, and by
-- whom -- and reconstructing that meant diffing database backups.
--
-- `changes` holds an array of {field, before, after}, built by
-- apps/api/src/audit/changes.ts, which redacts values by field name before
-- they ever reach here. That redaction is the part worth being careful about:
-- the application role holds no UPDATE and no DELETE on this table
-- (20260924090100_append_only_grants), deliberately, so anything written here
-- in error cannot be removed afterwards.
--
-- `reason` lifts the stated reason for amendments and corrections -- which the
-- domain already requires -- onto the trail, so a reader does not have to go
-- and find the domain record to learn why.

ALTER TABLE "audit_logs"
  ADD COLUMN "changes" JSONB,
  ADD COLUMN "reason"  TEXT;

-- An empty array is not "no changes", it is a diff that ran and found none,
-- which is indistinguishable from the column being absent and clutters every
-- read. Store NULL for that case.
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_changes_not_empty"
  CHECK ("changes" IS NULL OR jsonb_array_length("changes") > 0);

-- The array shape is asserted here rather than trusted from the application,
-- because more than one code path writes this column and a malformed value
-- cannot be corrected once written.
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_changes_is_array"
  CHECK ("changes" IS NULL OR jsonb_typeof("changes") = 'array');

-- "Show me every change to this record" is the question the trail is read
-- with, and it already has an (entityType, entityId) index. This one serves
-- the other direction: find the rows that carry change detail at all, which is
-- what an export or a review queue scans for. Partial, because most audit rows
-- are reads and logins that change nothing.
CREATE INDEX "audit_logs_with_changes_idx"
  ON "audit_logs"("tenantId", "occurredAt")
  WHERE "changes" IS NOT NULL;

-- No GRANT or REVOKE here: adding a column does not change table privileges,
-- and 20260924090100_append_only_grants already stripped UPDATE and DELETE.
-- privilege-coverage.spec.ts asserts that still holds.
