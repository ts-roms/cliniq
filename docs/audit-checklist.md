# ClinIQ — Application Audit Checklist

> **Audited:** 2026-09-17 against `main` @ `3fcf1ad`
> **Baseline:** `../docs/04-mvp-build-plan.md` (16-week MVP scope) + `00-overview.md` differentiators
> **Method:** static read of `apps/*`, `libs/*`, `.github/workflows/*`, Prisma schema + migrations, `.env.example`; grep for feature markers. No runtime testing.

The codebase is well past the MVP plan on breadth (40 API modules, 52 controllers,
~120 Prisma models, 37 migrations, a full dental-lab marketplace, queueing, OB/GYN,
telemed, HMO, inventory). What is missing is mostly **depth on the core clinic loop**,
**auth hardening**, **observability**, and **test coverage**. Items are ordered by
severity; each has a file pointer so it can be picked up directly.

Legend: `[ ]` missing · `[~]` partial / stubbed · `[x]` present (listed only where it
matters for context)

---

## P0 — Security / data-integrity (fix before any real clinic data)

- [ ] **Open self-registration into any tenant.** `POST /api/auth/register` is
  `@Public()` and only needs a `tenantSlug`; the user is created as an `ACTIVE`
  `RECEPTIONIST` with full patient-read access. Slugs are public (`GET /tenants/:slug`
  is `@Public()`, and slugs are the subdomain). Anyone can join any clinic.
  → `apps/api/src/auth/auth.service.ts:55-78`, `apps/api/src/tenants/tenants.controller.ts:29-33`
  Fix: replace with an invite flow (token emailed by OWNER/ADMIN), or gate
  register behind a one-time invite code. Default new members to `PENDING`.
- [ ] **No staff management endpoints.** `tenantUser.update` is never called
  anywhere in the API — there is no way to promote/demote a role, deactivate a
  member, or remove someone from a tenant. The register comment says "rely on an
  OWNER/ADMIN to promote them", but nothing implements that.
  → new `members` module (list / invite / change-role / deactivate) + web UI under
  `admin/settings`.
- [ ] **No rate limiting anywhere on the API.** `@nestjs/throttler` is not installed.
  `/auth/login`, `/auth/register`, `/tenants` (public create), `/auth/patient-register`,
  MFA verify, and the PayMongo webhook are all unthrottled. The tenants controller
  comment defers this to "the edge", but there is no edge (no WAF / CloudFront rule
  in `infra/terraform/`).
  → `apps/api/src/main.ts`, `apps/api/src/app/app.module.ts`
- [ ] **No account lockout / failed-login tracking.** Combined with no throttling,
  password brute-force is unbounded. `platform-auth.service.ts:48` explicitly notes
  lockouts are not implemented.
- [ ] **Refresh tokens are stateless and cannot be revoked.** `auth.service.ts:190`
  verifies a JWT with `audience=cliniq-refresh` and re-issues; there is no server-side
  session/refresh table, no rotation-with-replay-detection, no logout endpoint.
  A stolen refresh token is valid for the full 7 days.
  → add `RefreshSession` model (hash, userId, expiresAt, revokedAt), rotate on use,
  `POST /auth/logout`, "sign out everywhere".
- [ ] **No password reset / forgot-password.** Zero hits for `reset-password` /
  `forgot-password` in `apps/` or `libs/`. Clinic staff who forget a password have
  no recovery path except a DB edit.
- [ ] **Web session is in `localStorage`, not an httpOnly cookie.**
  `apps/web/features/auth/session.ts:3` says "swap for httpOnly cookies";
  `apps/web/middleware.ts:38,51` sets `httpOnly: false`. Any XSS = full token theft.
  Two pages also hand-roll `localStorage.getItem('cliniq.session')` for fetches
  (`(app)/queue/page.tsx:79`, `(app)/queue/display/page.tsx:43`) instead of going
  through `@org/api-client`.
- [ ] **ai-service has no authentication.** No `X-AI-Service-Token` / shared secret;
  only `helmet()`. If it is reachable on the network (Railway public domain, or the
  ECS service without a private SG), anyone can burn Bedrock budget and submit PHI.
  → `apps/ai-service/src/main.ts`; `webhooks.service.ts:90` reuses `JWT_SECRET` as
  a shared secret elsewhere — do the same with a dedicated `AI_SERVICE_TOKEN`.
- [ ] **Appointment status machine is half-wired.** `IN_PROGRESS`, `COMPLETED`, and
  `NO_SHOW` are never written by any code path (`grep AppointmentStatus.NO_SHOW` →
  0 hits outside the enum). `reports/no-shows` queries a status nothing sets, and the
  no-show prediction differentiator (overview §3 #4) has no data feeding it.
  → `apps/api/src/appointments/appointments.service.ts:193-221` — only `CHECKED_IN`
  and `CANCELLED` transitions exist.

## P1 — Core-loop functional gaps vs. the MVP plan

### Auth & onboarding (plan Phase 1)
- [ ] Invite-user flow with magic link via Resend (plan wk 4) — see P0 above.
- [ ] MFA is opt-in via `/mfa/setup`; the plan says **mandatory for clinical roles**.
  No enforcement that DOCTOR/NURSE/OWNER have TOTP enrolled; no `@RequiresMfa`
  gating found on clinical routes despite the e2e plan referencing it.
- [ ] WebAuthn / passkeys (README "planned") — not started.
- [ ] Tenant self-signup creates no sample data; plan calls for "sample data" on signup
  (`tenants.service.ts:75`).
- [ ] Clinic settings: only `GET`/`PATCH /settings`. No branding upload (logo/colours),
  no business-hours model — both are in the plan and the latter blocks scheduling below.

### Patients (plan wk 5)
- [ ] CSV import (name/DOB/phone/email) — 0 hits for `csv` in source.
- [ ] Full-text search: plan says `tsvector`; current search is `ILIKE`/contains
  (0 hits for `tsvector`/`to_tsquery`). Fine at pilot scale, will not scale.
- [~] Patient profile tabs exist on web; mobile `patients-screen.tsx` is read-only
  (no create/edit).

### Appointments (plan wk 6–7)
- [ ] **Provider availability rules** (working hours, breaks, days off) — not modelled.
  0 hits for `availability` / `workingHours`.
- [ ] **Reschedule** endpoint — only `create / list / check-in / cancel` exist.
- [ ] **Slot conflict detection** — no DB exclusion constraint or service-level overlap
  check on `Appointment(providerId, startsAt, endsAt)`.
- [ ] **Waitlist** — 0 hits.
- [ ] **Public per-tenant booking page** — `portal/*` requires patient login; there is
  no anonymous `book.<slug>.cliniq.app` flow.
- [~] Reminders: an in-process `setInterval` loop in `appointments.service.ts:43-51`,
  default **off** (`APPT_REMINDERS_ENABLED=false`). Single lead time (60 min), not the
  planned 24h + 1h. Runs inside the API process, so it double-fires with >1 replica
  and dies with the pod. Needs a worker (`@nestjs/schedule` is installed but unused
  for this) or an external scheduler.
- [ ] Calendar week/day view: `schedule/page.tsx` exists; verify it is a real calendar
  and not a list (not verified in this audit).

### Consultations & AI scribe (plan wk 8–10)
- [~] **Transcription is a stub.** `ai-service/src/transcribe/transcribe.controller.ts:19-39`
  returns `[stub transcript for s3://…]` with `provider: 'stub'`. No Whisper / Amazon
  Transcribe integration, no async job, no audio retention policy (delete after 30d).
  This is differentiator #1 in the overview.
- [~] Browser audio capture: `MediaRecorder` referenced in 2 files — verify chunked
  upload to S3 actually works end-to-end with the stub.
- [ ] **Dermatology image fetch is a TODO** — `dermatology.controller.ts:68` notes
  ai-service cannot read the S3 object until the API emits short-lived presigned GETs.
- [ ] Rich-text SOAP editor (Tiptap) — 1 hit only; likely plain textarea.
- [ ] Consultation completion locks notes and "edit creates revision" — `locked`/
  `revision` hits exist (17); verify a revision row is actually written, not just a
  boolean flag.
- [ ] Prompt caching on system+patient context (target 80% hit) — no `cache_control`
  usage found in `ai-service/src/bedrock`.
- [~] AI budget cap exists (`ai-budget` module) — verify alert-at-80% is wired to
  `notifications`.

### Prescriptions (plan wk 11)
- [x] Drug catalog, precheck (interactions + allergy), PDF, cancel — present.
- [ ] Doctor e-signature image + license number on the Rx PDF — `signature` hits are
  mostly lab consent; confirm `prescriptions/pdf` renders a signature block.
- [ ] Patient receives Rx via email on issue — no mailer call found in
  `prescriptions.service.ts` (not verified line-by-line; grep `mailer` there).

### Billing & payments (plan wk 12–13)
- [x] Services, invoices, manual payments, invoice PDF — present.
- [ ] **Online payments for clinic invoices.** PayMongo is wired **only** for the lab
  marketplace (`apps/api/src/lab/invoices/paymongo-webhook.controller.ts`). Clinic-side
  `billing` has no payment-link creation or webhook. GCash/Maya appear only as enum
  values for manual entry.
- [ ] Auto-generate invoice on consultation completion (configurable) — not found.
- [ ] Overdue status / dunning — `InvoiceStatus` has no `OVERDUE` transition job.
- [ ] Receipt email on payment — not found.
- [ ] Idempotency keys on payment creation — 0 hits for `idempotency`.

### Patient portal (plan wk 14)
- [x] Login, signup, appointments, invoices (+PDF), records, tele.
- [ ] Self-book appointment from portal — `me.controller.ts` is read-only
  (`GET profile / appointments / invoices / records / tele/active`). No `POST`.
- [ ] Update contact info / allergies with clinic review — no write path.
- [ ] Download prescriptions from portal — no `me/prescriptions` route.

### i18n
- [~] Web: `apps/web/shared/i18n/dict.ts` exists but is imported by **3** files
  (header + 2). ~45 pages are hard-coded English. Mobile portal screens are wired.
  Plan says "i18n scaffolded for Tagalog" — the scaffold exists, the coverage doesn't.
- [ ] No Tagalog strings anywhere (0 hits for common Filipino words).

## P2 — Platform, ops, observability

- [ ] **No error tracking.** Sentry is in the plan (wk 1) and budget; 0 hits in code,
  `.env.example`, or `docker-compose.yml`.
- [ ] **No product analytics.** PostHog: 0 hits.
- [ ] **No structured logging.** Nest default `Logger` only; no pino/winston, no request
  IDs, no tenant/user correlation on log lines. Breach-response runbook
  (`docs/runbooks/breach-response.md`) assumes you can trace a request — you can't.
- [ ] **No metrics / tracing.** No OpenTelemetry, no `prom-client`, no `@nestjs/terminus`
  readiness probes beyond the hand-rolled `health` module. Plan target "API p95 < 300ms"
  is unmeasurable.
- [ ] **No background-job system.** No BullMQ/Redis/SQS. Reminders, retention janitor,
  file janitor, and (future) transcription all run as in-process intervals gated by env
  flags that default to `false`. Multi-replica deploys will double-run them.
- [ ] **No web CI/CD for Railway.** `docs/railway.md` + `tools/scripts/railway-setup.sh`
  exist, but `.github/workflows/cd-*.yml` target ECS/ECR only. Which deploy target is
  canonical? Pick one; delete or mark the other.
- [ ] **Terraform `prod` environment is uncommitted config only** — `environments/prod/`
  has no `*.tfvars.example`, and `README` says bootstrap has never been run.
- [ ] `deploy.log` is committed at the repo root — should be gitignored.
- [ ] No `dependabot.yml` / Renovate, no `CODEOWNERS`, no `SECURITY.md`.
- [ ] No `pnpm audit` / secret-scan step in `ci.yml` (plan wk 15 "security pass").
- [ ] Docker `web` image builds with `NEXT_PUBLIC_API_URL` baked at build time; there
  is no per-environment build in CI for staging vs prod.
- [ ] Backup/restore drill — runbook exists (`docs/runbooks/backup-restore.md`) but
  there is no evidence it has been executed (plan DoD: "tested in production").

## P3 — Test coverage

Numbers from `find … -name '*.spec.*'`:

| Project | Spec files | Notes |
|---|---|---|
| `apps/api` | 4 | 2 are Nx boilerplate; real: `rls.integration.spec.ts`, `interactions.spec.ts`. **~2% of 40 modules.** |
| `apps/api-e2e` | 6 | Good harness; covers tenant-isolation, feature-gates, lab, ob, queue, smoke. 34 modules have zero e2e. |
| `apps/ai-service` | 2 | Boilerplate only. |
| `apps/web` | 2 | 1 real (`resolve-subdomain`). No Playwright project. |
| `apps/mobile` | 1 | Boilerplate `App.spec.tsx`. |
| `libs/auth` | **0** | RBAC matrix, JWT sign/verify, TOTP — all untested. |
| `libs/db` | **0** | `withTenant()` GUC roundtrip untested at unit level. |
| `libs/ui` | **0** | No Storybook stories either (`@nx/storybook` installed, 0 `*.stories.*`). |
| `libs/api-client` | 0 | Refresh single-flight / retry untested. |

- [ ] Follow `docs/e2e-testing-plan.md` (currently **untracked** in the main checkout —
  commit it). Its Phase 2 references P0-2 (throttler), P0-3 (ai-service secret),
  P0-6 (cookie auth) as prerequisites; none of those P0s are done (see above).
- [ ] Prompt eval gate: `libs/ai-prompts/evals/*` exist and run against a stub, but no
  CI job runs them.
- [ ] No coverage reporting/ratchet in CI.

## P4 — Docs & hygiene

- [ ] `README.md` "What's NOT done yet" is stale: says the schema is "a starter
  (Tenant, User, TenantUser, Patient)" (`README.md:155`) and migrations "haven't been
  applied" — neither is true. It also omits every module added after May 2. Rewrite
  as a pointer to this checklist.
- [ ] README references `../docs/00-overview.md` etc. (outside the repo). Either vendor
  the planning docs into `docs/planning/` or make the link explicit that it's a sibling
  folder.
- [ ] `og.png` social image TODO — `apps/web/app/page.tsx:18,24`.
- [ ] `docs/lab-module-plan.md`, `docs/railway.md` — no "status" header; unclear what is
  done vs. planned.
- [ ] Nx Cloud "provisioned but not connected" (README) — connect or remove
  `nxCloudId` from `nx.json`.

## Not in scope of the plan but already built (for awareness)

These exist and add maintenance surface; each needs the same P0 treatment (auth, tests,
observability) as the core:

Dental lab marketplace (`lab/*`, `clinic/lab-*`, 20+ models, PayMongo), queueing +
display board, OB/GYN + ultrasound, telemedicine (WebRTC + TURN), HMO claims, inventory
with lots, dental charting, delegations / acting-as, DSR + retention, platform-admin
console, calendar feeds, push notifications, ICD codes, multi-location.

---

## Suggested order of attack

1. **Week 1 — P0 auth:** invite flow + members module + close open register; throttler;
   lockout; refresh-token table + logout; forgot-password; `AI_SERVICE_TOKEN`.
2. **Week 2 — P0 appointments + P2 ops:** finish the status machine (no-show /
   complete / reschedule), availability + conflict check; add Sentry + pino + request
   IDs; move reminders/janitors to a worker.
3. **Week 3 — core-loop depth:** real transcription (Amazon Transcribe is in-region for
   `ap-southeast-1`), presigned GET for dermatology, clinic-side PayMongo, portal
   self-booking.
4. **Week 4+ — tests:** execute `docs/e2e-testing-plan.md` Phases 1–2; `libs/auth` and
   `libs/db` unit specs; Playwright project.
