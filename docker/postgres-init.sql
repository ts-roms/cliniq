-- Bootstrap the postgres container for ClinIQ. Runs ONCE on first boot
-- (postgres' /docker-entrypoint-initdb.d/ contract); subsequent boots skip.
--
-- Creates the application role used by the api at runtime. Migrations later
-- (via `prisma migrate deploy`) own schema creation + RLS policies; this file
-- only handles role + login password so DATABASE_URL_APP can connect.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cliniq_app') THEN
    -- LOGIN here so the app role can actually connect. The 20260501000001
    -- RLS migration created it as NOLOGIN; the IF NOT EXISTS makes that
    -- migration a no-op on this fresh DB (we beat it to the punch).
    CREATE ROLE cliniq_app LOGIN PASSWORD 'cliniq_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE cliniq TO cliniq_app;
GRANT USAGE ON SCHEMA public TO cliniq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cliniq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cliniq_app;
