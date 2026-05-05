# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ ai-service (NestJS Bedrock proxy).
# Same pattern as apps/api/Dockerfile.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY apps/ai-service/package.json apps/ai-service/
COPY apps/ai-service-e2e/package.json apps/ai-service-e2e/
COPY apps/api/package.json apps/api/
COPY apps/api-e2e/package.json apps/api-e2e/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY libs/db/package.json libs/db/
COPY libs/auth/package.json libs/auth/
COPY libs/shared-types/package.json libs/shared-types/
COPY libs/ui/package.json libs/ui/
COPY libs/ai-prompts/package.json libs/ai-prompts/
COPY libs/api-client/package.json libs/api-client/
RUN pnpm install --frozen-lockfile

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
COPY --from=build --chown=nestjs:nodejs /workspace/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /workspace/libs/auth ./libs/auth
COPY --from=build --chown=nestjs:nodejs /workspace/libs/ai-prompts ./libs/ai-prompts
COPY --from=build --chown=nestjs:nodejs /workspace/libs/shared-types ./libs/shared-types
COPY --from=build --chown=nestjs:nodejs /workspace/apps/ai-service/dist ./apps/ai-service/dist
COPY --from=build --chown=nestjs:nodejs /workspace/apps/ai-service/package.json ./apps/ai-service/

WORKDIR /workspace/apps/ai-service

USER nestjs

EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4100/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
