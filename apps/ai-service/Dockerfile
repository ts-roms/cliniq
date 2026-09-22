# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ ai-service (NestJS Bedrock proxy).
# Same pattern as apps/api/Dockerfile.

FROM node:22-alpine AS base
# Pinned: unpinned corepack resolves the latest pnpm (11.x), which rejects the
# pnpm 10 `onlyBuiltDependencies` config and fails install. Keep in step with
# PNPM_VERSION in .github/workflows/ci.yml.
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
RUN pnpm install --frozen-lockfile --ignore-scripts \
 || pnpm install --no-frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm exec nx sync \
 && pnpm exec nx run @org/ai-service:build

# ── deploy ────────────────────────────────────────
# See apps/api/Dockerfile for the rationale: `pnpm deploy` writes this
# app's `files` (dist) plus exactly its production dependency graph, with
# the workspace libs it declares copied in as injected packages. A plain
# `pnpm install --prod` always installs the root's dependencies too (the
# web/mobile stack), which is what made this image 2.5 GB. Runtime deps
# must therefore be declared in apps/ai-service/package.json, not the root.
FROM build AS deploy
RUN pnpm --filter=@org/ai-service deploy --prod --frozen-lockfile --ignore-scripts \
      --config.inject-workspace-packages=true /deploy

# ── runner ────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache wget tini \
 && addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4100

# node_modules is read-only at runtime, so it is copied root-owned (see
# apps/api/Dockerfile for why --chown is avoided on the pnpm tree).
COPY --from=deploy /deploy/node_modules ./node_modules
COPY --from=deploy --chown=nestjs:nodejs /deploy/package.json ./
COPY --from=deploy --chown=nestjs:nodejs /deploy/dist ./dist

USER nestjs

EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4100/ai/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
