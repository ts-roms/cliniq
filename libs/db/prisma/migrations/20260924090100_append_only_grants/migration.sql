-- Make the append-only tables actually append-only.
--
-- 20260502160000_audit_and_files granted SELECT + INSERT on audit_logs and
-- said so in a comment:
--
--     -- intentionally NOT granting UPDATE or DELETE — audit log is append-only.
--
-- That grant was never the whole story. 20260501000001_rls_policies had
-- already run:
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cliniq_app;
--
-- Default privileges apply to every table created afterwards, so audit_logs
-- came into existence with all four privileges and the later GRANT of two of
-- them changed nothing. A narrower GRANT does not subtract; only REVOKE does.
--
-- Verified on a fresh database built from these migrations:
--
--     table_name  | privileges
--     audit_logs  | DELETE,INSERT,SELECT,UPDATE
--
-- So the audit trail has been modifiable and deletable by the application
-- role this whole time. RetentionService even documents the opposite —
-- skipAuditLogs() logs "cliniq_app lacks DELETE grant on audit_logs" — so the
-- application already assumes what this migration finally makes true.
--
-- Nothing in the codebase updates or deletes an audit row: retention
-- deliberately skips them, and no other call site exists. Revoking is
-- therefore behaviour-preserving for the app and restorative for the control.

REVOKE UPDATE, DELETE ON "audit_logs" FROM cliniq_app;

-- Same reasoning for amendments. An amendment is itself part of the clinical
-- record: a mistaken one is corrected by adding the next version, exactly as
-- a mistaken note is. The GRANT in the creating migration was subject to the
-- same default-privileges trap.
REVOKE UPDATE, DELETE ON "consultation_amendments" FROM cliniq_app;

-- NOTE for whoever adds the next append-only table: granting SELECT, INSERT
-- is not enough. You must REVOKE UPDATE, DELETE explicitly, or inherit all
-- four from the schema default privileges above. The default is deliberately
-- left permissive because every other table needs all four; append-only is
-- the exception and has to say so.
