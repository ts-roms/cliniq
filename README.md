# ClinIQ

> The clinic management system with a brain. Multi-tenant SaaS for Filipino clinics with an AI co-pilot.

Planning docs live in [`../docs/`](../docs/). This is the implementation monorepo.

---

## Workspace layout

```
cliniq/
├── apps/
│   ├── web/             Next.js 15 — clinic app + patient portal (React 19)
│   ├── api/             NestJS 11 — core REST API (port 4000)
│   ├── api-e2e/         E2E tests for api
│   ├── ai-service/      NestJS 11 — Bedrock proxy (port 4100)
│   ├── ai-service-e2e/  E2E tests for ai-service
│   └── mobile/          Expo 54 + React Native + NativeWind v4 (shares design tokens)
├── libs/
│   ├── db/          Prisma schema + client (Postgres)
│   ├── shared-types Cross-app TypeScript types
│   ├── ui/          shadcn-style React component library + Tailwind preset
│   ├── api-client/  Generated TS client for the api
│   ├── auth/        JWT, RBAC, tenant resolution helpers
│   └── ai-prompts/  Versioned prompt templates + eval harness
└── infra/
    └── terraform/   AWS IaC: VPC + RDS + ECS Fargate + S3/KMS + Bedrock IAM
```

## Stack

| Layer | Choice |
|---|---|
| Monorepo | Nx 22 + pnpm workspaces |
| Web app | Next.js 15 + React 19 + Tailwind + shadcn |
| Marketing | React 19 + Vite + Tailwind + shadcn (shared `libs/ui`) |
| Mobile | Expo 54 + React Native |
| API | NestJS 11 + Webpack build |
| Database | PostgreSQL + Prisma 7 |
| Forms | react-hook-form + zod |
| Data | TanStack Query (with Devtools) |
| Auth | JWT (planned: WebAuthn for clinical roles) |
| AI | Bedrock (Claude Sonnet/Haiku) — see `docs/07` and `docs/08` |

## Prerequisites

- Node 22+
- pnpm 10+
- PostgreSQL 16 (local or Docker) — set `DATABASE_URL` in `.env`

## Quick start

Every command below is a root `package.json` script — run them from the
workspace root with `pnpm <script>`. The underlying `docker compose` / `nx`
invocation is shown alongside each one if you'd rather run it directly.

### Option A — Docker (one command, full stack)

The fastest way to run the whole thing locally. Brings up postgres,
runs every Prisma migration, then starts the api + ai-service + web.

```bash
cp .env.example .env
# edit .env — at minimum set JWT_SECRET to a 32+ char string
# (if you had an older .env from a previous version, copy the new
# .env.example over it — NEXT_PUBLIC_API_URL must point at port 4000)

pnpm docker:up      # docker compose up -d --build

# Browse:
#   http://localhost:3000      web (Next.js)
#   http://localhost:4000/api  api (NestJS) — health: /api/health
#   http://localhost:4100/ai   ai-service (Bedrock proxy, stub-fallback)
```

#### Docker scripts

| Script | Runs | What it does |
|---|---|---|
| `pnpm docker:up` | `docker compose up -d --build` | Build + start the whole stack (postgres → migrate → api, ai-service, web) |
| `pnpm docker:up:web` | `docker compose up -d --build web` | Build + start **web** and only the services it depends on (api → migrate → postgres) |
| `pnpm docker:start` | `docker compose up -d` | Start without rebuilding (use after a plain `docker:stop`) |
| `pnpm docker:stop` | `docker compose stop` | Stop containers, keep them around |
| `pnpm docker:down` | `docker compose down` | Remove containers (keeps the postgres volume) |
| `pnpm docker:reset` | `docker compose down -v` | Remove containers **and wipe the database volume** |
| `pnpm docker:build` | `docker compose build` | Rebuild all images without starting |
| `pnpm docker:build:web` | `docker compose build web` | Rebuild just the web image |
| `pnpm docker:logs` | `docker compose logs -f` | Tail every service |
| `pnpm docker:logs:web` | `docker compose logs -f web` | Tail web only |
| `pnpm docker:logs:api` | `docker compose logs -f api` | Tail api only |
| `pnpm docker:ps` | `docker compose ps` | Show container status/ports |
| `pnpm docker:migrate` | `docker compose run --rm migrate` | Re-run Prisma migrations after a schema change |
| `pnpm docker:sh:web` | `docker compose exec web sh` | Shell into the running web container |
| `pnpm docker:sh:api` | `docker compose exec api sh` | Shell into the running api container |

#### Running only the web app in Docker

`web` declares `depends_on: api`, and `api` in turn depends on `migrate` +
`postgres`, so a single command gets you a working browser experience:

```bash
pnpm docker:up:web        # postgres → migrate → api → web
open http://localhost:3000
```

Rebuild web alone after a UI change (nothing else restarts):

```bash
pnpm docker:build:web && pnpm docker:start
```

> **Note:** `NEXT_PUBLIC_API_URL` is inlined into the client bundle by
> `next build`, so changing it in `.env` requires a **rebuild** of the web
> image (`pnpm docker:build:web`), not just a restart.

#### Ports

Each is overridable in `.env`:

| Variable | Default | Service |
|---|---|---|
| `WEB_PORT` | `3000` | web |
| `API_PORT` | `4000` | api |
| `AI_PORT` | `4100` | ai-service |
| `POSTGRES_PORT` | `5432` | postgres |

The `migrate` service is a one-shot — it blocks `api`/`web` boot via
`service_completed_successfully` so the first request never races a
half-applied schema. `prisma migrate deploy` is idempotent, so re-runs are
no-ops once everything's applied.

The mobile app (Expo) is **not** in the compose stack — run it on your host
with `pnpm dev:mobile` and point `EXPO_PUBLIC_API_URL` at
`http://<your-LAN-ip>:4000`.

### Option B — Native dev (fastest hot-reload)

```bash
pnpm install
cp .env.example .env       # edit DATABASE_URL to your local postgres

pnpm db:migrate            # one-time: apply migrations against your local DB
pnpm db:seed               # optional: demo tenant + accounts

pnpm dev                   # api + ai-service + web, all in one terminal
```

`pnpm dev` runs `nx run-many -t serve,dev -p @org/api,@org/ai-service,@org/web`
— Nx interleaves the three continuous tasks and prefixes each line with the
project name. To run them individually (separate terminals, cleaner logs):

| Script | Runs | URL |
|---|---|---|
| `pnpm dev:web` | `nx dev @org/web` | http://localhost:3000 |
| `pnpm dev:api` | `nx serve @org/api` | http://localhost:4000/api |
| `pnpm dev:ai` | `nx serve @org/ai-service` | http://localhost:4100 |
| `pnpm dev:mobile` | `nx start @org/mobile` | Expo dev menu |

#### Running only the web app natively

`pnpm dev:web` starts Next.js on :3000, but the app talks to the api for
everything — so pair it with either a native api (`pnpm dev:api`) or the
dockerised one (`pnpm docker:up`, which also brings up postgres). Point the
web app at whichever you chose via `NEXT_PUBLIC_API_URL` in `.env`
(defaults to `http://localhost:4000`).

Production-mode check of the web app without Docker:

```bash
pnpm build:web      # nx build @org/web
pnpm start:web      # nx start @org/web — serves the built output on :3000
```

### Database scripts

| Script | Runs |
|---|---|
| `pnpm db:migrate` | `prisma migrate deploy` — apply pending migrations |
| `pnpm db:generate` | `prisma generate` — regen the client after a schema edit |
| `pnpm db:studio` | `prisma studio` — browse data |
| `pnpm db:seed` | Prisma seed + `tools/scripts/seed-dev.ts` |
| `pnpm db:reset` | `prisma migrate reset --force` — **drops and recreates** the DB |
| `pnpm seed:platform-admin` | Seed the platform admin account |
| `pnpm seed:demo-lab` | Seed the demo lab tenant |

### Quality scripts

| Script | Runs |
|---|---|
| `pnpm lint` | `nx run-many -t lint` |
| `pnpm test` | `nx run-many -t test` |
| `pnpm e2e` | `nx run-many -t e2e` (see [E2E tests](#e2e-tests) for prereqs) |

## Useful Nx commands

```bash
pnpm nx graph                        # interactive dependency graph
pnpm nx show projects                # list all projects
pnpm nx run-many -t build            # build everything
pnpm nx run-many -t lint             # lint everything
pnpm nx affected -t build            # only what changed since main
pnpm nx sync                         # sync TS project references
```

## E2E tests

Three suites live in the workspace, each owned by a sibling `*-e2e` project:

| Suite | Runner | Project | Targets |
|---|---|---|---|
| `@org/api-e2e` | Jest + supertest | api on :4000 | tenant isolation, RBAC, queue, OB, lab, feature gates |
| `@org/ai-service-e2e` | Jest | ai-service on :4100 | Bedrock proxy contract |
| `@org/web-e2e` | Playwright | web on :3000 (driving api on :4000) | clinic / portal / lab / platform shells + responsive + a11y |

### Prereqs

```bash
pnpm install
pnpm exec playwright install    # one-time — fetch chromium/firefox/webkit
pnpm db:migrate                 # against your local DB
```

### Run a single suite

```bash
# API e2e — boot the api first (separate terminal):
pnpm dev:api
pnpm nx run @org/api-e2e:e2e

# ai-service e2e — Nx boots the service for you (dependsOn :serve):
pnpm nx run @org/ai-service-e2e:e2e

# Web e2e — boot api + web first, then run:
pnpm dev:api                    # terminal 1
pnpm dev:web                    # terminal 2
pnpm nx run @org/web-e2e:e2e    # terminal 3
```

The web suite's `globalSetup` provisions tenants/users via the api and captures one `storageState` per role under `apps/web-e2e/storage/`, so specs skip the login flow (~6s saved per spec).

### Run them all

```bash
pnpm e2e                                  # every *-e2e project (nx run-many -t e2e)
pnpm nx affected -t e2e                   # only suites touched by the diff vs main
```

### Useful Playwright flags

Anything after `--` is forwarded to `playwright test`:

```bash
pnpm nx run @org/web-e2e:e2e -- --project=chromium-clinic   # one project (matrix is browser × portal)
pnpm nx run @org/web-e2e:e2e -- --headed                    # watch the browser
pnpm nx run @org/web-e2e:e2e -- --ui                        # Playwright UI / time-travel mode
pnpm nx run @org/web-e2e:e2e -- --debug                     # inspector, pauses on each step
pnpm nx run @org/web-e2e:e2e -- src/clinic/queue.spec.ts    # single spec
pnpm nx run @org/web-e2e:e2e -- --grep "tenant isolation"   # by title
```

HTML report lands at `apps/web-e2e/playwright-report/` — open `index.html` (or pass `--reporter=list` for plain console output).

### Env var overrides

| Variable | Used by | Default |
|---|---|---|
| `API_E2E_URL` | api-e2e wait-for-port + web-e2e provisioner | `http://127.0.0.1:4000` |
| `WEB_E2E_BASE_URL` | web-e2e Playwright base URL | `http://127.0.0.1:3000` |
| `HOST` / `PORT` | api-e2e + ai-service-e2e port wait (alternative to `API_E2E_URL`) | `localhost` / `4000` |
| `CI` | web-e2e (forces `forbidOnly`, 2 retries, 2 workers, html+github reporters) | unset |

### Tips

- The api-e2e suite has `testTimeout: 60_000` because bcrypt at cost=12 + provisioning eats a few seconds per case — don't trim it.
- Web-e2e workers are kept low (1 local, 2 CI) to avoid concurrent tenants stomping each other in the same Postgres. Bump only after RLS/isolation specs stay green.
- The api-e2e target has `dependsOn: ['@org/api:build']` so Nx rebuilds before the run; pass `--skip-nx-cache` if you suspect a stale build is being reused.

## Module boundaries (enforced by ESLint)

Tags applied to every project:

| Project | tags |
|---|---|
| `@org/web`        | `scope:web`, `type:app` |
| `@org/marketing`  | `scope:marketing`, `type:app` |
| `@org/api`        | `scope:api`, `type:app` |
| `@org/mobile`     | `scope:mobile`, `type:app` |
| `@org/ui`, `@org/db`, `@org/shared-types`, `@org/auth`, `@org/api-client`, `@org/ai-prompts` | `scope:shared`, `type:lib` |

Apps may only depend on `scope:shared` libs — never on each other. Enforced by `@nx/enforce-module-boundaries` in `eslint.config.mjs`.

## Adding new pieces

```bash
# A new shared lib (TS only)
pnpm nx g @nx/js:lib --directory=libs/<name> --linter=eslint --unitTestRunner=jest --bundler=tsc

# A new React shared lib
pnpm nx g @nx/react:lib --directory=libs/<name> --bundler=vite --linter=eslint --unitTestRunner=vitest

# A new NestJS module inside the api
pnpm nx g @nx/nest:module --project=@org/api --directory=apps/api/src/<name>
```

After generating, add `tags` in the new project's `package.json`:
```json
{ "nx": { "tags": ["scope:shared", "type:lib"] } }
```

## Prisma

The root scripts (`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`)
cover the common cases. For anything else, run the CLI in `libs/db`:

```bash
cd libs/db
pnpm exec prisma generate          # regen client after schema changes
pnpm exec prisma migrate dev       # create & apply a dev migration
pnpm exec prisma studio            # browse data
```

The schema lives in `libs/db/prisma/schema.prisma`. The full target schema is in [`../docs/05-data-model-prisma.md`](../docs/05-data-model-prisma.md) — current schema is a starter (Tenant, User, TenantUser, Patient). Expand model-by-model as features ship.

## Tailwind + shadcn

`libs/ui` owns:
- The shared Tailwind preset (`tailwind.preset.cjs`)
- The shadcn CSS variables (`src/globals.css`)
- The `cn()` helper and reusable components

Apps `web` and `marketing` extend the preset and `@import` `globals.css`. Add new shadcn components inside `libs/ui/src/lib/components/` and re-export from `libs/ui/src/index.ts`.

## What's NOT done yet (read this first)

- DB migration files exist (`libs/db/prisma/migrations/`) but haven't been applied to a live database — run `pnpm db:migrate` once Postgres is running (Docker users get this for free via the `migrate` service).
- AWS bootstrap is scripted at `infra/bootstrap/bootstrap.sh` (idempotent — creates the GitHub OIDC provider, the `cliniq-<env>-deploy` IAM role, the Terraform admin role, the KMS-encrypted state bucket, and the DynamoDB lock table). Run once per AWS account. After it prints the backend block, paste it into `infra/terraform/environments/<env>/main.tf` and run `terraform init && terraform apply`.
- API has `auth` (JWT + RBAC, global guards), `tenants`, `patients` (full CRUD with soft-delete + search), and `health` modules wired. `TenantContextMiddleware` resolves the tenant from subdomain or JWT and sets the AsyncLocalStorage context; every patients query goes through `prisma.withTenant()` which sets the RLS GUCs on the transaction. Swagger UI at `/api/docs` and the spec is exported via `node apps/api/dist/main.js --emit-openapi`.
- Typed TS client: `pnpm nx run @org/api-client:generate` runs the api once with `--emit-openapi`, then runs `@hey-api/openapi-ts` over `apps/api/openapi.json`. Output lands at `libs/api-client/src/generated/` and is re-exported as `@org/api-client`. Web + mobile import the generated SDK functions instead of hand-rolling fetch. `configureAuth(getter)` wires token injection.
- Mobile app uses NativeWind v4 + the shared design tokens but has no clinical screens yet.
- GitHub Actions live in `.github/workflows/`: `ci.yml` (Postgres service, lint/test/build affected, RLS leak test), `cd-api.yml` + `cd-web.yml` (ECR build/push + ECS deploy on `main`), `terraform.yml` (plan on PRs, apply on dispatch). Set repo secrets: `AWS_DEPLOY_ROLE_ARN`, `DATABASE_URL`, `ACM_CERTIFICATE_ARN`, `API_IMAGE_URI`.
- Nx Cloud workspace is provisioned but not connected — visit the URL printed at install time, or `pnpm nx connect`.

## Auth quickstart

```bash
# Bootstrap the first owner (public route on TenantsController)
curl -X POST http://localhost:4000/api/tenants \
  -H 'content-type: application/json' \
  -d '{"slug":"acme","name":"Acme Clinic","ownerEmail":"doc@acme.ph","ownerName":"Dr. Cruz"}'

# Login (returns access + refresh tokens)
curl -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"doc@acme.ph","password":"hunter2hunter2"}'

# Use the token on protected routes
curl http://localhost:4000/api/auth/me -H "Authorization: Bearer <token>"
```

Gate any controller route with the action vocabulary from `@org/auth`:

```ts
import { Actions } from '@org/auth';
import { Requires } from '../auth/decorators/requires.decorator.js';

@Get(':id')
@Requires(Actions.PATIENT_READ)
findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
  return this.patients.findById(id, user); // service uses prisma.withTenant(user.tenantId, ...)
}
```

`@Public()` opts a route out of authentication (e.g. `/auth/login`, `/health`).

## Reference

All product, business, and architectural decisions live in [`../docs/`](../docs/). Read `docs/00-overview.md` first.
