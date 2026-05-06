# Railway Deployment

Deploys the ClinIQ stack (api, ai-service, web + Postgres) to a single Railway
project. Mirrors the local `docker-compose.yml` topology — same Dockerfiles,
same env vars, just with Railway-managed Postgres and Railway's private network
between services.

## Topology

```
┌──────────────────────── Railway Project: cliniq ──────────────────────────┐
│                                                                            │
│   ┌────────────┐     ┌────────────┐     ┌──────────────┐                  │
│   │    web     │────▶│    api     │────▶│  ai-service  │                  │
│   │ Next.js    │     │ NestJS     │     │  NestJS      │                  │
│   │ :PORT      │     │ :PORT      │     │  :PORT       │                  │
│   └────────────┘     └─────┬──────┘     └──────────────┘                  │
│                            │                                               │
│                            ▼                                               │
│                     ┌──────────────┐                                       │
│                     │  Postgres    │  (Railway plugin)                     │
│                     └──────────────┘                                       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

- **web** (`apps/web`) — public, browser entry point.
- **api** (`apps/api`) — public; runs `prisma migrate deploy` as a pre-deploy step.
- **ai-service** (`apps/ai-service`) — private; only the api should reach it.
- **Postgres** — Railway-managed plugin, exposes `DATABASE_URL` reference.

## Prerequisites

- Railway account + CLI: `npm i -g @railway/cli`
- This repo pushed to GitHub (Railway pulls from GitHub for builds).

## One-time setup

### 1. Create the project

```bash
railway login
railway init                # creates a new project
```

Or do it in the dashboard: **New Project → Empty Project**, name it `cliniq`.

### 2. Add Postgres

Dashboard: **+ New → Database → Add PostgreSQL**.

This auto-creates these reference variables you can use elsewhere:
- `${{Postgres.DATABASE_URL}}` — connection string
- `${{Postgres.PGUSER}}`, `${{Postgres.PGPASSWORD}}`, etc.

### 3. Apply the SQL bootstrap (`cliniq_app` role + RLS)

`docker/postgres-init.sql` creates the `cliniq_app` role used by the api at
runtime so RLS policies engage. Railway's managed Postgres runs no init
scripts, so apply this manually once:

```bash
railway connect Postgres                  # opens psql
\i docker/postgres-init.sql               # paste/execute the file
```

Or pipe it:

```bash
railway run --service Postgres psql "$DATABASE_URL" -f docker/postgres-init.sql
```

> The repo also exposes `DATABASE_URL_APP` in `.env.example` pointing at the
> `cliniq_app` role. On Railway, set the api's `DATABASE_URL` to the
> `cliniq_app` role connection string (see [Service env vars](#service-env-vars)).

### 4. Create the three app services

For each service (`api`, `ai-service`, `web`), in the dashboard:

1. **+ New → GitHub Repo → cliniq** (or `railway up` from the CLI).
2. **Settings → Source** — set:
   - **Root Directory**: `/` (repo root — Dockerfiles need full workspace context)
   - **Config-as-Code Path**: `apps/<service>/railway.json`
3. **Settings → Networking** — add a public domain for `api` and `web`. Leave
   `ai-service` private (no public domain).

That's it for service creation. The `railway.json` files in this repo pin the
Dockerfile path, start command, healthcheck, and (for api) the pre-deploy
`prisma migrate deploy`.

### 5. Service env vars

Set these in the dashboard (**Variables** tab) for each service. Reference
variables (`${{...}}`) resolve at deploy time — use them instead of pasting
literal values across services.

#### `api`

| Var | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://cliniq_app:<password>@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}?schema=public` |
| `JWT_SECRET` | 32+ random chars (generate: `openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d` |
| `AI_SERVICE_URL` | `http://${{ai-service.RAILWAY_PRIVATE_DOMAIN}}:4100` |
| `PORTAL_BASE_URL` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |
| `CORS_ORIGINS` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |
| `PUBLIC_API_URL` | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` |
| `RESEND_API_KEY` | from Resend (or leave unset for no-op) |
| `MAIL_FROM` | `ClinIQ <noreply@yourdomain>` |
| `SMS_PROVIDER` | `semaphore` / `twilio` / unset |
| `SEMAPHORE_API_KEY` / `TWILIO_*` | as applicable |
| `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL` | from your TURN provider |
| `APPT_REMINDERS_ENABLED` | `false` (set `true` only on one replica) |
| `S3_BUCKET_PHI` / `S3_BUCKET_PUBLIC` | from AWS |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | from AWS |

> **Why a hand-built `DATABASE_URL`?** The api needs to connect as
> `cliniq_app` (not `postgres`) so RLS policies engage. The `<password>` is
> whatever you set in `docker/postgres-init.sql` (default: `cliniq_app`) — change
> it in that file before applying it on prod, then reflect the change here.

> Railway sets `PORT` automatically — the api binds to `process.env.PORT`. Don't
> override it.

#### `ai-service`

| Var | Value |
| --- | --- |
| `AWS_REGION` | e.g. `ap-southeast-1` |
| `AWS_ACCESS_KEY_ID` | from AWS |
| `AWS_SECRET_ACCESS_KEY` | from AWS |
| `BEDROCK_MODEL_SOAP` | Bedrock model id (or unset for stub responses) |
| `BEDROCK_MODEL_DERM` | Bedrock model id (or unset for stub responses) |
| `CORS_ORIGINS` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |

> Without `AWS_*` and `BEDROCK_MODEL_*` set, ai-service falls back to stub
> responses — fine for staging.

#### `web`

| Var | Value | Scope |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` | **build-time** (baked into client bundle) |

> `NEXT_PUBLIC_*` is read by Next.js at build time. After changing it,
> redeploy the web service so the bundle picks up the new value.

### 6. Deploy

Push to the branch tracked by Railway (default `main`). Railway will:

1. Build all three services in parallel using their respective Dockerfiles.
2. Run the api's `preDeployCommand` (`prisma migrate deploy`) against
   `DATABASE_URL`.
3. Promote each new container once its healthcheck passes.

Or trigger from the CLI: `railway up --service api` (etc.).

## Verifying

```bash
# api up?
curl https://<api-domain>/api/health
# → { "status": "ok", "checks": { "db": "up" }, ... }

# ai-service up? (private — proxy through railway run)
railway run --service ai-service curl http://localhost:$PORT/ai/health

# web up?
curl -I https://<web-domain>
```

## Operations

### Re-run migrations manually

The api's `preDeployCommand` runs migrations on every deploy. To re-run
without a code change:

```bash
railway redeploy --service api
```

Or run a one-off:

```bash
railway run --service api sh -c "cd /workspace/libs/db && pnpm exec prisma migrate deploy"
```

### Seed data

The catalog seed (`libs/db/prisma/seed/index.ts`) runs via
`prisma db seed`. Tenant fixtures (`tools/scripts/seed-dev.ts`) are
**dev-only** — don't run them on prod.

```bash
railway run --service api sh -c "cd /workspace/libs/db && pnpm exec prisma db seed"
```

### Logs

```bash
railway logs --service api
railway logs --service web --tail 200
```

## Notes & caveats

- **Mobile (Expo)**: not deployed via Railway — distribute via EAS Build.
- **Workspace context**: every service builds with the repo root as Docker
  context. The Dockerfiles `COPY` workspace package.jsons + the lockfile to
  preserve pnpm's strict resolution. Don't change Root Directory off `/`.
- **`.dockerignore`**: trims `node_modules/`, `dist/`, `.git`, `docs/` etc. Keep
  it tight — Railway uploads the whole context per build.
- **Cold start**: first deploy compiles all three apps from source, ~3–6 min.
  Subsequent deploys benefit from Railway's layer cache.
- **Health checks**: api's `/api/health` queries Postgres — expect `degraded`
  (HTTP 200) until migrations land on a fresh DB; goes `ok` after.
- **Secrets rotation**: rotate `JWT_SECRET` carefully — invalidates all
  outstanding access tokens. Refresh tokens stay valid (signed separately) so
  users won't be force-logged-out, but each will need a token refresh round-trip.
- **Janitor + reminder loops**: `JANITOR_ENABLED` and `APPT_REMINDERS_ENABLED`
  must stay `false` on all api replicas except one. Use `RAILWAY_REPLICA_ID` if
  you scale beyond a single instance, or run a dedicated worker service.
