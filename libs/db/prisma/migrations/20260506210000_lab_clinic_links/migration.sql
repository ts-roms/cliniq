-- Phase 1.2 — Lab ↔ Clinic linking. Many-to-many association table that
-- gates the lab-ordering surface and (Phase 4+) per-clinic pricing.

CREATE TYPE "LabClinicLinkStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'REJECTED',
  'REVOKED',
  'SUSPENDED'
);

CREATE TABLE "lab_clinic_links" (
  "id"              TEXT                  NOT NULL,
  "labTenantId"     TEXT                  NOT NULL,
  "clinicTenantId"  TEXT                  NOT NULL,
  "status"          "LabClinicLinkStatus" NOT NULL DEFAULT 'PENDING',
  "invitedByUserId" TEXT                  NOT NULL,
  "invitedAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt"     TIMESTAMP(3),
  "inviteNote"      TEXT,
  "createdAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)          NOT NULL,
  "deletedAt"       TIMESTAMP(3),

  CONSTRAINT "lab_clinic_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_clinic_links_lab_fkey"
    FOREIGN KEY ("labTenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_clinic_links_clinic_fkey"
    FOREIGN KEY ("clinicTenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_clinic_links_pair_key"
  ON "lab_clinic_links" ("labTenantId", "clinicTenantId");
CREATE INDEX "lab_clinic_links_lab_status_idx"
  ON "lab_clinic_links" ("labTenantId", "status");
CREATE INDEX "lab_clinic_links_clinic_status_idx"
  ON "lab_clinic_links" ("clinicTenantId", "status");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Either side of the link (lab or clinic) can read/mutate it. Platform
-- admin bypasses via the existing is_platform_admin() session flag.
ALTER TABLE "lab_clinic_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_clinic_links" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_clinic_links_either_side ON "lab_clinic_links"
  FOR ALL TO cliniq_app
  USING (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  )
  WITH CHECK (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  );

CREATE POLICY lab_clinic_links_platform_all ON "lab_clinic_links"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
