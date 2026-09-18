# syntax=docker/dockerfile:1.7
# One-shot container that runs `prisma migrate deploy` against DATABASE_URL.
# Used by docker-compose's `migrate` service before api/web come up.
#
# Lean by design — no SWC/webpack, no nest build. Just enough to run prisma.

FROM node:22-alpine AS base
# Pinned to the major CI uses (PNPM_VERSION in .github/workflows/ci.yml); the
# lockfile and pnpm-workspace.yaml (allowBuilds) are written for pnpm 11.
RUN corepack enable && corepack prepare pnpm@11 --activate
# pnpm's content-addressable store lives under $PNPM_HOME/store; the install
# below mounts a BuildKit cache there so packages are downloaded once per
# machine and shared by every image build, not re-fetched on each one.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

# ── deps ──────────────────────────────────────────
# This stage is identical in apps/api, apps/web, apps/ai-service and
# docker/migrate Dockerfiles ON PURPOSE (same files, same order, same RUN):
# BuildKit keys layers by instruction + input content, so all four images
# share one node_modules layer instead of running four installs.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/api-e2e/package.json apps/api-e2e/
COPY apps/web/package.json apps/web/
COPY apps/web-e2e/package.json apps/web-e2e/
COPY apps/mobile/package.json apps/mobile/
COPY apps/ai-service/package.json apps/ai-service/
COPY apps/ai-service-e2e/package.json apps/ai-service-e2e/
COPY libs/db/package.json libs/db/
COPY libs/auth/package.json libs/auth/
COPY libs/shared-types/package.json libs/shared-types/
COPY libs/ui/package.json libs/ui/
COPY libs/ai-prompts/package.json libs/ai-prompts/
COPY libs/api-client/package.json libs/api-client/
# Try strict (CI / prod) install first; if the lockfile is out of
# sync with package.json (common in dev when a new dep was just
# added), fall back to a non-frozen install rather than failing
# the whole `docker compose up`. CI explicitly runs the strict
# form via `pnpm install --frozen-lockfile` before docker build,
# so we don't silently drift in production.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
 || pnpm install --no-frozen-lockfile --ignore-scripts

# ── deploy ────────────────────────────────────────
# `pnpm deploy` of @org/db alone: prisma CLI + dotenv (its declared deps)
# and the schema / migrations / prisma.config.ts (its `files`). A plain
# `pnpm install --prod` would also install the workspace root's
# dependencies — the whole web/mobile/api stack — which made this image
# 2.8 GB for a job that runs one CLI. See apps/api/Dockerfile.
FROM deps AS deploy
COPY libs/db/prisma ./libs/db/prisma
COPY libs/db/prisma.config.ts ./libs/db/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter=@org/db deploy --prod --frozen-lockfile --ignore-scripts \
      --config.inject-workspace-packages=true /deploy

# ── migrate ───────────────────────────────────────
FROM node:22-alpine AS migrate
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deploy /deploy ./
# `migrate deploy` is idempotent — re-runs are no-ops once everything's applied.
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
