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

> **Status (2026-09-17):** every P0 item below is done on
> `claude/application-audit-checklist-*` — see `apps/api/src/members/`,
> `apps/api/src/auth/`, `apps/api/src/common/throttle.config.ts`,
> `apps/ai-service/src/common/service-auth.guard.ts`, migration
> `20260917000000_auth_hardening`, and `apps/api-e2e/src/auth-hardening.spec.ts`
> (11 e2e cases). Deployment needs two new secrets: `AI_SERVICE_TOKEN` (both
> api + ai-service) and, behind a proxy, `TRUST_PROXY=1`.

- [x] **Open self-registration into any tenant.** `POST /auth/register` now
      requires an `inviteToken` (from `POST /members/invites`) or the one-shot
      `bootstrapToken` that `POST /tenants` returns for a password-less create
      (first OWNER only, 15 min, bound to `ownerEmail`). A slug alone → 403.
- [x] **No staff management endpoints.** New `members` module: list, invite /
      resend / revoke, change role, suspend / reactivate, remove. Rules: ADMIN
      can't grant or touch OWNER, nobody edits themselves, last active OWNER can't
      be demoted/suspended/removed, PATIENT memberships are out of scope. Web UI:
      "Team" card on `/admin/settings`; accept page at `/signup?invite=…`.
- [x] **No rate limiting.** `@nestjs/throttler` global guard (`THROTTLE_LIMIT`
      per `THROTTLE_TTL_MS` per ip) + a tight `THROTTLE_AUTH_LIMIT` bucket on
      login / register / refresh / forgot / reset / tenant signup / MFA verify /
      platform login. In-process storage — swap for Redis when >1 replica.
- [x] **No account lockout.** `AUTH_LOCKOUT_THRESHOLD` failed password/TOTP
      attempts → `AUTH_LOCKOUT_MINUTES` lock (`users.failedLoginCount / lockedUntil`).
- [x] **Refresh tokens stateless / unrevocable.** `refresh_sessions` table;
      rotation on every refresh with replay detection (re-presenting a rotated
      token revokes the whole user+tenant family); `POST /auth/logout`,
      `POST /auth/logout-all`; suspension / removal / role change / password reset
      revoke sessions. Access tokens still live to `JWT_EXPIRES_IN` — keep it short.
- [x] **No password reset.** `POST /auth/forgot-password` (always 200) +
      `POST /auth/reset-password`; web pages `/forgot-password`, `/reset-password`.
- [x] **ai-service unauthenticated.** `ServiceAuthGuard` checks
      `X-AI-Service-Token` against `AI_SERVICE_TOKEN`; refuses to boot in
      production without it. The api's `AiClientService` sends it.
- [x] **Web session moved to httpOnly cookies** (merged from the May-2026 local
      work, `wip/main-local-2026-05`): the auth routes set `cliniq.access` /
      `cliniq.refresh` (refresh scoped to `/api/auth`), `JwtAuthGuard` falls back
      from the bearer header to the cookie, `/auth/refresh` and `/auth/logout` read
      the cookie, `apps/web/proxy.ts` replaces `middleware.ts`, and `session.ts`
      keeps only user metadata in `localStorage`. Mobile keeps bearer tokens.

- [x] **Appointment status machine.** Transition table in
      `apps/api/src/appointments/appointment-transitions.ts` (SCHEDULED → CHECKED_IN →
      IN_PROGRESS → COMPLETED, with CANCELLED / NO_SHOW branches; illegal moves 409).
      New routes: `GET :id`, `PATCH :id/start` (opens the consult), `:id/complete`,
      `:id/no-show`, `:id/reschedule`, `POST no-show-sweep` (admin); `?status=` filter.
      `POST /consultations` takes `appointmentId`; completing the consult completes the
      slot. Lifecycle timestamps (`checkedInAt … noShowAt`, `cancelReason`) on the row.
      Provider double-booking refused twice: service pre-check (409 with the clashing
      id) + a `btree_gist` exclusion constraint on live rows. Auto no-show sweep
      (`APPT_AUTO_NOSHOW_ENABLED`, `APPT_NOSHOW_GRACE_MINUTES`) on the reminder timer.
      Web schedule rows expose every legal action + a reschedule dialog.
      `reports/no-shows` now has data. Migration `20260917100000_appointment_lifecycle`.

### Follow-ups surfaced while doing P0

- [x] `JwtAuthGuard` acting-for path now reads `tenantUser` inside `withTenant`
      (came with the wip merge).
- [x] Fixed in the merge: every login/register audit row was failing with "new
      row violates row-level security policy" — Prisma's `create` appends
      `RETURNING`, which Postgres checks against the SELECT policy, and a null-tenant
      row can never pass it. `AuditService` now uses `createMany` (no RETURNING).
- [x] Fixed in the merge: `PrismaService` had no `pushToken` proxy, so the first
      push notification crashed the process (unhandled rejection).
- [x] Fixed in the merge: the wip `AllExceptionsFilter` dropped every structured
      field off HttpException bodies (`mfaRequired`, `missingFeatures`, the 422
      `reason`/`overridable`, `problems`); it now preserves them inside the envelope.

- [ ] Multi-tenant users: an invite to an email that already has an account is
      refused (409). Needs an "accept while signed in" path + tenant switcher.
- [x] Platform-admin login has no lockout / refresh-session table (only the
      throttle bucket). Mirror the tenant-side treatment.
      → `platform_refresh_sessions` + `failedLoginCount`/`lockedUntil` on
      `platform_admins` (migration `20260923160000_platform_auth_hardening`).
      Lockout counts bad TOTP codes too, so a known password cannot be used to
      brute-force the second factor. Refresh rotates with replay detection,
      `POST /platform/auth/logout` revokes server-side (it used to only clear
      the cookie, leaving the token good for its full 7 days) and
      `logout-all` ends every session. The console's "Sign out" now calls it —
      before, it cleared localStorage and hid the nav, nothing more.
      Not covered: no sweep of expired session rows, matching the tenant side.
- [ ] Access tokens keep working for up to `JWT_EXPIRES_IN` after suspension /
      removal. Either accept the 15-min window or add a per-request membership
      check in `JwtAuthGuard` (one indexed query, must run inside `withTenant`).
- [ ] Throttler storage is per-process; multi-replica deploys need
      `ThrottlerStorageRedis`.

## P1 — Core-loop functional gaps vs. the MVP plan

### Auth & onboarding (plan Phase 1)

- [x] Fixed in passing: `PLAN_FEATURES` / `LAB_PLAN_FEATURES` were built with
      `[...set]` which swc-loose compiles to `[].concat(set)` — PREMIUM tenants lost
      every PRO feature at runtime (`libs/shared-types/src/lib/features.ts`, now
      `Array.from`, with `features.spec.ts` asserting the ladders).
- [x] Fixed in passing: `LabClinicLinksService.isLinkActive` ran a raw query with
      no tenant GUC → always false under `cliniq_app` (clinic could never submit a
      lab case). Now wrapped in `withTenant`.
- [x] Invite-user flow via Resend (plan wk 4) — done, see P0 above.
- [ ] MFA is opt-in via `/mfa/setup`; the plan says **mandatory for clinical roles**.
      No enforcement that DOCTOR/NURSE/OWNER have TOTP enrolled; no `@RequiresMfa`
      gating found on clinical routes despite the e2e plan referencing it.
- [ ] WebAuthn / passkeys (README "planned") — not started.
- [ ] Tenant self-signup creates no sample data; plan calls for "sample data" on signup
      (`tenants.service.ts:75`).
- [ ] Clinic settings: no branding _upload_ (logo/colours are URL/hex fields only).
      Business hours exist (`settings.operatingHours`) and now feed scheduling.

### Patients (plan wk 5)

- [ ] CSV import (name/DOB/phone/email) — 0 hits for `csv` in source.
- [ ] Full-text search: plan says `tsvector`; current search is `ILIKE`/contains
      (0 hits for `tsvector`/`to_tsquery`). Fine at pilot scale, will not scale.
- [~] Patient profile tabs exist on web; mobile `patients-screen.tsx` is read-only
  (no create/edit).

### Appointments (plan wk 6–7)

- [x] **Provider availability rules.** `provider_availability` (weekly HH:mm ranges in
      the tenant timezone; several per day = breaks) + `provider_time_off` (dated blocks).
      Fallback: provider rules → clinic `settings.operatingHours` → unrestricted. Booking /
      reschedule outside them → 422 with a reason; `force: true` overrides (audited); time
      off that would cover live appointments → 409. `GET /providers`,
      `GET/PUT /providers/:id/availability[/schedule]`, `…/time-off`, and
      `GET …/availability/slots?date=` (free slots minus bookings + time off — what portal
      self-booking will consume). Web: availability card on `/admin/settings`; the booking
      dialog has a provider picker + free-slot chips + "book anyway" on a 422.
      Engine is pure (`apps/api/src/availability/availability.engine.ts`, 12 unit cases incl.
      a DST zone). Migration `20260917120000_provider_availability`.
- [x] Fixed in passing: `GET/PATCH /tenants/me/settings` ran outside the tenant context
      and the `tenants` table had no self-UPDATE policy — settings could neither be read
      nor saved under `cliniq_app`. Now `withTenant` + `tenants_self_update` policy.
- [x] **Reschedule** endpoint — `PATCH :id/reschedule` (see P0).
- [x] **Slot conflict detection** — service overlap check + DB exclusion constraint
      (see P0). Note: the constraint will refuse to apply on a DB that already holds
      overlapping live appointments for one provider — clean those up first.
- [x] Fixed in passing: the reminder sweep queried `appointments` with no tenant GUC
      → saw nothing under `cliniq_app`, so reminders never fired. Now runs in platform
      context with matching `appointments_platform_*` RLS policies.
- [ ] **Waitlist** — 0 hits.
- [ ] **Public per-tenant booking page** — `portal/*` requires patient login; there is
      no anonymous `book.<slug>.cliniq.app` flow.
- [~] Reminders (+ the new auto no-show sweep): an in-process `setInterval` loop,
  default **off**. Single lead time (60 min), not the planned 24h + 1h. Runs inside
  the API process, so it double-fires with >1 replica and dies with the pod. Needs a
  worker (`@nestjs/schedule` is installed but unused for this) or an external scheduler.
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

| Project           | Spec files | Notes                                                                                                  |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `apps/api`        | 4          | 2 are Nx boilerplate; real: `rls.integration.spec.ts`, `interactions.spec.ts`. **~2% of 40 modules.**  |
| `apps/api-e2e`    | 6          | Good harness; covers tenant-isolation, feature-gates, lab, ob, queue, smoke. 34 modules have zero e2e. |
| `apps/ai-service` | 2          | Boilerplate only.                                                                                      |
| `apps/web`        | 2          | 1 real (`resolve-subdomain`). No Playwright project.                                                   |
| `apps/mobile`     | 1          | Boilerplate `App.spec.tsx`.                                                                            |
| `libs/auth`       | **0**      | RBAC matrix, JWT sign/verify, TOTP — all untested.                                                     |
| `libs/db`         | **0**      | `withTenant()` GUC roundtrip untested at unit level.                                                   |
| `libs/ui`         | **0**      | No Storybook stories either (`@nx/storybook` installed, 0 `*.stories.*`).                              |
| `libs/api-client` | 0          | Refresh single-flight / retry untested.                                                                |

- [~] `docs/e2e-testing-plan.md` is now committed (wip merge). Phase 1 (per-module
  api specs) and Phase 4 (Playwright `apps/web-e2e`) landed with it, but were
  written ahead of the api and had never run green — see the quarantine below.
  P0-2 / P0-3 / P0-6 prerequisites are all done now.
- [x] `ci.yml` api-integration job runs `nx run @org/api-e2e:e2e` after the smoke
      script: **30 spec files / 190 cases** gate the PR (9 original + 21 wip module
      files that pass). The `web-e2e` Playwright job runs with `continue-on-error`
      until it has passed once.
- [x] **Playwright suite status**: **93 passed / 0 failed / 1 skipped** (2026-09-18)
      across chromium, firefox, webkit, the 4 viewports and the a11y project; the
      `web-e2e` job now gates CI (`continue-on-error` removed). The 27 failures from
      the first run (2026-09-17, PR #4) were four root causes, none of them
      product logic:
  - `webkit-clinic` ×12 + `tablet-768` ×7 (iPad = WebKit): the api sets `Secure`
    cookies whenever `NODE_ENV=production`; Chromium/Firefox still send them on
    `http://localhost`, WebKit does not, so every authed page bounced to
    `/login?next=…`. New `COOKIE_SECURE` override (default unchanged), set to
    `false` in the web-e2e job only.
  - `a11y` ×5: every axe `color-contrast` finding was the one brand primary
    `hsl(158 64% 40%)` (#25a777, 3.05:1 with white). Light-mode `--primary` is
    now 29% lightness (5.3:1 / 4.7:1 on its 10% tint).
  - `platform.spec` ×1: the `(authed)` platform layout redirected on the first
    client render, where `useSyncExternalStore`'s server snapshot is always
    `null` — the tenants table mounted, fetched, then got torn down ("element
    detached"). Same `hydrated` guard as `useRequiredSession` on the clinic side.
  - `login.spec` ×3: `getByLabel(/password/i)` matched the input and the
    "Show password" toggle; the spec uses `getByRole('textbox', …)` now.
  - The remaining skip is `viewports.spec` "dialog opens and stays inside the
    viewport" on tablet-768, a deliberate `test.skip` in the spec.
- [x] **Quarantined e2e specs** — all 19 module files re-enabled (2026-09-18):
      the api-e2e gate is now **49 files / 363 cases** (was 30 / 190). Of the 34
      failures, 6 were api bugs and the rest spec-vs-api drift:
  - api: `POST /files/confirm` rejected every request (`fileId` had no
    class-validator decorator, so the whitelist stripped it); patient-side
    `GET /tele/sessions/:id/signals` 500'd (`@CurrentUser` on a `@Public` route);
    platform `PATCH /tenants/:id` 500'd (audit row with a tenantId inside
    withPlatformContext violates `audit_logs` RLS); `PATCH /locations/:id`
    required every create field (`UpdateLocationDto` now `PartialType`);
    presign without AWS credentials is a 503 with a message instead of a 500;
    a delegated (X-Acting-For) prescription now uses the delegator's PRC licence.
  - RBAC matrix, decided: `TENANT_MANAGE` stays OWNER-only (settings.spec /
    tenants.spec pin it). New `CLINIC_ADMIN` (OWNER + ADMIN: locations,
    retention runs) and `QUEUE_MANAGE` (OWNER + ADMIN + RECEPTIONIST: the
    front-desk queue) replace it on those controllers.
  - specs: payload field names / enum values (dental surfaces, consultation
    SOAP shape, dsr status, ultrasound kind, tag colour, inventory receive /
    dispense), routes (`/drafts/soap`, `/items/:id/receive`), consent grant
    before precheck, a fully reported lab order can't be cancelled, and the
    harness now seeds a PRC licence for DOCTOR fixtures (there is no staff
    profile endpoint to set one — worth adding). CI passes dummy AWS keys so
    presign can sign; nothing reaches S3.
- [ ] `lab.spec.ts` "clinic + lab pair" flaked once in 5 full-suite runs under
      parallel load (passes in isolation). Watch it in CI; consider `--runInBand`.
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
