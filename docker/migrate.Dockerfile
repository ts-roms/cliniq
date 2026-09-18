# syntax=docker/dockerfile:1.7
# One-shot container that runs `prisma migrate deploy` against DATABASE_URL.
# Used by docker-compose's `migrate` service before api/web come up.
#
# Lean by design — no SWC/webpack, no nest build. Just enough to run prisma.

FROM node:22-alpine AS base
# Pinned: unpinned corepack resolves the latest pnpm (11.x), which rejects the
# pnpm 10 `onlyBuiltDependencies` config and fails install. Keep in step with
# PNPM_VERSION in .github/workflows/ci.yml.
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
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

# ── prod-deps ─────────────────────────────────────
# Runtime images ship this tree, not the dev one: a fresh --prod install
# drops the ~85 root devDependencies (nx, jest, playwright, typescript,
# eslint, storybook, …) that made node_modules 1.9 GB / 123k files and
# turned every COPY / export / unpack of it into minutes. Runtime-only CLIs
# the images still need (prisma, dotenv for prisma.config.ts) live in
# libs/db `dependencies` for exactly this reason. It starts from `base`
# (not `deps`) so pnpm never has to purge an existing dev tree; it runs in
# parallel with `deps`, sharing the store cache mount, so anything one of
# them has already fetched the other reuses.
FROM base AS prod-deps
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
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts \
 || pnpm install --prod --no-frozen-lockfile --ignore-scripts

FROM prod-deps AS migrate
RUN apk add --no-cache openssl

# Schema + migrations are all this stage needs.
COPY libs/db/prisma ./libs/db/prisma
COPY libs/db/prisma.config.ts ./libs/db/

WORKDIR /workspace/libs/db

# `migrate deploy` is idempotent — re-runs are no-ops once everything's applied.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy"]
