# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ Next.js web app (standalone output).

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
# Build-time public env. Next.js inlines NEXT_PUBLIC_* into the client bundle
# during `next build`, so the value MUST be present at this stage. Railway
# passes service variables as build args only when the Dockerfile declares
# them with ARG — runtime-only env wouldn't reach Next.js's compiler.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Emit .next/standalone (see next.config.js) — the runner ships only that.
ENV NEXT_OUTPUT_STANDALONE=1

# Regenerate the typed api-client SDK from apps/api/openapi.json (committed in
# git as the contract snapshot). Done inline rather than via the nx target so we
# don't transitively trigger an api build, which would require a live DB.
RUN pnpm exec nx sync \
 && pnpm --dir libs/db exec prisma generate \
 && pnpm --dir libs/api-client exec openapi-ts \
 && (cd libs/api-client && node scripts/strip-js-extensions.mjs) \
 && pnpm exec nx run @org/web:build

# ── runner ────────────────────────────────────────
# Next's standalone output: apps/web/server.js plus a node_modules holding
# only the modules the server actually imports (traced at build time from
# the monorepo root). The static assets and public/ are not part of the
# trace and are copied alongside, as Next documents. This replaced a runner
# that shipped the whole workspace prod node_modules (2.6 GB image).
FROM node:22-alpine AS runner
RUN apk add --no-cache wget \
 && addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
