# ClinIQ E2E Testing Plan

**Target:** comprehensive end-to-end coverage across API (all 40 modules, all roles, all routes), Web (Playwright across clinic / lab / platform / portal shells), Mobile (Detox or Maestro), and AI service. **Coverage bar:** every endpoint × every role × every key error path.

This document is the working plan for the post-P0 phase. It's deliberately ordered so a CI-green slice ships every week.

---

## 1. Inventory we're testing against

| Surface       | Scale                                                                | Today                                                  | Goal                                                                                                               |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| API (NestJS)  | 40 modules / 52 controllers / ~290 routes                            | 1 RLS integration spec + 6 Jest e2e files (18 `it()`s) | 1 happy-path + ≥1 forbidden-path per route, per applicable role; tenant-isolation on every read                    |
| Web (Next.js) | ~50 pages across 4 portals                                           | Resolve-subdomain unit spec + scaffold                 | Playwright suite covering every page's primary flow + role-gated denial paths                                      |
| Mobile (Expo) | 17 features                                                          | Scaffold App.spec.tsx                                  | Detox or Maestro suite covering login + each read-heavy feature; write paths blocked-by-design get assertion specs |
| AI service    | 5 controllers (bedrock, drafts, dermatology, lab-drafts, transcribe) | Boilerplate `GET /`                                    | Contract specs against stub responder + golden eval gate                                                           |

---

## 2. Test pyramid

```
                    ┌───────────────────────┐
                    │  Playwright / Detox   │  ← user journeys
                    │  (per portal × role)  │
                    └───────────────────────┘
                  ┌───────────────────────────┐
                  │  API e2e (Jest + real DB) │  ← contract + RLS
                  │  (per module × role)      │
                  └───────────────────────────┘
              ┌─────────────────────────────────┐
              │ Unit (Jest / Vitest)            │  ← logic
              │ services, guards, prompt parse  │
              └─────────────────────────────────┘
```

The bottom of the pyramid is light today (the audit caught ~2% API unit coverage and 0% on `libs/auth` / `libs/db` / `libs/api-client` / `libs/ui`). We'll fill some unit gaps in passing, but the headline investment is the middle and top tiers — those exercise the integrations the audit can't statically prove.

---

## 3. Phasing

### Phase 1 — API e2e foundation (week 1)

**Goal:** every API module has at least a happy-path + an isolation/forbidden-path spec.

Tasks:

1. Expand `apps/api-e2e/src/support/harness.ts` with helpers per role:
   - `makeOwner(tenantSlug)`, `makeAdmin`, `makeDoctor`, `makeNurse`, `makeReceptionist`, `makePatient`, `makeLabOwner` (lab tenant), `makePlatformAdmin`.
   - Each returns `{ token, userId, tenantId, http(method, path, body?) }` where `http` already attaches the Bearer header.
2. One spec file per API module under `apps/api-e2e/src/modules/<module>.spec.ts`. Each file proves:
   - Happy-path read & write for each role that has the required `Actions.*` capability.
   - 403 from a role that lacks the capability (RBAC enforcement).
   - 404/empty-list for a sibling tenant (RLS enforcement).
   - For each public route: that authentication is bypassed correctly.
3. CI: keep the new specs under the existing `api-integration` job. Already wired to run `nx run @org/api-e2e:e2e` against the booted api.

Acceptance:

- `nx run @org/api-e2e:e2e` runs ≥ 40 spec files green in CI.
- A new endpoint without a spec fails the PR via an `nx affected` ESLint rule (custom check; see Phase 6).

### Phase 2 — Multi-tenant + auth hardening specs (week 1.5)

**Goal:** the security-critical surface has belt-and-braces tests.

Tasks:

1. **Tenant isolation matrix** — for every Prisma model that carries `tenantId`, write a parametrized spec that creates a row under tenant A and asserts tenant B's `*.findMany` returns it nowhere (list, search, count, audit). Today only `tenant-isolation.spec.ts` covers a hand-picked subset.
2. **JWT + cookie auth** — verify both auth modes:
   - `Authorization: Bearer …` (mobile / external integrations)
   - `Cookie: cliniq.access=…` (web after P0-6)
3. **MFA-gated routes** — for the routes the audit found via `@RequiresMfa`, prove they 401/403 with a token that lacks an MFA claim.
4. **Throttler smoke** — after P0-2, prove the 429 fires after the burst limit with `THROTTLE_SHORT_LIMIT=5` env override.
5. **Refresh-token rotation + replay** — refresh once, then prove the old token is rejected on a second use (rotation invariant).
6. **Acting-as / delegations** — confirm the `X-Acting-For` header changes the effective role and shows up in audit logs.

### Phase 3 — AI service contract tests (week 2)

**Goal:** the api ↔ ai-service contract is locked down without touching Bedrock.

Tasks:

1. Replace `apps/api-e2e/src/integration/stub-ai-service.mjs` with a more complete stub that answers every route the api hits (`/ai/drafts/soap`, `/ai/dermatology/draft`, `/ai/transcribe`, `/lab-drafts/treatment-plan`).
2. Add `apps/ai-service-e2e/src/<route>.spec.ts` — one per controller — that boots the real `ai-service` against a Bedrock mock (the existing eval-runner stub responder is the right starting point) and proves:
   - 401 without the `X-AI-Service-Token` shared secret (after P0-3).
   - 200 with the secret and a well-formed body.
   - Budget-related fields surface in the response (so the api can record cost).
3. Wire the existing `libs/ai-prompts/evals/` golden runs as a CI gate. If the prompts drift such that the golden SOAP cases no longer satisfy the eval, the job goes red. This is already 80% there — add a `prompts-eval` workflow job that runs `nx run @org/ai-prompts:eval-soap` + `:eval-derm`.

### Phase 4 — Web Playwright suite (weeks 2–3)

**Goal:** every page's primary flow runs end-to-end against a real api in a fresh Postgres.

Tasks:

1. Generate a new e2e project: `pnpm nx g @nx/playwright:configuration apps/web-e2e --project=@org/web`.
2. Folder per portal under `apps/web-e2e/src`:
   - `clinic/` — dashboard, patients (list + detail + create), schedule, queue, consultations (SOAP + AI draft), prescriptions, lab-cases, inventory, notifications, audit, admin/{claims,dsr,settings}.
   - `lab/` — cases (list + detail + transitions), billing (invoice CRUD), catalog, materials, compliance, tags, stats.
   - `platform/` — login, dashboard, tenants list + detail (status / plan edit).
   - `portal/` — login, signup, home, appointments, invoices, records, tele/[token] (WebRTC happy-path can be skipped behind a flag).
3. Per role per portal: a single auth-bootstrap fixture (`storageState`) that logs in via the api and persists the httpOnly cookie. Playwright auto-attaches that storageState to each test in the suite — much faster than logging in per spec.
4. **Negative paths** — every protected page has a "anonymous user is redirected to /login" spec. P0-6's middleware makes this assertable at the network layer.
5. **A11y smoke** — `@axe-core/playwright` on the top 10 pages. Fail on serious-or-critical violations.
6. CI: add a `web-e2e` job that boots api + web + Postgres and runs `nx run @org/web-e2e:e2e --project=chromium`.

### Phase 5 — Mobile e2e (week 4)

**Goal:** the Expo app has a smoke-grade suite for the read-heavy flows it ships today.

Decision needed: Detox vs Maestro. Recommendation: **Maestro**.

- Maestro flows are YAML and run on the existing app build — no native config dance.
- Detox needs a custom debug build with TestButler and is finicky on iOS simulators.
- The mobile audit found nearly every screen is read-only, so we don't need Detox's deeper API for forms / native modules.

Tasks:

1. Add `apps/mobile-e2e/maestro/` with flows for: login, patients list + detail, consult detail, lab inbox + case + invoice, portal home + records + invoices, notifications, push permission denial.
2. CI: a `mobile-e2e` job using `mobile-dev-inc/action-maestro-cloud@v1` (cloud) or `mobile-dev-inc/action-maestro@v1` (local emulator). Cloud is cheaper for our scale.
3. Mark write-path screens that the audit flagged as missing (`patients/patients-screen` no create, `appointments/schedule-screen` no booking, etc.) with `EXPECT_MISSING` specs that fail green today and will start failing red once those screens land — so the suite enforces feature completion.

### Phase 6 — Test debt + ratchet (week 4)

**Goal:** the suite stays green and grows with new routes.

Tasks:

1. **Custom Nx generator** `e2e-spec` — `nx g @org/e2e-spec --module=appointments` scaffolds a happy-path spec from the OpenAPI definitions. Reduces the cost of "every new endpoint needs a spec" to a single command.
2. **CI ratchet**: write a small script that diffs `apps/api/openapi.json` against the union of routes covered by `apps/api-e2e` specs. PRs that add a route without a spec fail. Spec is keyed by `operationId` so it's robust to renames.
3. **Unit-test backfill** for the security/data layers the audit flagged:
   - `libs/auth/src/**/*.spec.ts` — RBAC matrix, JWT verify, TOTP roundtrip.
   - `libs/api-client/src/**/*.spec.ts` — refresh single-flight, acting-as injection, retry guard.
   - `libs/db/src/**/*.spec.ts` — `PrismaService.withTenant()` GUC roundtrip against a real Postgres in CI.
4. **Coverage badge / report** uploaded to PRs (codecov or coveralls). Target ratchet: API services ≥ 60% line, libs/auth ≥ 90%, libs/api-client ≥ 80%, libs/db ≥ 75%.

---

## 4. Cross-cutting conventions

- **Tenant fixtures**: `withFreshTenant(name, fn)` creates and tears down a tenant per test. Bcrypt cost stays at 12 (matches prod), so tests will be slow — `testTimeout: 60_000` (already set) is the right knob.
- **DB reset**: between specs, run a fast TRUNCATE of tenant-scoped tables rather than `migrate reset`. We'll add a `truncateTestData()` helper in `harness.ts`.
- **Time freezing**: any spec that asserts dates uses `jest.useFakeTimers().setSystemTime(...)` at the top so renewals, expirations, and audit timestamps are deterministic.
- **Audit assertions**: protected mutations are expected to leave an `AuditLog` row. Reuse a `assertAudited({ action, entity, entityId })` helper instead of hand-querying.
- **Cookie auth in Playwright**: web e2e uses the same login fixture as the production flow (POST /auth/login + Set-Cookie). The Playwright `storageState` mechanism persists the cookie jar between tests.

## 5. Risks and mitigations

| Risk                                     | Mitigation                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tests get flaky from Postgres contention | One DB per worker (`jest-environment-node` + per-worker connection string)                              |
| Bedrock costs from the AI eval gate      | Use the existing stub responder by default; the live-Bedrock job runs nightly on a schedule, not per PR |
| Playwright suite balloons past CI budget | Shard via `--shard=1/4`; only `--project=chromium` on PRs, full matrix on `main`                        |
| Mobile e2e infra is finicky              | Start with the smallest viable Maestro flow set; expand once it's stable                                |
| RLS regressions slip past the matrix     | The Phase 2 isolation matrix runs against every tenant-scoped model — schema additions force a new test |

## 6. Order of operations (concrete sprint plan)

| Week | Ship                                                                | CI gate                                            |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------- |
| 1    | Phase 1 — module-by-module API e2e harness + first 10 specs         | `api-integration` job runs the new specs           |
| 1.5  | Phase 1 — remaining 30 module specs + Phase 2 (auth/RLS hardening)  | All 40 modules green                               |
| 2    | Phase 3 — ai-service contract specs + prompt eval gate              | `prompts-eval` job added                           |
| 2–3  | Phase 4 — Playwright `apps/web-e2e` project, clinic + portal shells | `web-e2e` job (chromium only)                      |
| 3    | Phase 4 cont. — lab + platform shells                               | Web matrix on `main` (chromium + firefox + webkit) |
| 4    | Phase 5 — Maestro flows + Phase 6 ratchet                           | `mobile-e2e` job + OpenAPI ↔ spec diff             |

Definition of done for the whole initiative: every endpoint × every applicable role has at least one passing or explicitly-skipped spec, the OpenAPI ↔ spec diff is empty on `main`, and the dashboard shows ≥ 60% line coverage on the API services.
