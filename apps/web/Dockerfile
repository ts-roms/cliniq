# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ Next.js web app (standalone output).

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
# Build-time public env. Next.js inlines NEXT_PUBLIC_* into the client bundle
# during `next build`, so the value MUST be present at this stage. Railway
# passes service variables as build args only when the Dockerfile declares
# them with ARG — runtime-only env wouldn't reach Next.js's compiler.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Regenerate the typed api-client SDK from apps/api/openapi.json (committed in
# git as the contract snapshot). Done inline rather than via the nx target so we
# don't transitively trigger an api build, which would require a live DB.
RUN pnpm exec nx sync \
 && pnpm --dir libs/db exec prisma generate \
 && pnpm --dir libs/api-client exec openapi-ts \
 && (cd libs/api-client && node scripts/strip-js-extensions.mjs) \
 && pnpm exec nx run @org/web:build

FROM node:22-alpine AS runner
RUN apk add --no-cache wget \
 && addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=3000

# Workspace skeleton + node_modules so pnpm symlinks (Next loads workspace
# libs from `transpilePackages`) resolve at runtime.
COPY --from=build --chown=nextjs:nodejs /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml /workspace/nx.json ./
# node_modules (prod-only tree, see the prod-deps stage) + libs are read-only
# at runtime, so they're copied root-owned: `--chown` forces BuildKit to
# rewrite ownership file-by-file across the whole pnpm tree, which took
# ~10 min per image on Docker Desktop.
COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=build /workspace/libs ./libs
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web ./apps/web
# Per-package node_modules must point into the prod tree, not the dev one.
# (libs/ui has no runtime deps, so the prod tree has no node_modules for it.)
COPY --from=prod-deps /workspace/libs/db/node_modules ./libs/db/node_modules
COPY --from=prod-deps /workspace/libs/auth/node_modules ./libs/auth/node_modules
COPY --from=prod-deps /workspace/libs/shared-types/node_modules ./libs/shared-types/node_modules
COPY --from=prod-deps /workspace/libs/api-client/node_modules ./libs/api-client/node_modules
COPY --from=prod-deps --chown=nextjs:nodejs /workspace/apps/web/node_modules ./apps/web/node_modules

WORKDIR /workspace/apps/web

USER nextjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node_modules/.bin/next", "start"]
