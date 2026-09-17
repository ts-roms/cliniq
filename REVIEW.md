# ClinIQ — Project Review

**Date:** 2026-05-11
**Scope:** Feature completeness, code quality & architecture, testing coverage
**Method:** Deep-dive across `apps/` (api, web, mobile, ai-service), `libs/`, Prisma schema, CI/CD, and tests.

> TL;DR — ClinIQ is **much further along than the README implies**. Forty NestJS modules are real (not stubs), the web app ships ~50 pages across four portals (clinic, lab marketplace, platform admin, patient portal), the Prisma schema has 73 models with RLS forced on 55 tables, and the generated TS client exposes 290+ SDK functions. The README's "What's NOT done yet" section is out of date — most of those items are done. **The real gaps are in test coverage, AI guardrails, a handful of clinical entities, and several cross-cutting NestJS concerns.**

---

## 1. Headline findings

| # | Finding | Severity | Area |
|---|---|---|---|
| 1 | API unit-test coverage is ~2% (4 spec files vs 211 source files). `libs/auth`, `libs/db`, `libs/api-client`, `libs/ui` have **zero** tests. | **High** | Testing |
| 2 | Jest-based e2e specs (`tenant-isolation`, `lab`, `ob`, `queue`, `feature-gates`) exist but **don't run in CI**. Only `smoke.mjs` runs. | **High** | Testing / CI |
| 3 | `ai-service` transcribe is a hardcoded stub (`[stub transcript for s3://...]`). SOAP-from-audio chain is therefore broken end-to-end despite passing CI (eval harness has its own stub fallback). | **High** | AI |
| 4 | `ai-service` controllers carry only Swagger `@ApiBearerAuth` decoration — **no auth guard is registered**. Either it's expected to sit behind the api gateway, or it's an exposed surface. | **High** | Security |
| 5 | `AiBudget` model exists in Prisma and Bedrock logs token usage, but the ai-service **never queries the budget or refuses calls**. Cost ceiling is a TODO. | **High** | AI / cost control |
| 6 | Web auth proxy (`apps/web/proxy.ts`) only resolves tenant subdomain — it does **not enforce auth**. Every authed route group relies on client-side `useRequiredSession`. Tokens kept in `localStorage` ("cliniq.session"), read directly by `queue/page.tsx` for raw `fetch` calls. XSS-exposed. | **High** | Security |
| 7 | Dermatology AI is **not actually multimodal** — it forwards S3 keys as text in the user message. Real Bedrock vision is a TODO in the controller. | Medium | AI |
| 8 | No global NestJS exception filter, no rate limiting (`@nestjs/throttler`), no structured logger (Pino/Winston), no request-ID/correlation-ID middleware. | Medium | API ops |
| 9 | Soft-delete is inconsistent: only ~35 of 73 Prisma models carry `deletedAt`. Several clinical tables (Vital, Allergy, Medication, Condition, InvoiceItem, Payment, LabOrderItem) are hard-delete-only. | Medium | Data model |
| 10 | i18n: hand-rolled `en` + `ph` (Filipino) dict at `apps/web/shared/i18n/dict.ts`, but only ~5 pages reference `useT`. Pilot clinics will see English-only screens. | Medium | UX |
| 11 | `notifications/push.service.ts` queries `pushToken` by `userId` without tenant scope (raw prisma, not `withTenant`). Minor leak surface if a user existed across tenants. | Low–Med | Multi-tenant |
| 12 | `retention/retention.service.ts` self-documents an RLS bypass ("For MVP we trust the daemon") — only `audit` + `notifications` purges implemented, despite docstring claiming transcripts/audit/notifs/soft-delete. | Low | Data lifecycle |
| 13 | A11y: only ~18 `aria-`/`role=` occurrences across `apps/web/app/`. Many buttons (color swatches, tag delete) lack accessible names. No focus management on dialogs at the route level. | Medium | Accessibility |
| 14 | `libs/shared-types` is essentially the **features/plans catalog only** — no domain DTOs / Zod schemas / branded IDs. All cross-app type-sharing rides on the generated `@org/api-client`. | Low | Architecture |
| 15 | `libs/ui` ships **only shadcn primitives** — no clinic-specific components (PatientCard, AppointmentSlot, VitalsForm, PrescriptionRow). Every page rebuilds the same chrome. | Low | Reuse |

---

## 2. Feature completeness

### 2.1 API (40 modules, all classified as DONE)

The API surface is broad and consistent. Every module has working code with controllers, services, and DTOs. No stubs.

| Group | Modules |
|---|---|
| Identity & access | `auth` (5 routes, RBAC global guards), `mfa` (TOTP enroll/verify/recovery, 4 routes), `me` (6 routes), `delegations` (5 routes), `platform` (superadmin, 8 routes), `tenants` (3 routes) |
| Clinical | `patients` (6), `consultations` (9 + AI suggestions), `prescriptions` (6 + drug interactions), `clinical` (allergies/vitals/problems/history, 9), `dental` (perio + treatments, 5), `ob` (obstetric records, 9), `labs` (in-clinic orders, 7), `drugs` (formulary search), `icd-codes` (search) |
| Scheduling | `appointments` (4), `calendars` (iCal + feed token), `queue` (waiting-room, 7), `locations` (4) |
| Billing & finance | `billing` (6, invoice PDF), `hmo` (9 — eligibility/claims/payors), `inventory` (9 — FEFO + batches + movements) |
| Lab marketplace | `lab` (8 sub-controllers, 89 routes — cases, products, materials, compliance, invoices+PayMongo, disputes, tags, treatment plans, stats), `clinic` (clinic-side view, 30 routes across 5 sub-controllers) |
| Telemed | `tele` (11 routes — sessions, WebRTC signaling, 37 svc methods) |
| Compliance & ops | `audit` (global interceptor + `@Audit()` decorator), `consents` (global interceptor), `dsr` (DPA §16 export/erasure), `retention`, `files` (presign + janitor), `settings`, `notifications` (incl. push), `webhooks` (signed outbound, HMAC), `mailer` (Resend), `sms` (Semaphore/Twilio dual-provider) |
| Health & AI | `health` (rich readiness with env registry + migration drift), `ai-budget`, `ai-client`, `transcripts` |

**Multi-tenant correctness:** strong RLS strategy. `PrismaService.withTenant(tenantId, userId, fn)` runs inside a transaction and sets `app.current_tenant` / `app.current_user_id` GUCs (240 call-sites across 39 files). Boot guard refuses to start under a `BYPASSRLS` role unless `ALLOW_SUPERUSER_DB_CONN=1`. 21 files (56 sites) read prisma raw outside `withTenant`; spot-checks classify those as intentional (pre-tenant lookups in middleware/guards, system jobs, platform admin), with two real flags called out in §1 (push tokens, retention daemon).

**Cross-cutting present:** helmet, CORS, global `ValidationPipe` (whitelist + forbidNonWhitelisted), Swagger with bearer auth, rawBody for HMAC, global `APP_GUARD`s (Jwt, Rbac, Feature), global `APP_INTERCEPTOR`s (Audit, Consents).

**Cross-cutting missing:** no `APP_FILTER` (no global exception filter), no rate limiting, no structured logger, no request-ID/correlation-ID, no global timeout interceptor.

### 2.2 Web (Next.js 15 + React 19 — ~50 pages across 4 portals)

Every route inspected ships real UI: forms, queries via TanStack Query, error & loading states. No empty placeholders found.

- **Clinic app** `app/(app)/` — dashboard (overview grid, revenue chart, top services, no-show), patients (search + create + full chart with vitals/allergies/conditions/meds/HMO/consents/prescriptions/labs/dental/OB/ultrasound/invoices), consultations (SOAP editor + AI draft + tele launch + dermatology + labs), schedule (day picker + new-appt + iCal feed), queue (TV display + 5s polling), inventory (FEFO + lot alerts), notifications, audit (role-gated, cursor pagination), admin/settings, admin/claims, admin/dsr, lab-cases (+new+detail), lab-invitations, lab-invoices.
- **Lab marketplace** `app/lab/(authed)/` — cases (tag/status filters), billing (invoice CRUD + payments + void + PDF + payment links + monthly sweep), catalog, clinics (invite/revoke), materials (LOT tracking), compliance (conformity + consent templates), tags, stats.
- **Platform admin** `app/platform/(authed)/` — dashboard (tenants table), tenants/[id] (edit + features card). Top-level `/platform/tenants` list page is absent; the list lives at `/platform/dashboard`. Inconsistent naming.
- **Patient portal** `app/portal/` — overview, appointments (read-only list, no booking from portal), records, invoices, tele/[token] (WebRTC join with emergency notice).
- **Public** — marketing landing, pricing (en-PH), privacy/dpo/pia (DPA/NPC pages), login, signup.

**Known UI gaps:**
- No patient **edit form** rendered on patient detail page (PatientHeader/ContactCard components exist, but the page only exposes `onStartConsult`).
- Schedule page only lists appointments; no calendar/grid view, and reschedule/cancel row actions aren't visible at the page level.
- No user/role-management UI in `admin/settings` — covers tenant branding, delegations, broadcasts only.
- No `loading.tsx` / `error.tsx` route files anywhere in `app/` except one. Every page reimplements its own loading/error states inline — inconsistent UX.
- AI suggestions on consult: present but the `decide` mutation has no diff preview / confirm before applying.

### 2.3 Mobile (Expo + React Native + NativeWind v4 — 17 screens across 10 features)

The README claim that "mobile has no clinical screens yet" is **out of date**. Mobile has working screens but skews heavily read-only.

| Feature | Status | Notes |
|---|---|---|
| `auth/login` | DONE | i18n, password input, auto-refresh wired |
| `patients/patients-screen` | **PARTIAL** | List/refresh only — no search, no create, no edit |
| `patients/patient-detail-screen` | DONE | Vitals/allergies/meds/conditions + nested consults/prescriptions/invoices (read-only) |
| `appointments/schedule-screen` | **PARTIAL** | Day-paged list, no create/reschedule/cancel UI |
| `consultations/consult-detail-screen` | DONE | SOAP fields, AI generate, tele start/SMS, complete |
| `billing/invoice-list` | **PARTIAL** | Read-only; "PDF preview coming soon" — opens web |
| `prescriptions/prescription-list` | **PARTIAL** | Read-only; no create/dispense |
| `notifications` | DONE | List, mark-read, badge, 60s poll |
| `lab/*` (inbox, case, invoice, treatment-plans) | DONE | Decide endpoints wired |
| `portal/*` (home, appointments, records, invoices) | DONE | Read-only by design |

**Missing on mobile entirely:** inventory, queue, admin, dashboard, settings, audit — only patients/schedule/lab/portal/notifications surfaces are exposed.

### 2.4 AI service & prompts

- **Bedrock client** — real wrapper using `BedrockRuntimeClient` + `ConverseCommand`. Supports prompt caching (`cachePoint`), default model = Claude Sonnet 4.6. Logs tokens/cache/latency. **No streaming**, **no Haiku routing**, **no model fallback**, **no per-tenant budget enforcement** (the caller is expected to enforce, but no caller does).
- **drafts (SOAP)** — real Bedrock call, structured JSON, parsed and rejected if not JSON. No PHI redaction before send, no prompt-injection scrubbing of the transcript.
- **dermatology** — real Bedrock text call but **not actually multimodal** (TODO comment in controller). Forwards S3 keys as text.
- **lab-drafts (treatment plan)** — real Bedrock call, markdown output, temp 0.3.
- **transcribe** — **pure stub** returning `[stub transcript for s3://...]`, `provider: 'stub'`.
- **Prompts** — only 3 templates: `SOAP_V1`, `DERM_V1`, `LAB_TREATMENT_PLAN_V1`. Filename-based versioning (no semver/registry/shadow-version).
- **Evals** — runner works but datasets are tiny (3 SOAP + 3 derm cases). If `AI_SERVICE_URL` is unset, the runner falls through to a hand-coded stub responder that satisfies the golden cases. **Risk: CI green, prod broken.**

### 2.5 Shared libs

- **libs/db (Prisma)** — 73 models, 55 enums, 111 `@@index` declarations. RLS forced on 55 tables via GUC-based policies + `cliniq_app` role + `platform_rls_bypass` migration.
- **libs/ui** — 10 wrapped shadcn primitives, 5 Storybook stories, Tailwind preset present. No clinic-specific components.
- **libs/auth** — RBAC vocabulary (15 actions, 6 roles), dual-audience JWT (tenant vs platform + refresh audiences), TOTP primitives, bcryptjs hashing. **Gaps:** no NestJS guard shipped from the lib (those live in `apps/api`), no MFA recovery codes / backup helper here (the API module has them), no SSO/OIDC, no WebAuthn, HS256 only (no RS256/JWKS path — code-noted as "Switch when we add SSO").
- **libs/shared-types** — the public surface is **the features/plans catalog** (3 clinic plans + 3 lab plans, 42 feature flags, per-plan limits + PHP pricing, formatters). The `shared-types.ts` entrypoint is a one-line stub (`sharedTypes()` returns `'shared-types'`). No domain DTOs / Zod schemas / branded IDs.
- **libs/api-client** — generated `@hey-api/openapi-ts` client present; 290 exported symbols from `sdk.gen.ts`, 888 named re-exports from `index.ts`. Plus hand-written `configureAuth`, `configureActingAs` (`X-Acting-For` delegation), `configureAutoRefresh` (401 retry with single-flight + `x-cliniq-retry` guard). Good production patterns.
- **libs/ai-prompts** — see §2.4.

### 2.6 Missing clinical entities (vs a real clinic SaaS)

Captured from Prisma schema review against typical EMR/PMS feature sets:

- **Immunization / Vaccination record** — absent.
- **Referral** (outbound to specialists) — absent.
- **Waitlist** — absent (Queue exists for walk-ins, not future bookings).
- **Insurance policy** (beyond HMO) — `HmoMembership` covers HMO only; no private-insurance policy model.
- **FamilyHistory / SocialHistory / Lifestyle** — absent.
- **Structured LabResult / Observation (LOINC)** — `LabOrderItem` exists; no structured Observation table. Results are free-text only.
- **DiagnosticReport / ImagingStudy** — only `UltrasoundReport`/`UltrasoundFile`; no general imaging or DiagnosticReport.
- **PatientRelationship / Guardian** (for minors / dependents) — absent.
- **Document / Form templates** — only `LabConsentTemplate` / `LabConformityDocTemplate`; no general document or form template engine.
- **Tag / Label on patients** — only on lab cases.
- **SMS / email message log** (delivery receipts) — only `Notification`; no provider-side log.
- **Webhook / Event outbox** — webhooks dispatch is HMAC-signed but no outbox/retry table.
- **Payroll / HR / Staff scheduling** — absent.
- **Stripe / general payment gateway** — PayMongo exists only inside `lab/invoices/`; clinic-side `billing/` produces invoices + PDF but no payment-gateway capture.
- **OCR** — absent.
- **DocuSign / e-signature** — only lab compliance signatures; no patient consent e-sign integration despite `consents/` module.
- **HL7 / FHIR lab interop** — absent.
- **Patient portal messaging** (chat with clinic) — no dedicated module; only surfaces via `me/` and `tele/`.

---

## 3. Code quality & architecture

### 3.1 What's clean

- **NestJS layout consistent** — 40 modules, 52 controllers, 53 services, 35 `dto/` folders. One-per-feature pattern throughout.
- **DI correct** — the only `new` instantiations in `apps/api/src` are `AbortController` and the RLS test's `PrismaService` bootstrap. No service instantiations inside controllers.
- **Web shared-lib discipline** — 157 imports from `@org/{shared-types, api-client, auth, ui}` across `apps/web`. Zero raw `axios.` / `fetch(` calls in feature code, except the localStorage-token queue page noted in §1.
- **Module boundaries enforced** — `eslint.config.mjs` enforces `scope:web|mobile|api|shared` + `type:app|lib`. All 12 projects tagged correctly. No violations spotted.
- **Zero `@ts-ignore` / `@ts-expect-error`** across the codebase.
- **Zero empty `catch {}` blocks**.
- **Almost zero TODOs** — only 4 across the entire monorepo (2 are missing OG images on the marketing page, 1 is "presigned GETs for ai-service" in dermatology controller, 1 is in generated code).

### 3.2 Smells

| Smell | Count | Worst offenders |
|---|---|---|
| `console.*` | 22 | `apps/web/features/tele/hooks/use-webrtc-room.ts` (8), `libs/db/prisma/seed/index.ts` (5), `libs/ai-prompts/evals/runner.ts` (4) |
| `as any` | 2 | `apps/web/features/platform/lib/api.ts`, `apps/web/features/lab/lib/api.ts` |
| `: any` (non-d.ts) | 1 | `libs/ui/.storybook/main.ts:19` |
| Unwrapped `await prisma.*` | 116 sites | Many are intentional (NestJS surfaces Prisma errors via default exception filter), but worth a spot review once a custom filter is added. |

### 3.3 Architectural inconsistencies

- `health` and `transcripts` controllers have **no service file** — logic is inline. Convention deviation, not functional.
- `retention` module under-delivers vs its docstring (claims transcripts/audit/notifs/soft-delete; implements audit + notifications only).
- Web `queue` pages use raw `fetch` + `localStorage` token instead of the generated client. Two pages duplicate 5s polling logic.
- `/platform/tenants` list page missing; list lives at `/platform/dashboard`.

---

## 4. Testing coverage

| Project | Source files | Spec files | Ratio | Notes |
|---|---|---|---|---|
| apps/api | 211 | 4 | ~1.9% | `app.controller`, `app.service`, `interactions.spec`, `rls.integration.spec` |
| apps/api-e2e | 4 | 6 | n/a | Strong: tenant-isolation, lab, ob, queue, feature-gates, smoke |
| apps/ai-service | 21 | 2 | ~9.5% | Scaffold only |
| apps/ai-service-e2e | 3 | 1 | n/a | Boilerplate `GET /` |
| apps/web | 265 | 2 | ~0.8% | One feature spec + scaffold |
| apps/mobile | 34 | 1 | ~2.9% | Default `App.spec.tsx` |
| libs/db | 89 | 0 | 0% | Jest configured, no tests |
| libs/shared-types | 3 | 1 | ~33% | Trivial scaffold |
| libs/ui | 19 | 0 | 0% | Storybook present |
| libs/api-client | 19 | 0 | 0% | Custom transforms (auth/acting-as/refresh) untested |
| libs/auth | 5 | 0 | 0% | RBAC/JWT/TOTP — untested |
| libs/ai-prompts | 7 | 0 | 0% | Has `eval-soap` target instead |

**E2E:** `apps/api-e2e` has 18 `it()` cases across 6 files booting a real Postgres via `support/harness.ts` and the `cliniq_app` RLS role. **But these don't run in CI** — `ci.yml` invokes `nx affected -t test` (which excludes e2e per nx.json plugin config) plus a dedicated `api-integration` job that only runs `apps/api-e2e/src/integration/smoke.mjs`. The README's "RLS leak test in CI" claim is technically backed by `apps/api/src/common/rls.integration.spec.ts` (which does run) rather than the broader `tenant-isolation.spec.ts`.

**CI/CD workflows:**
- `ci.yml` — affected lint/test/build with Postgres service + `cliniq_app` RLS role + migrate deploy + format check; then `api-integration` smoke; then `docker-api` PR-only image build.
- `cd-api.yml` — ECR push + ECS deploy on `main`.
- `cd-web.yml` — Next.js build + deploy on `main`.
- `terraform.yml` — plan on PRs touching infra, apply on dispatch.

---

## 5. Recommendations — ordered by impact

### P0 — do this sprint
1. **Stand up real auth on `ai-service` controllers** (or document the gateway-only access pattern and lock the security group). Add a JWT `UseGuards` or block the listener.
2. **Wire `AiBudget` enforcement** — every Bedrock call should pre-check tenant budget, reserve tokens, decrement on response. Without this, a runaway prompt can rack up costs.
3. **Replace `transcribe` stub** with AWS Transcribe (or Whisper). The SOAP-from-audio chain currently produces garbage in production.
4. **Run the existing Jest e2e specs in CI.** They exist and are good; add an `e2e` job to `ci.yml` that runs `nx run-many -t e2e` against the same Postgres service.
5. **Move web auth tokens off `localStorage`** to httpOnly + Secure + SameSite cookies. Tokens currently readable by XSS; the raw-fetch queue pages make that worse.
6. **Add a global `APP_FILTER` exception filter + structured logger (Pino) + request-ID middleware + `@nestjs/throttler`.** Four small changes that buy a lot of operability.

### P1 — next 2–4 sprints
7. **Cover the security & data layers with unit tests** — `libs/auth` (RBAC matrix, JWT verify, TOTP), `libs/api-client` (refresh/retry/single-flight), `libs/db` (`withTenant` GUC roundtrip).
8. **Fill missing clinical entities** in priority order: Immunization, Referral, PatientRelationship/Guardian, FamilyHistory, structured LabResult/Observation with LOINC. Each is a thin Prisma model + a small CRUD module.
9. **Patient edit form on web** — the page renders the chart but not an edit pathway.
10. **Calendar/grid view + reschedule/cancel actions** on schedule page.
11. **i18n rollout** — wire `useT` across all clinic-app pages, not just five. Filipino pilots will see English-only otherwise.
12. **Mobile parity for write paths** — patient create/edit, appointment booking, prescription create. Mobile is currently a read-mostly companion app.

### P2 — this quarter
13. **Real multimodal dermatology** — replace S3-key text forwarding with Bedrock vision (or document the deferral).
14. **Streaming + Haiku routing** in `bedrock.service` — Haiku for cheap classifications, Sonnet for SOAP, with cost-aware fallback.
15. **PHI redaction + prompt-injection scrubbing** before any text leaves the api into Bedrock.
16. **Soft-delete pass** on the 38 clinical/finance models currently hard-delete-only (Vital, Allergy, Medication, Condition, InvoiceItem, Payment, LabOrderItem, dental sub-rows, queue tickets, notifications).
17. **`/platform/tenants` list route** (currently lives at `/platform/dashboard` — name it correctly).
18. **`loading.tsx` + `error.tsx` route files** for the app router groups. Will fix the inconsistent inline-loading-state pattern at the route boundary.
19. **A11y pass** — every interactive control should have an accessible name; dialogs need focus traps.
20. **Tenant-scope the `pushToken` reads** in `notifications/push.service.ts`; or document why a user-id global lookup is safe.
21. **Finish `retention.service.ts`** — implement transcripts + soft-delete purges to match the docstring; remove the "trust the daemon" RLS bypass.
22. **Storybook + visual tests for `libs/ui`** — 5 stories is too few; aim for one per primitive.
23. **Clinic-specific UI library** — extract PatientCard, AppointmentSlot, VitalsForm, PrescriptionRow, etc. into `libs/ui` to stop repeating page chrome.

### P3 — backlog
24. **Stripe (or expand PayMongo) on clinic-side billing.**
25. **Payroll / staff scheduling / HR module.**
26. **HL7 / FHIR lab interop.**
27. **OCR for paper records intake.**
28. **DocuSign for patient consents.**
29. **Patient portal messaging.**
30. **Webhook outbox + retry table.**
31. **RS256 / JWKS** rotation in `libs/auth` ahead of SSO/OIDC work (already flagged in code).

---

## 6. Files / locations cited

- `apps/api/src/common/tenant-context.middleware.ts` — tenant resolution from subdomain/JWT
- `libs/db/src/lib/prisma.service.ts` — `withTenant` + RLS boot guard
- `apps/api/src/retention/retention.service.ts:38-40` — self-documented RLS bypass
- `apps/api/src/notifications/push.service.ts` — non-tenant-scoped `pushToken` reads
- `apps/api/src/transcripts/transcripts.controller.ts` — controller-only (no service)
- `apps/ai-service/src/transcribe/*` — hardcoded stub
- `apps/ai-service/src/dermatology/dermatology.controller.ts:68` — vision TODO
- `apps/ai-service/src/main.ts` — no JWT guard registration
- `apps/web/proxy.ts` — tenant resolution only, no auth enforcement
- `apps/web/app/(app)/queue/page.tsx` — raw fetch + localStorage token
- `apps/web/features/tele/hooks/use-webrtc-room.ts` — 8× `console.*`
- `apps/api-e2e/src/tenant-isolation.spec.ts` — RLS e2e (not currently in CI)
- `apps/api/src/common/rls.integration.spec.ts` — RLS integration test (in CI)
- `.github/workflows/ci.yml` — affected + api-integration + docker-api smoke
- `libs/db/prisma/schema.prisma` — 73 models, 55 RLS tables
- `libs/auth/src/lib/*` — RBAC + JWT + TOTP
- `libs/api-client/src/configure-auth.ts` — token interceptor + refresh + acting-as
