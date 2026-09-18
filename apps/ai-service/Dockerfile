# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ ai-service (NestJS Bedrock proxy).
# Same pattern as apps/api/Dockerfile.

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

FROM deps AS build
COPY . .
RUN pnpm exec nx sync \
 && pnpm exec nx run @org/ai-service:build

FROM node:22-alpine AS runner
RUN apk add --no-cache wget tini \
 && addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=4100

# Same webpack-node-externals pattern as the api — runtime needs the full
# workspace skeleton + workspace libs + node_modules.
COPY --from=build --chown=nestjs:nodejs /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml /workspace/nx.json ./
# node_modules (prod-only tree, see the prod-deps stage) + libs are read-only
# at runtime, so they're copied root-owned: `--chown` forces BuildKit to
# rewrite ownership file-by-file across the whole pnpm tree, which took
# ~10 min per image on Docker Desktop.
COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=build /workspace/libs/auth ./libs/auth
COPY --from=build /workspace/libs/ai-prompts ./libs/ai-prompts
COPY --from=build /workspace/libs/shared-types ./libs/shared-types
COPY --from=prod-deps /workspace/libs/auth/node_modules ./libs/auth/node_modules
COPY --from=prod-deps /workspace/libs/ai-prompts/node_modules ./libs/ai-prompts/node_modules
COPY --from=prod-deps /workspace/libs/shared-types/node_modules ./libs/shared-types/node_modules
COPY --from=build --chown=nestjs:nodejs /workspace/apps/ai-service/dist ./apps/ai-service/dist
COPY --from=build --chown=nestjs:nodejs /workspace/apps/ai-service/package.json ./apps/ai-service/
# The service's own deps (e.g. @swc/helpers for the swc-compiled bundle) are
# linked here by pnpm, not at the workspace root.
COPY --from=prod-deps /workspace/apps/ai-service/node_modules ./apps/ai-service/node_modules

WORKDIR /workspace/apps/ai-service

USER nestjs

EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4100/ai/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
