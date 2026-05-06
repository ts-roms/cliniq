# ClinIQ Lab — Dental Laboratory Module Plan

**Status:** draft, awaiting strategic decisions (see open questions at bottom).
**Scope:** add a dental laboratory management surface to ClinIQ alongside the
existing clinic management. Three plan tiers (Basic / Standard / Premium)
gated to lab tenants, with associated clinics getting free access to the
ordering surface.

---

## Goals

1. Labs can publish product catalogs and receive case/order requests from
   their associated clinics.
2. Clinics can request products from labs they're connected to, attach
   files (STL, ZIP, PDF, photos), and track manufacturing progress.
3. Lab operators can manage manufacturing phases, materials, traceability,
   and billing — through to e-invoicing and SEPA exports (or PH equivalents).
4. Pricing/feature gates mirror the published Basic/Standard/Premium tiers.
5. Existing clinic-only features (consults, Rx, telemedicine, HMO) stay
   intact and untouched.

---

## Architecture decisions

### Tenant kind

Add a top-level discriminator on `Tenant`:

```prisma
enum TenantKind {
  CLINIC
  LAB
}

model Tenant {
  ...
  kind        TenantKind  @default(CLINIC)
  // existing `type: ClinicType` becomes meaningful only when kind=CLINIC
}
```

This lets us keep `ClinicType` (GENERAL/DENTAL/etc.) for clinics and add a
parallel `LabSpecialty` (CROWN_BRIDGE, ORTHO, IMPLANT, FULL_SERVICE, etc.)
for labs without bloating one enum.

### Plan ladder split

Two enums, one per kind:

```prisma
enum ClinicPlan { STARTER PRO PREMIUM }            // existing, renamed for clarity
enum LabPlan    { LAB_BASIC LAB_STANDARD LAB_PREMIUM }

model Tenant {
  ...
  clinicPlan  ClinicPlan?    // when kind=CLINIC
  labPlan     LabPlan?       // when kind=LAB
}
```

Feature gating:
`libs/shared-types/src/lib/features.ts` already defines `Feature` and
`PLAN_FEATURES`. Extend with lab features and a parallel
`LAB_PLAN_FEATURES: Record<LabPlan, ReadonlySet<Feature>>`. The existing
`@RequiresFeature(...)` decorator + `FeatureGuard` pattern works as-is for
both.

### Lab ↔ Clinic relationship

Labs serve multiple clinics; clinics work with multiple labs. Many-to-many:

```prisma
model LabClinicLink {
  id          String   @id @default(cuid())
  labTenantId String
  clinicTenantId String
  status      LabClinicLinkStatus  @default(PENDING)  // PENDING, ACTIVE, SUSPENDED
  rateProfileId String?  // points at LabRateProfile for clinic-specific pricing
  invitedByUserId String
  invitedAt   DateTime @default(now())
  acceptedAt  DateTime?

  lab    Tenant @relation("LabLinks", fields: [labTenantId], references: [id])
  clinic Tenant @relation("ClinicLinks", fields: [clinicTenantId], references: [id])

  @@unique([labTenantId, clinicTenantId])
  @@index([labTenantId])
  @@index([clinicTenantId])
}
```

**Pricing implication:** the "free access for associated clinics" line in
the published pricing means clinics linked to a paying lab don't need
their own subscription **for the lab-ordering surface**. If they want
clinic-side EMR features (consultations, Rx, etc.), they still need a
clinic plan. Document this in the marketing site.

---

## Data model additions

| Model | Purpose | Phase |
|---|---|---|
| `LabProduct` | Product catalog item (crown, denture, aligner, etc.) with phases | 1 |
| `LabProductCategory` | Folder/category tree for the catalog | 1 |
| `LabProductForm` | Dynamic form schema per product (multi-language) | 1 |
| `LabProductPhase` | Customizable manufacturing phases per product | 2 |
| `LabRateProfile` | Per-clinic price overrides (tiered) | 1 |
| `LabRateProfileItem` | Specific product/clinic price | 1 |
| `LabOrder` | Case/order from clinic to lab | 1 |
| `LabOrderFile` | Attached files (STL/ZIP/PDF/JPG, no size limit) | 1 |
| `LabOrderPhaseEvent` | Audit trail of phase transitions per order | 2 |
| `LabOrderNote` | Internal notes (lab-only) | 2 |
| `LabOrderMessage` | Chat messages between clinic and lab on an order | 2 |
| `LabOrderTag` + `LabOrderTagAssignment` | Order tagging | 2 |
| `LabDeliveryCenter` | Clinic-managed delivery addresses | 1 |
| `LabDoctorProfile` | Clinic-managed doctor records (orderers) | 1 |
| `LabConformityDocTemplate` | Customizable conformity doc per product | 3 |
| `LabConsentTemplate` | Customizable consent + e-signature | 3 |
| `LabMaterial` + `LabMaterialLot` | Material/LOT tracking | 3 |
| `LabMaterialUsage` | Material→order assignments | 3 |
| `LabShipment` | Outbound shipment + tracking number | 2 |
| `LabInvoice` + `LabInvoiceItem` | Lab-specific billing (separate from clinic invoices) | 4 |
| `LabPaymentLink` | Configurable payment URLs on invoices | 4 |
| `LabTreatmentPlan` + viewers | Treatment plan manager | 5 |
| `LabIprMovement` | IPR table per treatment plan | 5 |
| `LabMachine` + `LabMachineSchedule` | Machine occupation control | 6 |
| `LabUser` (or extend `TenantUser`) | Lab-specific roles + permissions | 1 |

The existing `User`/`TenantUser` model handles the auth side; we extend
with lab-specific roles (`LAB_OWNER`, `LAB_MANAGER`, `LAB_TECHNICIAN`,
`LAB_ADMIN`) and per-product visibility.

---

## Feature → plan mapping (proposed)

| Feature flag | Basic | Standard | Premium |
|---|:-:|:-:|:-:|
| `lab_catalog` (custom product catalog) | ✅ | ✅ | ✅ |
| `lab_dynamic_forms` (unlimited) | ✅ | ✅ | ✅ |
| `lab_orders` (per month) | 500 | 1000 | ∞ |
| `lab_files` (no size limit) | ✅ | ✅ | ✅ |
| `lab_calendar` | ✅ | ✅ | ✅ |
| `lab_phases` | — | ✅ | ✅ |
| `lab_chat` | — | ✅ | ✅ |
| `lab_internal_notes` | — | ✅ | ✅ |
| `lab_tags` | — | ✅ | ✅ |
| `lab_multilab` | — | ✅ | ✅ |
| `lab_conformity_docs` | — | ✅ | ✅ |
| `lab_consent_esign` | — | ✅ | ✅ |
| `lab_materials_lot` | — | ✅ | ✅ |
| `lab_shipments` | — | ✅ | ✅ |
| `lab_payment_links` | — | ✅ | ✅ |
| `lab_einvoice` | — | — | ✅ |
| `lab_treatment_plan` | — | — | ✅ |
| `lab_3d_viewer` (OnyxCeph/3Shape) | — | — | ✅ |
| `lab_ai_assist` (GPT-4) | — | — | ✅ |
| `lab_machine_control` | — | — | ✅ |
| `lab_dispute_manager` | — | — | ✅ |
| `lab_stats_panel` | — | ✅ | ✅ |
| Users/employees per tenant | 200 | ∞ | ∞ |
| Cloud storage | 5 GB | 15 GB | ∞ (1) |
| Custom domain | — | — | ✅ (on-demand) |
| Dedicated server | — | — | ✅ (on-demand) |
| 24/7 support | ✅ | ✅ | ✅ |

Inferred from pricing — confirm with the source spec.

---

## Phased rollout

Each phase produces shippable, demoable functionality. Sized in dev-weeks
assuming one full-stack engineer.

### Phase 1 — Foundation + Catalog + Basic Orders (3 weeks)

**Schema:** `TenantKind`, `LabPlan`, `LabClinicLink`, `LabProduct`,
`LabProductCategory`, `LabProductForm`, `LabRateProfile`,
`LabRateProfileItem`, `LabOrder`, `LabOrderFile`, `LabDeliveryCenter`,
`LabDoctorProfile`. Feature flags + plan gates.

**Backend:**
- New tenant signup flow accepts `kind=LAB` and a `LabPlan` choice.
- `LabProductsModule`, `LabOrdersModule`, `LabClinicLinksModule`.
- File upload for orders (re-use existing `FileObject` + S3 presigning).
- Lab-clinic invitation flow (lab invites clinic by email; clinic accepts).
- "Public anonymous link" generator for one-off case requests (no auth).
- Tiered loyalty discount engine (configurable thresholds per lab).

**Web:**
- New `/lab` route group, accessible only when current tenant `kind=LAB`.
- `/lab/catalog` — product CRUD with multi-language form builder.
- `/lab/orders` — incoming orders inbox.
- `/lab/orders/[id]` — basic order detail (files, status, customer info).
- `/lab/clinics` — manage linked clinics, send invitations.
- New `/orders` group on the **clinic** side for clinics to place requests
  with their associated labs.

**Marketing/billing:**
- Update `/pricing` page with a "For Labs" tab toggle that shows the new
  plans alongside the clinic plans.
- `/signup?plan=LAB_BASIC` etc. flows wired through existing signup.

**Definition of done:** A lab can sign up, build a 5-product catalog, invite
a clinic. The clinic accepts, places an order with attached STL, lab sees it
in their inbox.

### Phase 2 — Workflow & Communication (3 weeks)

**Schema:** `LabProductPhase`, `LabOrderPhaseEvent`, `LabOrderNote`,
`LabOrderMessage`, `LabOrderTag`, `LabOrderTagAssignment`, `LabShipment`.

**Backend:**
- Phase-transition state machine + audit events.
- WebSocket or SSE channel for per-order chat (re-use Tele's signaling
  infra if it fits, or polling for v1).
- Tag CRUD + filter API.
- Shipment record + tracking-number lookup.

**Web:**
- `/lab/orders/[id]` upgraded with phase Kanban, chat panel, notes
  sidebar, tag picker.
- Calendar view for orders by due date / phase.
- Multilab assignment UI (a tenant operating multiple physical labs).

**Plan gates:** Most of these are Standard+ tier.

### Phase 3 — Materials & Compliance (2 weeks)

**Schema:** `LabMaterial`, `LabMaterialLot`, `LabMaterialUsage`,
`LabConformityDocTemplate`, `LabConsentTemplate`, `LabConsentSignature`.

**Backend:**
- LOT inventory tracking (active/warehouse/finished/defective).
- Auto-generate conformity declaration on order completion.
- E-signature flow for consent (signature image + IP + timestamp).

**Web:**
- `/lab/materials` — material/LOT CRUD with status filters.
- Per-order material assignment widget.
- Conformity doc template editor.

### Phase 4 — Billing (3 weeks)

**Schema:** `LabInvoice`, `LabInvoiceItem`, `LabPaymentLink`,
`LabMonthlySummary`. Hook to `LabOrder` for auto-line items.

**Backend:**
- Per-order delivery note + invoice generation (PDF, re-using `pdfkit`).
- Editable invoices (add/remove order lines, change date/numbering).
- Monthly summary auto-invoicing scheduler (cron — already in deps).
- SEPA file generator (or PH bank-friendly equivalent — confirm with PH
  banks; SEPA is EU/EUR).
- Payment link integration (Stripe / PayMongo / Maya).
- E-invoice integration — depends on PH BIR e-invoicing requirements;
  scope this separately.

**Web:**
- `/lab/billing` — invoice list, monthly summary review, export to Excel.
- Payment link generator on each invoice.

### Phase 5 — Treatment Plans & 3D (3 weeks)

**Schema:** `LabTreatmentPlan`, `LabTreatmentPlanFile`, `LabIprMovement`,
`LabTreatmentPlanApproval`.

**Backend:**
- 3D viewer integration: OnyxCeph and 3Shape both expose viewer URLs and
  embed APIs. Use their JS SDKs in the web app — no backend processing.
- Approval workflow (lab → clinic → approve/reject with chat).

**Web:**
- `/lab/treatment-plans/[id]` — viewer iframe, IPR table, file manager.
- Clinic-side approval UI in `/orders/[id]`.

### Phase 6 — Advanced & On-Demand (2-4 weeks)

- Statistics panel (recharts on top of `LabOrder`/`LabInvoice` aggregates).
- Machine occupation calendar.
- Workload manager (assignment + time tracking).
- Generative AI assist (existing `@org/ai-prompts` + new lab-specific prompts).
- Image optimizer (sharp pipeline on file upload).
- Custom domain support (Railway custom domains, on-demand only).
- Dedicated server option (Enterprise sales conversation).

---

## Total effort & timeline

**Conservative estimate:** ~16 weeks for one engineer to deliver Phases 1–5.
Phase 6 is open-ended.

**Aggressive (multiple engineers, parallel streams):**
- Foundation + Catalog + Orders (Phase 1) — 3 weeks, 1 eng
- Workflow + Materials + Billing (Phase 2-4) — 6 weeks, 2 eng parallel
- Treatment plans + 3D — 3 weeks, 1 eng
- = ~10 weeks calendar with 2-3 engineers.

**MVP definition for first paying lab customer:**
End of Phase 1 (3 weeks). Demo: catalog → invite clinic → receive order →
mark complete. Charge them on Basic plan from day 1. Iterate based on
feedback while Phases 2-3 are in flight.

---

## Open questions / decisions needed

1. **Pivot vs parallel?** Confirmed parallel? (Adding labs alongside clinics.)
2. **Pricing strategy:** Keep both ladders separate? Replace clinic prices
   with these (since clinic pricing was placeholder)?
3. **PH-specific billing:** SEPA is EU. Replace with PH (BIR e-invoice,
   GCash/Maya/PayMongo links)? Anything BIR-specific that must ship in
   Phase 4?
4. **First customer:** Do you have a pilot lab to onboard? (Drives Phase 1
   feature priority.)
5. **3D viewer integrations:** Are OnyxCeph/3Shape the right choice for the
   PH market, or are there local alternatives?
6. **Cloud storage tiers:** 5/15/∞ GB — feasible on Railway free/hobby? May
   need S3 for the unlimited tier ([@org/api already uses S3 SDK](../apps/api/package.json)).
7. **Free clinic access for associated clinics:** Confirm the gate works
   like: "if `LabClinicLink.status = ACTIVE` and the lab's plan is paid,
   the clinic can use lab-ordering features without their own clinic plan."
8. **Internationalization:** "Multi-language" comes up a lot. Scope i18n as
   a Phase 1 deliverable or Phase 6 polish? (Affects schema for product
   forms.)
9. **AI features:** "Assistance with Generative AI - ChatGPT 4" — bring our
   own (OpenAI key) or reuse Bedrock from `@org/ai-service`?

---

## Next steps

1. You answer the strategic questions above (or annotate this doc).
2. I scope Phase 1 in more detail (schema migration, controller surface,
   web routes) and we sequence into 1-week sprints.
3. We ship Phase 1, find a pilot lab, and iterate.
