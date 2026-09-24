-- Critical results become an obligation with a record, not a fire-and-forget.
--
-- LabsService.recordResult did this and nothing else:
--
--     void this.notif.notify({ ... severity: CRITICAL ... });
--
-- `void` — unawaited, failure swallowed. No recipient record, no
-- acknowledgement, no escalation, no audit row. If the in-app write failed,
-- or the clinician simply never opened the bell icon, there was no trace that
-- anyone should have been told. The result sat in the chart looking handled.
--
-- The notification row is now written in the SAME transaction as the result,
-- so a critical value cannot exist without a corresponding obligation to
-- communicate it. Delivery remains best-effort and is recorded ON the row;
-- the obligation does not depend on delivery succeeding.

CREATE TYPE "CriticalNotificationMethod" AS ENUM (
  'IN_APP',
  'PHONE',
  'SMS',
  'EMAIL',
  'IN_PERSON'
);

-- Escalation target for the unacknowledged sweep.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'LAB_CRITICAL_UNACKNOWLEDGED';

CREATE TABLE "critical_result_notifications" (
  "id"                   TEXT         NOT NULL,
  "tenantId"             TEXT         NOT NULL,
  "orderId"              TEXT         NOT NULL,
  "orderItemId"          TEXT         NOT NULL,
  "patientId"            TEXT         NOT NULL,

  -- Snapshot: the row must stay meaningful after the result is corrected,
  -- and "what was critical at the time" is what an inspection asks.
  "testName"             TEXT         NOT NULL,
  "resultValue"          TEXT         NOT NULL,
  "resultUnit"           TEXT,
  "flag"                 "LabAbnormalFlag" NOT NULL,
  "criticalLow"          DOUBLE PRECISION,
  "criticalHigh"         DOUBLE PRECISION,
  "ruleId"               TEXT,

  "recipientUserId"      TEXT         NOT NULL,
  "method"               "CriticalNotificationMethod" NOT NULL DEFAULT 'IN_APP',

  "notifiedAt"           TIMESTAMP(3),
  "deliveryError"        TEXT,

  "acknowledgedAt"       TIMESTAMP(3),
  "acknowledgedByUserId" TEXT,
  "acknowledgementNote"  TEXT,

  "dueAt"                TIMESTAMP(3) NOT NULL,
  "escalatedAt"          TIMESTAMP(3),

  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "critical_result_notifications_pkey" PRIMARY KEY ("id")
);

-- An acknowledgement without an acknowledger is not an acknowledgement.
ALTER TABLE "critical_result_notifications"
  ADD CONSTRAINT "critical_result_notifications_ack_has_actor"
  CHECK (
    ("acknowledgedAt" IS NULL AND "acknowledgedByUserId" IS NULL)
    OR ("acknowledgedAt" IS NOT NULL AND "acknowledgedByUserId" IS NOT NULL)
  );

-- Only the two critical flags belong here. A HIGH result creating a
-- call-back obligation would train people to ignore the queue.
ALTER TABLE "critical_result_notifications"
  ADD CONSTRAINT "critical_result_notifications_flag_is_critical"
  CHECK ("flag" IN ('CRITICAL_LOW', 'CRITICAL_HIGH'));

-- The sweep's query: unacknowledged and past due, per tenant.
CREATE INDEX "critical_result_notifications_tenantId_acknowledgedAt_dueAt_idx"
  ON "critical_result_notifications"("tenantId", "acknowledgedAt", "dueAt");
CREATE INDEX "critical_result_notifications_tenantId_orderItemId_idx"
  ON "critical_result_notifications"("tenantId", "orderItemId");
CREATE INDEX "critical_result_notifications_tenantId_patientId_createdAt_idx"
  ON "critical_result_notifications"("tenantId", "patientId", "createdAt");

-- CASCADE from the item: the obligation has no meaning without the result.
ALTER TABLE "critical_result_notifications"
  ADD CONSTRAINT "critical_result_notifications_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "lab_order_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Standard tenant isolation, in the migration that creates the table.
ALTER TABLE "critical_result_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "critical_result_notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY critical_result_notifications_isolation
  ON "critical_result_notifications"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- No DELETE. A communication record is evidence: it is closed by
-- acknowledgement, never removed. UPDATE is granted because acknowledgement
-- and escalation write to the row.
--
-- NOTE: granting a narrower set does NOT subtract — the schema-wide
-- ALTER DEFAULT PRIVILEGES in 20260501000001_rls_policies already gave this
-- table all four. Only REVOKE removes one. See 20260924090100.
REVOKE DELETE ON "critical_result_notifications" FROM cliniq_app;
