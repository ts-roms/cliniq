# Running the Web and Mobile Apps — Operational Runbook

> **Audience:** Anyone — engineer, designer, QA — who needs to bring the
> ClinIQ web app or the Expo mobile app up locally.
> **Time to first browser load:** ~5 minutes (Docker path), ~10 minutes (native).
> **Time to mobile on real device:** add ~5 minutes for Expo Go install.

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | 22+ | Both apps target Node 22 |
| pnpm | 10+ | The monorepo uses pnpm workspaces |
| PostgreSQL | 16 | Database. Skip if using the Docker path |
| Docker Desktop | latest | Optional — only for the Docker path |
| Expo Go (mobile) | latest | iOS App Store / Android Play Store |
| Android Studio / Xcode | optional | Only for **native** simulator builds |

```bash
node -v       # v22.x or newer
pnpm -v       # 10.x or newer
```

---

## Step 1 — One-time setup

```bash
git clone <repo-url> cliniq
cd cliniq

# Install all workspace dependencies
pnpm install

# Bootstrap env vars
cp .env.example .env
# Edit .env — at minimum:
#   JWT_SECRET=<32+ random chars>
#   DATABASE_URL=<your local Postgres URL>
```

**`.env` keys you'll touch most:**

| Key | What sets it |
|---|---|
| `DATABASE_URL` | Local Postgres connection string |
| `JWT_SECRET` | Random 32+ char string, any value for dev |
| `NEXT_PUBLIC_API_URL` | URL the **web** browser hits (default `http://localhost:4000`) |
| `EXPO_PUBLIC_API_URL` | URL the **mobile** device hits — needs your LAN IP, see Mobile section |

---

## Step 2 — Bring up the API + database

### Path A: Docker (one command, full stack)

Brings up Postgres, runs every Prisma migration, then starts api +
ai-service + web. Mobile is **not** in the compose stack — see Step 3.

```bash
docker compose up -d --build

# Verify everything is healthy
docker compose ps
curl http://localhost:4000/api/health
```

URLs:
- `http://localhost:3000` — web (Next.js)
- `http://localhost:4000/api` — api (Swagger UI at `/api/docs`)
- `http://localhost:4100/ai` — ai-service

Common docker commands:

```bash
docker compose logs -f api          # tail any service
docker compose run --rm migrate     # re-run after schema changes
docker compose down                 # stop, keep volume
docker compose down -v              # stop + wipe data
```

### Path B: Native (faster hot-reload)

```bash
# 1. Apply migrations against your local Postgres
pnpm --dir libs/db exec prisma migrate deploy

# 2. Run each app in a separate terminal
pnpm nx serve @org/api          # http://localhost:4000/api
pnpm nx serve @org/ai-service   # http://localhost:4100
pnpm nx dev   @org/web          # http://localhost:3000
```

> **First-time gotcha:** if Prisma reports a stale generated client, run
> `pnpm --dir libs/db exec prisma generate` before serving the api.

---

## Step 3 — Seed demo data (optional but recommended)

Without seed data the UI is empty. Two seed scripts:

```bash
# Clinic-side demo: 1 tenant, 5 staff, 3 patients (one with portal login).
pnpm db:seed

# Lab-side demo: paired LAB + CLINIC tenants, 4 products, 2 materials,
# 8 cases in mixed states, 3 invoices. Useful for showing a populated lab UI.
pnpm seed:demo-lab
```

Seeded logins (password for both: `Password123!`):

| Tenant | Login |
|---|---|
| `demo` (clinic) | `owner@demo.local` |
| `demo-lab` (lab) | `lab-owner@demo.local` |
| `demo-clinic` (clinic) | `clinic-owner@demo.local` |

---

## Step 4 — Run the web app

The web app is already running if you took the Docker path. For native:

```bash
pnpm nx dev @org/web
```

Open `http://localhost:3000`. The web reads `NEXT_PUBLIC_API_URL` at
**build time** (Next.js bakes public env into the bundle), so if you
change the api URL you must restart `nx dev`.

### Routes worth knowing

| Route | What |
|---|---|
| `/login` | Clinic staff login |
| `/dashboard` | Post-login landing for clinic staff |
| `/lab/cases` | Lab-tenant inbox (lands here for `kind: LAB` tenants) |
| `/lab/billing` | Lab invoices |
| `/lab/stats` | Lab metrics dashboard |
| `/lab-cases` | Clinic-side: cases sent to associated labs |
| `/lab-invoices` | Clinic-side: invoices received from labs |
| `/portal/login` | Patient portal entry |
| `/platform/login` | Superadmin console (separate JWT audience) |
| `/pricing` | Public pricing page |

### Web build (production)

```bash
pnpm nx build @org/web
pnpm nx start @org/web    # serves the production build
```

---

## Step 5 — Run the mobile app (Expo)

Mobile **is not** in the Docker stack. You run Metro on your host and
either an emulator/simulator or your physical phone.

### 5a. Set the api URL the device will hit

Mobile runs on a phone/emulator on a different network host than your
laptop. `localhost` won't work — you need your LAN IP.

```bash
# Mac / Linux
ipconfig getifaddr en0      # e.g. 192.168.1.42
# Windows
ipconfig | findstr IPv4     # find your active adapter's IPv4
```

Set it in `.env` (or export inline before running Expo):

```env
EXPO_PUBLIC_API_URL=http://192.168.1.42:4000
```

> **Same Wi-Fi network required.** If your laptop is on Wi-Fi and your
> phone is on cellular, the device can't reach your laptop. Either join
> the same Wi-Fi or expose the api with a tunnel (e.g. `ngrok`, `cloudflared`).

### 5b. Start Metro (the Expo bundler)

```bash
pnpm nx start @org/mobile
```

This opens the Expo dev menu in your terminal. Press:

| Key | What it does |
|---|---|
| `s` | Switch between Expo Go and a development build |
| `i` | Open iOS Simulator (Mac only, requires Xcode) |
| `a` | Open Android Emulator (requires Android Studio AVD) |
| `w` | Open in browser (Expo web — most features work) |
| `r` | Reload the bundle |
| `m` | Toggle the in-app dev menu |
| `?` | Show all shortcuts |

A QR code prints in the terminal. **On your phone:**

- **iOS:** open the Camera app → point at the QR → tap the Expo Go banner
- **Android:** open Expo Go → tap *Scan QR code*

### 5c. Native simulators (optional, faster than physical device)

```bash
pnpm nx run @org/mobile:run-ios       # Mac only, requires Xcode
pnpm nx run @org/mobile:run-android   # requires Android Studio + an AVD
```

These build a development client and install it on the simulator. Slower
first time (~3 min), instant after.

### 5d. Push notifications

Push works through `expo-notifications` and the api's
`/api/notifications/register-push-token` endpoint. **Limitations:**

- **Expo Go:** push tokens are issued but the api can only deliver via
  the Expo Push service. Real-device tokens are stable; simulator tokens
  rotate per build.
- **iOS Simulator:** does **not** receive push at all (Apple limitation).
  Test push on a physical iOS device or Android emulator.
- **Android Emulator:** push works if the AVD has Google Play Services
  installed.

The api logs `[push] no devices for user X` if no push tokens are
registered — that's normal until the user has signed in on a device.

### 5e. Login on mobile

The mobile app shares the staff/patient JWT scheme with web. After
seeding (Step 3), you can sign in with:

| Account | Sees |
|---|---|
| `owner@demo.local` | Staff shell — Patients / Schedule / Lab / Inbox |
| `clinic-owner@demo.local` | Same staff shell, populated with seeded lab cases |
| `patient1@demo.local` | Patient portal — Home / Visits / Records / Bills |

---

## Common issues

### "Network request failed" on mobile after login

Either:
1. `EXPO_PUBLIC_API_URL` still points at `localhost` instead of your LAN IP, **or**
2. Your phone and laptop are on different Wi-Fi networks, **or**
3. macOS/Windows firewall is blocking inbound port 4000.

```bash
# Quick check — from your laptop:
curl http://192.168.1.42:4000/api/health    # ← use your real LAN IP
# Should return {"status":"ok",...}. If this fails, the api isn't bound
# to 0.0.0.0; restart it with HOST=0.0.0.0 if needed.
```

### "Prisma client out of date" on api boot

```bash
pnpm --dir libs/db exec prisma generate
```

### Web env var changes not taking effect

Next.js bakes `NEXT_PUBLIC_*` at build/start time. Restart `pnpm nx dev @org/web` after editing `.env`.

### Expo: "Unable to resolve module '@org/api-client'"

The generated SDK is regenerated on api changes. From repo root:

```bash
pnpm exec nx run @org/api-client:generate
```

Then restart Metro (`r` in the Expo terminal).

### Expo: dev menu doesn't open on shake

Use the keyboard shortcut `m` in the Metro terminal, or hit `Cmd+D` (iOS) / `Cmd+M` (Android).

---

## Production builds (mobile)

EAS Build handles iOS/Android binaries. Configured in `apps/mobile/eas.json`:

| Profile | Output |
|---|---|
| `development` | dev client (`expo-dev-client`), distribution: internal |
| `preview` | iOS simulator build + Android APK, distribution: internal |
| `production` | Android app-bundle for Play Store; iOS goes through `eas submit` |

Run from `apps/mobile`:

```bash
cd apps/mobile
eas build --profile preview --platform all       # builds APK + iOS sim
eas build --profile production --platform android
```

`eas-build-post-install` (declared in `apps/mobile/package.json`) runs at
the start of every EAS build to wire the workspace properly — don't
remove it.
