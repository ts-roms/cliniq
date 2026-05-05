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

### Option A — Docker (one command, full stack)

The fastest way to run the whole thing locally. Brings up postgres,
runs every Prisma migration, then starts the api + ai-service + web.

```bash
cp .env.example .env
# edit .env — at minimum set JWT_SECRET to a 32+ char string
# (if you had an older .env from a previous version, copy the new
# .env.example over it — NEXT_PUBLIC_API_URL must point at port 4000)

docker compose up -d --build

# Browse:
#   http://localhost:3000      web (Next.js)
#   http://localhost:4000/api  api (NestJS) — health: /api/health
#   http://localhost:4100/ai   ai-service (Bedrock proxy, stub-fallback)

docker compose logs -f api          # tail any service
docker compose run --rm migrate     # re-run after a schema change
docker compose down                 # stop (keeps the postgres volume)
docker compose down -v              # stop + wipe data
```

The `migrate` service is a one-shot — it blocks `api`/`web` boot via
`service_completed_successfully` so the first request never races a
half-applied schema. `prisma migrate deploy` is idempotent, so re-runs are
no-ops once everything's applied.

The mobile app (Expo) is **not** in the compose stack — run it on your host
with `pnpm nx start @org/mobile` and point `EXPO_PUBLIC_API_URL` at
`http://<your-LAN-ip>:4000`.

### Option B — Native dev (fastest hot-reload)

```bash
pnpm install
cp .env.example .env       # edit DATABASE_URL to your local postgres

# One-time: apply migrations against your local DB
pnpm --dir libs/db exec prisma migrate deploy

# Run apps in separate terminals
pnpm nx serve @org/api          # http://localhost:4000/api
pnpm nx serve @org/ai-service   # http://localhost:4100
pnpm nx dev   @org/web          # http://localhost:3000
pnpm nx start @org/mobile       # Expo dev menu
```

## Useful Nx commands

```bash
pnpm nx graph                        # interactive dependency graph
pnpm nx show projects                # list all projects
pnpm nx run-many -t build            # build everything
pnpm nx run-many -t lint             # lint everything
pnpm nx affected -t build            # only what changed since main
pnpm nx sync                         # sync TS project references
```

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

- DB migration files exist (`libs/db/prisma/migrations/`) but haven't been applied to a live database — `cd libs/db && pnpm exec prisma migrate deploy` once Postgres is running.
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
