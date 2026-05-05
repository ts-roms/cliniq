# syntax=docker/dockerfile:1.7
# One-shot container that runs `prisma migrate deploy` against DATABASE_URL.
# Used by docker-compose's `migrate` service before api/web come up.
#
# Lean by design — no SWC/webpack, no nest build. Just enough to run prisma.

FROM node:22-alpine
RUN corepack enable && apk add --no-cache openssl
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/api-e2e/package.json apps/api-e2e/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY apps/ai-service/package.json apps/ai-service/
COPY apps/ai-service-e2e/package.json apps/ai-service-e2e/
COPY libs/db/package.json libs/db/
COPY libs/auth/package.json libs/auth/
COPY libs/shared-types/package.json libs/shared-types/
COPY libs/ui/package.json libs/ui/
COPY libs/ai-prompts/package.json libs/ai-prompts/
COPY libs/api-client/package.json libs/api-client/
RUN pnpm install --frozen-lockfile --ignore-scripts

# Schema + migrations are all this stage needs.
COPY libs/db/prisma ./libs/db/prisma
COPY libs/db/prisma.config.ts ./libs/db/

WORKDIR /workspace/libs/db

# `migrate deploy` is idempotent — re-runs are no-ops once everything's applied.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy"]
