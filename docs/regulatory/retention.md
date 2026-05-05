# Data Retention Policy

> **Authority:** RA 10173 (DPA) §11.f — retention only as long as necessary; DOH AO 2008-0029 — clinic record retention; BIR Section 235 — invoicing 10 years; NPC Circular 16-01 §B — log retention.

The public-facing summary is at [/privacy/pia §4](../../apps/web/app/privacy/pia/page.tsx). This is the canonical engineering reference.

## Retention windows

| Data | Window | Mechanism | Rationale |
|---|---|---|---|
| **Active patient record** | Indefinite (while clinic-patient relationship is active) | None | Treatment necessity (§13.f) |
| **Inactive patient record** (no visit > 5y) | +5y archive then anonymize | Annual review | DOH 10y retention |
| **Consultation note (locked)** | Same as patient record | None | Clinical record |
| **Audit log** | 7 years (2555 days) | Daily cron purges past-window rows | NPC §B + tax |
| **Notification (in-app)** | 90 days from creation | Daily cron | UX-only data, low value at age |
| **Audio transcript** | 30 days | Worker job (separate from RetentionService) | Privacy minimization (PIA §5) |
| **Backups (RDS automated)** | 35 days | RDS retention policy | Recovery + audit window |
| **Backups (cross-region DR)** | 90 days | RDS lifecycle | DR posture |
| **AI suggestions** | Same as parent consultation | Cascade delete | Clinical context |
| **Invoice / payment** | 10 years | Manual archive | BIR §235 |
| **DSR request records** | 7 years | Audit table | NPC compliance |

## Deletion mode

- **Hard delete** for: notifications, audit logs past window, audio transcripts.
- **Soft delete + anonymize** for: patients (set name to "REDACTED-{id}", clear contact, retain encounters under tenant retention).
- **Cascade delete** for: AI suggestions when parent consultation is deleted; tenant_users when tenant is deleted.

The DSR module's `EraseProcessor` performs anonymize-mode deletion; `RetentionService` performs hard-delete-mode purges.

## Implementation

- `apps/api/src/retention/retention.service.ts` runs at 03:15 Asia/Manila (= 19:15 UTC).
- An OWNER may trigger ad-hoc via `POST /api/retention/run-now` (audit-logged).
- Deletes per category are logged to CloudWatch + recorded as a single audit entry under `action=retention.purge` per run.

## Drift detection

A weekly query looks for rows past their stated window — alerts if found:

```sql
SELECT
  'audit_logs' AS tbl,
  COUNT(*) AS overdue
FROM audit_logs
WHERE "occurredAt" < NOW() - INTERVAL '2555 days'
UNION ALL
SELECT 'notifications', COUNT(*)
FROM notifications
WHERE "createdAt" < NOW() - INTERVAL '90 days';
```

Wired into the staging Grafana board and a CloudWatch alarm (>0 rows). PagerDuty rule: warn at 24h, page at 7d.
