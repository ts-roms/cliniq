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

- Railway account + CLI **5.42 or newer** (`npm i -g @railway/cli`; older
  builds cannot evaluate the IaC file).
- The repo pushed to GitHub and the **Railway GitHub App** authorised for
  `ts-roms/cliniq` (Railway → Account → Integrations → GitHub). Without it
  Railway can create the services but every build dies at "scheduling build"
  with no log; `railway up` (upload from a checkout) still works.

## Project layout — `.railway/railway.ts`

The project is defined in [`.railway/railway.ts`](../.railway/railway.ts)
(Railway Infrastructure as Code; the per-service `railway.json` files were
removed — Railway now rejects config-as-code on new services). It declares:

- `Postgres` (managed, 5 GB volume, TCP proxy for migrations from a laptop)
- `api`, `ai-service`, `web` — GitHub source `ts-roms/cliniq@main`, root
  directory `/` (the Dockerfiles need the whole workspace as context),
  Dockerfile path, start command, healthcheck, watch patterns, and the
  **names** of every variable. Values are `preserve()` so nothing secret is in
  git; the tables below say what each value is.

```bash
railway link                  # once per checkout → project cliniq / production
railway config plan           # diff the file against Railway (should be clean)
railway config apply          # after reviewing the plan
railway config pull --force   # import dashboard edits back into the file
```

> On Windows/Git Bash the SDK locates the CLI through `$_`; if `plan` claims
> the CLI is too old, run it as `env -u _ railway.exe config plan`.

## One-time setup (already done for `cliniq`, kept for a rebuild)

1. `railway.exe` → create the project, add Postgres, create the three
   services from the GitHub repo (the MCP/CLI/dashboard all work), then
   `railway config pull` to capture it — or write the file first and
   `railway config apply`.
2. Generate public domains for `api` (target port 4000) and `web` (3000).
   `ai-service` stays private.
3. Set the variables below. Secrets: `openssl rand -hex 32`.
4. Bootstrap the database (next section).
5. Deploy: push to `main`, or `railway up --service <name>` from a checkout.

### Database bootstrap

Railway's Postgres runs no init scripts, so create the RLS role and apply
migrations from your machine through the TCP proxy (`Postgres → Variables →
DATABASE_PUBLIC_URL`, or build it from `PGUSER/PGPASSWORD/PGDATABASE` + the
proxy host:port):

```bash
PUB='postgresql://postgres:<pw>@<proxy-host>:<port>/railway'

# 1. cliniq_app role with the password you put in api.CLINIQ_APP_DB_PASSWORD
#    (the file grants on database "cliniq"; Railway's is "railway").
sed -e "s/PASSWORD 'cliniq_app'/PASSWORD '<app-password>'/" \
    -e "s/ON DATABASE cliniq TO/ON DATABASE railway TO/" docker/postgres-init.sql \
  | psql "$PUB" -v ON_ERROR_STOP=1

# 2. schema + RLS policies
DATABASE_URL="$PUB?schema=public" pnpm --dir libs/db exec prisma migrate deploy

# 3. grants on the tables the migrations just created (default privileges
#    only cover tables created *after* the ALTER DEFAULT PRIVILEGES)
psql "$PUB" -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cliniq_app;
                GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cliniq_app;"
```

Repeat steps 2–3 whenever a PR adds files under `libs/db/prisma/migrations/`
(idempotent). Migrations do not run on deploy — see
[Run migrations](#run-migrations) for why.

### Service env vars

Reference variables (`${{...}}`) resolve at deploy time.

#### `api`

| Var                                                                       | Value                                                                                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                                    | `4000` (matches the Dockerfile `EXPOSE` and the domain's target port)                                                                  |
| `NODE_ENV`                                                                | `production`                                                                                                                           |
| `CLINIQ_APP_DB_PASSWORD`                                                  | the `cliniq_app` password you created above                                                                                            |
| `DATABASE_URL`                                                            | `postgresql://cliniq_app:${{CLINIQ_APP_DB_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}?schema=public` |
| `JWT_SECRET`                                                              | 32+ random chars                                                                                                                       |
| `JWT_EXPIRES_IN` / `REFRESH_TOKEN_EXPIRES_IN`                             | `15m` / `7d`                                                                                                                           |
| `AI_SERVICE_URL`                                                          | `http://${{ai-service.RAILWAY_PRIVATE_DOMAIN}}:4100`                                                                                   |
| `AI_SERVICE_TOKEN`                                                        | 32+ random chars, **same value on `ai-service`**                                                                                       |
| `TRUST_PROXY`                                                             | `1` (Railway terminates TLS; rate limits need the real client ip)                                                                      |
| `COOKIE_SAMESITE` / `COOKIE_SECURE`                                       | `none` / `true` — web and api are on different `*.up.railway.app` hosts, so the auth cookies must be cross-site                        |
| `PORTAL_BASE_URL`                                                         | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`                                                                                               |
| `CORS_ORIGINS`                                                            | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`                                                                                               |
| `PUBLIC_API_URL`                                                          | `https://${{RAILWAY_PUBLIC_DOMAIN}}`                                                                                                   |
| `APPT_REMINDERS_ENABLED` / `APPT_AUTO_NOSHOW_ENABLED` / `JANITOR_ENABLED` | `false` (turn on for exactly one replica)                                                                                              |
| `THROTTLE_AUTH_LIMIT` / `THROTTLE_LIMIT`                                  | optional; defaults 10 / 300 per minute per ip                                                                                          |
| `RESEND_API_KEY` / `MAIL_FROM`                                            | from Resend (unset = no-op mail)                                                                                                       |
| `SMS_PROVIDER` + `SEMAPHORE_API_KEY` / `TWILIO_*`                         | as applicable                                                                                                                          |
| `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL`                         | from your TURN provider (tele)                                                                                                         |
| `S3_BUCKET_PHI` / `S3_BUCKET_PUBLIC` / `AWS_*`                            | from AWS (file uploads answer 503 until set)                                                                                           |

#### `ai-service`

| Var                                                          | Value                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `PORT`                                                       | `4100`                                                        |
| `NODE_ENV`                                                   | `production`                                                  |
| `AI_SERVICE_TOKEN`                                           | same value as on `api` — the service exits at boot without it |
| `CORS_ORIGINS`                                               | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000`                 |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | from AWS                                                      |
| `BEDROCK_MODEL_SOAP` / `BEDROCK_MODEL_DERM`                  | Bedrock model ids (unset = stub responses, fine for staging)  |

#### `web`

| Var                   | Value                                    | Scope                                     |
| --------------------- | ---------------------------------------- | ----------------------------------------- |
| `PORT` / `HOSTNAME`   | `3000` / `0.0.0.0`                       | runtime                                   |
| `NODE_ENV`            | `production`                             |                                           |
| `NEXT_PUBLIC_API_URL` | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` | **build-time** (baked into client bundle) |

> `NEXT_PUBLIC_*` is read by Next.js at build time (the Dockerfile declares it
> as an `ARG`; Railway passes service variables as build args). After changing
> it, redeploy `web`.

### Dockerfile rules Railway enforces

- No BuildKit cache mounts. Railway only accepts
  `--mount=type=cache,id=s/<service-uuid>-<path>` (the id cannot come from an
  ARG), which would pin each Dockerfile to one Railway service. Docker's layer
  cache still skips `pnpm install` while the lockfile is unchanged.
- Root directory stays `/`; the Dockerfiles copy the workspace manifests.

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

### Run migrations

**Migrations run manually**, not on every deploy. The `preDeployCommand`
was removed from [`apps/api/railway.json`](../apps/api/railway.json) because
Railway's pre-deploy stage failed to run prisma reliably on this stack. The
fix-forward flow:

```bash
# Get the Postgres public URL from the dashboard:
#   cliniq-postgres → Connect → Public Network → copy DATABASE_URL.
# Then run from your local machine:
DATABASE_URL='postgresql://postgres:<password>@<public-host>:<port>/railway' \
  pnpm --dir libs/db exec prisma migrate deploy
```

Idempotent — re-runs are no-ops once everything's applied. Run this any
time you merge a PR with new files in `libs/db/prisma/migrations/`.

> **To re-enable on-deploy migrations later**, add this back to the
> `deploy` block in [`apps/api/railway.json`](../apps/api/railway.json):
>
> ```json
> "preDeployCommand": "cd /app/node_modules/@org/db && ./node_modules/.bin/prisma migrate deploy"
> ```
>
> Then debug whatever was making it fail silently. Known blocker: the api
> image runs as the unprivileged `nestjs` user and its `node_modules` is
> root-owned, while `prisma migrate` wants to download the schema engine into
> `node_modules/@prisma/engines` on first run — so it fails with "Can't write
> to …/@prisma/engines". The `docker/migrate.Dockerfile` image (runs as root,
> ships only libs/db) is the supported way to apply migrations.

### Seed data

The catalog seed (`libs/db/prisma/seed/index.ts`) runs via
`prisma db seed`. Tenant fixtures (`tools/scripts/seed-dev.ts`) are
**dev-only** — don't run them on prod.

```bash
railway run --service api sh -c "cd /app/node_modules/@org/db && ./node_modules/.bin/prisma db seed"
```

### Bootstrap the platform admin (superadmin)

The first time you stand up an environment, you need a `platform_admin`
row so someone can sign in at `/platform/login` and manage tenants.
Use [`tools/scripts/seed-platform-admin.ts`](../tools/scripts/seed-platform-admin.ts) — idempotent, prod-safe (touches
`platform_admins` only), takes inputs from env vars.

```bash
# Pick a strong password (the script enforces ≥12 chars):
PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

# Run from your local machine, with Railway's api env injected:
railway run --service api \
  env PLATFORM_ADMIN_EMAIL=you@yourcompany.com \
      PLATFORM_ADMIN_NAME='Your Name' \
      PLATFORM_ADMIN_PASSWORD="$PASS" \
  pnpm seed:platform-admin

echo "Admin password: $PASS"   # save it once, then delete from your shell history
```

Re-running the script with the **same email** is a password reset — it
updates `name` + `passwordHash` in place and preserves MFA state. Use
this if you ever need to recover a locked-out admin.

> ⚠️ Never put `PLATFORM_ADMIN_PASSWORD` in a Railway service Variable. It's
> a one-shot bootstrap, not a runtime secret. The script reads it from the
> shell env at invocation time only.

After the script succeeds, sign in at:

```
https://<web-domain>/platform/login
```

…with the email you just seeded. Enroll MFA from the platform console
on first session (TODO: that flow isn't built yet — see notes).

### Add another platform admin

Repeat the same `seed:platform-admin` invocation with a different
`PLATFORM_ADMIN_EMAIL`. The script doesn't have a delete path; to
revoke an admin, mark them deleted in SQL:

```bash
railway run --service Postgres bash -c \
  'psql "$DATABASE_URL" -c "UPDATE platform_admins SET \"deletedAt\" = NOW() WHERE email = '\''old@admin.com'\''"'
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
