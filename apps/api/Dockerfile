# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ NestJS api.
# Build runs from the monorepo root so workspace deps resolve cleanly.

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

# ── build ─────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm exec nx sync \
 && pnpm --dir libs/db exec prisma generate \
 && pnpm exec nx run @org/db:build \
 && pnpm exec nx run @org/api:build

# ── runner ────────────────────────────────────────
# api uses webpack-node-externals — runtime needs the full node_modules tree
# AND the workspace libs' built dists (they're require()'d at runtime, not
# bundled). Cheaper than a single-stage image but heavier than a true
# standalone bundle. We can shrink this later by switching the bundler to
# include node_modules.
FROM node:22-alpine AS runner
# corepack is enabled so Railway's preDeployCommand can run
# `pnpm exec prisma migrate deploy` against the bundled libs/db schema.
RUN corepack enable \
 && apk add --no-cache wget tini openssl \
 && addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=4000

# Workspace skeleton (lockfile + workspace pointers) so pnpm symlinks resolve.
COPY --from=build --chown=nestjs:nodejs /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml /workspace/nx.json ./
# node_modules (prod-only tree, see the prod-deps stage) + libs are read-only
# at runtime, so they're copied root-owned: `--chown` forces BuildKit to
# rewrite ownership file-by-file across the whole pnpm tree, which took
# ~10 min per image on Docker Desktop.
COPY --from=prod-deps /workspace/node_modules ./node_modules

# Workspace libs the api require()s at runtime.
COPY --from=build /workspace/libs/db ./libs/db
COPY --from=build /workspace/libs/auth ./libs/auth
COPY --from=build /workspace/libs/shared-types ./libs/shared-types
COPY --from=build /workspace/libs/ai-prompts ./libs/ai-prompts
# Their per-package node_modules must point into the prod tree, not the dev one.
COPY --from=prod-deps /workspace/libs/db/node_modules ./libs/db/node_modules
COPY --from=prod-deps /workspace/libs/auth/node_modules ./libs/auth/node_modules
COPY --from=prod-deps /workspace/libs/shared-types/node_modules ./libs/shared-types/node_modules
COPY --from=prod-deps /workspace/libs/ai-prompts/node_modules ./libs/ai-prompts/node_modules

# api bundle + Prisma migrations (run prisma migrate deploy from this dir)
COPY --from=build --chown=nestjs:nodejs /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nodejs /workspace/apps/api/package.json ./apps/api/
# The api's own deps (e.g. @swc/helpers for the swc-compiled bundle) are linked
# here by pnpm, not at the workspace root.
COPY --from=prod-deps /workspace/apps/api/node_modules ./apps/api/node_modules

WORKDIR /workspace/apps/api

USER nestjs

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
