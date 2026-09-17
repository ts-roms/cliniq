-- Phase 4 — Lab billing: invoices + line items + payment links.

CREATE TYPE "LabInvoiceStatus" AS ENUM (
  'DRAFT',
  'ISSUED',
  'PAID',
  'OVERDUE',
  'VOID'
);

CREATE TYPE "LabPaymentLinkProvider" AS ENUM (
  'PAYMONGO',
  'GCASH',
  'MAYA',
  'STRIPE',
  'MANUAL'
);

CREATE TYPE "LabPaymentLinkStatus" AS ENUM (
  'PENDING',
  'PAID',
  'EXPIRED',
  'CANCELLED'
);

CREATE TABLE "lab_invoices" (
  "id"              TEXT               NOT NULL,
  "labTenantId"     TEXT               NOT NULL,
  "clinicTenantId"  TEXT               NOT NULL,
  "refNumber"       INTEGER,
  "status"          "LabInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency"        TEXT               NOT NULL DEFAULT 'PHP',
  "subtotalCents"   INTEGER            NOT NULL DEFAULT 0,
  "taxCents"        INTEGER            NOT NULL DEFAULT 0,
  "totalCents"      INTEGER            NOT NULL DEFAULT 0,
  "paidCents"       INTEGER            NOT NULL DEFAULT 0,
  "issuedAt"        TIMESTAMP(3),
  "dueAt"           TIMESTAMP(3),
  "paidAt"          TIMESTAMP(3),
  "voidedAt"        TIMESTAMP(3),
  "notes"           TEXT,
  "pdfFileKey"      TEXT,
  "pdfFilename"     TEXT,
  "createdByUserId" TEXT               NOT NULL,
  "createdAt"       TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)       NOT NULL,
  "deletedAt"       TIMESTAMP(3),

  CONSTRAINT "lab_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_invoices_lab_fkey"
    FOREIGN KEY ("labTenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_invoices_clinic_fkey"
    FOREIGN KEY ("clinicTenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_invoices_lab_ref_uniq"
  ON "lab_invoices" ("labTenantId", "refNumber");
CREATE INDEX "lab_invoices_lab_status_idx"
  ON "lab_invoices" ("labTenantId", "status");
CREATE INDEX "lab_invoices_clinic_status_idx"
  ON "lab_invoices" ("clinicTenantId", "status");
CREATE INDEX "lab_invoices_due_idx" ON "lab_invoices" ("dueAt");

CREATE TABLE "lab_invoice_items" (
  "id"             TEXT    NOT NULL,
  "invoiceId"      TEXT    NOT NULL,
  "caseId"         TEXT,
  "description"    TEXT    NOT NULL,
  "qty"            INTEGER NOT NULL DEFAULT 1,
  "unitPriceCents" INTEGER NOT NULL,
  "amountCents"    INTEGER NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "lab_invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_invoice_items_invoice_fkey"
    FOREIGN KEY ("invoiceId")
    REFERENCES "lab_invoices" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_invoice_items_case_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "lab_cases" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "lab_invoice_items_invoice_idx" ON "lab_invoice_items" ("invoiceId");
CREATE INDEX "lab_invoice_items_case_idx"    ON "lab_invoice_items" ("caseId");

CREATE TABLE "lab_payment_links" (
  "id"          TEXT                     NOT NULL,
  "invoiceId"   TEXT                     NOT NULL,
  "provider"    "LabPaymentLinkProvider" NOT NULL DEFAULT 'MANUAL',
  "externalId"  TEXT,
  "url"         TEXT,
  "amountCents" INTEGER                  NOT NULL,
  "status"      "LabPaymentLinkStatus"   NOT NULL DEFAULT 'PENDING',
  "expiresAt"   TIMESTAMP(3),
  "paidAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)             NOT NULL,

  CONSTRAINT "lab_payment_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_payment_links_invoice_fkey"
    FOREIGN KEY ("invoiceId")
    REFERENCES "lab_invoices" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lab_payment_links_invoice_status_idx"
  ON "lab_payment_links" ("invoiceId", "status");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Both lab and clinic see their own invoices. Items and payment links
-- inherit visibility from the parent invoice.
ALTER TABLE "lab_invoices"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_invoices"       FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_invoice_items"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_invoice_items"  FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_payment_links"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_payment_links"  FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_invoices_either_side ON "lab_invoices"
  FOR ALL TO cliniq_app
  USING (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  )
  WITH CHECK (
    -- INSERT/UPDATE may only originate from the owning lab. Clinic-side
    -- mutations are restricted to PaymentLink (a future webhook flow);
    -- the invoice itself is lab-controlled.
    "labTenantId" = current_tenant_id()
  );

CREATE POLICY lab_invoice_items_via_invoice ON "lab_invoice_items"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_invoices" i
      WHERE i."id" = "lab_invoice_items"."invoiceId"
        AND (i."labTenantId" = current_tenant_id() OR i."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_invoices" i
      WHERE i."id" = "lab_invoice_items"."invoiceId"
        AND i."labTenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_payment_links_via_invoice ON "lab_payment_links"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_invoices" i
      WHERE i."id" = "lab_payment_links"."invoiceId"
        AND (i."labTenantId" = current_tenant_id() OR i."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_invoices" i
      WHERE i."id" = "lab_payment_links"."invoiceId"
        AND i."labTenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_invoices_platform_all ON "lab_invoices"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_invoice_items_platform_all ON "lab_invoice_items"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_payment_links_platform_all ON "lab_payment_links"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
