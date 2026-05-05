# Backup & Restore — Operational Runbook

> **RPO target:** ≤ 24 hours (daily snapshot + 5-min PITR after launch)
> **RTO target:** ≤ 4 hours for production database
> **Storage:** AWS RDS automated snapshots + manual snapshots before every migration

---

## Backup configuration

Set in `infra/terraform/modules/database/main.tf`:

| Setting | Value | Why |
|---|---|---|
| `backup_retention_period` | 35 days | NPC retention floor + room for monthly drill |
| `preferred_backup_window` | `18:00-18:30` UTC (02:00–02:30 Manila) | Quiet hours |
| `copy_tags_to_snapshot` | true | Audit + cost allocation |
| `deletion_protection` | true | Block accidental drop |
| `multi_az` | true (prod), false (staging) | Failover capacity |
| `storage_encrypted` | true | AES-256 via AWS KMS |
| Custom KMS key | yes | Key rotation owned by us, not AWS |

S3 (file uploads, audio) backed by versioning + 90-day lifecycle to Glacier IR; deletion is soft via versioned delete-markers.

## Manual snapshot before every prod migration

```bash
aws rds create-db-snapshot \
  --db-instance-identifier cliniq-prod-db \
  --db-snapshot-identifier "pre-migration-$(date -u +%Y%m%d-%H%M%S)" \
  --tags Key=Purpose,Value=PreMigration Key=Migration,Value=20260504020000_pilot_readiness
```

Wait until `status: available` before starting `prisma migrate deploy`.

## Restore drill

Run quarterly. Steps:

1. Pick the most recent automated snapshot.
2. Restore into a new instance `cliniq-restore-drill-YYYYMMDD` in the same VPC + subnet group.
3. Run `pnpm --dir libs/db exec prisma migrate status` against the restore — must say "Database schema is up to date".
4. Run integration smoke test (`pnpm nx run @org/api-e2e:e2e --skip-nx-cache`) against the restored DB.
5. Run our cross-tenant RLS leak test specifically:
   ```bash
   pnpm nx run @org/api:test --testPathPattern=rls.integration
   ```
6. Capture row counts on `patients`, `consultations`, `prescriptions` and compare against current prod (within ±0.1%).
7. Tear down the restore instance.
8. Record drill timestamp + duration in `drill-log.md`.

## Point-in-time recovery (PITR)

Enabled with `backup_retention_period > 0`. To recover to a specific timestamp:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier cliniq-prod-db \
  --target-db-instance-identifier cliniq-prod-db-pitr \
  --restore-time 2026-05-04T18:00:00Z
```

Use this for accidental data loss scenarios (bad migration, bad delete query).

## Disaster recovery scenarios

| Scenario | Target | Procedure |
|---|---|---|
| Single AZ outage | < 5 min unavailability | Multi-AZ failover (automatic) |
| RDS instance corruption | RTO 1h | Restore latest automated snapshot |
| Bad migration | RTO 30min | PITR to t-5min before migration |
| Region failure | RTO 4h | Cross-region snapshot copy → restore in `ap-southeast-2` |
| Ransomware / total compromise | RTO 8h | Restore from immutable cross-account backup vault |

## Cross-region snapshot copy (DR posture)

Configure once via Terraform — daily cross-region snapshot copy to `ap-southeast-2` (Sydney). Encryption uses a regional KMS key; tagged `DR=true`.

## Verifying backups

- `aws rds describe-db-snapshots` lists last 35 days of automated + every manual.
- Daily Lambda alert if no snapshot ≤ 27h old.

## Application-layer tenant restore (one tenant from backup)

The DPA permits per-tenant erasure or restore. Run:

```bash
psql "$RESTORE_DATABASE_URL" \
  -c "COPY (SELECT * FROM patients WHERE \"tenantId\" = '<id>') TO STDOUT" \
  | psql "$PROD_DATABASE_URL" \
  -c "COPY patients FROM STDIN ON CONFLICT (id) DO NOTHING"
```

For a small clinic this is a few minutes; document the procedure when first used.
