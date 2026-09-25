# CLINIQ — Philippine Clinic + LIS Gap Analysis

**Date:** 2026-09-23
**Branch audited:** `claude/cliniq-audit-architecture-923251` (worktree `seeded-accounts-data-f997a7`)
**Method:** source-level read of `apps/`, `libs/`, `libs/db/prisma/schema.prisma` (2,781 lines, 80 tables, 44 migrations), all 44 migration SQL files, CI workflows, Terraform, and the e2e suites. Regulatory claims checked against DOH/HFSRB, NPC, PhilHealth, PRC and Supreme Court E-Library sources (cited in §21).

> **How to read the statuses**
> ✅ EXISTS · 🟡 PARTIAL · 🔴 MISSING · 🟠 NEEDS REDESIGN · ⚠️ RISK

> **This document is maintained, not frozen.** It was written against `main` at the 2026-09-23 audit. Findings that have since been fixed carry a **Status** block naming the migration or module that fixed them; nothing has been deleted, because a gap analysis whose history is edited out is not evidence of anything. §30 lists what changed and when.

> **Correction to an earlier reading.** A first pass over the migrations with a plain grep suggested 21 tables had no RLS. That was wrong — `20260502220000_clinical_billing_dsr`, `..._inventory`, `..._hmo_claims`, `..._labs` and `..._telemed_and_settings` apply RLS through a `FOREACH t IN ARRAY ARRAY[...]` loop, which a static grep for `ALTER TABLE "x" ENABLE ROW LEVEL SECURITY` misses. The real figure is **76 of 80 tables under RLS**. This document uses the corrected figure throughout.

---

# 1. Executive Summary

CLINIQ is a **well-built multi-tenant outpatient clinic SaaS** with a genuinely strong security foundation, and a **clinical laboratory module that is a thin lab-order tracker, not a LIS**.

What is actually there:

- A 40-module NestJS API, a 47-route Next.js app across four portals (clinic, dental-lab marketplace, platform admin, patient portal), an Expo mobile app, and a separate Bedrock AI service.
- **Postgres row-level security on 76 of 80 tables**, forced, with the API refusing to boot as a superuser or any `BYPASSRLS` role (`libs/db/src/lib/prisma.service.ts:78-118`). This is better tenant isolation than most healthcare startups ship.
- An **append-only audit log** — _in production as of 2026-09-24, and verified in CI as of the same day_. This entry has been wrong twice, in two different ways, and both are worth recording because they are the same class of mistake:
  1. **The grant.** The creating migration granted `SELECT, INSERT` only and said so, but `20260501000001_rls_policies` had already run `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE`, which applies to every table created afterwards. A narrower GRANT does not subtract; only REVOKE does, so the trail was modifiable and deletable by the app role until `20260924090100_append_only_grants` revoked it. **This entry originally reported the control as already in force — that was wrong.**
  2. **The verification.** Even after that migration, CI was not testing the control it claimed. The `Provision cliniq_app role` step in `.github/workflows/ci.yml` ran `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public` _after_ `prisma migrate deploy`, silently re-granting what the migrations had revoked — on `audit_logs`, `consultation_amendments`, `critical_result_notifications` and `specimen_rejections` alike. CI was therefore exercising a database with weaker privileges than the one we ship, and no test noticed because no test asserted the property. The first one that did (`lis-specimens.spec.ts`) failed immediately. Fixed by replaying every migration `REVOKE` after the blanket grant, in all three jobs that provision the role.

  The lesson generalises beyond this row: **a control is not in force because a migration says so.** It is in force when a test asserts the privilege state of the database the tests actually run against.

- **PRC licence capture and snapshotting** on prescriptions (`User.prcLicenseNumber`, `Prescription.providerLicense`) — the single most PH-specific thing in the codebase, and it is done correctly.
- **Data-minimised AI**: the dermatology path sends age/sex/allergies/complaint, not names or MRN (`apps/api/src/ai-client/ai-client.service.ts:90-100`), gated on explicit `AI_PROCESSING` patient consent via `@RequiresConsent`.
- Real regulatory documentation (`docs/regulatory/retention.md`, `docs/runbooks/breach-response.md`, `/privacy/pia` pages).
- 40+ API e2e specs and 20 Playwright specs, all running in CI.

What is not there:

- **The clinical laboratory was two tables** at the time of the audit: `LabOrder` + `LabOrderItem`, with the result a free-text string inline on the order item. No test catalog, no specimen, no accession number, no reference-range entity, no verification or validation step, no QC, no equipment, no reagent lot, no referral laboratory, no sections, no TAT targets, no critical-value rule or acknowledgement.

  _Since then_ the catalogue (`LaboratoryTest`, `TestComponent`, `LabSection`), specimens with atomic accession numbering and append-only rejections, configured critical-value rules, and acknowledged/escalated critical-result notifications have shipped. The result verification chain, signed reports, the laboratory licence profile with its service-capability gate, referral laboratories, and EQAP enrolment and submissions have since shipped too. **What remains unbuilt is still enough that CLINIQ cannot yet legally operate a DOH-licensed clinical laboratory**: internal QC, and equipment and reagent lots. See §6 and §30.

- **The ~35 `Lab*` models are a dental laboratory marketplace**, not a clinical lab. `LabCase`, `LabProduct`, `LabMaterialLot`, `LabShipment`, `LabTreatmentPlan`, `LabInvoice`, `LabCaseDispute` model crown-and-bridge manufacturing workflow between a clinic and a dental lab. This is a substantial, well-built module — and it is a naming collision that will confuse every engineer who joins after this. `apps/api/src/dental-lab/` (dental) and `apps/api/src/labs/` (clinical) differ by one character.
- **A P0 patient-portal authorization hole.** `PATIENT` role holds `PATIENT_READ` (`libs/shared-types/src/lib/roles.ts:118`), and ~30 staff endpoints are gated on `PATIENT_READ` alone with no self-scoping. A portal patient can call `GET /api/patients`, `GET /api/patients/:id`, `GET /api/patients/:id/export`, `GET /api/lab-orders/:id`, `GET /api/prescriptions/:id/pdf` and read every other patient in their clinic. RLS stops cross-tenant; nothing stops patient→patient.
- **Zero PH payer/benefit modelling.** No PhilHealth member, eligibility, benefit or claim entity. No senior citizen, no OSCA, no PWD, no VAT-exemption. `Invoice.discountCentavos` is one flat integer — it cannot represent the statutory sequence (VAT-exempt the base, then 20% off).
- **The `Patient` table has 8 fields.** No middle name, suffix, address, barangay, civil status, emergency contact, blood type, occupation, or any government identifier.
- **Signed clinical notes cannot be corrected.** `ConsultationsService.update` refuses a locked consult with _"Consultation is locked; create a revision instead"_ (`apps/api/src/consultations/consultations.service.ts:177-179`) — and no revision mechanism exists anywhere in the codebase.

**Maturity verdict:** CLINIQ is roughly **a credible small-clinic EMR at ~70% of a pilot-ready product**, and **~10% of a clinical laboratory information system**. The platform engineering (multi-tenancy, auth, audit, CI, IaC) is production-grade and should be preserved as-is. The clinical laboratory needs to be built, not refactored.

---

# 2. Repository Architecture

## 2.1 Actual layout

```
cliniq/
├── apps/
│   ├── api/                 NestJS 11 — 40 modules, 243 .ts files
│   ├── web/                 Next.js 15 + React 19 — 47 page.tsx routes, 33 feature folders
│   ├── mobile/              Expo 54 — 8 feature screens
│   ├── ai-service/          NestJS — Bedrock proxy (drafts, dermatology, transcribe, lab-drafts)
│   ├── api-e2e/             Jest + real HTTP — 41 module specs + tenant-isolation + auth-hardening
│   ├── web-e2e/             Playwright — 20 specs incl. a11y + responsive
│   └── ai-service-e2e/
├── libs/
│   ├── db/                  Prisma 7 schema + generated client + PrismaService (RLS plumbing)
│   ├── auth/                JWT, bcrypt, TOTP, opaque-token helpers
│   ├── shared-types/        Role/Action matrix + feature/plan catalog
│   ├── api-client/          Generated from the API's OpenAPI snapshot
│   ├── ui/                  shadcn primitives + Storybook
│   └── ai-prompts/          Versioned prompt templates + eval harness
├── infra/terraform/         AWS: network, database, compute (ECS), storage (S3+KMS), ai-bedrock
├── infra/ecs/               dev + prod task definitions
├── .railway/railway.ts      Railway IaC (the currently-live deployment)
├── docker/                  migrate.Dockerfile, postgres-init.sql
├── docs/                    regulatory/retention.md, runbooks/, lab-module-plan.md, audit-checklist.md
└── tools/scripts/           seeds, smoke-login, fix-cliniq-app-role.sql
```

## 2.2 Request path

```
Browser / Expo
      │  httpOnly cookie `cliniq.access`  (web)
      │  Authorization: Bearer            (mobile)
      ▼
Next.js 15 (apps/web) ──── proxy.ts resolves tenant subdomain
      │
      ▼
NestJS API (apps/api)
  ThrottlerGuard  →  JwtAuthGuard  →  RbacGuard  →  FeatureGuard
  (APP_GUARD chain registered in apps/api/src/auth/auth.module.ts:19-21)
      │            ↑ X-Acting-For delegation resolves here
      ▼
Domain service  ──► prisma.withTenant(tenantId, userId, tx => …)
      │                └─ SET LOCAL app.current_tenant = <tenantId>
      ▼
PostgreSQL as role `cliniq_app`  (NOLOGIN, no BYPASSRLS)
  RLS policy:  USING ("tenantId" = current_tenant_id())
      │
      ├──► S3 (PHI bucket, SSE-KMS, versioned, public access blocked)
      └──► ai-service (x-ai-service-token) ──► AWS Bedrock (Claude)
```

## 2.3 External services

| Service           | Used for                                                      | Where                                                     |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| AWS Bedrock       | SOAP drafting, dermatology draft, dental treatment-plan draft | `apps/ai-service/src/bedrock/`                            |
| AWS Transcribe    | consult audio → transcript                                    | `apps/ai-service/src/transcribe/`                         |
| AWS S3 + KMS      | PHI documents, PDFs                                           | `apps/api/src/files/`, `infra/terraform/modules/storage/` |
| SMTP (mailer)     | invites, password reset                                       | `apps/api/src/mailer/`                                    |
| SMS provider      | queue "you're up next"                                        | `apps/api/src/sms/`                                       |
| Push (Expo)       | mobile notifications                                          | `apps/api/src/notifications/push.service.ts`              |
| WebRTC + TURN     | telemedicine (signalling over HTTP short-poll)                | `apps/api/src/tele/`                                      |
| Payment links     | dental-lab invoices only                                      | `LabPaymentLink` model                                    |
| Railway / AWS ECS | hosting                                                       | `.railway/railway.ts`, `infra/`                           |

**Note:** there is no analyzer interface, no HL7/ASTM/FHIR endpoint, and no PhilHealth eClaims integration anywhere in the tree.

---

# 3. Current Feature Inventory

| Domain                                 | Status | Evidence                                                              | Notes                                                                                                                |
| -------------------------------------- | ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Multi-tenancy + RLS                    | ✅     | `prisma.service.ts:78-118`, 76/80 tables                              | Superuser boot refusal is excellent                                                                                  |
| Auth (JWT, refresh, MFA/TOTP, lockout) | ✅     | `libs/auth/`, `User.mfaEnabled/failedLoginCount`                      | httpOnly cookies + Bearer both supported                                                                             |
| RBAC                                   | 🟡     | `libs/shared-types/src/lib/roles.ts`                                  | 8 roles / 21 actions; `MEDICAL_TECHNOLOGIST` + `PATHOLOGIST` landed, no `LAB_RECEPTION` or cashier role              |
| Patient registration                   | 🟠     | `schema.prisma:1144-1182`                                             | 8 fields. See §5                                                                                                     |
| Patient chart                          | 🟡     | `Allergy`, `Medication`, `Condition`, `Vital`                         | No history/immunisation/procedure/document entities                                                                  |
| Consultation (SOAP)                    | 🟡     | `Consultation`, JSON SOAP, `lockedAt`                                 | Locked = frozen forever; no amendment                                                                                |
| ICD-10                                 | ✅     | `IcdCode` model + `icd.findUnknown()` validation                      | Validated on write                                                                                                   |
| Prescriptions                          | ✅     | `Prescription` + `PrescriptionItem` + PRC snapshot + PDF              | Best-implemented clinical domain                                                                                     |
| Drug catalog + safety                  | ✅     | `apps/api/src/drugs/`, `prescriptions/safety/`                        | Global + per-tenant drugs                                                                                            |
| Appointments                           | ✅     | `Appointment` + lifecycle timestamps + `appointment-transitions.ts`   | Proper state machine                                                                                                 |
| Provider availability                  | ✅     | `ProviderAvailability`, `ProviderTimeOff`                             | Weekly + dated overrides                                                                                             |
| Queue                                  | 🟡     | `Queue`, `QueueTicket`                                                | Single-stage ticket; no multi-stage journey (§7)                                                                     |
| Visit types                            | ✅     | `VisitType`                                                           | Drives which clinical forms appear                                                                                   |
| **Clinical laboratory**                | 🟡     | + catalogue, specimens, verification chain, critical-value rules (§6) | Was `LabOrder`/`LabOrderItem` only. QC, equipment, licence profile and reports still missing                         |
| Dental laboratory marketplace          | ✅     | ~35 `Lab*` models, `apps/api/src/dental-lab/`                         | Substantial and complete; wrong name                                                                                 |
| Dental chart / odontogram              | ✅     | `DentalChart`, `DentalToothEntry`, `DentalSurfaceFinding`             | FDI numbering                                                                                                        |
| OB module                              | ✅     | `ObPregnancy`, `ObVisit`, `UltrasoundReport`                          |                                                                                                                      |
| Billing                                | 🟡     | `Invoice`, `InvoiceItem`, `Payment`, `Service`                        | Flat discount; no PH statutory rules (§8)                                                                            |
| HMO                                    | 🟡     | `HmoProvider`, `HmoMembership`, `HmoClaim`                            | No LOA/authorization entity                                                                                          |
| **PhilHealth**                         | 🔴     | one `payerCode` comment string                                        | Nothing modelled                                                                                                     |
| **Senior / PWD**                       | 🔴     | one `QueueKind.PRIORITY` enum value                                   | Nothing modelled                                                                                                     |
| Inventory                              | ✅     | `InventoryItem`, `StockBatch`, `StockMovement`                        | FEFO batch consumption                                                                                               |
| Telemedicine                           | ✅     | `TeleSession`, `TeleSignal`, recording consent                        | WebRTC P2P + short-poll signalling                                                                                   |
| Notifications                          | 🟡     | `Notification`, `PushToken`                                           | In-app + push + SMS; no unified channel abstraction                                                                  |
| Audit log                              | 🟡     | `AuditLog` + `AuditInterceptor`                                       | Append-only ✅ since `20260924090100` — and asserted in CI only since the fix in §1; no before/after, no reason      |
| Consents (DPA)                         | ✅     | `PatientConsent`, `@RequiresConsent` interceptor                      | AI processing gated on consent                                                                                       |
| DSR (data subject requests)            | ✅     | `DataSubjectRequest` + `EraseProcessor`                               | Access/erase/portability                                                                                             |
| Retention                              | 🟡     | `apps/api/src/retention/`, `docs/regulatory/retention.md`             | Only audit + notification purges implemented                                                                         |
| Files / S3                             | 🟡     | `FileObject` + `patientId`, presign PUT/GET, audited download         | Download + ownership fixed (P0-7); **no AV scan**                                                                    |
| Patient portal                         | ✅     | `apps/api/src/me/`, `PortalScopeGuard`, `portal-boundary.spec.ts`     | BOLA fixed (P0-1); PATIENT holds `PORTAL_READ` only                                                                  |
| Platform admin                         | ✅     | `PlatformAdmin` (separate identity table), RLS bypass GUC             | Good blast-radius isolation                                                                                          |
| Delegations (act-on-behalf)            | ✅     | `Delegation` + `X-Acting-For` + scoped actions                        | Audited                                                                                                              |
| Reports                                | 🟡     | 4 endpoints: overview, revenue, top-services, no-shows                | No lab analytics at all                                                                                              |
| AI                                     | ✅     | `ai-service`, `libs/ai-prompts`, `AiBudget`, consent gate             | Data-minimised; budget enforced in consult path                                                                      |
| Infra (Terraform AWS)                  | ✅     | `infra/terraform/modules/*`                                           | S3 KMS+versioned+PAB; VPC; RDS; ECS                                                                                  |
| CI                                     | ✅     | lint/typecheck/test/build + api-e2e + Playwright + docker build       | All suites run                                                                                                       |
| Unit tests (API)                       | 🔴     | 10 spec files / 254 source files                                      | Still ~4%. The new ones are the pure-logic modules (`flagging`, `accession`, `verification`) — the pattern to follow |

---

# 4. Critical Findings (P0)

## P0-1 ⚠️ Patient-portal BOLA: a patient can read every other patient in the clinic

**Confirmed.** `PATIENT` is granted `PATIENT_READ`:

```ts
// libs/shared-types/src/lib/roles.ts:118
PATIENT: new Set([Actions.PATIENT_READ]),
```

`PATIENT_READ` is the _only_ gate on ~30 staff endpoints. `PatientsService.findById` and `.list` contain no role branch and no self-scope:

```ts
// apps/api/src/patients/patients.service.ts:130-138
async findById(id: string, user: AuthenticatedUser) {
  return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
    const patient = await tx.patient.findFirst({ where: { id, deletedAt: null } });
    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    return patient;
  });
}
```

RLS scopes this to the tenant. **Nothing scopes it to the patient.** A portal account issued by `/portal/signup` therefore reaches, with its own valid token:

| Endpoint                                        | File                          |
| ----------------------------------------------- | ----------------------------- | ---------- | ------- | ------------------------ |
| `GET /api/patients` (full roster)               | `patients.controller.ts:50`   |
| `GET /api/patients/:id`                         | `patients.controller.ts:59`   |
| `GET /api/patients/:id/modules`                 | `patients.controller.ts:76`   |
| `GET /api/patients/:id/export` (full chart PDF) | `patients.controller.ts`      |
| `GET /api/lab-orders/:id`                       | `labs.controller.ts:53`       |
| `GET /api/patients/:patientId/lab-orders`       | `labs.controller.ts:35`       |
| `GET /api/prescriptions/:id` and `/pdf`         | `prescriptions.controller.ts` |
| `GET /api/patients/:patientId/dental-chart`     | `dental.controller.ts`        |
| `GET /api/ob/pregnancies`, `/ob/ultrasound/:id` | `ob.controller.ts`            |
| `GET /api/clinical/allergies                    | medications                   | conditions | vitals` | `clinical.controller.ts` |
| `GET /api/patients/:patientId/hmo-memberships`  | `hmo.controller.ts`           |
| `GET /api/appointments`, `/appointments/:id`    | `appointments.controller.ts`  |

The `/api/me/*` module is done correctly — `MeService.requirePatientId` derives the id from the JWT `pid` claim and never from a param (`me.service.ts:30-33`). The design intent was right; the coarse gate leaks around it.

**No test covers this.** `apps/api-e2e/src/modules/patients.spec.ts:91` asserts only that PATIENT cannot _create_ a patient (403 on `PATIENT_WRITE`). There is no assertion that PATIENT is refused on read.

**Fix (small, surgical):**

1. Add `Actions.PORTAL_READ` to `libs/shared-types/src/lib/roles.ts` and change `PATIENT` to `new Set([Actions.PORTAL_READ])`.
2. Change `MeController`'s `@Requires(Actions.PATIENT_READ)` → `@Requires(Actions.PORTAL_READ)` on the portal routes, and keep `PATIENT_READ` on `staff-profile` (which already has its own `requireStaff` check).
3. Add a `PortalScopeGuard` (or extend `RbacGuard`) that hard-rejects any request whose `user.role === 'PATIENT'` on a controller not marked `@PortalRoute()`. Belt and braces.
4. Add `apps/api-e2e/src/modules/portal-boundary.spec.ts` asserting 403 for a PATIENT token against every endpoint in the table above.

> **Status: fixed.** All four steps landed. `PATIENT` now holds `PORTAL_READ` and nothing else (`libs/shared-types/src/lib/roles.ts`), `PortalScopeGuard` hard-refuses any PATIENT-role token on a handler not marked `@PortalRoute()`, and `apps/api-e2e/src/modules/portal-boundary.spec.ts` asserts the refusal against the endpoints listed above so it cannot regress silently.

## P0-2 ⚠️ Lab results have no verification, no versioning, and hard-coded critical thresholds

`LabsService.recordResult` (`apps/api/src/labs/labs.service.ts:166-256`) does all of the following in one call, gated on `CONSULT_WRITE` (i.e. a doctor or nurse):

- writes `resultValue` directly onto the order item, overwriting any prior value with no history row;
- derives the abnormal flag;
- flips the parent order to `REPORTED` when the last item is filled;
- fires a best-effort in-app notification.

There is no technologist entry → technical verification → pathologist validation → release chain. There is no `verifiedBy`, `validatedBy`, `releasedAt`, or result version. A released result can be silently rewritten, and the audit log records only `lab.resultRecord` with the item id — not the old and new values.

Worse, the critical thresholds are invented:

```ts
// apps/api/src/labs/labs.service.ts:278-292
if (high !== null) {
  const criticalHigh = high * 1.5;
  if (n >= criticalHigh) return LabAbnormalFlag.CRITICAL_HIGH;
  ...
  const criticalLow = low * 0.5;
```

For serum potassium (reference 3.5–5.1 mmol/L) this flags CRITICAL_HIGH at 7.65 and CRITICAL_LOW at 1.75. Clinically accepted critical limits are roughly ≥6.0–6.5 and ≤2.5. **The rule systematically under-flags true critical values** — a patient-safety defect, not a cosmetic one. Critical limits are per-analyte and must be configured, never derived from the reference interval.

> **Status: the threshold half is fixed.** Critical limits are now configured data — `CriticalValueRule` (tenant-scoped, RLS-forced, narrowable by age and sex, bounded by an effective window) plus per-order overrides on `LabOrderItem`. The arithmetic lives in `apps/api/src/labs/flagging.ts` as pure functions with 34 unit tests, and with no limit configured a result is flagged HIGH/LOW against its reference interval but **never** CRITICAL. The formula is gone.
>
> **Status: the rest of P0-2 is now fixed too** (`20260924220000_lis_result_verification`). Results move `PENDING → PRELIMINARY → FINAL`, with `CORRECTED` for a released value later changed — HL7's P/F/C vocabulary. Every entry, release and correction appends to `lab_result_versions`, which is append-only at the grant level, so a corrected result no longer destroys the value a clinician may have acted on. `enteredById` and `verifiedById` are recorded on every result, and `MEDICAL_TECHNOLOGIST` / `PATHOLOGIST` carry the separation.
>
> Two behaviours worth knowing: an order now reaches `REPORTED` only when every item is **released**, not merely valued — it previously reported results nobody had stood behind. And critical values still notify on **entry**, before any release, because a critical value is phoned immediately; a merely HIGH/LOW result waits for release.
>
> Still open from the original finding: the audit log records `lab.resultRecord` with the item id, not the old and new values. The result history answers that for results specifically, but §29 #18 stands for the audit log generally.
>
> One design note for whoever reviews it: verification and separation-of-duties are **per-tenant settings that default off**, not hard rules. Defaulting them on would leave a single-technologist clinic unable to release any result at all, and results that never reach the ordering doctor are a worse patient-safety outcome than self-verification. Both identities are recorded either way; the settings only decide what is enforced.

## P0-3 ⚠️ Critical results are a fire-and-forget in-app notification

```ts
// apps/api/src/labs/labs.service.ts:222
void this.notif.notify({ ... severity: NotificationSeverity.CRITICAL ... });
```

`void` — the promise is not awaited and failure is swallowed. There is no `CriticalResultNotification` entity, no recipient record, no call-back/read-back, no acknowledgement, no escalation if unacknowledged, and no audit row. Documented communication and acknowledgement of critical values is a standard DOH/QA expectation for licensed laboratories and is the single most common finding in lab inspections.

> **Status: fixed.** `CriticalResultNotification` (`20260924120000_critical_result_notifications`) records the obligation **inside the result transaction**, so a failed delivery leaves a row rather than nothing. It carries the recipient, the flag and the limits that applied, the rule that supplied them, a `dueAt` derived from the rule's `notifyWithinMinutes`, the acknowledgement, and the delivery error when in-app delivery fails — so the unacknowledged queue distinguishes "nobody has acknowledged this" from "we could not even reach them". `DELETE` is revoked on the table.
>
> Still open: call-back/read-back capture (who was told, by what method, and what they repeated back) is recorded only as an acknowledgement, not as a structured read-back.

## P0-4 ⚠️ Signed consultations cannot be amended

`ConsultationsService.complete` sets `lockedAt`; `update` then refuses with _"Consultation is locked; create a revision instead"_ — and grep across `apps/api/src` finds no addendum, amendment or revision mechanism for consultations (only for dental-lab treatment plans). A doctor who signs a note with the wrong diagnosis, the wrong patient's history, or a typo'd drug has **no lawful path to correct the record**. In practice clinics will work around this by never completing consults, which silently destroys the lock's value.

> **Status: fixed.** `ConsultationAmendment` (append-only, RLS-forced, unique `(consultationId, version)`) plus `POST /consultations/:id/amendments`. Each amendment is a complete snapshot carrying forward what was not restated, the original row is never rewritten, a reason is required, and the author's name and PRC licence are snapshotted at signing time. The dead-end error message now names the endpoint.

## P0-5 ⚠️ CLINIQ cannot support a DOH-licensed clinical laboratory

Not a bug — a scope gap, listed as P0 because it is the stated product goal. Absent at audit time: test catalog, specimen/accession, reference-range entity, QC, EQAP evidence, equipment, reagent lots, laboratory licence profile, service capability, referral laboratory, report signatures. See §6 and §21.

> **Status: partially closed, and the remainder is the licensing-critical part.**
>
> | Built                                                                                                                         | Still missing                                         |
> | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
> | Test catalogue — `LaboratoryTest`, `TestComponent`, `LabSection` (`20260924180000_lis_test_catalogue`)                        | Internal QC (EQAP evidence has since shipped)         |
> | Specimens, accession numbers, append-only rejections (`20260924200000_lis_specimens`)                                         | Equipment and reagent lots                            |
> | Configured critical-value rules (`20260923180000_critical_value_rules`)                                                       | `Laboratory` licence profile + `LabServiceCapability` |
> | Acknowledged critical-result notifications (`20260924120000_critical_result_notifications`)                                   | Referral laboratories                                 |
> | Result verification chain (`20260924220000_lis_result_verification`); signed reports + PDF (`20260924240000_lis_lab_reports`) | A standalone `ReferenceRange` entity                  |
>
> A DOH licence turns on the right-hand column, not the left. The catalogue and specimen work make the laboratory _operable_; it does not make it _licensable_.

## P0-6 ⚠️ `push_tokens` has no RLS and is queried without tenant scope

`push_tokens` is the one tenant-scoped table with no RLS policy (verified across all 44 migrations), and `PushService` uses the bare client rather than `withTenant`:

```ts
// apps/api/src/notifications/push.service.ts:92,114
const tokens = await this.prisma.pushToken.findMany({ ... });
```

Impact is bounded (a device token, and only for a user id that already exists), but it is the one place the otherwise-uniform isolation model has a hole. `platform_admins` and `platform_refresh_sessions` are likewise outside RLS; no current code path exposes them to a tenant session, so that is a defence-in-depth gap rather than a live vulnerability. `icd_codes` is deliberately global with a `SELECT`-only grant — **this document said that was correct, and it was wrong.**

The creating migration (`20260504020000_pilot_readiness`) does say `GRANT SELECT ON "icd_codes" TO cliniq_app`, but the schema-wide `ALTER DEFAULT PRIVILEGES` in `20260501000001_rls_policies` had already granted all four privileges, and a narrower GRANT does not subtract. The role held `DELETE, INSERT, SELECT, UPDATE` on it until `20260924260000_icd_codes_read_only`.

It matters more on this table than on the append-only ones. `icd_codes` has no `tenantId` and therefore no RLS, so nothing stood between any tenant session and `DELETE FROM icd_codes` — which would remove the ICD-10 reference data for every tenant on the instance. No code path does it (the API only reads; the seed runs as the owner), so this was a hole rather than a live bug.

**This is the third instance of the same trap**, after `audit_logs` / `consultation_amendments` and CI re-granting after `migrate deploy`. All three were found by hand, late, one at a time. `apps/api-e2e/src/modules/privilege-coverage.spec.ts` now asserts the class: every `REVOKE` the migrations declare still holds, read out of the migration files so the next one is covered automatically.

> **Status: fixed.** `20260924100000_push_tokens_rls` enables and forces RLS with a tenant-isolation policy, and `PushService` goes through `withTenant`. Every table carrying a `tenantId` is now under RLS; the migrations that add one assert this, and a scratch-database check of `information_schema` returns zero exceptions.

## P0-7 ⚠️ There is no authorized file download path

`FilesService` implements `presign` (PUT) and `confirm` only. There is no GET/download endpoint, and `FileObject` has **no `patientId`** — so even when one is added there is nothing to authorize against. Any future download route will have to backfill ownership. Today, uploaded PHI is effectively write-only through the API.

> **Status: fixed.** `20260924140000_file_patient_ownership` adds `FileObject.patientId`, and `GET /api/files/:id/download` plus the portal's `GET /api/me/files/:id/download` issue short-lived presigned GETs. Both are audited, because a download of PHI is precisely the event an inspection asks about. A null `patientId` is staff-only by construction, so the portal route cannot reach a file that was never attributed to a patient.
>
> Still open: antivirus scanning on upload.

---

# 5. Clinic / EMR Gap Analysis

## 5.1 Patient registration — 🟠 NEEDS REDESIGN

Current (`libs/db/prisma/schema.prisma:1144-1182`), in full: `mrn`, `firstName`, `lastName`, `dateOfBirth`, `sex`, `email`, `phone`.

| Field                                         | Status                         | Recommendation                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MRN                                           | ✅ `@@unique([tenantId, mrn])` | Keep. Add a generator; today it is caller-supplied.                                                                                                                                                            |
| First / Last name                             | ✅                             |                                                                                                                                                                                                                |
| Middle name, suffix                           | 🔴                             | Add to `Patient`. PH records routinely need both; middle name is the mother's maiden surname and is a real disambiguator.                                                                                      |
| Preferred name                                | 🔴                             | Add `preferredName String?`                                                                                                                                                                                    |
| Date of birth                                 | ✅                             |                                                                                                                                                                                                                |
| Sex                                           | ✅ `Sex` enum                  | Keep. Consider separate `genderIdentity` later.                                                                                                                                                                |
| Civil status                                  | 🔴                             | Enum `CivilStatus`                                                                                                                                                                                             |
| Address / barangay / city / province / region | 🔴                             | **Normalize** — `PatientAddress` (many-per-patient, typed HOME/WORK/BILLING) with `line1`, `barangay`, `cityMunicipality`, `province`, `region`, `postalCode`. PSGC codes optional but valuable for reporting. |
| Contact info                                  | 🟡 email + phone inline        | **Normalize** — `PatientContact` (typed MOBILE/LANDLINE/EMAIL, `isPrimary`). Patients have two mobiles more often than not.                                                                                    |
| Emergency contact / guardian                  | 🔴                             | `PatientRelatedPerson` with `relationship`, `isEmergencyContact`, `isGuardian`                                                                                                                                 |
| Occupation / employer                         | 🔴                             | Fields on `Patient`, or a `PatientEmployment` row if HMO membership should key off it                                                                                                                          |
| PhilHealth                                    | 🔴                             | `PatientIdentifier` (see below) + `PhilHealthMembership`                                                                                                                                                       |
| HMO                                           | 🟡 `HmoMembership` exists      | Keep; add LOA (§8)                                                                                                                                                                                             |
| Senior citizen (OSCA)                         | 🔴                             | `PatientEntitlement` (see below)                                                                                                                                                                               |
| PWD                                           | 🔴                             | `PatientEntitlement`                                                                                                                                                                                           |
| Government IDs (PhilSys/UMID/TIN/passport)    | 🔴                             | `PatientIdentifier`                                                                                                                                                                                            |
| Allergies                                     | ✅ `Allergy` model             | Keep                                                                                                                                                                                                           |
| Blood type                                    | 🔴                             | Add `bloodType BloodType?` to `Patient`                                                                                                                                                                        |
| Nationality                                   | 🔴                             | Add                                                                                                                                                                                                            |

**Recommended normalization (do not stuff these onto `Patient`):**

```prisma
model PatientIdentifier {
  id        String             @id @default(cuid())
  tenantId  String
  patientId String
  system    PatientIdSystem    // PHILHEALTH | PHILSYS | UMID | SSS | GSIS | TIN | PASSPORT | DRIVERS | OTHER
  value     String
  issuedAt  DateTime?
  expiresAt DateTime?
  verifiedAt DateTime?
  verifiedBy String?
  documentFileId String?       // → FileObject (the scanned ID)
  @@unique([tenantId, system, value])
  @@index([tenantId, patientId])
}

model PatientEntitlement {
  id         String            @id @default(cuid())
  tenantId   String
  patientId  String
  kind       EntitlementKind   // SENIOR_CITIZEN | PWD | SOLO_PARENT | INDIGENT
  idNumber   String            // OSCA no. / PWD ID no.
  issuingBody String?          // OSCA office / CSWDO / NCDA
  validFrom  DateTime?
  validUntil DateTime?
  documentFileId String?
  verifiedAt DateTime?
  verifiedBy String?
  @@index([tenantId, patientId, kind])
}
```

`PatientEntitlement` is what the billing engine reads. Storing "is senior" as a boolean on `Patient` is the trap: the discount is conditioned on presenting a valid ID, the ID number must appear on the receipt, and the entitlement expires.

## 5.2 Patient chart — 🟡 PARTIAL

| Section              | Status | Evidence                                                                                                               |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Demographics         | 🟠     | thin (§5.1)                                                                                                            |
| Identifiers          | 🔴     | —                                                                                                                      |
| Contacts / Addresses | 🔴     | —                                                                                                                      |
| Allergies            | ✅     | `Allergy` + `AllergyType` + `Severity`                                                                                 |
| Medical history      | 🔴     | only `Condition` (problem list)                                                                                        |
| Surgical history     | 🔴     | —                                                                                                                      |
| Family history       | 🔴     | —                                                                                                                      |
| Social history       | 🔴     | —                                                                                                                      |
| Immunizations        | 🔴     | —                                                                                                                      |
| Medications          | ✅     | `Medication` + `MedStatus`                                                                                             |
| Problems / Diagnoses | 🟡     | `Condition`, plus `Consultation.diagnosisCodes String[]` — diagnoses are a string array on the encounter, not entities |
| Encounters           | ✅     | `Consultation`                                                                                                         |
| Laboratory           | 🟠     | §6                                                                                                                     |
| Imaging              | 🟡     | `UltrasoundReport` only (OB)                                                                                           |
| Procedures           | 🔴     | —                                                                                                                      |
| Prescriptions        | ✅     | `Prescription`                                                                                                         |
| Documents            | 🟠     | `FileObject` has no patient link                                                                                       |
| Audit history        | ✅     | `AuditLog` (append-only since `20260924090100_append_only_grants`)                                                     |

**Recommendation:** `Consultation.diagnosisCodes String[]` should become a `Diagnosis` entity (`encounterId`, `icdCode`, `rank` primary/secondary, `certainty`, `onsetDate`, `resolvedAt`) so diagnoses can be reported on, carried to the problem list, and attached to a PhilHealth claim. Migration is additive and backfillable from the array.

## 5.3 Clinical encounter — 🟡 PARTIAL

| Stage                   | Status | Evidence                                                  |
| ----------------------- | ------ | --------------------------------------------------------- |
| Check-in                | ✅     | `Appointment.checkedInAt` + `QueueTicket`                 |
| Vitals                  | ✅     | `Vital`                                                   |
| Chief complaint         | 🟡     | inside `Consultation.subjective` JSON                     |
| History                 | 🟡     | free JSON                                                 |
| Physical exam           | 🟡     | `Consultation.objective` JSON                             |
| Assessment              | 🟡     | JSON                                                      |
| Diagnosis               | 🟡     | `diagnosisCodes String[]`, validated against `IcdCode` ✅ |
| Plan                    | 🟡     | JSON                                                      |
| Orders (lab)            | 🟡     | `LabOrder`                                                |
| Prescription            | ✅     | `Prescription` + PDF + PRC snapshot                       |
| Follow-up               | 🔴     | no follow-up entity; only a free-text plan                |
| Medical certificate     | 🔴     | —                                                         |
| Fit-to-work certificate | 🔴     | —                                                         |
| Referral letter         | 🔴     | —                                                         |
| Procedures              | 🔴     | —                                                         |

SOAP as JSON is a defensible MVP choice (Tiptap rich text without four extra tables) and I would **not** redesign it. But it means SOAP content is unqueryable and unversioned — which is fine for narrative, and not fine for `chiefComplaint`. Recommend promoting `chiefComplaint String?` to a column.

### Amendment model (fixes P0-4)

```prisma
model ConsultationAmendment {
  id             String   @id @default(cuid())
  tenantId       String
  consultationId String
  version        Int              // 1 = original signed content
  authorId       String
  reason         String           // required — "wrong patient", "typo in dosage"
  subjective     Json?
  objective      Json?
  assessment     Json?
  plan           Json?
  diagnosisCodes String[] @default([])
  signedAt       DateTime
  @@unique([consultationId, version])
  @@index([tenantId, consultationId])
}
```

The original row stays immutable; the latest amendment is the current view; the chart renders "Amended <date> by <clinician> — <reason>". This is the standard medico-legal pattern and it is what the existing error message already promises.

## 5.4 Appointments + queue — ✅ / 🟡

Appointments are genuinely good: a real state machine (`apps/api/src/appointments/appointment-transitions.ts`), one timestamp per transition, reschedule provenance, provider availability with dated overrides.

The queue is not. `QueueTicket` has one `status` (`WAITING|CALLED|SERVED|NO_SHOW|CANCELLED`) and one `Queue` per `(tenant, location, kind)`. A patient's journey through the clinic is not modelled — so "waiting for cashier" and "waiting for the doctor" are different tickets in different queues with no link, and TAT across the visit cannot be computed.

**Recommended (P2, not P0):** keep `Queue`/`QueueTicket` as the _display_ layer and add a `VisitJourney` with ordered `VisitStage` rows:

```
CHECKED_IN → VITALS → DOCTOR → LAB → CASHIER → COMPLETED
```

each stage carrying `enteredAt`, `startedAt`, `completedAt`, `stationId`, `staffId`. The queue display reads from stages; reports get wait-time-per-stage for free. Stages should be **tenant-configurable** — a derma clinic has no LAB stage, an OB clinic has ULTRASOUND.

---

# 6. LIS Gap Analysis

## 6.1 The naming problem, first

`apps/api/src/dental-lab/` is a **dental laboratory marketplace** — `LabCase` (a crown being manufactured), `LabProduct` (a catalog of prosthetics), `LabMaterialLot`, `LabShipment`, `LabTreatmentPlan`, `LabConformityDocTemplate`, `LabCaseDispute`. `Tenant.kind = LAB` with `LabSpecialty` means _dental lab tenant_.

`apps/api/src/labs/` is the **clinical laboratory** — two tables.

Thirty-five models are named `Lab*` for the former; the latter gets `LabOrder`/`LabOrderItem`. **Before writing a single line of LIS code, rename.** Proposal: dental-lab models keep `Lab*` but the module moves to `apps/api/src/dental-lab/` and `Tenant.kind` gains `DENTAL_LAB`; clinical-lab models are prefixed `Diagnostic*` or namespaced `lis/`. Doing this after the LIS is built will be a multi-week merge conflict.

## 6.2 Stage-by-stage mapping

| Target stage             | Status | What exists                                                                            |
| ------------------------ | ------ | -------------------------------------------------------------------------------------- |
| Doctor/clinic order      | 🟡     | `LabOrder` with `patientId`, `providerId`, `consultationId`, `number`                  |
| Accession                | 🔴     | `LabOrder.number` is a slip number, not an accession; no specimen accession exists     |
| Specimen collection      | 🔴     | `LabOrder.collectedAt` timestamp only — no collector, no container, no volume, no site |
| Specimen reception       | 🔴     | `receivedAt` timestamp only                                                            |
| Processing               | 🔴     | no state, no worklist, no section routing                                              |
| Testing                  | 🔴     | no analyzer, no method, no run                                                         |
| Result entry             | 🟡     | `LabOrderItem.resultValue String?` — free text                                         |
| Technical verification   | 🔴     | —                                                                                      |
| Pathologist validation   | 🔴     | —                                                                                      |
| Result release           | 🟡     | `LabOrderStatus.REPORTED` auto-set when every item has a value                         |
| Report to doctor/patient | 🟡     | in-app notification; no PDF lab report exists                                          |

## 6.3 Lab order — 🟠

Present: patient, encounter, ordering practitioner, requested-at, order items.
Missing: **priority** (STAT/urgent/routine), **clinical indication**, **working diagnosis**, fasting status, collection instructions, and any link from an order item to a test catalog. `LabOrderItem.testName String` and `testCode String?` are free text — two clinics will spell "CBC with platelet count" three ways, and nothing can be reported on.

## 6.4 Test catalog — ✅ BUILT (was 🔴 MISSING ENTIRELY)

> **Status: built** in `20260924180000_lis_test_catalogue` — `LaboratoryTest`, `TestComponent` and `LabSection`, with the test's code, name, specimen and component unit **snapshotted onto the order item** at order time so a historical order still reads as it was placed after the catalogue is edited. Ordering from the catalogue is optional: ad-hoc orders and rows written before the catalogue existed keep working.
>
> The analysis below is left as written, because it is still the specification the build was measured against.

There is no `LaboratoryTest` table. Every field in the target spec (code, short name, section, specimen type, container, minimum volume, collection/processing instructions, TAT, price, result type, unit, decimal precision, critical values, reference ranges, method, active status) is absent.

**Panels are the sharpest problem.** The schema comment is explicit:

```
// One LabOrder per order slip, multiple LabOrderItems per order (one per
// test). Results are stored inline on the item — for panels that produce
// many values (e.g. CBC), each value gets its own item.
```

So a CBC is entered as ~7 sibling order items with no parent, no shared reference set, no panel identity, and no way to render a CBC report as a CBC. This is exactly the "don't store a CBC as one simple result" failure mode — inverted: it stores a CBC as seven unrelated results.

**Recommended:**

```prisma
model LabSection {           // HEMATOLOGY, CLINICAL_CHEMISTRY, …
  id String @id @default(cuid())
  tenantId String
  code String
  name String
  isActive Boolean @default(true)
  @@unique([tenantId, code])
}

model LaboratoryTest {
  id                String  @id @default(cuid())
  tenantId          String
  code              String            // local code
  loincCode         String?
  name              String
  shortName         String?
  sectionId         String
  isPanel           Boolean @default(false)
  specimenTypeId    String?
  containerId       String?
  minVolumeMl       Float?
  collectionInstructions String?
  processingInstructions String?
  targetTatMinutes  Int?
  statTatMinutes    Int?
  method            String?
  isActive          Boolean @default(true)
  @@unique([tenantId, code])
  @@index([tenantId, sectionId, isActive])
}

model TestComponent {              // the analytes a test reports
  id            String @id @default(cuid())
  tenantId      String
  testId        String
  code          String             // HGB, HCT, WBC…
  loincCode     String?
  name          String
  resultType    ResultType         // NUMERIC | TEXT | CODED | TITER | CALCULATED
  unit          String?
  decimals      Int     @default(1)
  displayOrder  Int     @default(0)
  calculationFormula String?       // e.g. MCHC = HGB/HCT*100
  isActive      Boolean @default(true)
  @@unique([tenantId, testId, code])
}
```

A panel is a `LaboratoryTest` with `isPanel = true` whose `TestComponent` rows are its analytes — or, for reflex/profile panels, a `TestPanelMember` join to child tests. Order items reference `testId`; results reference `componentId`.

## 6.5 Reference ranges — 🟠

Current: two nullable floats on the order item, `referenceLow`/`referenceHigh`, copied from whatever the orderer typed.

No age, sex, pregnancy, condition, specimen, method, analyzer, unit or effective-date dimension. That means a paediatric haemoglobin and an adult male haemoglobin are flagged against the same numbers.

**Recommended** — close to the target spec:

```prisma
model ReferenceRange {
  id           String   @id @default(cuid())
  tenantId     String
  componentId  String
  ageMinDays   Int?
  ageMaxDays   Int?          // days, not years — neonatal ranges change weekly
  sex          Sex?          // null = any
  condition    String?       // PREGNANT_T1, FASTING, …
  methodId     String?
  equipmentId  String?
  lowerLimit   Float?
  upperLimit   Float?
  textualRange String?       // "Negative", "<1:40"
  unit         String
  effectiveFrom DateTime
  effectiveTo   DateTime?
  @@index([tenantId, componentId, effectiveFrom])
}

model CriticalValueRule {
  id           String @id @default(cuid())
  tenantId     String
  componentId  String
  ageMinDays   Int?
  ageMaxDays   Int?
  sex          Sex?
  criticalLow  Float?
  criticalHigh Float?
  textualCritical String?     // "Positive" for certain serology
  notifyWithinMinutes Int @default(60)
  effectiveFrom DateTime
  effectiveTo   DateTime?
  @@index([tenantId, componentId])
}
```

Critical rules are **separate rows from reference ranges** and independently configured. This directly replaces the `high * 1.5` / `low * 0.5` heuristic (P0-2).

## 6.6 Specimen management — ✅ BUILT (was 🔴 MISSING)

> **Status: built** in `20260924200000_lis_specimens` — `Specimen`, `SpecimenRejection` and a `DocumentSequence` allocator. Worth knowing about the implementation:
>
> - **Accession numbers are allocated atomically** (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`). The pre-existing `nextOrderNumber` did count-then-format inside a transaction, which at READ COMMITTED hands two concurrent callers the same number; the unique index then fails one insert and it surfaces as a 500 on a valid request. Order slips now share the same allocator.
> - **REJECTED is terminal.** A re-draw is a new specimen with its own accession number, because reusing the number would put two different draws under one identity. Rejecting releases the order's items so they can be re-collected rather than stranded.
> - **Rejection reasons are a closed enum**, because rejection rate _by reason_ is the quality indicator a laboratory is expected to act on, and free text makes that unmeasurable. The rejection table is append-only.
>
> Still open: specimen storage/retention rules and transport tracking between collection sites.

No `Specimen` table. Accession number, collector, collection site, container, volume, status and rejection are all absent; the only trace is three nullable timestamps on `LabOrder`.

```prisma
model Specimen {
  id               String @id @default(cuid())
  tenantId         String
  accessionNumber  String           // e.g. 26-0923-00147
  orderId          String
  patientId        String
  specimenTypeId   String
  containerId      String?
  collectedAt      DateTime?
  collectedById    String?
  collectionSite   String?
  volumeMl         Float?
  receivedAt       DateTime?
  receivedById     String?
  status           SpecimenStatus @default(ORDERED)
  storageLocation  String?
  @@unique([tenantId, accessionNumber])
  @@index([tenantId, status, receivedAt])
}

enum SpecimenStatus {
  ORDERED COLLECTED RECEIVED PROCESSING COMPLETED REJECTED CANCELLED REFERRED
}

model SpecimenRejection {
  id          String @id @default(cuid())
  tenantId    String
  specimenId  String
  reason      RejectionReason
  remarks     String?
  rejectedById String
  rejectedAt  DateTime @default(now())
  notifiedAt  DateTime?
  recollectionSpecimenId String?     // links the replacement
  @@index([tenantId, specimenId])
}

enum RejectionReason {
  HEMOLYZED INSUFFICIENT_QUANTITY WRONG_CONTAINER WRONG_SPECIMEN
  LEAKING CLOTTED IMPROPER_TRANSPORT UNLABELED MISLABELED DELAYED OTHER
}
```

The accession number is the specimen's identity for the rest of its life; it must be generated in a transaction with a per-tenant, per-day sequence, and it must appear on the label, the worklist and the report.

## 6.7 Result model — 🟠 NEEDS REDESIGN

Current: `LabOrderItem.resultValue String?` + `resultUnit` + `abnormalFlag` + `comment` + `reportedAt`. No component, no method, no analyzer, no performer, no verifier, no validator, no release timestamp, no version.

```prisma
model LabResult {                   // one per (specimen, test)
  id            String @id @default(cuid())
  tenantId      String
  specimenId    String
  orderItemId   String
  testId        String
  status        ResultStatus @default(DRAFT)
  performedById String?
  performedAt   DateTime?
  verifiedById  String?             // RMT technical verification
  verifiedAt    DateTime?
  validatedById String?             // pathologist
  validatedAt   DateTime?
  releasedAt    DateTime?
  version       Int @default(1)
  supersedesId  String?             // corrected report chain
  correctionReason String?
  equipmentId   String?
  @@index([tenantId, status, performedAt])
}

model LabResultComponent {
  id               String @id @default(cuid())
  tenantId         String
  resultId         String
  componentId      String
  valueNumeric     Float?
  valueText        String?
  unit             String?
  referenceRangeId String?          // the range actually applied, pinned
  referenceText    String?          // rendered "3.5 – 5.1 mmol/L" snapshot
  flag             ResultFlag?
  comment          String?
  @@index([tenantId, resultId])
}

enum ResultStatus { DRAFT ENTERED VERIFIED VALIDATED RELEASED CORRECTED CANCELLED }
enum ResultFlag   { LOW NORMAL HIGH CRITICAL_LOW CRITICAL_HIGH ABNORMAL }
```

Two things matter here beyond the field list. **Pin the reference range id and render text onto the result row** — ranges change, and a report reprinted in 2029 must show the range that was in force in 2026. And **never update a released result**: write a new `LabResult` with `version + 1` and `supersedesId` pointing at the old one, status `CORRECTED`. The old row stays.

## 6.8 Verification / validation workflow — ✅ BUILT (was 🔴)

> **Status: built** in `20260924220000_lis_result_verification` — `PENDING → PRELIMINARY → FINAL` with `CORRECTED` (HL7's P/F/C), an append-only `lab_result_versions` table, `enteredById`/`verifiedById` on every result, and the `MEDICAL_TECHNOLOGIST` / `PATHOLOGIST` roles with `LAB_RESULT_ENTER` / `LAB_RESULT_VERIFY`.
>
> **It deliberately does not implement the four-stage `ENTERED → VERIFIED → VALIDATED → RELEASED` chain sketched below**, and a reader comparing the two should know that is a decision rather than an omission. Technical verification and pathologist validation collapse into one release step, and whether that step requires a second person is a per-tenant setting defaulting off — because a single-technologist clinic that cannot release any result is a worse patient-safety outcome than one that self-verifies with both identities on the record. Both identities are stored regardless; the settings only decide what is enforced. Full reasoning in §4 P0-2.
>
> Still open: `LAB_RECEPTION` and `CASHIER` roles, and the specimen routes from §6.6 still gate on `CONSULT_WRITE` rather than dedicated `LAB_SPECIMEN_*` actions.

Required transitions, each with its own action in the RBAC matrix:

```
DRAFT ──enter──► ENTERED ──verify──► VERIFIED ──validate──► VALIDATED ──release──► RELEASED
                     │                   │                                             │
                     └───────────── reject/redo ─────────────┘              correct ──► CORRECTED (v+1)
```

- `lab:result:enter` — MEDTECH
- `lab:result:verify` — MEDTECH (must be a **different user** than the performer for tests the tenant configures as double-verified)
- `lab:result:validate` — PATHOLOGIST
- `lab:result:release` — PATHOLOGIST or MEDTECH per tenant policy
- `lab:result:correct` — PATHOLOGIST, `reason` required

Today none of this exists and a `DOCTOR` token can do all of it via `CONSULT_WRITE`. The e2e suite must assert "doctor cannot validate as pathologist" and "performer cannot self-verify where double verification is configured".

## 6.9 Digital signatures — ✅ BUILT (was 🔴)

> **Status: built** in `20260924240000_lis_lab_reports`. `LabReport` + `LabReportSignature`, numbered `LR-202609-0001` through the same atomic `DocumentSequence` as accessions and order slips, with the signer's name and PRC licence snapshotted at signing exactly as `Prescription.providerLicense` does it.
>
> Three departures from the sketch below, each deliberate:
>
> 1. **The report hangs off the ORDER, not the specimen.** An order split across two tubes still produces one report for the patient; keying it to the specimen would produce two documents for one draw.
> 2. **No `renderedFileId`.** The PDF is rendered on demand rather than stored. A stored PDF is a second copy of the truth that can drift from the results, and the whole point of `contentHash` is that there is one answer to "is this still what was signed?". The cost is re-rendering; the benefit is that a stale PDF cannot be served from storage.
> 3. **`isCurrent` is computed on read, never stored.** Stored staleness would have to be updated from every path that can change a result, and the failure mode of missing one is a report that silently looks valid.
>
> What follows, all tested: a stale report cannot be countersigned, re-issuing supersedes rather than edits, a superseded report cannot be signed, and `resultStatus` is inside the hash so FINAL → CORRECTED with the same number still invalidates the signature. The PDF carries a red banner naming its replacement, because once a document is on paper no status column can reach it.
>
> Still open: a rendered-report archive for long-term retention, if retention rules ever require the exact bytes that were issued rather than the ability to reproduce them.

`User.prcLicenseNumber` / `prcLicenseExpiry` / `prcSpecialty` / `signatureFileId` already exist and are snapshotted onto `Prescription` — the pattern is proven in this codebase. It needs to be applied to lab reports:

```prisma
model LabReport {
  id            String @id @default(cuid())
  tenantId      String
  specimenId    String
  version       Int    @default(1)
  renderedFileId String?          // → FileObject (the PDF)
  contentHash   String            // sha256 of the rendered content
  releasedAt    DateTime
  @@unique([tenantId, specimenId, version])
}

model LabReportSignature {
  id            String @id @default(cuid())
  tenantId      String
  reportId      String
  signerId      String
  signerRole    SignerRole        // MEDICAL_TECHNOLOGIST | PATHOLOGIST | LAB_HEAD
  signerName    String            // snapshot
  prcLicense    String            // snapshot
  prcExpiry     DateTime?         // snapshot — proves validity at signing time
  signatureFileId String?
  signedAt      DateTime
  contentHash   String            // must equal LabReport.contentHash
  @@index([tenantId, reportId])
}
```

`contentHash` on both sides is what makes the signature mean something: if the rendered report ever differs from what was signed, verification fails. A boolean `signed = true` would not survive a dispute.

## 6.10 Laboratory sections & service capability — ✅ BUILT (was 🔴)

> **Status: built and enforceable.** `20260924300000_lis_laboratory_licence` models the licensed facility — LTO number, category, classification, validity window, head of laboratory and pathologist of record with PRC numbers — and the report PDF carries the LTO and head, which is the actual AO 2021-0037 requirement and was missing from every report issued before it.
>
> `20260924320000_lis_referral_labs` (§6.11) supplies the referral path, which is what makes the refusal below real. Order placement routes each out-of-scope test three ways: **referred** when a destination is on file, **flagged** when there is none, **refused** when there is none and the clinic has turned enforcement on.
>
> Three properties worth knowing:
>
> - **Undeclared is not prohibited.** A clinic that never opens this screen sees no change; an empty declaration reports NOT_DECLARED. Treating silence as prohibition would flag every test in every clinic.
> - **A per-test row overrides its section**, so "we do chemistry but HbA1c goes out" and "no microbiology except gram stain" are both expressible.
> - **An expired licence is stated, not hidden** — on the profile and in red on the report. A report issued during a lapse is a fact, and a document that quietly omits it is worse than one that says so.
>
> The category→section table in `capability.ts` is guidance for whoever fills the form in, and a test asserts the checker never consults it: the authoritative list is what is printed on the laboratory's own Licence to Operate, which can carry conditions no table here knows about.

Nothing models what a given laboratory is licensed to perform. This is not a nice-to-have in the Philippines — a clinical laboratory **may not perform examinations beyond its authorized service capability** (§21).

```prisma
model Laboratory {                    // the licensed facility, not the tenant
  id              String @id @default(cuid())
  tenantId        String
  locationId      String?
  name            String
  dohLtoNumber    String?
  ltoCategory     LtoCategory         // PRIMARY | SECONDARY | TERTIARY
  ltoClassification String?           // GENERAL | SPECIAL; INSTITUTION_BASED | FREESTANDING
  validFrom       DateTime?
  validUntil      DateTime?
  labHeadUserId   String?
  pathologistUserId String?
  @@index([tenantId])
}

model LabServiceCapability {
  id           String  @id @default(cuid())
  tenantId     String
  laboratoryId String
  sectionId    String
  testId       String?              // null = whole section
  isEnabled    Boolean @default(true)
  referralLaboratoryId String?      // where it goes when not enabled
  @@index([tenantId, laboratoryId, sectionId])
}
```

Order placement then becomes: _can this laboratory perform this test?_ → yes, accession locally; no, create a `ReferralOrder`. That decision must be enforced server-side at order time, not left to the receptionist.

## 6.11 Referral laboratory — 🟡 PARTIAL (was 🔴)

> **Status: built** (`20260924320000_lis_referral_labs`), and it is what turns §6.10 from advice into enforcement.
>
> `ReferralLaboratory` (destinations, with their own LTO number), `LabReferral` (one test sent out), and a standing `referralLaboratoryId` on the capability row that excluded the test — recorded once rather than chosen at every order, because "HbA1c goes to Hi-Precision" is an arrangement, not a decision.
>
> Two safety properties:
>
> - **Referral only to a licensed laboratory.** A destination with no LTO on file is refused at referral time, per AO 2021-0037. Referring to one we cannot evidence is licensed is indefensible if anyone asks.
> - **A misconfigured destination does not break ordering.** If the standing arrangement points at an inactive or unlicensed laboratory, the order still succeeds and the item falls back to being flagged. An order failing because someone mis-set a send-out arrangement months ago would be the wrong failure.
>
> `lab_referrals` has no DELETE and the foreign key to the destination is RESTRICT: a referral records a specimen leaving the building, and can be cancelled but not erased.
>
> **Smaller than the sketch below, deliberately.** Chain of custody lives in fields on `LabReferral` — released by, when, courier, condition on arrival — rather than a separate `ReferralSpecimen`, and a referral is keyed to the order ITEM rather than a specimen, so a referred-in report arriving with no specimen of ours is still representable. `ReferralResult` is not built: a referred result is recorded through the ordinary result path. Referred tests are now stated on the report face: each carries a dagger in the results table, with a block naming the destination and its DOH LTO number, and the destination is inside the content hash — a value produced by another laboratory is a different assertion about who is answerable for it, so a report signed before a referral changed must not still validate. **Still open: the MOA file.**

Nothing exists. Needed: `ReferralLaboratory` (name, DOH LTO, MOA file, contact, courier), `ReferralOrder`, `ReferralSpecimen` (chain of custody: released-by, courier, released-at, received-at, condition on arrival), `ReferralResult` (external result file + transcribed components + who reviewed it before it entered the patient's chart). The report must state which tests were referred and to which licensed laboratory.

## 6.12 QC / QA — 🟡 PARTIAL (was 🔴)

> **Status: the EQAP half is built; internal QC is not.**
>
> `20260925140000_lis_eqap` models participation in an External Quality Assessment Program, which AO 2021-0037 makes a condition of licensure: `eqap_providers` (the scheme operator — NRL, RIQAS, CAP), `eqap_enrolments` (one programme, carrying the participant number an inspector matches against the certificate on the wall) and `eqap_submissions` (one row per round per analyte — what we reported, what came back, and what we did about it). The evaluation rules are a pure module in `apps/api/src/labs/eqap.ts` with 24 unit tests, for the same reason the Westgard rules below should be.
>
> **Why this is not a subset of internal QC.** Internal QC shows an analytical process is stable against its own established mean. It cannot show the mean is right: a laboratory can be beautifully in control around a value that is systematically wrong, and every run will agree with every other run. EQAP is the only routine check that catches a whole-laboratory bias, because the comparison is against other laboratories rather than against ourselves.
>
> Four things worth knowing:
>
> - **The finding is the unexamined failure, not the failure.** Laboratories fail surveys — that is what a survey is for. The participation summary therefore reports `unacceptable` and `unresolved` separately, where unresolved means an unacceptable result with no corrective action recorded against it. One is a result; the other is evidence that nobody looked.
> - **The verdict is computed on read, not stored** — the opposite of the decision the QC sketch below calls for. A QC run is judged against a target that moves, so its verdict has to be frozen alongside it; an EQAP result is judged against an SDI the provider supplies and never revises, so nothing can drift underneath it.
> - **The SDI can be given or derived.** Providers report differently: either the index directly, or the peer mean and SD, from which it is computed against the value we reported. Deriving one from the other when only one is available would invent precision that is not there, so it is not attempted.
> - **A submission cannot be deleted.** It is the evidence of participation an inspection asks for. UPDATE stays, because the score and the corrective action arrive weeks after the specimen went out; DELETE is revoked. The foreign key to the provider is RESTRICT — retiring a scheme operator must not erase the record of having participated in it.
>
> Constraints carry the rest. A peer SD of zero is refused, because it makes every SDI infinite and fails every laboratory in the survey with a number nobody can explain. A score without a submission is refused at the service and again at a CHECK constraint — a provider scores what was sent to it. And the whole-panel case needs its own partial unique index, because Postgres compares NULLs as distinct and a round with no analyte set could otherwise be recorded twice.
>
> One bug is worth recording, because a test was written for it and caught it: this endpoint records both the provider's result and the corrective action, and the first version recomputed the SDI from the request alone. Documenting a failure therefore erased the score that made it a failure — the participation summary went from one unacceptable result to zero, and an inspection would have read a clean record manufactured by the act of investigating.
>
> **Still open: internal QC** — `QCMaterial`, `QCLot`, `QCRun`, Westgard evaluation, Levey-Jennings, corrective actions and calibration, as sketched below.

Nothing. No QC material, lot, level, run, target mean, SD, CV, Westgard evaluation, Levey-Jennings data, corrective action, calibration, or EQAP participation record. For a DOH-licensed laboratory this is the difference between passing and failing inspection.

Minimum viable set: `QCMaterial`, `QCLot` (level, target mean, target SD, expiry), `QCRun` (equipment, test, lot, value, z-score, evaluated rules, accepted/rejected, performedBy, performedAt), `QCViolation` + `CorrectiveAction`, `Calibration`, `EqapEnrollment` + `EqapSubmission` (with the result-report file attached as evidence for inspectors).

Levey-Jennings is a **chart over `QCRun` rows** — build the data model first, the chart is a UI concern. Westgard rules (1₃ₛ, 2₂ₛ, R₄ₛ, 4₁ₛ, 10ₓ) should be a pure evaluator function in `libs/` with unit tests, not scattered in a service.

## 6.13 Equipment & reagents — 🔴

Neither exists. `InventoryItem`/`StockBatch`/`StockMovement` are clinic supplies (FEFO consumption) and are **not** a fit for reagents: no storage temperature, no open-vial expiry, no QC status per lot, no applicable-tests link. Build `Equipment` + `EquipmentMaintenance` + `Calibration`, and `Reagent` + `ReagentLot` separately; link `LabResult.equipmentId` and `LabResult.reagentLotId` so a recalled lot can be traced to every result it produced. That traceability is the whole point.

## 6.14 Analyzer integration — 🔴 (P3, but design for it now)

Recommendation: a separate `apps/interface-engine` (or `libs/lis-interfaces`) with an adapter interface:

```
Analyzer ──ASTM E1381/E1394 or HL7 v2.5 ORU^R01──► Interface Engine
                                                        │
                                              adapter → canonical ResultMessage
                                                        │
                                              test/component code mapping
                                                        │
                                                   POST /lis/results/inbound
                                                        │
                                              status = ENTERED (never RELEASED)
```

Adapters: `ASTM`, `HL7v2`, `CSV`, `Manual`. **Do not** put serial/TCP framing inside a NestJS domain service. Results arriving from an analyzer enter at `ENTERED` and still go through verification — an instrument does not release a result.

---

# 7. Philippine Regulatory Gap Analysis

Statuses below distinguish **LEGAL REQUIREMENT** (statute or DOH/NPC issuance), **REGULATORY GUIDANCE**, **GOOD PRACTICE**, and **PRODUCT RECOMMENDATION**. Sources in §21.

## 7.1 Clinical laboratory licensing

**LEGAL REQUIREMENT.** RA 4688 requires clinical laboratories to be registered with and licensed by the DOH, and headed by a pathologist certified by the Philippine Board of Pathology (with a limited exception for a physician with three months' training in clinical laboratory medicine, QC and laboratory management managing a primary/secondary laboratory where no pathologist is available). DOH AO 2021-0037 replaced the 2007 rules; existing licensed laboratories were given until **1 October 2025** to comply fully. Under it, **a laboratory may not perform examinations beyond its authorized service capability**, and **every clinical laboratory must participate in an External Quality Assessment Program** administered by a designated National Reference Laboratory or a DOH-approved EQAP.

**CLINIQ status:** 🔴 nothing modelled. No LTO, no category, no laboratory head, no pathologist, no service capability gate, no EQAP record.

_Since then_ (§6.10, §6.12) the licence profile — LTO, category, validity window, head of laboratory and pathologist of record with PRC numbers — the service-capability gate, and EQAP enrolment and submissions have shipped. The `PATHOLOGIST` and `MEDICAL_TECHNOLOGIST` **roles** have not: the licence names those people, but nothing yet ties a released result to a supervising pathologist. See the two rows below.

**LEGAL REQUIREMENT.** RA 5527 (Philippine Medical Technology Act): a medical technologist practises **under the supervision of a pathologist** (or a DOH-authorized physician where none is available). Practising without that supervision is penalised.

**CLINIQ status:** 🔴 there is no `MEDICAL_TECHNOLOGIST` or `PATHOLOGIST` role, so the supervision relationship cannot be expressed, let alone enforced.

**REGULATORY GUIDANCE.** AO 2021-0037's QA provisions require documented internal quality control with QC reports per test on file, and retention of laboratory records per DOH standards (AO 2022-0007 addresses document retention for clinical laboratories).

**CLINIQ status:** 🔴 for QC; 🟡 for retention (`docs/regulatory/retention.md` is a good policy but `RetentionService` implements only audit + notification purges).

> I was unable to fetch the DOH HFSRB clinical-laboratory page directly (HTTP 403) or an official PDF of AO 2021-0037 during this audit. The statements above are drawn from DOH/HFSRB pages surfaced in search and from RA 4688 / RA 5527 on the Supreme Court E-Library and PRC. **Before implementing the service-capability matrix, obtain the current AO text and its Annexes A and C from HFSRB directly** — the category test lists are the normative source and an amendment was under public consultation.

## 7.2 Data privacy

**LEGAL REQUIREMENT.** RA 10173 (Data Privacy Act) classifies health information as _sensitive personal information_. NPC Circular 16-03 requires notification to the Commission and to affected data subjects **within 72 hours** of knowledge or reasonable belief of a breach involving sensitive personal information where there is a real risk of serious harm, with a full report within five days. There is to be **no delay** where at least 100 data subjects are involved.

**CLINIQ status:** 🟡. `docs/runbooks/breach-response.md` exists — a genuine strength, most codebases have nothing. But there is no in-product breach register, no `PrivacyIncident` entity, and no automated detection that would start the 72-hour clock. The DSR module (`DataSubjectRequest`, access/erase/portability) is ✅ and directly serves DPA §16 rights.

## 7.3 Senior citizen and PWD

**LEGAL REQUIREMENT.** RA 9994 (Expanded Senior Citizens Act) grants senior citizens a 20% discount and VAT exemption on, among other things, medical and dental services and diagnostic and laboratory fees in all private facilities. RA 10754 grants PWDs the equivalent 20% discount and VAT exemption on presentation of a valid PWD ID issued by the C/MSWDO or NCDA. The arithmetic is statutory: **strip the 12% VAT from the base first, then apply 20% to the VAT-exclusive amount.** (DOH AO 2024-0017 / FDA Circular 2025-005 removed the _purchase booklet_ from the requirements for the medicines discount; the ID itself is still required.)

**CLINIQ status:** 🔴. `Invoice` carries `subtotalCentavos`, `discountCentavos`, `taxCentavos`, `totalCentavos` — four integers that cannot express "this line was VAT-exempt because the patient is a senior, under OSCA ID 12-3456, and therefore the 20% was computed on ₱892.86 not ₱1,000". The discount basis, the entitlement id, and the per-line VAT treatment all need to be recorded, because they are what a BIR or DOH examiner asks for.

## 7.4 PhilHealth

**REGULATORY GUIDANCE / CONTRACTUAL.** PhilHealth requires electronic filing of claims through eClaims within 60 calendar days of the date of service. The Konsulta primary-care package covers consultation plus a defined diagnostic panel, paid by capitation; freestanding laboratories may file directly only for Konsulta, newborn screening and certain outpatient packages.

**CLINIQ status:** 🔴. No `PhilHealthMembership`, no eligibility check, no `PhilHealthClaim`, no benefit package catalog, no claim documents, no submission status. The only trace is a comment on `HmoClaim.payerCode`.

**PRODUCT RECOMMENDATION (not a legal requirement):** model benefit packages as **configurable data**, not code. Konsulta's panel composition and capitation rate change by circular; a `BenefitPackage` + `BenefitPackageItem` table with effective dates means a circular is a data update, not a deploy.

## 7.5 Professional identification

**LEGAL REQUIREMENT.** PRC registration is required to practise medicine and medical technology; the licence number belongs on professional documents.

**CLINIQ status:** ✅ for prescriptions (`User.prcLicenseNumber` + `Prescription.providerLicense` snapshot + validation that a doctor cannot prescribe without one — `apps/api-e2e/src/modules/me.spec.ts:133`). 🔴 for laboratory reports, because lab reports do not exist.

## 7.6 Financial records

**LEGAL REQUIREMENT.** NIRC §235 requires books of account and invoices/receipts to be preserved for ten years.

**CLINIQ status:** 🟡. `docs/regulatory/retention.md` states the 10-year window with mechanism "Manual archive". There is no BIR-compliant official receipt series, no `OfficialReceipt` entity, no ATP/CAS reference, and no `Refund` entity (only a `PaymentStatus.REFUNDED` value).

---

# 8. Privacy & Security Gap Analysis

## 8.1 What is genuinely strong

| Control                                                                            | Evidence                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS forced on 76/80 tables                                                         | 44 migrations, `FORCE ROW LEVEL SECURITY`                                                                                                                      |
| App refuses to start as superuser / `BYPASSRLS`                                    | `prisma.service.ts:78-118`                                                                                                                                     |
| Tenant GUC set inside the transaction via parameterised `set_config`               | `prisma.service.ts` `withTenant`                                                                                                                               |
| Platform admin as a separate identity table, not a `User` row                      | `PlatformAdmin`, `PlatformRefreshSession`                                                                                                                      |
| Platform RLS bypass is an explicit, `SET LOCAL`-scoped GUC                         | `withPlatformContext`, migration `20260506110000`                                                                                                              |
| Audit log append-only at the grant level, asserted in CI                           | `REVOKE UPDATE, DELETE` in `20260924090100_append_only_grants` — the earlier `GRANT SELECT, INSERT` was silently overridden by the schema's default privileges |
| Tokens in httpOnly cookies (web) with Bearer fallback (mobile)                     | `jwt-auth.guard.ts:20-35`                                                                                                                                      |
| MFA/TOTP + hashed backup codes + brute-force lockout                               | `User.mfaSecret`, `failedLoginCount`, `lockedUntil`                                                                                                            |
| Password reset tokens stored as sha256, never raw                                  | `PasswordResetToken`, `TenantInvite`                                                                                                                           |
| Rate limiting with a tighter bucket on credential endpoints                        | `common/throttle.config.ts` (default 300/min, auth 10/min)                                                                                                     |
| S3 PHI bucket: SSE-KMS, versioned, public access blocked, access-logged, lifecycle | `infra/terraform/modules/storage/main.tf`                                                                                                                      |
| AI receives minimised context, gated on explicit patient consent                   | `ai-client.service.ts:90-100`, `@RequiresConsent(AI_PROCESSING)`                                                                                               |

## 8.2 Gaps

| #   | Finding                                                                                                                                                                                                                        | Sev | Evidence                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------- |
| S1  | **PATIENT role reaches ~30 staff endpoints** (P0-1)                                                                                                                                                                            | P0  | `roles.ts:118` + controllers                            |
| S2  | `push_tokens` has no RLS and `PushService` bypasses `withTenant`                                                                                                                                                               | P0  | `push.service.ts:92,114`                                |
| S3  | `platform_admins` / `platform_refresh_sessions` outside RLS (defence-in-depth)                                                                                                                                                 | P1  | no policy in any migration                              |
| S4  | No file download endpoint and `FileObject` has no `patientId` — future downloads cannot be authorized                                                                                                                          | P0  | `files.service.ts`, `schema.prisma:1387`                |
| S5  | No malware scanning on upload; extension sanitised but `mimeType` is caller-asserted                                                                                                                                           | P1  | `files.service.ts:161-166`                              |
| S6  | Audit log records no before/after values and no reason                                                                                                                                                                         | P1  | `AuditLog` model                                        |
| S7  | `AuditLog` has no read on `patient.read` for portal routes, and no `lab.resultRelease`/`report.download` actions                                                                                                               | P1  | `audit.decorator.ts` usage                              |
| S8  | Dead RLS helper: `current_user_id()` reads `app.current_user`, but `withTenant` sets `app.current_user_id`. No policy uses it, so no live impact — but it is a loaded footgun for the next person who writes a per-user policy | P2  | migration `20260501000001:18-19` vs `prisma.service.ts` |
| S9  | Rate-limit storage is in-process; with >1 replica each enforces its own count                                                                                                                                                  | P2  | `throttle.config.ts` (documented)                       |
| S10 | `queue/page.tsx` still reads a token from localStorage for raw `fetch` (TODO in-file)                                                                                                                                          | P2  | `apps/web/app/(app)/queue/page.tsx:77`                  |
| S11 | Inventory SKU uniqueness check leaks nothing cross-tenant (RLS) — but `createItem` conflicts are computed pre-insert rather than on a DB constraint, a race                                                                    | P3  | `inventory.service.ts:69-74`                            |
| S12 | No `PrivacyIncident` / breach register to drive the NPC 72-hour clock                                                                                                                                                          | P1  | —                                                       |
| S13 | `patientLabel` is sent to the AI service in the dental-lab treatment-plan path                                                                                                                                                 | P2  | `ai-client.service.ts:73`                               |

---

# 9. Database Audit

`libs/db/prisma/schema.prisma` — 80 models/enums-backed tables, 44 migrations. Overall quality is above average: consistent `tenantId` on every tenant-scoped table, composite indexes that match real query shapes, `@@unique([tenantId, number])` on every document series, money as integer centavos (correct), and substantial explanatory comments.

Significant problems, each with the requested shape:

### D1 — Lab results are unstructured strings

```
Current:   LabOrderItem.resultValue String?  (+ referenceLow/High Float?)
Problem:   Cannot represent panels, components, methods, analyzers, verification,
           versioning, or age/sex-specific ranges. Flags derived from a
           hard-coded ±50% heuristic (labs.service.ts:278-292).
Recommend: LaboratoryTest / TestComponent / Specimen / LabResult /
           LabResultComponent / ReferenceRange / CriticalValueRule (§6)
Migration: Additive. Keep lab_orders/lab_order_items; backfill each existing
           item into a single-component LabResult under a synthetic Specimen.
           Risk: LOW (new tables) → MEDIUM at cutover.
```

### D2 — `Consultation.diagnosisCodes String[]`

```
Current:   String[] of ICD-10 codes on the encounter
Problem:   No rank (primary/secondary), no onset, no certainty, no resolution,
           no FK to icd_codes, unreportable, cannot attach to a claim.
Recommend: model Diagnosis { encounterId, icdCode, rank, certainty,
           onsetDate, resolvedAt } with FK to IcdCode
Migration: Additive + backfill (array → rows, rank by array position).
           Keep the column through one release for read compatibility.
           Risk: LOW.
```

### D3 — `FileObject` has no owner

```
Current:   FileObject { tenantId, s3Key, category, isPhi, uploadedBy }
Problem:   No patientId / encounterId. Download authorization is impossible;
           patient-scoped retention and DSR erasure cannot find a patient's files.
Recommend: add patientId String?, consultationId String?, plus
           @@index([tenantId, patientId]).
Migration: Additive nullable + backfill from the attaching domain rows.
           Risk: LOW.
```

### D4 — Discounts cannot express PH statutory rules

```
Current:   Invoice { subtotal, discount, tax, total } — four integers
Problem:   Cannot record the discount basis, the entitlement/ID presented,
           or per-line VAT exemption. RA 9994/10754 arithmetic is not
           representable, and the OR cannot show what an examiner needs.
Recommend: InvoiceItem gains isVatExempt, vatCentavos, discountCentavos,
           discountRuleId; new Discount / DiscountRule and
           InvoiceDiscountApplication { entitlementId, ruleId, basisCentavos }.
Migration: Additive. Existing invoices keep their flat discount as a
           MANUAL-rule application. Risk: LOW.
```

### D5 — `Patient` under-normalized

```
Current:   8 columns
Problem:   §5.1 — addresses, contacts, identifiers, entitlements all missing;
           adding them as columns would produce a 40-column table with
           multi-value fields crammed into strings.
Recommend: PatientAddress, PatientContact, PatientIdentifier,
           PatientEntitlement, PatientRelatedPerson + scalars
           (middleName, suffix, civilStatus, bloodType, nationality).
Migration: Additive; email/phone stay on Patient through a compatibility
           period, then become derived from the primary PatientContact.
           Risk: LOW → MEDIUM at the email/phone cutover.
```

### D6 — Soft-delete is inconsistent

`deletedAt` is present on ~35 of 80 tables. `Vital`, `Allergy`, `Medication`, `Condition`, `InvoiceItem`, `Payment`, `LabOrderItem`, `QueueTicket` are hard-delete-only. `ClinicalService.deleteAllergy` calls `tx.allergy.delete(...)` (`clinical.service.ts:50`) — a clinical fact vanishes with no trace beyond one audit row that does not record what was deleted. **Recommendation:** add `deletedAt` to every clinical and financial table; never hard-delete clinical data outside the DSR erase path.

### D7 — Missing FK constraints on `tenantId`

No table has a foreign key from `tenantId` to `tenants.id` except through the relations Prisma generates for models that declare one (`Patient`, `Location`, …). Most tenant-scoped models (e.g. `LabOrder`, `Invoice`, `Vital`) carry a bare `tenantId String` with no relation. RLS covers reads/writes, but an orphaned row is possible and `ON DELETE CASCADE` for tenant removal is inconsistent. **Recommendation:** add the relation (or at minimum a DB-level FK) uniformly.

### D8 — Order/accession numbering is race-prone

```ts
// apps/api/src/labs/labs.service.ts:258-266
const monthCount = await tx.labOrder.count({
  where: { tenantId, number: { startsWith: prefix } },
});
return `${prefix}-${String(monthCount + 1).padStart(4, '0')}`;
```

Count-then-format inside a transaction is not serialisable under concurrent inserts at READ COMMITTED; two orders can compute the same number and one insert fails on `@@unique([tenantId, number])` (better than a duplicate, but a user-visible 500). Accession numbers will be generated far more often than order slips and will hit this. **Recommendation:** a `DocumentSequence { tenantId, kind, period, nextValue }` row with `SELECT … FOR UPDATE`, or a Postgres sequence per tenant-kind.

### D9 — N+1 and transaction-scope risks

`PatientsService.moduleData` issues six `count` queries per patient (`patients.service.ts:44-54`) — fine for one patient, quadratic on a list view if ever reused there. More importantly, `withTenant` wraps **every** read in an interactive transaction (`TX_OPTIONS` maxWait 15s / timeout 30s). That is correct for RLS but means a slow AI or S3 call inside a `withTenant` block holds a pool connection. `LabsService.recordResult` calls `this.notif.notify` inside the transaction (fire-and-forget, so it does not block — but the notification writes its own rows outside the tenant context). **Recommendation:** an explicit rule — no network I/O inside `withTenant`.

### D10 — Enum naming collision risk

`LabOrderStatus`, `LabAbnormalFlag` (clinical) sit beside `LabCaseStatus`, `LabInvoiceStatus`, `LabMaterialLotStatus` (dental). See §6.1.

---

# 10. API Audit

**Conventions in use (follow these, do not impose new ones):** NestJS controllers with `class-validator` DTOs under `<module>/dto/`, global `ValidationPipe`, `@Requires(Actions.X)` for RBAC, `@RequiresFeature(Features.X)` for plan gating, `@Audit({ action, entity, entityIdFrom })` for the audit trail, `@RequiresConsent(type, source)` for DPA consent, `@Public()` to opt out of JWT. Services always wrap data access in `prisma.withTenant`. Errors via a global `AllExceptionsFilter`. OpenAPI is emitted and `libs/api-client` is generated from it.

| Area                   | Status | Notes                                                                                                                                                                                                   |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication         | ✅     | JWT via cookie or Bearer; `@Public` opt-out; delegation via `X-Acting-For` with active-delegation + active-membership checks                                                                            |
| Authorization          | 🟡     | Action-based and consistently applied — but the action vocabulary is too coarse (P0-1) and has no lab actions                                                                                           |
| Validation             | ✅     | DTOs throughout; ICD codes validated against the catalog                                                                                                                                                |
| Mass assignment        | 🟡     | `consultations.service.ts:183` spreads `...dto` into `update`; safe because the DTO is whitelisted, but `labs.service.ts:127` does `const data: Record<string, unknown> = { ...dto }` — audit these two |
| IDOR / BOLA            | ⚠️     | Cross-tenant: covered by RLS. Intra-tenant patient→patient: **not covered** (P0-1)                                                                                                                      |
| Rate limiting          | ✅     | Global + tighter credential bucket; in-process store (S9)                                                                                                                                               |
| Error handling         | ✅     | `AllExceptionsFilter`                                                                                                                                                                                   |
| Logging                | ✅     | `RequestLoggingInterceptor`                                                                                                                                                                             |
| Pagination / filtering | 🟡     | Present on patients/appointments; several list endpoints use a bare `take: 100` (`labs.service.ts:38`)                                                                                                  |
| File upload            | 🟡     | Presigned PUT, extension sanitised, KMS forced for PHI — no AV scan, no server-side content-type verification                                                                                           |
| File download          | 🔴     | Does not exist (S4)                                                                                                                                                                                     |

**Specific issues**

- `GET /api/lab-orders/:id` requires `PATIENT_READ` — should require `CONSULT_READ` at minimum, and portal access should go through `/me/lab-orders`.
- `PATCH /api/lab-orders/:id/items/:itemId` (result entry) requires `CONSULT_WRITE`. A receptionist is correctly refused; a doctor is incorrectly permitted to act as the laboratory.
- `labs.service.recordResult` looks up the item by `{ id: itemId, orderId }` — good, it scopes to the parent. But the subsequent `tx.labOrderItem.update({ where: { id: itemId } })` and `tx.labOrder.update({ where: { id: orderId } })` rely on RLS alone; correct here, worth knowing.
- Reports endpoints all require `AUDIT_READ`, which `DOCTOR` lacks — so a doctor cannot see their own productivity. Probably unintended.

---

# 11. Frontend / Mobile Audit

## Web (`apps/web`, Next.js 15 / React 19)

47 routes across four portals. Route groups: `(app)` clinic, `lab/(authed)` dental-lab, `platform/(authed)`, `portal` patient. Feature-folder architecture (`apps/web/features/*`) with colocated components/hooks/schemas — clean and consistent.

| Aspect                        | Status | Notes                                                                                                                                                                                                                                                                 |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role-based UI                 | 🟡     | Menus and buttons gate on role — but see the rule below                                                                                                                                                                                                               |
| **Server-side authorization** | ⚠️     | `apps/web/proxy.ts` resolves the tenant subdomain and does **not** enforce auth. Every authed group relies on the client-side `useRequiredSession` hook. Hiding the button is not authorization — the API is the boundary, and P0-1 shows the API boundary has a hole |
| Token storage                 | ✅     | Tokens are httpOnly cookies; localStorage holds only UI-shell session metadata (`features/auth/session.ts:1`) — with one leftover (S10)                                                                                                                               |
| Form validation               | ✅     | react-hook-form + zod, schemas under `features/*/schemas`                                                                                                                                                                                                             |
| Loading / error states        | 🟡     | TanStack Query throughout; states present but inconsistent                                                                                                                                                                                                            |
| Accessibility                 | 🟡     | A dedicated `apps/web-e2e/src/a11y/a11y.spec.ts` with `@axe-core/playwright` — better than most. Coverage is partial                                                                                                                                                  |
| Responsive                    | ✅     | `apps/web-e2e/src/responsive/viewports.spec.ts`                                                                                                                                                                                                                       |
| i18n                          | 🟡     | Hand-rolled `en`/`ph` dictionary; few pages consume it                                                                                                                                                                                                                |
| Lab UI                        | 🟠     | `features/labs` is 4 components (orders card, new-order dialog, record-results dialog) embedded in patient/consult pages. There is **no lab worklist, no accessioning screen, no verification queue, no QC screen** — because there is no backend for them            |

## Mobile (`apps/mobile`, Expo 54)

8 feature areas: auth, appointments, consultations, patients, prescriptions, billing, notifications, portal, dental-lab. No lab result entry, no specimen collection. For a PH clinic, **specimen collection on a phone at the patient's side is the single highest-value mobile feature** and it does not exist.

---

# 12. Infrastructure Audit

| Area                    | Status | Evidence                                                                                                                                                                                           |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VPC                     | ✅     | `infra/terraform/modules/network`                                                                                                                                                                  |
| RDS                     | ✅     | `infra/terraform/modules/database`                                                                                                                                                                 |
| ECS/Fargate             | ✅     | `infra/terraform/modules/compute` + `infra/ecs/*.task-def.json`                                                                                                                                    |
| S3                      | ✅     | PHI bucket: KMS CMK, versioning, full public-access block, server access logging to a separate blocked bucket, lifecycle                                                                           |
| KMS                     | ✅     | Dedicated CMK for PHI with rotation                                                                                                                                                                |
| IAM                     | 🟡     | GitHub OIDC role for deploys (good); least-privilege of task roles not verified in this pass                                                                                                       |
| Secrets                 | 🟡     | `JWT_SECRET` etc. via env/ECS secrets; no rotation policy documented                                                                                                                               |
| CI/CD                   | ✅     | `ci.yml` runs lint/typecheck/test/build (affected), api e2e against real Postgres with the `cliniq_app` role provisioned, Playwright web e2e, and a Docker image build                             |
| Backups                 | 🟡     | RDS automated 35d + cross-region 90d per `docs/regulatory/retention.md`; **no evidence of a restore test**                                                                                         |
| DR                      | 🟡     | `docs/runbooks/backup-restore.md` exists; no RTO/RPO stated                                                                                                                                        |
| Monitoring / alerting   | 🔴     | No CloudWatch alarms, no APM, no error tracking in the tree                                                                                                                                        |
| Dual deployment targets | ⚠️     | Both AWS Terraform and Railway IaC exist. Railway is the live one. The AWS path builds in CI but skips deploy when `AWS_DEPLOY_ROLE_ARN` is unset. Pick one as canonical or the Terraform will rot |

**Recommendations:** CloudWatch alarms on API 5xx rate, DB connection saturation and RDS free storage; a quarterly scripted restore test with the result recorded; an explicit RTO/RPO in the runbook; and a decision on AWS vs Railway.

---

# 13. Target Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                           │
│  Next.js clinic │ Next.js portal │ Next.js lab │ Expo mobile       │
└────────────────────────────┬───────────────────────────────────────┘
                             │ httpOnly cookie / Bearer
┌────────────────────────────▼───────────────────────────────────────┐
│  API (NestJS modular monolith — KEEP IT A MONOLITH)                │
│  Throttle → Jwt → Rbac → Feature → Consent → Audit                 │
│                                                                    │
│  ┌── clinical ──┐ ┌──── lis ────┐ ┌─ revenue ─┐ ┌── platform ──┐   │
│  │ patients     │ │ catalog     │ │ billing   │ │ tenants      │   │
│  │ encounters   │ │ orders      │ │ discounts │ │ members      │   │
│  │ prescriptions│ │ specimens   │ │ philhealth│ │ audit        │   │
│  │ dental / ob  │ │ results     │ │ hmo       │ │ dsr / privacy│   │
│  │ queue/visit  │ │ verify/rel. │ │ receipts  │ │ retention    │   │
│  │              │ │ qc / equip  │ │           │ │              │   │
│  │              │ │ referral    │ │           │ │              │   │
│  └──────────────┘ └─────────────┘ └───────────┘ └──────────────┘   │
│  ┌── dental-lab (renamed from `lab`) ──┐                           │
│  └─────────────────────────────────────┘                           │
└──────┬──────────────────┬───────────────────┬──────────────────────┘
       │                  │                   │
┌──────▼──────┐  ┌────────▼────────┐  ┌───────▼────────────────────┐
│ PostgreSQL  │  │ interface-engine│  │ ai-service (Bedrock)       │
│ RLS on ALL  │  │ ASTM│HL7│CSV    │  │ de-identified input only   │
│ tenant rows │  │ → canonical msg │  │ human review mandatory     │
└──────┬──────┘  └────────┬────────┘  └────────────────────────────┘
       │                  │
┌──────▼──────┐  ┌────────▼────────┐  ┌────────────────────────────┐
│ S3 + KMS    │  │ Analyzers       │  │ integration layer          │
│ PHI docs    │  │ (hospital LAN)  │  │ FHIR R4 façade │ eClaims   │
└─────────────┘  └─────────────────┘  └────────────────────────────┘
```

Two architectural commitments:

1. **Stay a modular monolith.** The current NestJS module boundaries are clean and the RLS model depends on one connection pool with a per-request GUC. Microservices would buy nothing and would break tenant isolation's simplest guarantee. The only justified separate process is the **interface engine**, because analyzer protocols are long-lived socket connections with entirely different operational characteristics.
2. **FHIR is a façade, never the storage model.** Map outward at the edge; do not contort the Prisma schema toward resources.

---

# 14. Target Domain Model

Comparison against the model proposed in the brief. **Bold = new. `~` = exists, needs change. Struck concepts are ones I recommend against.**

```
Organization ────► Tenant                    ~ exists (rename `kind` values, §6.1)
Facility     ────► Location                  ~ exists; add DOH facility fields
Department   ────► **LabSection** only       — do not add a generic Department yet
User / Role / Permission                     ~ exists; extend the Action vocabulary (§32)

Patient                                      ~ exists, thin
**PatientIdentifier**  **PatientEntitlement**
**PatientContact**     **PatientAddress**    **PatientRelatedPerson**
PatientConsent                               ✅ exists

Practitioner ────► User                      — do NOT add a Practitioner table;
PractitionerLicense ─► User.prc* fields        the snapshot pattern already works

Appointment  ✅   QueueTicket ✅   **VisitJourney/VisitStage**
Encounter    ────► Consultation ✅  + **ConsultationAmendment**

Vital ✅   ClinicalNote ─► Consultation JSON ✅   **Diagnosis**
Condition ✅   Allergy ✅   Medication ✅   Prescription ✅
**Procedure**   **Referral**   **MedicalCertificate**
**Immunization**  **FamilyHistory**  **SurgicalHistory**  (P2)

── LIS (all new) ────────────────────────────────────────────
**Laboratory**  **LabSection**  **LabServiceCapability**
**SpecimenType** **Container**
**LaboratoryTest**  **TestComponent**  **TestPanelMember**
LabOrder ~   LabOrderItem ~  (repoint to testId)
**Specimen**  **SpecimenRejection**
**LabResult**  **LabResultComponent**
**ReferenceRange**  **CriticalValueRule**  **CriticalResultNotification**
**LabReport**  **LabReportSignature**
**Equipment**  **EquipmentMaintenance**  **Calibration**
**Reagent**  **ReagentLot**
**QCMaterial**  **QCLot**  **QCRun**  **QCViolation**  **CorrectiveAction**
**EqapEnrollment**  **EqapSubmission**
**ReferralLaboratory**  **ReferralOrder**  **ReferralSpecimen**  **ReferralResult**

── Revenue ──────────────────────────────────────────────────
Service ✅   **PriceList**  **PriceListItem**
Invoice ~    InvoiceItem ~   Payment ✅   **Refund**   **OfficialReceipt**
**DiscountRule**  **InvoiceDiscountApplication**
HmoProvider ✅  HmoMembership ✅  **HmoAuthorization (LOA)**  HmoClaim ✅
**PhilHealthMembership**  **BenefitPackage**  **BenefitPackageItem**  **PhilHealthClaim**

── Cross-cutting ────────────────────────────────────────────
Notification ✅  Document ─► FileObject ~ (add patientId)
AuditLog ✅  Consent ✅  DataSubjectRequest ✅  **PrivacyIncident**
```

**What I recommend against building:** a separate `Practitioner` table (the `User` + PRC-snapshot pattern is already correct and duplicating it invites drift); a generic `Department` (premature — `LabSection` is the only real need); and a `Permission` table (the static `Action` matrix in `libs/shared-types` is simpler, typed, shared with the frontend, and testable; make it finer-grained, not dynamic).

---

# 15. Recommended Prisma Schema Changes

All in `libs/db/prisma/schema.prisma`, with matching migrations under `libs/db/prisma/migrations/`. **Every new tenant-scoped table must get an RLS policy in the same migration** — follow the `FOREACH t IN ARRAY ARRAY[...]` pattern from `20260502220000_clinical_billing_dsr/migration.sql:215-225`, and add the table to a regression test that asserts every `@@map`ped table with a `tenantId` column has `relrowsecurity = true`.

Ordered by phase:

| #   | Migration                     | Tables                                                                                                                                                                             | Risk                                                |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| M1  | `..._rls_push_tokens`         | policy on `push_tokens`; `PushService` → `withTenant`                                                                                                                              | LOW                                                 |
| M2  | `..._rls_platform_tables`     | policies denying `cliniq_app` on `platform_admins`, `platform_refresh_sessions`                                                                                                    | LOW                                                 |
| M3  | `..._patient_demographics`    | `Patient` scalars + `PatientAddress`, `PatientContact`, `PatientIdentifier`, `PatientEntitlement`, `PatientRelatedPerson`                                                          | LOW                                                 |
| M4  | `..._consultation_amendments` | `ConsultationAmendment`                                                                                                                                                            | LOW                                                 |
| M5  | `..._diagnosis_entity`        | `Diagnosis` + backfill from `diagnosisCodes`                                                                                                                                       | LOW                                                 |
| M6  | `..._file_patient_link`       | `FileObject.patientId`, `.consultationId` + backfill                                                                                                                               | LOW                                                 |
| M7  | `..._lis_catalog`             | `LabSection`, `SpecimenType`, `Container`, `LaboratoryTest`, `TestComponent`, `TestPanelMember`                                                                                    | LOW                                                 |
| M8  | `..._lis_specimen`            | `Specimen`, `SpecimenRejection`, `DocumentSequence`                                                                                                                                | LOW                                                 |
| M9  | `..._lis_results`             | `LabResult`, `LabResultComponent`, `ReferenceRange`, `CriticalValueRule`, `CriticalResultNotification`                                                                             | LOW                                                 |
| M10 | `..._lis_reports`             | `LabReport`, `LabReportSignature`                                                                                                                                                  | LOW                                                 |
| M11 | `..._lab_order_backfill`      | repoint `LabOrderItem` → `testId`; backfill legacy rows into single-component results                                                                                              | **MEDIUM**                                          |
| M12 | `..._laboratory_licence`      | `Laboratory`, `LabServiceCapability`, `ReferralLaboratory` + referral chain                                                                                                        | LOW                                                 |
| M13 | `..._billing_ph_rules`        | `DiscountRule`, `InvoiceDiscountApplication`, `PriceList`, `Refund`, `OfficialReceipt`, `InvoiceItem.isVatExempt/vatCentavos/discountCentavos`                                     | LOW                                                 |
| M14 | `..._philhealth`              | `PhilHealthMembership`, `BenefitPackage`, `BenefitPackageItem`, `PhilHealthClaim`                                                                                                  | LOW                                                 |
| M15 | `..._hmo_authorization`       | `HmoAuthorization` (LOA)                                                                                                                                                           | LOW                                                 |
| M16 | `..._lab_qa`                  | `Equipment`, `EquipmentMaintenance`, `Calibration`, `Reagent`, `ReagentLot`, `QCMaterial`, `QCLot`, `QCRun`, `QCViolation`, `CorrectiveAction`, `EqapEnrollment`, `EqapSubmission` | LOW                                                 |
| M17 | `..._soft_delete_clinical`    | `deletedAt` on `Vital`, `Allergy`, `Medication`, `Condition`, `InvoiceItem`, `Payment`, `LabOrderItem`, `QueueTicket`                                                              | LOW                                                 |
| M18 | `..._tenant_fks`              | FK `tenantId → tenants.id` uniformly                                                                                                                                               | **MEDIUM** (may surface orphans)                    |
| M19 | `..._rename_dental_lab`       | rename `Lab*` dental models → `DentalLab*`; `TenantKind.LAB` → `DENTAL_LAB`                                                                                                        | **HIGH** (wide blast radius — do it early or never) |

M19 deserves emphasis: it touches ~35 models, ~20 API modules, the web lab portal, the mobile lab screens and the generated API client. **Its cost only goes up.** If it is not done before the LIS work starts, accept the collision permanently and instead namespace the new work (`Diagnostic*`).

---

# 16. API Roadmap

Following the repo's existing REST + decorator conventions.

```
# Patient demographics (extends existing controller)
POST   /api/patients/:id/addresses          @Requires(PATIENT_WRITE)
POST   /api/patients/:id/contacts           @Requires(PATIENT_WRITE)
POST   /api/patients/:id/identifiers        @Requires(PATIENT_WRITE)  @Audit
POST   /api/patients/:id/entitlements       @Requires(PATIENT_WRITE)  @Audit
PATCH  /api/patients/:id/entitlements/:eid/verify  @Requires(PATIENT_WRITE) @Audit

# Encounter amendment
POST   /api/consultations/:id/amendments    @Requires(CONSULT_WRITE) @Audit   # reason required
GET    /api/consultations/:id/amendments    @Requires(CONSULT_READ)

# LIS — catalog
GET    /api/lis/sections                    @Requires(LAB_READ)
GET    /api/lis/tests                       @Requires(LAB_READ)
POST   /api/lis/tests                       @Requires(LAB_CATALOG_MANAGE) @Audit
POST   /api/lis/tests/:id/components        @Requires(LAB_CATALOG_MANAGE) @Audit
GET    /api/lis/tests/:id/reference-ranges  @Requires(LAB_READ)
POST   /api/lis/tests/:id/reference-ranges  @Requires(LAB_CATALOG_MANAGE) @Audit
POST   /api/lis/tests/:id/critical-rules    @Requires(LAB_CATALOG_MANAGE) @Audit

# LIS — order → specimen → result
POST   /api/lis/orders                      @Requires(LAB_ORDER)      @Audit
GET    /api/lis/orders/:id                  @Requires(LAB_READ)
POST   /api/lis/orders/:id/specimens        @Requires(LAB_COLLECT)    @Audit  # allocates accession
PATCH  /api/lis/specimens/:id/receive       @Requires(LAB_RECEIVE)    @Audit
POST   /api/lis/specimens/:id/reject        @Requires(LAB_RECEIVE)    @Audit  # reason required
GET    /api/lis/worklist                    @Requires(LAB_READ)               # ?sectionId&status
POST   /api/lis/specimens/:id/results       @Requires(LAB_RESULT_ENTER)  @Audit
PATCH  /api/lis/results/:id/verify          @Requires(LAB_RESULT_VERIFY) @Audit
PATCH  /api/lis/results/:id/validate        @Requires(LAB_RESULT_VALIDATE) @Audit
POST   /api/lis/results/:id/correct         @Requires(LAB_RESULT_CORRECT) @Audit  # new version
POST   /api/lis/reports/:id/release         @Requires(LAB_REPORT_RELEASE) @Audit
GET    /api/lis/reports/:id/pdf             @Requires(LAB_READ)          @Audit  # download logged

# Critical values
GET    /api/lis/critical-notifications      @Requires(LAB_READ)
POST   /api/lis/critical-notifications/:id/acknowledge  @Requires(CONSULT_READ) @Audit

# QA
POST   /api/lis/qc/runs                     @Requires(LAB_QC)         @Audit
GET    /api/lis/qc/runs?testId&lotId&from&to
POST   /api/lis/qc/violations/:id/corrective-action  @Requires(LAB_QC) @Audit
POST   /api/lis/equipment/:id/maintenance   @Requires(LAB_QC)         @Audit
POST   /api/lis/reagent-lots                @Requires(LAB_QC)         @Audit

# Referral
POST   /api/lis/referrals                   @Requires(LAB_ORDER)      @Audit
PATCH  /api/lis/referrals/:id/dispatch      @Requires(LAB_COLLECT)    @Audit
POST   /api/lis/referrals/:id/results       @Requires(LAB_RESULT_ENTER) @Audit

# Billing / payers
POST   /api/invoices/:id/discounts          @Requires(BILLING_WRITE)  @Audit
POST   /api/invoices/:id/refunds            @Requires(BILLING_WRITE)  @Audit
POST   /api/invoices/:id/official-receipt   @Requires(BILLING_WRITE)  @Audit
GET    /api/philhealth/eligibility/:patientId  @Requires(BILLING_READ)
POST   /api/philhealth/claims               @Requires(BILLING_WRITE)  @Audit
POST   /api/hmo/authorizations              @Requires(BILLING_WRITE)  @Audit

# Portal (self-scoped — derive patientId from JWT `pid`, never a param)
GET    /api/me/lab-orders
GET    /api/me/lab-reports/:id/pdf          @Audit   # only status=RELEASED
GET    /api/me/documents/:id
```

Two rules for the portal routes: **they live in `MeController` and derive the patient from the JWT**, and **a patient sees a lab report only when it is `RELEASED`** — never a draft, never a verified-but-unvalidated result.

---

# 17. UI/UX Roadmap

New clinic screens (`apps/web/app/(app)/`):

- `lis/worklist` — section-filtered pending worklist, the medtech's home screen
- `lis/accession` — receive/reject specimens, print labels
- `lis/results/[specimenId]` — component grid with inline flags and reference ranges shown per row
- `lis/verify` — verification queue, explicitly separate from entry
- `lis/validate` — pathologist queue
- `lis/qc` — Levey-Jennings per test/lot/level with Westgard violations called out
- `lis/critical` — unacknowledged critical results with an escalation timer
- `lis/catalog` — tests, components, reference ranges, critical rules
- `billing/[invoiceId]` — a real invoice screen showing VAT/discount breakdown line by line

Portal (`apps/web/app/portal/`): `lab-results` (released only), with a clear "discuss with your doctor" framing and no interpretation.

Mobile (`apps/mobile/src/features/`): `lis/specimen-collection` — scan the accession barcode, confirm patient identity, record collection time and collector. This is the highest-value mobile addition.

Cross-cutting: finish the `en`/`ph` i18n (clinic staff in the provinces will want Filipino labels), extend the a11y spec to the new screens, and build clinic-specific components in `libs/ui` (`PatientBanner`, `ResultGrid`, `FlagBadge`, `ReferenceRangeCell`) rather than rebuilding chrome per page.

---

# 18. Laboratory Workflow (target)

```
 Doctor orders  ──► LabOrder (priority, indication, dx)
        │                 │  ServiceCapability check
        │                 ├── can perform? NO ──► ReferralOrder ──► ReferralLaboratory
        ▼                 │                               │  chain of custody
 Cashier / payer gate     ▼                               ▼
 (HMO LOA · PhilHealth · senior/PWD discount)      ReferralResult ──┐
        │                                                           │
        ▼                                                           │
 Specimen collected ──► Specimen(accession) ──► label printed       │
        │                                                           │
        ▼                                                           │
 Received at lab ──► accept ──► PROCESSING ──► section worklist     │
        │                                                           │
        └── reject ──► SpecimenRejection(reason) ──► recollect      │
                                                                    │
 Test performed (manual or analyzer via interface engine)           │
        │                                                           │
        ▼                                                           │
 LabResult status = ENTERED   (performedBy = RMT)                   │
        │        flags from ReferenceRange + CriticalValueRule      │
        │                                                           │
        ├── critical? ──► CriticalResultNotification ──► clinician  │
        │                      └── must be ACKNOWLEDGED (audited)   │
        ▼                                                           │
 VERIFIED   (verifiedBy = RMT, ≠ performer where configured)        │
        ▼                                                           │
 VALIDATED  (validatedBy = Pathologist)                             │
        ▼                                                           │
 LabReport v1 + LabReportSignature (PRC snapshot + contentHash) ◄───┘
        ▼
 RELEASED ──► doctor notification · portal visibility · PDF (download audited)
        │
        └── correction needed? ──► LabResult v2, supersedes v1,
                                   LabReport v2 marked "CORRECTED REPORT",
                                   v1 retained and still retrievable
```

---

# 19. Clinic Workflow (target)

```
 Appointment booked │ Walk-in
        ▼
 CHECK-IN ──► QueueTicket + VisitJourney(stage=CHECKED_IN)
        │      └── verify identity (name + DOB, 2 identifiers)
        │      └── capture/verify entitlements (senior/PWD/PhilHealth/HMO)
        ▼
 VITALS ──► Vital  (nurse)
        ▼
 DOCTOR ──► Consultation: complaint · history · exam · assessment ·
            Diagnosis(ICD-10) · plan
        ├──► Prescription (PRC-signed PDF)
        ├──► LabOrder ─────────────► §18
        ├──► Procedure / Referral / MedicalCertificate
        └──► Follow-up scheduled
        ▼
 (LAB stage if ordered — patient returns to DOCTOR on release, or
  results are released to the doctor for a follow-up visit)
        ▼
 CASHIER ──► Invoice
            line items → PriceList
            VAT exemption applied first (senior/PWD)
            then 20% statutory discount on the VAT-exclusive base
            then HMO/PhilHealth coverage → patient share
        ──► Payment → OfficialReceipt (BIR series)
        ▼
 COMPLETED ──► Consultation locked (amendable via ConsultationAmendment)
```

---

# 20. Security Threat Model

| Actor / asset            | Threat                                                | Impact                                                            | Likelihood                                                 | Current control                                                   | Gap                                            | Mitigation                                                                     |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Patient (portal)         | Reads another patient's chart via `/api/patients/:id` | **Critical** — PHI breach, NPC notifiable                         | **High** — trivially exploitable with a valid portal token | RLS (tenant only)                                                 | No self-scope on ~30 endpoints                 | P0-1 fix: `PORTAL_READ` action + portal guard + e2e                            |
| Patient                  | Reads a draft/unvalidated lab result                  | High — clinical harm from misread preliminary data                | Medium                                                     | none                                                              | no result status gating                        | Portal exposes `RELEASED` only                                                 |
| Staff (tenant A)         | Reads tenant B data                                   | Critical                                                          | **Low**                                                    | RLS forced, superuser boot refusal                                | `push_tokens` only                             | M1                                                                             |
| Staff                    | Escalates via `X-Acting-For`                          | High                                                              | Low                                                        | Active delegation + active membership + scope narrowing           | none found                                     | keep; add e2e for expired delegation                                           |
| Doctor                   | Enters/releases a lab result as the laboratory        | High — no separation of duties, RMT/pathologist attribution false | **High** today                                             | none                                                              | `CONSULT_WRITE` gates result entry             | Lab action vocabulary (§16)                                                    |
| Medtech                  | Self-verifies own result                              | Medium                                                            | Medium                                                     | none                                                              | no verifier ≠ performer rule                   | Configurable double verification                                               |
| Anyone with write access | Silently rewrites a released result                   | **Critical** — patient safety + evidentiary                       | High today                                                 | audit row (id only)                                               | no versioning, no before/after                 | Result versioning + `supersedesId`                                             |
| Clinician                | Never sees a critical value                           | **Critical**                                                      | Medium                                                     | `void` fire-and-forget in-app notification                        | no ack, no escalation, no audit                | `CriticalResultNotification` + escalation                                      |
| Insider (admin)          | Bulk-exports patients                                 | High                                                              | Medium                                                     | `patient.read` audited; `/export` audited                         | no volume anomaly detection, no reason capture | Rate-limit exports; require a reason; alert on bulk                            |
| Attacker                 | Steals a token                                        | High                                                              | Medium                                                     | httpOnly cookies, short access TTL, refresh rotation              | S10 localStorage leftover; no device binding   | Finish the cookie migration                                                    |
| Attacker                 | Uploads malware                                       | Medium                                                            | Medium                                                     | extension allow-list                                              | no AV scan, mimeType asserted by client        | S3 + Lambda scan before flipping `READY`                                       |
| Attacker                 | Guesses a file id to download PHI                     | High                                                              | —                                                          | **no download endpoint exists**                                   | when one is added, `FileObject` has no owner   | Add `patientId` first (M6)                                                     |
| Attacker                 | Credential stuffing                                   | Medium                                                            | High                                                       | 10/min auth throttle, lockout, MFA                                | in-process throttle across replicas            | Redis throttle store                                                           |
| AI provider              | Receives PHI                                          | High                                                              | Low                                                        | minimised context + consent gate                                  | `patientLabel` in dental-lab path              | Strip to initials/id                                                           |
| Backup                   | Snapshot leaked                                       | Critical                                                          | Low                                                        | RDS encryption                                                    | no restore test                                | Quarterly restore drill                                                        |
| Analyzer (future)        | Spoofed result injection                              | Critical                                                          | —                                                          | n/a                                                               | n/a                                            | Per-analyzer credentials; inbound results enter at `ENTERED`, never `RELEASED` |
| Platform admin           | Cross-tenant read                                     | High                                                              | Low                                                        | separate identity table, explicit `SET LOCAL` bypass GUC, audited | `platform_admins` outside RLS                  | M2                                                                             |

---

# 21. Compliance Matrix

| Requirement                                                                                                                                     | Authority                                                                                                                                                                                                                                                                     | Type                         | Current implementation                                                                                  | Gap | Recommended feature                                                      | Priority                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------ | --------------------------- |
| Clinical laboratory must hold a DOH LTO; may not test beyond authorized service capability                                                      | [DOH AO 2021-0037](https://hfsrb.doh.gov.ph/clinical-laboratory/); [RA 4688](https://www.studocu.com/ph/document/notre-dame-of-marbel-university/medical-technology/ra-4688-clinical-laboratory-act/9306242)                                                                  | **LEGAL**                    | none                                                                                                    | 🔴  | `Laboratory` + `LabServiceCapability`; enforce at order placement        | **P0**                      |
| Laboratory headed/managed by a certified pathologist (limited exception for a trained physician in primary/secondary labs where none available) | RA 4688; DOH AO 2021-0037                                                                                                                                                                                                                                                     | **LEGAL**                    | none                                                                                                    | 🔴  | `Laboratory.labHeadUserId` / `pathologistUserId`; `PATHOLOGIST` role     | **P0**                      |
| Medical technologists practise under pathologist supervision                                                                                    | [RA 5527](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/7439) ([PRC text](https://www.prc.gov.ph/sites/default/files/Medical%20Technology%20-%20Board%20Law_0.PDF))                                                                                               | **LEGAL**                    | none                                                                                                    | 🔴  | `MEDICAL_TECHNOLOGIST` role + supervision link; PRC on report signatures | **P0**                      |
| Participation in an External Quality Assessment Program (NRL or DOH-approved)                                                                   | DOH AO 2021-0037                                                                                                                                                                                                                                                              | **LEGAL**                    | `EqapProvider` / `EqapEnrolment` / `EqapSubmission` + participation summary (`20260925140000_lis_eqap`) | ✅  | Attach the provider's report file as the inspector-facing evidence       | done                        |
| Documented internal QC, QC reports per test on file                                                                                             | DOH AO 2021-0037                                                                                                                                                                                                                                                              | **REGULATORY GUIDANCE**      | none                                                                                                    | 🔴  | `QCMaterial`/`QCLot`/`QCRun`/`QCViolation`/`CorrectiveAction`            | **P1**                      |
| Retention of laboratory records per DOH standards                                                                                               | DOH AO 2021-0037; [AO 2022-0007](https://sites.google.com/view/doh-hfdb/2023-updates/ao-2023-0018)                                                                                                                                                                            | **LEGAL**                    | policy documented, partially implemented                                                                | 🟡  | Extend `RetentionService`; retention class per entity                    | P1                          |
| Health data = sensitive personal information; lawful basis, minimisation, security                                                              | [RA 10173](https://privacy.gov.ph/)                                                                                                                                                                                                                                           | **LEGAL**                    | RLS, KMS, consent, DSR, PIA pages                                                                       | 🟡  | Encryption at rest ✅; add field-level crypto for identifiers            | P1                          |
| Breach notification to NPC and data subjects within 72 hours; full report within 5 days; no delay ≥100 subjects                                 | [NPC Circular 16-03](https://privacy.gov.ph/wp-content/uploads/2022/01/sgd-npc-circular-16-03-personal-data-breach-management.pdf)                                                                                                                                            | **LEGAL**                    | runbook only                                                                                            | 🟡  | `PrivacyIncident` register + clock + notification templates              | **P1**                      |
| Data subject rights (access, correction, erasure, portability)                                                                                  | RA 10173 §16                                                                                                                                                                                                                                                                  | **LEGAL**                    | `DataSubjectRequest` + processors                                                                       | ✅  | keep; extend erasure to files once `FileObject.patientId` exists         | P2                          |
| Senior citizen: 20% discount + VAT exemption on medical/dental services and diagnostic and laboratory fees                                      | [RA 9994](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/17035)                                                                                                                                                                                                    | **LEGAL**                    | none                                                                                                    | 🔴  | `PatientEntitlement` + `DiscountRule` with VAT-first arithmetic          | **P0** for a billing clinic |
| PWD: 20% discount + VAT exemption on presentation of a valid PWD ID                                                                             | [RA 10754](https://batasnatin.com/doctrine/pwd-rights-discount-vat-exemption-ra-10754)                                                                                                                                                                                        | **LEGAL**                    | none                                                                                                    | 🔴  | same mechanism, different rule + ID capture                              | **P0** for a billing clinic |
| Purchase booklet no longer required for the senior medicines discount                                                                           | [FDA Circular 2025-005](https://www.fda.gov.ph/fda-circular-no-2025-005-delisting-of-purchase-booklet-from-the-checklist-of-requirements-to-avail-of-the-20-senior-citizen-discount-on-the-purchase-of-medicines-and-medical-devices-in-accordance-w/) (per DOH AO 2024-0017) | **REGULATORY GUIDANCE**      | n/a                                                                                                     | —   | do **not** build a booklet requirement                                   | P3                          |
| PhilHealth claims filed electronically via eClaims within 60 days of service                                                                    | [PhilHealth](https://www.philhealth.gov.ph/yakap/issuances/)                                                                                                                                                                                                                  | **CONTRACTUAL / REGULATORY** | none                                                                                                    | 🔴  | `PhilHealthClaim` + submission tracking + 60-day alerting                | P2                          |
| Konsulta: capitated primary-care package with a defined diagnostic panel                                                                        | [PhilHealth Circular 2024-0013](https://www.philhealth.gov.ph/circulars/2024/PC2024-0013.pdf)                                                                                                                                                                                 | **CONTRACTUAL**              | none                                                                                                    | 🔴  | `BenefitPackage` as **configurable data**, not code                      | P2                          |
| PRC licence on professional documents                                                                                                           | RA 5527, PRC                                                                                                                                                                                                                                                                  | **LEGAL**                    | ✅ prescriptions                                                                                        | 🟡  | extend to lab reports and medical certificates                           | P1                          |
| Books/receipts preserved 10 years                                                                                                               | NIRC §235                                                                                                                                                                                                                                                                     | **LEGAL**                    | policy only                                                                                             | 🟡  | `OfficialReceipt` + archival job                                         | P2                          |

**PRODUCT RECOMMENDATIONS (not required by any of the above):** Levey-Jennings charting, Westgard rule automation, analyzer interfacing, FHIR export, TAT dashboards, offline mode. All are good engineering; none is a licensing precondition. Do not present them to a clinic as legal obligations.

---

# 22. Implementation Roadmap

## Phase 0 — Security & architecture foundations (2–3 weeks) · P0

- Fix the portal authorization hole (P0-1): `PORTAL_READ` action, portal guard, e2e boundary suite.
- RLS on `push_tokens`; `PushService` → `withTenant`; deny policies on platform tables.
- **The dental-lab rename (M19)** — do it now or accept it forever.
- `FileObject.patientId` + an authorized, audited download endpoint + AV scan on confirm.
- `ConsultationAmendment` (P0-4).
- Audit log: capture before/after and a `reason` on clinical and financial mutations.
- A regression test that asserts every `tenantId`-bearing table has `relrowsecurity = true`.

_DB:_ M1, M2, M4, M6, M19 · _API:_ roles, guards, files, consultations · _Web:_ amendment UI · _Tests:_ portal boundary, RLS coverage · _Migration risk:_ HIGH for M19, LOW otherwise.

## Phase 1 — Clinic / EMR foundation (4–6 weeks) · P1

Patient demographics normalization (M3), `Diagnosis` entity (M5), `VisitJourney`/`VisitStage`, follow-ups, medical certificate + referral letter with PRC signature, soft-delete on clinical tables (M17), tenant FKs (M18).

## Phase 2 — Core LIS (8–12 weeks) · P0 for the lab product

M7–M12. Catalog → specimen/accession → structured results → verification chain → signed reports → critical-value rules and acknowledgement → referral laboratory. Replace `deriveFlag` with rule-driven evaluation. Build the worklist, accession, entry, verify and validate screens. Mobile specimen collection.

**This is the phase that makes CLINIQ a LIS. Nothing before it does.**

## Phase 3 — Billing / PhilHealth / HMO (5–7 weeks) · P1

M13–M15. Senior/PWD statutory discounts with correct VAT-first arithmetic, price lists, refunds, official receipts, HMO LOA, PhilHealth membership/eligibility/claims with configurable benefit packages.

## Phase 4 — Laboratory QA / inventory / equipment (5–7 weeks) · P1 for licensing

M16. QC materials/lots/runs, Westgard evaluator as a tested pure function in `libs/`, Levey-Jennings UI, corrective actions, calibration, equipment maintenance, reagent lots with open-vial expiry and result traceability, EQAP records.

## Phase 5 — Compliance & privacy (3–4 weeks) · P1

`PrivacyIncident` register with the 72-hour clock; full retention implementation per entity class; DSR erasure extended to files; laboratory record retention; restore drill; monitoring and alerting.

## Phase 6 — Analyzer integration & interoperability (6–10 weeks) · P3

`apps/interface-engine` with ASTM/HL7v2/CSV adapters; code mapping; inbound results enter at `ENTERED`. FHIR R4 façade for `Patient`, `Practitioner`, `Organization`, `Encounter`, `Observation`, `DiagnosticReport`, `ServiceRequest`, `Specimen`, `MedicationRequest`, `Condition`, `AllergyIntolerance`, `Appointment` — **as a mapping layer, not as storage**.

## Phase 7 — Analytics & AI (4–6 weeks) · P2/P3

Lab TAT dashboards (order→result, collection→result, received→result, against per-test targets), rejection-rate and QC-failure trends, revenue split clinic vs lab, doctor productivity, receivables, claims ageing. AI confined to drafting, summarisation, patient-friendly explanation and missing-documentation detection — always with human review, never autonomous diagnosis, treatment or record modification.

---

# 23. File-by-File Change Plan

### P0-1 · Portal authorization

```
libs/shared-types/src/lib/roles.ts
  + Actions.PORTAL_READ
  ~ PATIENT: new Set([Actions.PORTAL_READ])          (drop PATIENT_READ)

apps/api/src/me/me.controller.ts
  ~ @Requires(PATIENT_READ) → @Requires(PORTAL_READ) on portal routes
    (leave staff-profile on PATIENT_READ; requireStaff already gates it)

apps/api/src/auth/guards/rbac.guard.ts
  + reject role === 'PATIENT' unless the handler/class is @PortalRoute()

apps/api/src/auth/decorators/portal-route.decorator.ts   (new)

apps/api-e2e/src/modules/portal-boundary.spec.ts          (new)
  PATIENT token → 403 on /api/patients, /api/patients/:id,
  /api/patients/:id/export, /api/lab-orders/:id,
  /api/prescriptions/:id/pdf, /api/clinical/*, /api/ob/*,
  /api/dental/*, /api/hmo/*, /api/appointments

apps/web/features/portal/*            — re-point any staff-endpoint calls to /me/*
libs/api-client/                      — regenerate
```

### P0-2/3 · Lab results, flags, critical values

```
libs/db/prisma/schema.prisma
  + LabSection SpecimenType Container LaboratoryTest TestComponent
    TestPanelMember Specimen SpecimenRejection LabResult
    LabResultComponent ReferenceRange CriticalValueRule
    CriticalResultNotification LabReport LabReportSignature
    DocumentSequence
libs/db/prisma/migrations/2026XXXX_lis_*/migration.sql
  + RLS via the FOREACH pattern for every new tenant-scoped table

apps/api/src/labs/  →  apps/api/src/lis/                 (rename module)
  lis/catalog/{controller,service,dto}                   (new)
  lis/specimens/{controller,service,dto}                 (new)
  lis/results/{controller,service,dto}                   (new)
  lis/results/flagging.service.ts                        (new)
    replaces deriveFlag() at labs.service.ts:278-292
  lis/results/verification.service.ts                    (new)
  lis/critical/{controller,service}                      (new)
  lis/reports/{controller,service,pdf/}                  (new)
  lis/referrals/{controller,service,dto}                 (new)

libs/lis-rules/src/                                       (new lib)
  reference-range.ts   selectRange(component, patient, method, date)
  critical.ts          evaluateCritical(value, rules, patient)
  westgard.ts          evaluate(runs) → violations
  + unit tests for all three (these are pure functions — test them properly)

libs/shared-types/src/lib/roles.ts
  + Roles.MEDICAL_TECHNOLOGIST, Roles.PATHOLOGIST, Roles.LAB_RECEPTION,
    Roles.CASHIER
  + Actions.LAB_READ / LAB_ORDER / LAB_COLLECT / LAB_RECEIVE /
    LAB_RESULT_ENTER / LAB_RESULT_VERIFY / LAB_RESULT_VALIDATE /
    LAB_RESULT_CORRECT / LAB_REPORT_RELEASE / LAB_QC / LAB_CATALOG_MANAGE

apps/web/features/labs/  →  apps/web/features/lis/
apps/web/app/(app)/lis/{worklist,accession,results/[id],verify,validate,qc,critical,catalog}/page.tsx
apps/mobile/src/features/lis/specimen-collection-screen.tsx

apps/api-e2e/src/modules/lis-*.spec.ts                    (new)
```

### P0-4 · Consultation amendments

```
libs/db/prisma/schema.prisma                + ConsultationAmendment
apps/api/src/consultations/consultations.service.ts
  + amend(id, dto, user)  — requires reason; writes version+1
apps/api/src/consultations/consultations.controller.ts
  + POST /consultations/:id/amendments  @Requires(CONSULT_WRITE) @Audit
apps/web/features/consultations/components/amend-dialog.tsx
apps/web/app/(app)/consultations/[id]/page.tsx   — render amendment history
```

### P0-6 · push_tokens RLS

```
libs/db/prisma/migrations/2026XXXX_rls_push_tokens/migration.sql
apps/api/src/notifications/push.service.ts
  ~ this.prisma.pushToken.*  →  this.prisma.withTenant(tenantId, null, tx => tx.pushToken.*)
```

### P0-7 · File ownership and download

```
libs/db/prisma/schema.prisma        ~ FileObject + patientId, consultationId, scanStatus
apps/api/src/files/files.service.ts + download(fileId, user) → presigned GET, TTL 60s
apps/api/src/files/files.controller.ts
  + GET /files/:id/download  @Requires(PATIENT_READ) @Audit({action:'file.download'})
    — verifies the caller may see that patient; PATIENT role → own files only
infra/terraform/modules/storage/main.tf  + S3 event → scan Lambda
```

### PH billing

```
libs/db/prisma/schema.prisma
  + PatientEntitlement DiscountRule InvoiceDiscountApplication
    PriceList PriceListItem Refund OfficialReceipt
  ~ InvoiceItem + isVatExempt, vatCentavos, discountCentavos, discountRuleId
apps/api/src/billing/pricing.service.ts          (new — VAT-first arithmetic)
apps/api/src/billing/discounts.service.ts        (new)
libs/billing-rules/src/ph-statutory.ts           (new — pure, unit-tested)
apps/web/features/billing/components/invoice-breakdown.tsx
```

### Dental-lab rename (M19)

```
apps/api/src/dental-lab/         → apps/api/src/dental-lab/
apps/web/app/lab/         → apps/web/app/dental-lab/
apps/web/features/dental-lab/    → apps/web/features/dental-lab/
apps/mobile/src/features/dental-lab/ → .../dental-lab/
libs/db/prisma/schema.prisma   Lab* (dental) → DentalLab*, TenantKind.LAB → DENTAL_LAB
libs/db/prisma/migrations/2026XXXX_rename_dental_lab/migration.sql  (ALTER TABLE ... RENAME)
libs/api-client/          regenerate
docs/lab-module-plan.md   → docs/dental-lab-module-plan.md
```

---

# 24. Migration Strategy

The general shape, applied to every schema change above:

```
Existing model ──► new tables added (additive migration, no drops)
       │
       ▼
Dual-write period — services write both old and new
       │
       ▼
Backfill job — historical rows copied into the new shape, idempotent, resumable
       │
       ▼
Read cutover — reads move to the new tables; old columns kept but unread
       │
       ▼
One full release of soak, with a verification query proving parity
       │
       ▼
Drop old columns/tables (separate migration, separate release)
```

**Migrations with real data-loss potential — do not run these without the steps below:**

- **M11 (`LabOrderItem` → catalog + `LabResult`).** Existing items have free-text `testName` with no catalog match. **Do not delete them.** Create a `LaboratoryTest` with `code = 'LEGACY-' + slug(testName)` and `isActive = false` for each distinct name, backfill each item into a single-component `LabResult` with `status = RELEASED` and `releasedAt = reportedAt`, and keep `lab_order_items` intact for one full release. A clinic's historical results are the most irreplaceable data in the system.
- **M18 (tenant FKs).** Will fail on orphaned rows. Run a detection query first, and reconcile or delete orphans in a prior migration.
- **M19 (dental-lab rename).** `ALTER TABLE ... RENAME` is metadata-only and safe on Postgres, but the API and the generated client must deploy in lockstep. Ship it in a single release with a brief maintenance window, or add temporary views under the old names.
- **`Patient.email`/`phone` → `PatientContact`.** Backfill first, dual-read for a release, then drop. Never drop before the portal signup flow (which matches on email) has been repointed.

Every backfill: run in batches with a cursor, log progress, be re-runnable, and be validated by a count-parity query recorded in the PR.

---

# 25. Testing Strategy

Current state: **7 unit specs against 243 API source files (~3%)**; 41 api-e2e module specs + `tenant-isolation` + `auth-hardening` + `feature-gates`; 20 Playwright specs including a11y and responsive. All run in CI against a real Postgres with the `cliniq_app` role provisioned — that setup is genuinely good and the e2e layer partly compensates for thin unit coverage.

The gaps that matter for a clinical product:

**Must exist before any clinical pilot:**

```
Patient A cannot access Patient B                    ← MISSING (P0-1)
Portal patient cannot reach any staff endpoint       ← MISSING
Clinic A cannot access Clinic B                      ← exists (3 domains only; extend to all)
Lab user cannot alter a RELEASED result              ← N/A until §6 ships
Result correction creates v2 and retains v1          ← N/A
Doctor cannot validate as pathologist                ← N/A
Performer cannot self-verify (when configured)       ← N/A
Patient cannot access a draft/verified result        ← N/A
Critical result notification is persisted and audited← N/A
Unacknowledged critical result escalates             ← N/A
Expired HMO authorization cannot be used             ← N/A
Unauthorized user cannot download a lab report       ← N/A (no download exists)
Locked consultation cannot be edited, only amended   ← partial (lock tested; amend missing)
Every tenantId table has RLS enabled                 ← MISSING — write this as a SQL assertion
Senior + PWD discount arithmetic (VAT first)         ← N/A
Accession numbers are unique under concurrency       ← N/A
```

**Unit-test targets (pure functions, high value, cheap):** `libs/lis-rules/*` (range selection, critical evaluation, Westgard), `libs/billing-rules/ph-statutory.ts`, `apps/api/src/appointments/appointment-transitions.ts`, and the flagging service. These are exactly the places where a silent arithmetic error becomes a patient-safety or statutory-compliance incident, and they are trivial to test.

Recommended targets: **80% line coverage on `libs/lis-rules` and `libs/billing-rules`**, 60% on API services, and the full boundary matrix above as e2e.

---

# 26. Recommended MVP Scope

The smallest credible **Philippine Clinic + Laboratory** release, for a single-branch clinic with an in-house primary/secondary laboratory:

**Must have**

- Phase 0 in full (the P0 fixes — non-negotiable, these are live defects)
- Patient registration with middle name, address, contacts, PhilHealth/PhilSys identifiers, senior/PWD entitlements
- Encounter with SOAP, ICD-10 diagnoses as entities, and amendment
- Appointments + a queue with stages
- Prescriptions (already done)
- **LIS core**: test catalog with panels and components, specimen + accession, structured results, reference ranges by age/sex, configured critical values with acknowledgement, RMT entry → RMT verification → pathologist validation → signed PDF release
- Laboratory licence profile + service capability + referral for out-of-scope tests
- Billing with senior/PWD statutory discounts computed correctly, HMO LOA, cash/GCash/card payments, official receipt
- Audit with before/after on clinical and financial changes
- Portal: appointments, invoices, **released** lab results only

**Explicitly out of MVP**

- QC/Levey-Jennings/Westgard (required for licensing — but a laboratory can run its QC on paper for a pilot; ship it in the release immediately after)
- Analyzer interfacing, FHIR, PhilHealth eClaims submission
- Offline mode, multi-branch, microbiology and anatomic pathology sections
- AI beyond the existing SOAP draft

**On offline mode:** I would not build it for MVP. The clinic workflows that must survive a connectivity drop are check-in, queue, vitals and specimen collection — all short, append-only and conflict-light. The rest (results, billing, claims) needs server authority and would be actively dangerous to reconcile after the fact. The tradeoff: a lightweight offline queue in the Expo app (local encrypted store, append-only, sync-on-reconnect, last-write-wins on a single-owner record) is perhaps two weeks and covers the real failure mode. Full offline EMR with conflict resolution is a quarter and buys little.

---

# 27. Post-MVP

QC/QA suite and EQAP records (first release after MVP — licensing depends on it); equipment and reagent lot traceability; microbiology (culture, sensitivity, organism catalog — a genuinely different data model) and anatomic pathology (gross/microscopic description, synoptic reporting); analyzer interfacing; PhilHealth eClaims; FHIR façade; multi-branch with per-facility capability; lab TAT and QC analytics; a referral-laboratory network across tenants; and AI for missing-documentation detection and patient-friendly result explanations — with human review.

---

# 28. Final Engineering Recommendations

1. **Keep the RLS model exactly as it is.** Forced RLS, a `NOLOGIN`/no-`BYPASSRLS` app role, a boot-time superuser refusal and a `SET LOCAL` GUC inside the transaction is the right design. Every new table joins it in the same migration.
2. **Keep the modular monolith.** Only the interface engine justifies a separate process.
3. **Fix the portal authorization hole this week.** It is one action constant, one guard and one test file, and it is a notifiable breach waiting to happen.
4. **Rename the dental lab before building the clinical lab.** The cost only rises.
5. **Build the LIS; do not extend `LabOrderItem`.** Two tables with a free-text result string cannot become a LIS incrementally.
6. **Make clinical rules data, not code.** Reference ranges, critical limits, TAT targets, discount rules, benefit packages — all configurable with effective dates. The `high * 1.5` heuristic is what happens when a clinical rule is a literal in a service.
7. **Never destructively edit a clinical record.** Consultations amend; results version. The lock already exists — give it the escape hatch it promises.
8. **Separate duties in the laboratory.** Entry, verification, validation and release are four different actions held by different roles. A doctor holding `CONSULT_WRITE` must not be able to sign as a medical technologist.
9. **Put the PRC snapshot on lab reports** the way it already is on prescriptions, with a content hash. The pattern is proven in this codebase; reuse it.
10. **Extract pure rule functions into `libs/` and test them hard.** Range selection, critical evaluation, Westgard, VAT-first discount arithmetic. These are where silent errors become patient harm or statutory non-compliance.
11. **Give every file an owner and every download an audit row** before any download endpoint ships.
12. **Get the AO 2021-0037 text and its Annexes directly from HFSRB** before implementing the service-capability matrix. Do not build the category test lists from secondary sources, and do not tell a clinic that a product feature is a legal requirement.

---

# 29. The 20 most important things to change or build first

> _"If we want CLINIQ to become a production-ready Philippine Clinic + Clinical Laboratory platform, what are the 20 most important things we should change or build first, and exactly where?"_

| #   | Change                                                                                                                                                                                                                                                                                                                          | Where                                                                                                                                   | Why                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~Revoke `PATIENT_READ` from the `PATIENT` role; add `PORTAL_READ` + a portal-scope guard~~ **DONE**                                                                                                                                                                                                                            | `libs/shared-types/src/lib/roles.ts:118`, `apps/api/src/auth/guards/rbac.guard.ts`, `apps/api/src/me/me.controller.ts`                  | A portal patient can read every chart in the clinic today                                                                                                                                                                                     |
| 2   | ~~Add the portal boundary e2e suite~~ **DONE**                                                                                                                                                                                                                                                                                  | `apps/api-e2e/src/modules/portal-boundary.spec.ts` (new)                                                                                | Nothing currently asserts #1 stays fixed                                                                                                                                                                                                      |
| 3   | ~~Replace `deriveFlag`'s `high*1.5 / low*0.5` with configured `CriticalValueRule` rows~~ **DONE**                                                                                                                                                                                                                               | `apps/api/src/labs/flagging.ts`, `critical-value-rules.service.ts`, migration `20260923180000_critical_value_rules`                     | Systematically under-flagged true critical values. The evaluator landed in `apps/api/src/labs/` rather than a new `libs/lis-rules` — Nx generators do not run in this workspace's worktrees, and it moves cleanly when the LIS lib is created |
| 4   | ~~Build `CriticalResultNotification` with recipient, method, acknowledgement and escalation~~ **DONE** — structured call-back/read-back capture still open                                                                                                                                                                      | `libs/db/prisma/schema.prisma`, `apps/api/src/lis/critical/` (new); replaces the `void this.notif.notify(...)` at `labs.service.ts:222` | A missed critical value is the classic lab-caused death                                                                                                                                                                                       |
| 5   | ~~Build the LIS result chain~~ **DONE** — as `PENDING→PRELIMINARY→FINAL`/`CORRECTED` on `LabOrderItem` + append-only `lab_result_versions`, not a separate `LabResult`/`LabResultComponent` pair; verification and four-eyes are per-tenant settings defaulting off (§4 P0-2)                                                   | `libs/db/prisma/schema.prisma`, `apps/api/src/labs/verification.ts`                                                                     | Today one `CONSULT_WRITE` call enters and reports a result, rewritable with no history                                                                                                                                                        |
| 6   | Add `MEDICAL_TECHNOLOGIST`, `PATHOLOGIST`, `LAB_RECEPTION`, `CASHIER` roles and the `LAB_*` action vocabulary **— PARTIALLY DONE.** `MEDICAL_TECHNOLOGIST` + `PATHOLOGIST` + `LAB_RESULT_ENTER`/`LAB_RESULT_VERIFY` landed; **`LAB_RECEPTION` and `CASHIER` still open**, and the specimen routes still gate on `CONSULT_WRITE` | `libs/shared-types/src/lib/roles.ts`                                                                                                    | RA 5527 supervision and separation of duties cannot be expressed with 6 roles                                                                                                                                                                 |
| 7   | ~~Build `LaboratoryTest` + `TestComponent` + `TestPanelMember`~~ **DONE** — `LabSection` too; panels are modelled through the catalogue rather than a separate `TestPanelMember`                                                                                                                                                | `libs/db/prisma/schema.prisma`                                                                                                          | A CBC is currently 7 unrelated free-text rows                                                                                                                                                                                                 |
| 8   | ~~Build `Specimen` + accession numbering + `SpecimenRejection`~~ **DONE** — numbering is atomic, and it also fixed a pre-existing race in lab order slip numbers                                                                                                                                                                | `libs/db/prisma/schema.prisma`, `apps/api/src/lis/specimens/` (new)                                                                     | No specimen identity = no chain of custody, no wrong-specimen defence                                                                                                                                                                         |
| 9   | Build `ReferenceRange` with age/sex/condition/method + effective dates; pin the applied range onto the result                                                                                                                                                                                                                   | `libs/db/prisma/schema.prisma`                                                                                                          | Paediatric and adult results are flagged against the same numbers                                                                                                                                                                             |
| 10  | ~~Add `ConsultationAmendment`~~ **DONE**                                                                                                                                                                                                                                                                                        | `libs/db/prisma/schema.prisma`, `apps/api/src/consultations/consultations.service.ts:177`                                               | The lock already tells users to "create a revision" and no revision exists                                                                                                                                                                    |
| 11  | ~~Rename the dental-lab domain~~ **MOSTLY DONE** — `Lab*` → `DentalLab*`, `apps/api/src/lab/` → `dental-lab/`, routes → `/api/dental-lab/*`, clinical critical-value rules moved to `/api/lis/*`. Still open: DB table names (kept as `lab_*` via `@@map`, deliberately) and `TenantKind.LAB` → `DENTAL_LAB`                    | schema + ~20 API modules + web/mobile lab portals + `libs/api-client`                                                                   | `lab/` and `labs/` differed by one character and meant unrelated things                                                                                                                                                                       |
| 12  | ~~Add RLS to `push_tokens` and route `PushService` through `withTenant`~~ **DONE**                                                                                                                                                                                                                                              | new migration; `apps/api/src/notifications/push.service.ts:92,114`                                                                      | The one hole in an otherwise uniform isolation model                                                                                                                                                                                          |
| 13  | Add `FileObject.patientId` + an authorized, audited download endpoint + AV scan **— MOSTLY DONE.** Ownership and the audited download landed; **AV scan still open**                                                                                                                                                            | `libs/db/prisma/schema.prisma:1387`, `apps/api/src/files/`                                                                              | PHI is write-only today, and any download added later has nothing to authorize against                                                                                                                                                        |
| 14  | Normalize `Patient`: middle name, suffix, civil status, blood type + `PatientAddress`/`PatientContact`/`PatientIdentifier`/`PatientEntitlement`                                                                                                                                                                                 | `libs/db/prisma/schema.prisma:1144-1182`                                                                                                | 8 fields cannot register a Philippine patient                                                                                                                                                                                                 |
| 15  | Build `PatientEntitlement` + `DiscountRule` + VAT-first statutory arithmetic                                                                                                                                                                                                                                                    | `libs/billing-rules/src/ph-statutory.ts` (new), `apps/api/src/billing/pricing.service.ts` (new); `Invoice.discountCentavos` today       | RA 9994 / RA 10754 are legal requirements a billing clinic cannot skip                                                                                                                                                                        |
| 16  | ~~Build `Laboratory` (DOH LTO, category, head, pathologist) + `LabServiceCapability`, enforced at order placement~~ **DONE** — `20260924300000_lis_laboratory_licence` plus `20260924320000_lis_referral_labs`. Enforcement is per-tenant and defaults off (§6.10)                                                              | `libs/db/prisma/schema.prisma`, `apps/api/src/labs/capability.ts`, `referral.ts`                                                        | AO 2021-0037: a lab may not test beyond its authorized capability                                                                                                                                                                             |
| 17  | ~~Build `LabReport` + `LabReportSignature` with the PRC snapshot and a content hash~~ **DONE** — plus the PDF and patient-portal access. Keyed to the order rather than the specimen, and the PDF is rendered on demand rather than stored (§6.9)                                                                               | `libs/db/prisma/schema.prisma`, `apps/api/src/labs/reports.service.ts`, `apps/api/src/labs/pdf/`                                        | Reuses the proven `Prescription.providerLicense` pattern; a boolean `signed` is worthless                                                                                                                                                     |
| 18  | Capture before/after values and a `reason` in the audit log                                                                                                                                                                                                                                                                     | `libs/db/prisma/schema.prisma:1359` (`AuditLog`), `apps/api/src/audit/audit.interceptor.ts`                                             | Append-only is already right; it records _that_ something changed, not _what_                                                                                                                                                                 |
| 19  | Promote `Consultation.diagnosisCodes String[]` to a `Diagnosis` entity                                                                                                                                                                                                                                                          | `libs/db/prisma/schema.prisma:1216`                                                                                                     | Needed for problem lists, reporting and any PhilHealth claim                                                                                                                                                                                  |
| 20  | Add the RLS coverage assertion + the clinical boundary test matrix to CI **— PARTIALLY.** The boundary matrix exists (`portal-boundary.spec.ts`); a standing "every `tenantId` table has `relrowsecurity`" assertion in CI is **still open**, and it would also have caught the CI re-grant described in §1                     | `apps/api-e2e/src/` , `.github/workflows/ci.yml`                                                                                        | A SQL assertion that every `tenantId` table has `relrowsecurity = true` would have caught #12                                                                                                                                                 |

---

# 30. What has changed since the audit

Every row below was verified against the source, not inferred from a commit message: the migration, guard, spec or module named was confirmed to exist on `main`. Everything listed here is merged.

| Finding                                        | State            | Landed in                                                                                       |
| ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| P0-1 portal BOLA                               | fixed            | `PORTAL_READ` + `PortalScopeGuard` + `portal-boundary.spec.ts`                                  |
| P0-2 critical thresholds                       | fixed            | `20260923180000_critical_value_rules`, `apps/api/src/labs/flagging.ts`                          |
| P0-2 result verification chain                 | fixed            | `20260924220000_lis_result_verification`                                                        |
| P0-3 critical-result handling                  | fixed            | `20260924120000_critical_result_notifications` (+ `20260924160000_critical_rule_notify_window`) |
| P0-4 consultation amendments                   | fixed            | `20260924090000_consultation_amendments`                                                        |
| P0-5 DOH-licensable laboratory                 | partially closed | catalogue, specimens, verification chain; QC, equipment, licence profile, reports still open    |
| P0-6 `push_tokens` RLS                         | fixed            | `20260924100000_push_tokens_rls`                                                                |
| P0-7 file download path                        | fixed            | `20260924140000_file_patient_ownership`                                                         |
| Audit log append-only **in CI**                | fixed            | `.github/workflows/ci.yml` — replay migration `REVOKE`s after the blanket grant                 |
| Dental-lab rename                              | mostly done      | see §29 #11                                                                                     |
| Test catalogue                                 | built            | `20260924180000_lis_test_catalogue`                                                             |
| Specimens + accession                          | built            | `20260924200000_lis_specimens`                                                                  |
| Result verification + history                  | built            | `20260924220000_lis_result_verification`                                                        |
| Signed reports + PDF + portal access           | built            | `20260924240000_lis_lab_reports`                                                                |
| Laboratory LTO profile + service capability    | built            | `20260924300000_lis_laboratory_licence`                                                         |
| Referral laboratories + capability enforcement | built            | `20260924320000_lis_referral_labs` — referred tests stated on the report; MOA file still open   |

## Three things this exercise taught that are worth keeping

1. **A control is not in force because a migration says so.** The append-only audit log was claimed as a strength in the first draft of this document. It was wrong twice — once because `ALTER DEFAULT PRIVILEGES` had already granted what a later narrower `GRANT` did not subtract, and once because CI re-granted it after migrating. Both times the migration read correctly. What was missing was a test asserting the privilege state of the database the tests run against.

2. **The verification gap between "typechecks", "builds" and "boots" is real.** Each layer in this workspace catches a different class of defect and none substitutes for another: `tsc` misses what only Swagger sees at boot, the Docker build strips types without checking them, and `nx` silently no-ops inside worktrees, reporting success without running anything. Green output is not evidence unless you know which command produced it.

3. **Configurable beats correct-in-theory when the clinic cannot staff it.** Several rules here are patient-safety rules — verification, four-eyes, critical-value limits — and the temptation is to hard-code the strict version. A single-technologist rural clinic that cannot release any result is a worse outcome than one that self-verifies with both identities on the record. Record everything; enforce what the clinic has opted into.

---

# `CLINIQ — RECOMMENDED TARGET ARCHITECTURE`

```
                        ┌──────────────────────────────────────┐
                        │  Clinic · Portal · Dental-Lab · Mobile│
                        └───────────────────┬──────────────────┘
                                            │ httpOnly cookie / Bearer
   ┌────────────────────────────────────────▼─────────────────────────────────┐
   │  NestJS modular monolith                                                 │
   │  Throttle → Jwt → Rbac(fine-grained) → PortalScope → Feature → Consent   │
   │                                        → Audit(before/after/reason)      │
   │                                                                          │
   │  clinical      │  lis                │  revenue        │  platform       │
   │  ───────────── │  ────────────────── │  ────────────── │  ────────────── │
   │  patients+     │  catalog(test/comp) │  pricelist      │  tenants        │
   │   identifiers  │  orders             │  invoice        │  members        │
   │   entitlements │  specimen/accession │  ph-discounts   │  audit          │
   │  encounters +  │  results(versioned) │  philhealth     │  dsr/privacy    │
   │   amendments   │  verify→validate    │  hmo + LOA      │  retention      │
   │  diagnoses     │   →release(signed)  │  receipts       │                 │
   │  prescriptions │  critical + ack     │                 │  dental-lab     │
   │  visit journey │  qc/eqap/equipment  │                 │  (renamed)      │
   │  ob · dental   │  referral labs      │                 │                 │
   └───────┬─────────────────┬──────────────────────┬───────────────┬─────────┘
           │                 │                      │               │
   ┌───────▼───────┐ ┌───────▼────────┐  ┌──────────▼───────┐ ┌─────▼────────┐
   │ PostgreSQL    │ │ interface-     │  │ integration      │ │ ai-service   │
   │ RLS on EVERY  │ │ engine         │  │ ─────────────    │ │ ──────────── │
   │ tenant table  │ │ ASTM│HL7│CSV   │  │ FHIR R4 façade   │ │ de-identified│
   │ append-only   │ │ → ENTERED      │  │ PhilHealth       │ │ human review │
   │ audit         │ │   (never       │  │  eClaims         │ │ consent-gated│
   │               │ │    RELEASED)   │  │ HMO portals      │ │ budget-capped│
   └───────┬───────┘ └────────────────┘  └──────────────────┘ └──────────────┘
           │
   ┌───────▼────────────────────────────┐
   │ S3 + KMS — PHI, versioned, scanned │
   │ every object owned by a patient    │
   │ every download audited             │
   └────────────────────────────────────┘
```

---

## Sources

- [DOH HFSRB — Clinical Laboratory](https://hfsrb.doh.gov.ph/clinical-laboratory/) and [Public consultation on the proposed amendment of AO 2021-0037](https://hfsrb.doh.gov.ph/3313-2/)
- [DOH AO 2021-0037 summary — jur.ph](https://jur.ph/laws/summary/new-rules-and-regulations-governing-the-regulation-of-clinical-laboratories-in-the-philippines)
- [RA 5527, Philippine Medical Technology Act — Supreme Court E-Library](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/7439) · [PRC board law text](https://www.prc.gov.ph/sites/default/files/Medical%20Technology%20-%20Board%20Law_0.PDF)
- [RA 9994, Expanded Senior Citizens Act — Supreme Court E-Library](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/17035)
- [RA 10754, PWD discount and VAT exemption](https://batasnatin.com/doctrine/pwd-rights-discount-vat-exemption-ra-10754) · [DSWD/NCDA on RA 10754 implementation](https://old.dswd.gov.ph/pwds-can-already-avail-of-vat-free-purchases-under-ra-1054-ncda-welcomes-inquires-on-implementation-of-law/)
- [FDA Circular 2025-005 — purchase booklet delisted (per DOH AO 2024-0017)](https://www.fda.gov.ph/fda-circular-no-2025-005-delisting-of-purchase-booklet-from-the-checklist-of-requirements-to-avail-of-the-20-senior-citizen-discount-on-the-purchase-of-medicines-and-medical-devices-in-accordance-w/)
- [NPC Circular 16-03, Personal Data Breach Management (PDF)](https://privacy.gov.ph/wp-content/uploads/2022/01/sgd-npc-circular-16-03-personal-data-breach-management.pdf) · [NPC Breach Reporting](https://privacy.gov.ph/pips-and-pics/breach-reporting/)
- [PhilHealth Circular 2024-0013 — Enhancement of the Konsulta Benefit Package (PDF)](https://www.philhealth.gov.ph/circulars/2024/PC2024-0013.pdf) · [Konsulta Benefit Table, Annex B (PDF)](https://www.philhealth.gov.ph/circulars/2024/0013/Annex_B_Konsulta_Benefit_Table.pdf) · [PhilHealth issuances for providers](https://www.philhealth.gov.ph/yakap/issuances/)
- [DOH HFDB — AO 2023-0018 / document retention updates](https://sites.google.com/view/doh-hfdb/2023-updates/ao-2023-0018)

> **Caveat on regulatory sourcing.** `hfsrb.doh.gov.ph/clinical-laboratory/` returned HTTP 403 to direct fetch during this audit, and no official PDF of AO 2021-0037 or its Annexes was retrievable. Statements about the AO above are drawn from DOH/HFSRB pages surfaced in search plus the underlying statutes (RA 4688, RA 5527) from the Supreme Court E-Library and PRC. **Obtain the current AO text and Annexes A and C from HFSRB before implementing the service-capability matrix or the category-specific test lists.**
