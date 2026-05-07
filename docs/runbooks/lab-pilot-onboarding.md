# Lab Pilot Onboarding — Operational Runbook

> **Audience:** Whoever's onboarding the first paying dental-lab tenant.
> **Goal:** From "lab signed the contract" to "lab is using the product" with no surprises.

---

## Pre-flight checks

### 1. Apply pending migrations on Railway

The lab module rolled out across several migrations. Before onboarding,
confirm prod is at the latest:

```bash
# From Railway → cliniq-postgres → Connect → Public Network → copy DATABASE_URL
DATABASE_URL='postgresql://postgres:<password>@<public-host>:<port>/railway' \
  pnpm --dir libs/db exec prisma migrate status
```

Lab-related migrations (in apply order):

| Migration | What it adds |
|---|---|
| `20260507100000_lab_billing` | `lab_invoices`, `lab_invoice_items`, `lab_payment_links` + RLS |
| `20260507120000_lab_treatment_plans` | `lab_treatment_plans` + files + approvals |
| `20260507130000_lab_case_disputes` | `lab_case_disputes` + messages |

To deploy:

```bash
DATABASE_URL='postgresql://...' \
  pnpm --dir libs/db exec prisma migrate deploy
```

### 2. Confirm readiness via the health endpoint

```bash
curl https://<api-domain>/api/health/lab-readiness | jq
```

Expected shape:

```jsonc
{
  "status": "ready",
  "env": {
    "required": { "configured": [...], "missing": [] },
    "optional": { "configured": [...], "missing": [...] }
  },
  "migrations": {
    "latest": "20260507130000_lab_case_disputes",
    "applied": true
  }
}
```

If `required.missing` is non-empty or `migrations.applied` is `false`,
**stop and fix that first.** Onboarding a paying lab over a broken
config is the worst time to find out.

### 3. Optional env vars — wire what the pilot will actually use

These default to "feature is off" rather than crashing. Set in Railway:

| Var | Effect when missing |
|---|---|
| `RESEND_API_KEY` | Email notifications log only — no invoices/cases/plans emailed |
| `WEB_URL` | Email links point at `localhost:3000` instead of prod |
| `AI_SERVICE_URL` | "AI draft" button on treatment plans throws 502 |
| `PAYMONGO_SECRET_KEY` | "PayMongo link" button throws a friendly error; manual links still work |
| `PAYMONGO_WEBHOOK_SECRET` | Webhook endpoint rejects all events (signature can't be verified) |

For the pilot, the minimum-useful set is `RESEND_API_KEY` + `WEB_URL`.
PayMongo is recommended once the lab is doing real billing.

---

## Provisioning the lab tenant

There are two paths. Pick based on whether you need scripted or manual.

### A. Scripted (demo / sandbox / repeatable)

`pnpm seed:demo-lab` creates a paired demo lab + clinic with sample data.
Useful for showing prospects the populated UI before they sign.

```bash
DATABASE_URL='postgresql://...' pnpm seed:demo-lab
```

Logins after seeding (password: `Password123!`):
- Lab owner: `lab-owner@demo.local`
- Clinic owner: `clinic-owner@demo.local`

**Don't run this against your real prod DB** — it wipes any tenant with
slug `demo-lab` or `demo-clinic`.

### B. Manual (real customer)

Use the platform admin console at `/platform/login`:

1. Create the lab tenant with `kind: LAB`, `labPlan: LAB_PREMIUM` (or
   whichever tier the pilot is on), `status: ACTIVE`.
2. Add the lab's primary contact as the `OWNER` user.
3. The owner will get a signup-completion email; they set their own
   password.

Once the owner logs in, they land at `/lab/cases` (the lab UI shell).

---

## First-day walkthrough with the lab

Run through these in order on a screenshare. Each maps to a feature the
pilot will use within their first week.

1. **Catalog** (`/lab/catalog`): create their first product. The
   `phases` array drives the manufacturing tracker on each case — set
   it now even if rough.
2. **Clinics** (`/lab/clinics`): invite their first associated clinic
   by slug. The clinic accepts at `/lab-invitations`.
3. **Materials** (`/lab/materials`): add at least one material + lot.
   Lab Conformity declarations pull lot numbers from here.
4. **Cases inbox** (`/lab/cases`): wait for the clinic to submit a case,
   then walk through Accept → Phase advance → Awaiting pickup → Shipped
   → Delivered. Each transition emails the clinic owner.
5. **Billing** (`/lab/billing`): Generate-from-cases for the delivered
   case, issue, download PDF. PayMongo button if creds are set.
6. **Stats** (`/lab/stats`): briefly — populated only after a few cases
   move through. Set expectations: "this lights up after a week of use."

---

## Premium-only features (Standard plans don't see these)

If the pilot is on `LAB_BASIC` or `LAB_STANDARD`, hide:

- Treatment plans (`LAB_TREATMENT_PLAN`)
- AI assist (`LAB_AI_ASSIST`)
- Disputes manager (`LAB_DISPUTE_MANAGER`)
- E-invoice scoping (`LAB_EINVOICE`)
- 3D viewer (`LAB_3D_VIEWER`) — not implemented yet anyway
- Custom domain (`LAB_CUSTOM_DOMAIN`) — also not implemented

The `FeatureGuard` returns 402 Payment Required if a non-Premium plan
hits a Premium endpoint, so it fails closed by design.

---

## Common issues

### "I clicked Generate from cases and nothing happened"
The clinic side hasn't delivered any cases yet. Generate-from-cases
only picks up cases in `DELIVERED` status. Confirm by filtering
`/lab/cases?status=DELIVERED`.

### "AI draft button errored"
- `AI_SERVICE_URL` not set in Railway, or the ai-service container is
  down. Check `https://<ai-service-domain>/api/health`.
- Lab plan is below Premium. AI assist is gated by `LAB_AI_ASSIST`.

### "PayMongo webhook isn't firing"
- `PAYMONGO_WEBHOOK_SECRET` not set → controller returns 401 on every
  event.
- Check `paymongo-signature` header matches what PayMongo sent. The
  signature header must be passed through verbatim — proxies sometimes
  strip non-standard headers.
- Confirm the webhook URL in PayMongo dashboard is
  `https://<api-domain>/api/webhooks/paymongo` (not under `/api/lab/`).

### "Email notifications aren't sending"
- `RESEND_API_KEY` unset → mailer is a no-op (you'll see
  `[mailer:noop]` log lines).
- The recipient is not the tenant `OWNER` user, or there is no `OWNER`.
  Notification helper picks the oldest `ACTIVE` `OWNER` only.

---

## Post-pilot checklist

After ~30 days of pilot use:

- Pull case + invoice counts via `/lab/stats` — sanity check usage.
- Audit the audit log (`/audit`) for failed transitions or webhook
  retries.
- Ask the lab what they used most + what they ignored. Cut features
  they ignored from the next pilot.
