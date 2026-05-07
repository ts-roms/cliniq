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

Mobile **is not** in the Docker stack. You run Metro (the Expo bundler)
on your host and connect either a physical phone, an iOS Simulator, or
an Android Emulator.

### 5.0 Install Expo Go on your phone (first time only)

The fastest way to see the app is via **Expo Go** — Expo's host app that
loads your dev bundle off your laptop. Install it once:

- **iOS:** [App Store → Expo Go](https://apps.apple.com/app/expo-go/id982107779)
- **Android:** [Play Store → Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)

Sign in to Expo Go with the same Expo account you'll use locally
(optional but recommended — lets you see all your dev projects in one list).

You **don't** need to install the `expo-cli` globally. The repo already
has Expo wired through Nx — `pnpm nx start @org/mobile` is all you need.
If you'd rather use the standalone CLI:

```bash
# Optional: enables `npx expo` shorthand outside Nx
npm install -g expo
```

### 5.1 Set the api URL the device will hit

Mobile runs on a phone/emulator that lives on a different network host
than your laptop. `localhost` resolves to **the device itself**, not to
your dev machine — you need your laptop's LAN IP.

**Find your laptop's LAN IP:**

```bash
# macOS
ipconfig getifaddr en0                    # Wi-Fi adapter
ipconfig getifaddr en1                    # Ethernet, if you're wired

# Linux
hostname -I | awk '{print $1}'

# Windows (PowerShell)
(Get-NetIPAddress -AddressFamily IPv4 |
   Where-Object {$_.InterfaceAlias -like 'Wi-Fi*' -or $_.InterfaceAlias -like 'Ethernet*'} |
   Select-Object -First 1).IPAddress

# Windows (cmd / git-bash)
ipconfig | findstr /R /C:"IPv4 Address"   # pick the one for your active adapter
```

You'll get something like `192.168.1.42`. Set it in the repo-root `.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.42:4000
```

> **Why not use `EXPO_PUBLIC_API_URL=http://localhost:4000`?** That works
> only when you run the Expo *web* target in the same browser as the api.
> On phones/emulators, `localhost` is the device's own loopback.

> **Expo's env loading rule:** the bundler only inlines vars that start
> with `EXPO_PUBLIC_`, and it reads them from the `.env` in the
> *directory you ran the start command from* (i.e. the repo root via
> `pnpm nx start @org/mobile`). Renaming the file or running from
> `apps/mobile/` will silently use a different `.env`.

### 5.2 Make sure phone + laptop are on the same Wi-Fi

A common gotcha: laptop on Wi-Fi, phone on cellular → device can't
reach your laptop. Three options:

1. **Same Wi-Fi (preferred):** join the same network. Most home routers
   route `192.168.x.x` between clients without extra config.
2. **Tunnel mode (works through any network — even cafe Wi-Fi or
   corporate networks that block client-to-client):** see step 5.3.
3. **Cable + adb (Android only):** plug the phone in, run
   `adb reverse tcp:4000 tcp:4000` so `EXPO_PUBLIC_API_URL=http://localhost:4000`
   works from the device.

Verify the api is actually reachable from the device's perspective.
From your laptop:

```bash
curl http://192.168.1.42:4000/api/health     # use your real LAN IP
```

If that returns `{"status":"ok"}` from the laptop but the phone can't
reach it, it's a firewall (macOS Application Firewall, Windows Defender,
or your router's AP isolation). Allow inbound TCP 4000.

### 5.3 Start Metro

```bash
pnpm nx start @org/mobile
```

This boots Metro on `:8081` (the dev bundler) and prints a QR code +
keyboard menu in your terminal. Leave it running in its own terminal.

| Key | What it does |
|---|---|
| `s` | Switch between Expo Go and a development build |
| `i` | Open iOS Simulator (macOS only, requires Xcode) |
| `a` | Open Android Emulator (requires Android Studio AVD) |
| `w` | Open Expo web in your browser (most features work) |
| `r` | Reload the JS bundle on the connected device |
| `j` | Open Chrome DevTools to debug the JS bundle |
| `m` | Toggle the in-app dev menu |
| `shift+m` | Hide all menus |
| `?` | Show all shortcuts |

To start with a clean cache (after `node_modules` changes, schema regen,
or Metro acting up):

```bash
pnpm nx start @org/mobile -- --clear
# or, with the standalone CLI from apps/mobile:
cd apps/mobile && npx expo start -c
```

### 5.4 Connect a device (the four options, easiest first)

#### A. Physical phone via Expo Go (fastest path)

With Metro running:

- **iOS:** open the **Camera** app → point at the QR code in the
  terminal → tap the *Open in Expo Go* banner.
- **Android:** open **Expo Go** → tap *Scan QR code* → point at the
  terminal.

The bundle downloads (10–30 seconds first time), then the app launches.
Hot reload is on by default — save a file, the screen updates in ~1 sec.

#### B. iOS Simulator (macOS only)

Prereqs: Xcode 16+ from the App Store, then run once:

```bash
xcode-select --install
sudo xcodebuild -license accept
```

Open Xcode → Settings → Components → install at least one iOS
simulator. Then with Metro running, press `i` — Expo opens the default
simulator and installs the dev build.

#### C. Android Emulator (any OS)

Prereqs:

1. Install **Android Studio** (free).
2. Open Android Studio → *More Actions* → *Virtual Device Manager*.
3. *Create Device* → pick a phone profile (Pixel 7 is fine) → pick a
   system image (any API 33+ → **Google Play** variant for push
   notifications to work).
4. Add Android SDK platform-tools to your PATH so `adb` is reachable.

Boot the emulator, then with Metro running press `a`.

#### D. Tunnel mode (when LAN doesn't work)

Routes traffic through Expo's relay so any internet-connected device can
reach your bundler. Slower than LAN (200–500ms latency vs. <50ms) but
saves you when on guest Wi-Fi or behind a strict firewall:

```bash
pnpm nx start @org/mobile -- --tunnel
```

First run installs `@expo/ngrok` (Metro will prompt to confirm).

> **Note:** tunnel mode only solves Metro reachability — it does **not**
> tunnel your api server. The phone still hits `EXPO_PUBLIC_API_URL`
> directly, so if the api is on `localhost` you'll need a separate
> tunnel for it (e.g. `cloudflared tunnel --url http://localhost:4000`)
> and update `EXPO_PUBLIC_API_URL` to that URL.

### 5.5 Native dev-client builds (skip Expo Go)

Expo Go runs many apps inside one host. If you need a native module
that Expo Go doesn't ship (e.g. you add a new `expo-*` package), you
need a **dev client** — a custom build of the host app baked just for
this project. From the repo root:

```bash
pnpm nx run @org/mobile:run-ios       # builds + installs on iOS Simulator
pnpm nx run @org/mobile:run-android   # builds + installs on Android Emulator/device
```

First run takes 2–5 minutes; subsequent reloads are as fast as Expo Go.
The QR code in Metro now opens **the dev client** instead of Expo Go.

### 5.6 Login on mobile

After seeding (Step 3), sign in:

| Account | Sees |
|---|---|
| `owner@demo.local` | Staff shell — Patients / Schedule / Lab / Inbox |
| `clinic-owner@demo.local` | Same staff shell, populated with seeded lab cases |
| `patient1@demo.local` | Patient portal — Home / Visits / Records / Bills |

> The mobile app reuses the same JWT scheme as web. The session is
> stored in `expo-secure-store` (iOS Keychain / Android Keystore), so
> killing the app doesn't sign you out.

### 5.7 Push notifications

Push goes through Expo's Push API → your device. The api registers
tokens via `POST /api/notifications/register-push-token`, called
automatically when you sign in.

**Where push works:**

| Environment | Receives push? | Notes |
|---|---|---|
| Physical iOS device + Expo Go | ✅ | Token rotates per Expo Go session |
| Physical iOS device + dev client | ✅ | Token stable across reloads |
| iOS Simulator | ❌ | Apple-imposed — no APNS in the simulator |
| Physical Android device | ✅ | |
| Android Emulator (Google Play image) | ✅ | Make sure to pick the *Google Play* AVD variant, not AOSP |
| Android Emulator (AOSP image) | ❌ | No Play Services → no FCM |
| Expo web (`w`) | ❌ | Use browser notifications API instead (not wired up) |

If you sign in but the api logs `[push] no devices for user X`:

1. Confirm the device actually requested permission — iOS shows a
   modal the first time. If you tapped "Don't allow", reset via
   Settings → ClinIQ → Notifications.
2. Confirm `EXPO_PUBLIC_API_URL` points at a reachable api (Step 5.1).
3. On Android emulator, confirm Play Services is running:
   `adb shell pm list packages | grep com.google.android.gms`.

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

### Expo: Metro hangs on "Starting Metro" or "Waiting on http://localhost:8081"

Usually a leftover Metro instance holding port 8081. Kill it:

```bash
# macOS / Linux
lsof -ti :8081 | xargs kill -9
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 8081 | Select-Object -Expand OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

Then restart with a clean cache: `pnpm nx start @org/mobile -- --clear`.

### Expo: bundle download hangs at 99% on the device

Almost always a phone/laptop network mismatch (see Step 5.2). Quick test:
on the phone's browser, hit `http://<laptop-ip>:8081/status` — should
return `packager-status:running`. If it doesn't, you have a network /
firewall problem, not a code one.

### Expo Go: "There was a problem running the requested app"

The Expo Go SDK version doesn't match the project's. Update Expo Go from
the App Store / Play Store. If Expo Go is already current, the project
is on a newer SDK than Expo Go supports — use a dev client instead
(Step 5.5).

### iOS Simulator: "Unable to boot device, Connection interrupted"

Restart the simulator and Xcode:

```bash
xcrun simctl shutdown all
killall Simulator       # if it's stuck
open -a Simulator       # relaunch fresh
```

### Android: "SDK location not found" or `ANDROID_HOME not set`

Add to your shell rc:

```bash
# macOS / Linux
export ANDROID_HOME="$HOME/Library/Android/sdk"      # macOS
export ANDROID_HOME="$HOME/Android/Sdk"              # Linux
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"

# Windows (PowerShell, in $PROFILE)
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator"
```

### Mobile: `EXPO_PUBLIC_API_URL` change not applied

`EXPO_PUBLIC_*` is read at bundler startup, not at runtime. Stop Metro,
edit `.env`, restart with `pnpm nx start @org/mobile -- --clear`. Just
hot-reloading isn't enough.

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
