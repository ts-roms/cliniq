# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ NestJS api.
# Build runs from the monorepo root so workspace deps resolve cleanly.

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
RUN pnpm install --frozen-lockfile --ignore-scripts \
 || pnpm install --no-frozen-lockfile --ignore-scripts

# ── build ─────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm exec nx sync \
 && pnpm --dir libs/db exec prisma generate \
 && pnpm exec nx run @org/db:build \
 && pnpm exec nx run @org/api:build

# ── deploy ────────────────────────────────────────
# Produce the ONLY tree the runner ships: `pnpm deploy` writes the api
# package (its `files`: dist) plus a node_modules containing exactly the
# api's production dependency graph — NestJS, Prisma, the workspace libs
# it declares (@org/db, @org/auth, @org/shared-types, copied in as injected
# packages with their built dist) and nothing else. A plain
# `pnpm install --prod`, even filtered, always installs the workspace
# root's `dependencies` too, and the root carries the web/mobile stack
# (next, expo, react-native, …) — that is what made this image 2.6 GB.
#
# Consequences for maintainers:
#  - a runtime dep of the api must be declared in apps/api/package.json
#    (or the lib that imports it), never only at the root;
#  - anything a lib needs at runtime must be listed in its `files`
#    (dist is gitignored, so it is not packed by default).
# `inject-workspace-packages` is passed for this command only — the repo
# keeps symlinked workspace packages for development. The legacy deploy
# mode is NOT used: it inherits the root's dependencies (the same 2.6 GB).
FROM build AS deploy
RUN pnpm --filter=@org/api deploy --prod --frozen-lockfile --ignore-scripts \
      --config.inject-workspace-packages=true /deploy

# ── runner ────────────────────────────────────────
# The api bundle uses webpack-node-externals, so node_modules is required
# at runtime (not bundled) — but only the deploy tree above, ~0.4 GB
# instead of the 1.3 GB root prod install.
FROM node:22-alpine AS runner
# corepack is enabled so a pre-deploy hook can run
# `pnpm exec prisma migrate deploy` (prisma + the schema ship inside
# node_modules/@org/db).
RUN corepack enable \
 && apk add --no-cache wget tini openssl \
 && addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# node_modules is read-only at runtime, so it is copied root-owned:
# `--chown` makes BuildKit rewrite ownership file-by-file across the whole
# pnpm tree, which took ~10 min per image on Docker Desktop.
COPY --from=deploy /deploy/node_modules ./node_modules
COPY --from=deploy --chown=nestjs:nodejs /deploy/package.json ./
COPY --from=deploy --chown=nestjs:nodejs /deploy/dist ./dist

USER nestjs

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
