-- ─────────────────────────────────────────────────────────────────────
-- One-off remediation: enable the `cliniq_app` role for runtime use.
--
-- Background: docker-compose seeds this role with LOGIN via
-- docker/postgres-init.sql, but managed Postgres providers (Railway, RDS)
-- never run that init script. The 20260501000001_rls_policies migration
-- creates the role as NOLOGIN. So out-of-the-box on Railway, the api
-- connects as the `postgres` superuser — and superusers bypass RLS,
-- which means cross-tenant reads silently work.
--
-- Run this ONCE per environment, as the postgres superuser:
--   psql "$POSTGRES_DATABASE_URL" -f tools/scripts/fix-cliniq-app-role.sql -v cliniq_app_password="'<strong-random>'"
--
-- Then update the api's `DATABASE_URL` env var to:
--   postgresql://cliniq_app:<strong-random>@<host>:<port>/<db>?schema=public
-- and redeploy. Migrations should keep using the postgres URL (DDL needs
-- ownership privileges; cliniq_app intentionally doesn't have them).
-- ─────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

-- 1. Add LOGIN + password so the role can actually connect.
-- The :cliniq_app_password variable is provided via -v at psql invocation;
-- callers should pass a strong random secret (NOT 'cliniq_app'). Falls back
-- to the dev default only if you forgot to set it.
\if :{?cliniq_app_password}
\else
  \set cliniq_app_password '''cliniq_app'''
\endif

ALTER ROLE cliniq_app WITH LOGIN PASSWORD :cliniq_app_password;

-- 2. Database + schema access.
DO $$
DECLARE current_db text;
BEGIN
  SELECT current_database() INTO current_db;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO cliniq_app', current_db);
END $$;
GRANT USAGE ON SCHEMA public TO cliniq_app;

-- 3. Re-grant DML on ALL existing tables. The original RLS migration did
-- this once, but tables created by later migrations (lab module, etc.)
-- aren't covered by ALTER DEFAULT PRIVILEGES if those migrations ran AS A
-- DIFFERENT ROLE than the one that originally set the defaults. Re-running
-- this is idempotent.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cliniq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cliniq_app;

-- 4. Future tables created by `postgres` should auto-grant to cliniq_app.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cliniq_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cliniq_app;

-- 5. Verification — should show LOGIN=t, BYPASSRLS=f.
SELECT rolname, rolcanlogin, rolbypassrls
  FROM pg_roles
 WHERE rolname = 'cliniq_app';
