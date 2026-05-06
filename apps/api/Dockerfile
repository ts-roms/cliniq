# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ NestJS api.
# Build runs from the monorepo root so workspace deps resolve cleanly.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /workspace

# ── deps ──────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY libs/db/package.json libs/db/
COPY libs/auth/package.json libs/auth/
COPY libs/shared-types/package.json libs/shared-types/
COPY libs/ui/package.json libs/ui/
COPY libs/ai-prompts/package.json libs/ai-prompts/
COPY libs/api-client/package.json libs/api-client/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY apps/api-e2e/package.json apps/api-e2e/
COPY apps/ai-service/package.json apps/ai-service/
COPY apps/ai-service-e2e/package.json apps/ai-service-e2e/
RUN pnpm install --frozen-lockfile

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
COPY --from=build --chown=nestjs:nodejs /workspace/node_modules ./node_modules

# Workspace libs the api require()s at runtime.
COPY --from=build --chown=nestjs:nodejs /workspace/libs/db ./libs/db
COPY --from=build --chown=nestjs:nodejs /workspace/libs/auth ./libs/auth
COPY --from=build --chown=nestjs:nodejs /workspace/libs/shared-types ./libs/shared-types
COPY --from=build --chown=nestjs:nodejs /workspace/libs/ai-prompts ./libs/ai-prompts

# api bundle + Prisma migrations (run prisma migrate deploy from this dir)
COPY --from=build --chown=nestjs:nodejs /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nodejs /workspace/apps/api/package.json ./apps/api/

WORKDIR /workspace/apps/api

USER nestjs

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
