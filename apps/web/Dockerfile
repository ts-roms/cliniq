# syntax=docker/dockerfile:1.7
# Multi-stage build for the ClinIQ Next.js web app (standalone output).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/api-e2e/package.json apps/api-e2e/
COPY apps/mobile/package.json apps/mobile/
COPY apps/ai-service/package.json apps/ai-service/
COPY apps/ai-service-e2e/package.json apps/ai-service-e2e/
COPY libs/db/package.json libs/db/
COPY libs/auth/package.json libs/auth/
COPY libs/shared-types/package.json libs/shared-types/
COPY libs/ui/package.json libs/ui/
COPY libs/ai-prompts/package.json libs/ai-prompts/
COPY libs/api-client/package.json libs/api-client/
RUN pnpm install --frozen-lockfile

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
COPY --from=build --chown=nextjs:nodejs /workspace/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /workspace/libs ./libs
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web ./apps/web

WORKDIR /workspace/apps/web

USER nextjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node_modules/.bin/next", "start"]
