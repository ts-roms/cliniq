# Seeded Accounts

Seeded **tenant users** (staff and patients) share the password **`P@ssw0rd123`**.
Seeded **platform operators** use **`ChangeMe@123`** — a change-me placeholder, not a secret.

Both are overridable, and should be on anything reachable by other people:
`DEMO_PASSWORD` for the tenant users, `PLATFORM_PASSWORD` (or
`PLATFORM_ADMIN_PASSWORD` for `seed:platform-admin`) for the operators.
`SEED_PLATFORM_ADMIN=0` skips the operator account entirely.

Three seed scripts exist:

| Command                    | Script                                                                          | What it creates                               |
| -------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `pnpm db:seed`             | [tools/scripts/seed-dev.ts](../tools/scripts/seed-dev.ts)                       | Platform admin + `demo` clinic tenant         |
| `pnpm seed:demo-lab`       | [tools/scripts/seed-demo-lab.ts](../tools/scripts/seed-demo-lab.ts)             | `demo-lab` + `demo-clinic` linked tenant pair |
| `pnpm seed:platform-admin` | [tools/scripts/seed-platform-admin.ts](../tools/scripts/seed-platform-admin.ts) | One platform admin from env vars (prod-safe)  |

## `pnpm db:seed` — dev fixtures

Runs the Prisma catalog seed (drugs, ICD-10) first, then `seed-dev.ts`.

### Platform Console

Operator-side admins managing the SaaS itself. Stored in the `platform_admins` table — not tenant-scoped, no `TenantUser` membership. Upserted by email (survives re-seed; password reset to default). Password: `ChangeMe@123` (`PLATFORM_PASSWORD`), not the tenant-user password.

| Email                   | Name              | Notes                        |
| ----------------------- | ----------------- | ---------------------------- |
| `platform@cliniq.local` | Platform Operator | Full platform-console access |

### Tenant: `demo`

Tenant slug `demo` (Demo Clinic, plan `PREMIUM` so every gated module is reachable, status `TRIAL`, 30-day trial). Wiped and recreated on every seed run via `Tenant` cascade.

Also seeds a starter **visit-type** catalogue — General consultation (default), Annual physical, Dental cleaning, Prenatal checkup — so the visit-type picker on booking and the "Visit focus" panel on the consult have something to show. Manage them under Settings → Visit types.

#### Staff

| Email                  | Name                 | Role           |
| ---------------------- | -------------------- | -------------- |
| `owner@demo.local`     | Demo Owner           | `OWNER`        |
| `admin@demo.local`     | Demo Admin           | `ADMIN`        |
| `doctor@demo.local`    | Dr. Juana Cruz       | `DOCTOR`       |
| `nurse@demo.local`     | Nurse Pedro Reyes    | `NURSE`        |
| `reception@demo.local` | Reception Mae Santos | `RECEPTIONIST` |

#### Patients

| MRN       | Name             | DOB        | Sex    | Email                 | Portal Login    |
| --------- | ---------------- | ---------- | ------ | --------------------- | --------------- |
| `MRN-001` | Maria Dela Cruz  | 1992-04-12 | FEMALE | `patient1@demo.local` | Yes (`PATIENT`) |
| `MRN-002` | Jose Rizal       | 1985-06-19 | MALE   | —                     | No              |
| `MRN-003` | Andres Bonifacio | 1978-11-30 | MALE   | —                     | No              |

## `pnpm seed:demo-lab` — lab module demo

Opt-in; not part of `pnpm db:seed`. Creates a LAB tenant and a CLINIC tenant with an active `LabClinicLink` between them, plus a product catalog (3 categories, 4 products), materials with lots, 8 lab cases in mixed statuses (`SUBMITTED` → `DELIVERED`), and invoices in `PAID` / `ISSUED` / `DRAFT` states. Both tenants are wiped and recreated on every run.

| Slug          | Name                       | Kind     | Plan                         | Status   |
| ------------- | -------------------------- | -------- | ---------------------------- | -------- |
| `demo-lab`    | Cebu Dental Lab (demo)     | `LAB`    | `LAB_PREMIUM` (full-service) | `ACTIVE` |
| `demo-clinic` | Manila Smile Clinic (demo) | `CLINIC` | `PRO`                        | `ACTIVE` |

| Email                     | Name         | Tenant        | Role    |
| ------------------------- | ------------ | ------------- | ------- |
| `lab-owner@demo.local`    | Lab Owner    | `demo-lab`    | `OWNER` |
| `clinic-owner@demo.local` | Clinic Owner | `demo-clinic` | `OWNER` |

## `pnpm seed:platform-admin` — production bootstrap

No fixed account. Reads `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_NAME` from env (both required) plus `PLATFORM_ADMIN_PASSWORD` (12+ chars, defaults to `ChangeMe@123`) and upserts a single `platform_admins` row. Does not touch tenant data, so it is safe to run on Railway to create the first superadmin. On an existing row the name and password are updated; MFA state and `lastLogin` are preserved.

```bash
railway run --service api \
  env PLATFORM_ADMIN_EMAIL=you@example.com \
      PLATFORM_ADMIN_NAME='Your Name' \
      PLATFORM_ADMIN_PASSWORD='<32-char-strong-pass>' \
  pnpm tsx tools/scripts/seed-platform-admin.ts
```

## Re-running

- `pnpm db:seed` — runs catalog seed (drugs, ICD-10) then dev fixtures.
- `pnpm seed:demo-lab` — re-creates the `demo-lab` / `demo-clinic` pair.
- `pnpm db:reset` — wipes the database, re-applies all migrations, then runs only the Prisma catalog seed (drugs, ICD-10). Run `pnpm db:seed` afterwards to get the accounts above, and `pnpm seed:demo-lab` if you need the lab pair.
- The `demo`, `demo-lab`, and `demo-clinic` tenants are fully cascaded on each run; `platform_admins` rows are upserted (preserved across re-runs, password reset to default).
