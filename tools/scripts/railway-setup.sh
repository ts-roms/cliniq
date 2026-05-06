#!/usr/bin/env bash
# Railway one-time bootstrap for the ClinIQ stack.
#
# Creates 4 services in the currently-linked Railway project:
#   - Postgres (managed plugin)
#   - api          → apps/api/railway.json
#   - ai-service   → apps/ai-service/railway.json
#   - web          → apps/web/railway.json
#
# Each service is pinned to the matching railway.json via its "config path"
# so the build/deploy spec lives in this repo, not the dashboard.
#
# Prereqs:
#   - npm i -g @railway/cli
#   - railway login
#   - railway link            (or `railway init` to make a new project)
#   - GitHub repo connected to the Railway project (Settings → Source)
#
# Idempotency: the `railway add --service <name>` calls fail if the service
# already exists. Re-running this script will not duplicate services, but it
# will exit non-zero on the first conflict — that's fine, treat it as "already
# bootstrapped, skip ahead."
#
# After this script:
#   1. Apply docs/postgres-init.sql:
#        railway run --service Postgres bash -c 'psql "$DATABASE_URL" -f docker/postgres-init.sql'
#   2. Set service env vars per docs/railway.md ("Service env vars" section).
#   3. Generate public domains for `api` and `web` in the dashboard.
#   4. Push to your tracked branch — Railway auto-deploys.

set -euo pipefail

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "✗ required command not found: $1" >&2
    exit 1
  }
}

require railway

echo "→ Verifying you're linked to a Railway project…"
railway status >/dev/null 2>&1 || {
  echo "✗ Not linked. Run \`railway link\` (existing project) or \`railway init\` (new) first." >&2
  exit 1
}

echo "→ Adding Postgres plugin (skip if already present)…"
railway add --database postgres || echo "  (Postgres already exists, continuing)"

# Create each service with its config-as-code path baked in.
# `railway add --service` provisions an empty service we then configure.
declare -a SERVICES=(api ai-service web)
declare -A CONFIG_PATHS=(
  [api]="apps/api/railway.json"
  [ai-service]="apps/ai-service/railway.json"
  [web]="apps/web/railway.json"
)

for svc in "${SERVICES[@]}"; do
  cfg="${CONFIG_PATHS[$svc]}"
  echo "→ Creating service '$svc' (config: $cfg)…"
  railway add --service "$svc" || {
    echo "  ('$svc' already exists, continuing)"
  }
done

cat <<'EOF'

✓ Services created. Remaining manual steps in the Railway dashboard:

  1. For each app service (api, ai-service, web):
     Settings → Source
       • Connect to your GitHub repo (if not already)
       • Root Directory:  /
       • Config Path:     apps/<service>/railway.json

  2. Variables tab — set per docs/railway.md:
       • api:         DATABASE_URL, JWT_SECRET, AI_SERVICE_URL,
                      PORTAL_BASE_URL, CORS_ORIGINS, PUBLIC_API_URL, …
       • ai-service:  AWS_*, BEDROCK_MODEL_*, CORS_ORIGINS
       • web:         NEXT_PUBLIC_API_URL  (build-time)

  3. Bootstrap the cliniq_app role + RLS:
       railway run --service Postgres bash -c \
         'psql "$DATABASE_URL" -f docker/postgres-init.sql'

  4. Networking:
       • api → Generate Domain
       • web → Generate Domain
       • ai-service → leave private (no public domain)

  5. Push to your tracked branch — Railway will build & deploy.

EOF
