// Railway project definition (Infrastructure as Code).
//
// This is the source of truth for the `cliniq` Railway project: the three app
// services, Postgres, build/deploy settings, and which variables exist.
// Variable *values* are `preserve()` — they live only in Railway (secrets:
// JWT_SECRET, AI_SERVICE_TOKEN, CLINIQ_APP_DB_PASSWORD; the rest are
// references such as `${{api.RAILWAY_PUBLIC_DOMAIN}}`). docs/railway.md lists
// every variable and its value shape.
//
// Workflow (needs `pnpm add -Dw railway` — already in package.json — and
// Railway CLI >= 5.42):
//   railway link                      # once per checkout
//   railway config plan               # diff this file against Railway
//   railway config apply              # apply after reviewing the plan
//   railway config pull --force       # import dashboard changes back here
//
// The old per-service apps/*/railway.json files are gone: Railway rejects
// config-as-code on new services ("deprecated, use .railway/railway.ts").
import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume,
} from 'railway/iac';

export default defineRailway(() => {
  const cliniq = github('ts-roms/cliniq', { checkSuites: false });

  const Postgres = postgres('Postgres', { region: 'sfo' });
  Postgres.networking = {
    privateNetworkEndpoint: 'postgres',
    tcpProxies: { '5432': {} },
  };
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'sfo',
    sizeMB: 5000,
  });
  const aiService = service('ai-service', {
    source: cliniq,
    build: {
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/ai-service/Dockerfile',
      watchPatterns: [
        'apps/ai-service/**',
        'libs/ai-prompts/**',
        'libs/shared-types/**',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ],
    },
    start: 'node dist/main.js',
    healthcheck: '/ai/health',
    healthcheckTimeout: 120,
    replicas: { sfo: 1 },
    env: {
      AI_SERVICE_TOKEN: preserve(),
      CORS_ORIGINS: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
    },
  });
  const web = service('web', {
    source: cliniq,
    build: {
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/web/Dockerfile',
      watchPatterns: [
        'apps/web/**',
        'libs/ui/**',
        'libs/api-client/**',
        'libs/shared-types/**',
        'libs/auth/**',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ],
    },
    start: 'node apps/web/server.js',
    healthcheck: '/',
    healthcheckTimeout: 120,
    replicas: { sfo: 1 },
    env: {
      HOSTNAME: preserve(),
      NEXT_PUBLIC_API_URL: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
    },
  });
  const api = service('api', {
    source: cliniq,
    build: {
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/api/Dockerfile',
      watchPatterns: [
        'apps/api/**',
        'libs/db/**',
        'libs/auth/**',
        'libs/shared-types/**',
        'libs/ai-prompts/**',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ],
    },
    start: 'node dist/main.js',
    // Apply pending migrations before the new version takes traffic. Runs in
    // the api image as the Postgres superuser (MIGRATE_DATABASE_URL =
    // ${{Postgres.DATABASE_URL}}): the api's own DATABASE_URL is the
    // RLS-bound cliniq_app role, which cannot create tables or change
    // grants. A failed migration fails the deploy, so the previous version
    // keeps serving instead of new code running on an old schema.
    preDeploy: 'npm run migrate:deploy',
    healthcheck: '/api/health',
    healthcheckTimeout: 120,
    replicas: { sfo: 1 },
    env: {
      AI_SERVICE_TOKEN: preserve(),
      AI_SERVICE_URL: preserve(),
      APPT_AUTO_NOSHOW_ENABLED: preserve(),
      APPT_REMINDERS_ENABLED: preserve(),
      CLINIQ_APP_DB_PASSWORD: preserve(),
      COOKIE_SAMESITE: preserve(),
      COOKIE_SECURE: preserve(),
      CORS_ORIGINS: preserve(),
      DATABASE_URL: preserve(),
      JANITOR_ENABLED: preserve(),
      JWT_EXPIRES_IN: preserve(),
      JWT_SECRET: preserve(),
      MIGRATE_DATABASE_URL: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
      PORTAL_BASE_URL: preserve(),
      PUBLIC_API_URL: preserve(),
      REFRESH_TOKEN_EXPIRES_IN: preserve(),
      TRUST_PROXY: preserve(),
    },
  });

  return project('cliniq', {
    resources: [aiService, web, Postgres, api, postgresVolume],
  });
});
