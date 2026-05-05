-- Tele recording consent ledger. Schema first; actual upload integration
-- (chunked S3 multipart from the doctor's MediaRecorder) deferred to v2.
-- Adding two enum values + three nullable columns; safe for existing rows.

ALTER TYPE "TeleSignalKind" ADD VALUE IF NOT EXISTS 'CONSENT_REQUEST';
ALTER TYPE "TeleSignalKind" ADD VALUE IF NOT EXISTS 'CONSENT_RESPONSE';

ALTER TABLE "tele_sessions"
  ADD COLUMN "recordingConsentAt"  TIMESTAMP(3),
  ADD COLUMN "recordingDeclinedAt" TIMESTAMP(3),
  ADD COLUMN "recordingFileId"     TEXT;
