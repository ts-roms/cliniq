-- Equipment, calibration and reagent lots. DOH AO 2021-0037, section 6.13.
--
-- Neither existed. InventoryItem / StockBatch / StockMovement model clinic
-- consumables with FEFO consumption and are the wrong shape: no storage
-- condition, no open-vial expiry, no link to the tests a reagent serves.
--
-- The point, as the gap analysis put it, is traceability: link the equipment
-- and reagent lot to the result "so a recalled lot can be traced to every
-- result it produced". The columns added to lab_order_items at the bottom of
-- this migration are that link, and the fitness checks exist so the link is
-- worth having -- knowing which lot produced a result matters most when the
-- lot turns out to have been unfit.
--
-- A reagent has TWO clocks and the earlier one wins: the manufacturer's
-- printed expiry on the sealed vial, and a much shorter in-use stability
-- that starts when it is opened. A lot three months from its printed date
-- can be unusable because it was opened four weeks ago. See
-- apps/api/src/labs/fitness.ts.

CREATE TYPE "EquipmentStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'RETIRED');

CREATE TABLE "equipment" (
  "id"                      TEXT              NOT NULL,
  "tenantId"                TEXT              NOT NULL,
  "name"                    TEXT              NOT NULL,
  "manufacturer"            TEXT,
  "model"                   TEXT,
  "serialNumber"            TEXT,
  "location"                TEXT,
  "status"                  "EquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "calibrationIntervalDays" INTEGER,
  "commissionedOn"          TIMESTAMP(3),
  "createdAt"               TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)      NOT NULL,
  "deletedAt"               TIMESTAMP(3),
  CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "equipment"
  ADD CONSTRAINT "equipment_name_present" CHECK (length(btrim("name")) > 0);

-- A zero or negative interval is not "calibrate constantly", it is a typo.
ALTER TABLE "equipment"
  ADD CONSTRAINT "equipment_calibration_interval_positive"
  CHECK ("calibrationIntervalDays" IS NULL OR "calibrationIntervalDays" > 0);

CREATE UNIQUE INDEX "equipment_tenantId_name_key" ON "equipment"("tenantId", "name");
CREATE INDEX "equipment_tenantId_status_idx" ON "equipment"("tenantId", "status");

-- Calibration -------------------------------------------------
CREATE TABLE "calibrations" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "equipmentId"   TEXT         NOT NULL,
  "testId"        TEXT,
  "calibratedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "performedById" TEXT         NOT NULL,
  "calibratorLot" TEXT,
  "passed"        BOOLEAN      NOT NULL DEFAULT true,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calibrations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calibrations_tenantId_equipmentId_calibratedAt_idx"
  ON "calibrations"("tenantId", "equipmentId", "calibratedAt");
CREATE INDEX "calibrations_tenantId_equipmentId_testId_calibratedAt_idx"
  ON "calibrations"("tenantId", "equipmentId", "testId", "calibratedAt");

ALTER TABLE "calibrations"
  ADD CONSTRAINT "calibrations_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Reagent lots ------------------------------------------------
CREATE TABLE "reagent_lots" (
  "id"                TEXT         NOT NULL,
  "tenantId"          TEXT         NOT NULL,
  "name"              TEXT         NOT NULL,
  "lotNumber"         TEXT         NOT NULL,
  "manufacturer"      TEXT,
  "expiresOn"         TIMESTAMP(3),
  "openedOn"          TIMESTAMP(3),
  "openStabilityDays" INTEGER,
  "receivedOn"        TIMESTAMP(3),
  "equipmentId"       TEXT,
  "isActive"          BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "reagent_lots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reagent_lots"
  ADD CONSTRAINT "reagent_lots_lot_present"
  CHECK (length(btrim("lotNumber")) > 0);

ALTER TABLE "reagent_lots"
  ADD CONSTRAINT "reagent_lots_stability_positive"
  CHECK ("openStabilityDays" IS NULL OR "openStabilityDays" > 0);

-- A vial cannot be opened before it arrived.
ALTER TABLE "reagent_lots"
  ADD CONSTRAINT "reagent_lots_opened_after_received"
  CHECK ("openedOn" IS NULL OR "receivedOn" IS NULL OR "openedOn" >= "receivedOn");

CREATE UNIQUE INDEX "reagent_lots_tenantId_name_lotNumber_key"
  ON "reagent_lots"("tenantId", "name", "lotNumber");
CREATE INDEX "reagent_lots_tenantId_isActive_expiresOn_idx"
  ON "reagent_lots"("tenantId", "isActive", "expiresOn");

ALTER TABLE "reagent_lots"
  ADD CONSTRAINT "reagent_lots_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Traceability: what produced this result ---------------------
ALTER TABLE "lab_order_items"
  ADD COLUMN "equipmentId"  TEXT,
  ADD COLUMN "reagentLotId" TEXT;

-- The recall query: every result a given lot produced.
CREATE INDEX "lab_order_items_tenantId_reagentLotId_idx"
  ON "lab_order_items"("tenantId", "reagentLotId");
CREATE INDEX "lab_order_items_tenantId_equipmentId_idx"
  ON "lab_order_items"("tenantId", "equipmentId");

-- RESTRICT, not CASCADE or SET NULL: deleting an instrument or a lot must
-- not quietly sever the link from the results it produced. That link is the
-- entire reason these tables exist.
ALTER TABLE "lab_order_items"
  ADD CONSTRAINT "lab_order_items_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_order_items"
  ADD CONSTRAINT "lab_order_items_reagentLotId_fkey"
  FOREIGN KEY ("reagentLotId") REFERENCES "reagent_lots"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation --------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment', 'calibrations', 'reagent_lots'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "equipment" TO cliniq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "reagent_lots" TO cliniq_app;

-- A calibration is evidence the instrument was adjusted to a known standard
-- on a given day. The next one supersedes it in relevance, never in the
-- record.
GRANT SELECT, INSERT ON "calibrations" TO cliniq_app;
REVOKE UPDATE, DELETE ON "calibrations" FROM cliniq_app;
