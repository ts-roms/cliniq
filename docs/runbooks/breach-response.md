# Personal Data Breach — Response Runbook

> **Trigger:** Any unauthorized access, disclosure, alteration, or loss of personal data is suspected or confirmed.
> **Authority:** RA 10173 (Data Privacy Act) + IRR §38; NPC Circular 16-03.
> **Notification windows:** Affected clinic within **24h**, NPC within **72h** of confirmation.

---

## Roles

| Role | Owner | Backup |
|---|---|---|
| Incident Commander | DPO | CTO |
| Communications | DPO | Founder |
| Forensics / containment | On-call SRE | CTO |
| Legal counsel | External (retainer) | — |

The DPO is the single point of accountability. The IC drives the timeline below.

---

## T+0 — Discovery

1. **Stop the bleeding.** If the breach is active (e.g., leaked credential being used, public S3 bucket), revoke / rotate / restrict access **first**, write down the action with timestamp, then proceed.
2. Open a private incident channel (Slack `#incident-NNN`).
3. Page the IC. The IC opens a timeline doc (Google Docs template `incident-template`).
4. **Do not delete or rotate logs** — preserve as evidence.

## T+1h — Assessment

Determine within the first hour:

- Categories of data involved (sensitive PII / health records / financial).
- Estimated number of affected data subjects.
- How: vector (compromised credential, code defect, vendor breach, lost device).
- When: earliest possible time of exposure (look at audit logs, CloudTrail, RDS performance insights).
- Whether the breach is ongoing or contained.

Use this to decide if it qualifies for mandatory notification (per IRR §38: yes, if sensitive personal info likely accessed by unauthorized party AND likelihood of real risk to data subjects).

## T+24h — Clinic notification

For every affected tenant, send a written notice (email + portal banner) including:

- Nature of breach
- Personal information involved
- Possible consequences
- Measures taken / proposed
- Contact for further info (DPO email)

Template: `docs/regulatory/templates/breach-notice-clinic.md`.

## T+72h — NPC notification

File via `register.privacy.gov.ph` → "Notification of Personal Data Breach". Required fields per NPC Circular 16-03:

- Description of breach
- Chronology
- Likely impact
- Measures taken / planned
- Contact details of DPO + IC

Email a copy to `complaints@privacy.gov.ph`.

## Patient notification

If sensitive personal info is affected and likely to expose the patient to identity theft, fraud, or material harm, the affected clinic (controller) notifies patients directly. ClinIQ supports the clinic with notification text and channel (SMS via Semaphore + email via Resend).

## Post-incident

- Within 5 business days: published post-mortem (internal).
- Within 10 business days: corrective action plan filed with NPC if requested.
- Within 30 days: implement preventive controls; verify in CI.

## Forensic preservation

- Snapshot affected RDS instance (manual snapshot, retention 1 year).
- Export CloudTrail + S3 access logs for the suspected window.
- Pin Sentry events from the incident.
- Capture process / container memory if relevant.

## Decision tree — does it require notification?

```
unauthorized access/disclosure?
├── no → log and close, monitor
└── yes
    ├── sensitive personal info or financial info? (DPA §3.l)
    │   ├── no → assess risk; usually not notifiable
    │   └── yes
    │       └── real risk of harm to subject?
    │           ├── no → document decision, do not notify
    │           └── yes → NOTIFY (NPC + affected clinics + subjects)
```

---

## Drill schedule

- **Quarterly** tabletop exercise. IC + DPO + on-call SRE walk through a synthetic breach scenario.
- **Annual** full restore drill (see [backup-restore.md](backup-restore.md)).

Drill outcomes recorded in `docs/runbooks/drill-log.md`.
