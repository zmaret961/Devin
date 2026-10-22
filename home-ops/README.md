# Home Operations & Emergency Command Center

A mobile-first PWA for an American homeowner: keep appliance records, manuals and insurance files in one place, stay on top of seasonal maintenance, and get clear step-by-step help when a pipe bursts, you smell gas, the power goes out or a storm hits.

It installs to the iPhone home screen today and is structured to be wrapped with Capacitor for the App Store later.

| Tab | What it does |
| --- | --- |
| **Home** | Maintenance Health Score, upcoming tasks, appliance summary, one-tap Emergency Mode, home details and settings |
| **Emergency** | Emergency Mode toggle (high-contrast amber/red), interactive triage for water leaks, gas leaks, power outages and storm damage, editable emergency contacts with one-tap Call |
| **Assets** | Appliance ledger (brand, model, serial, location, install date, warranty), manuals/receipts per appliance, plus a home-wide document vault for insurance |
| **Maintenance** | Chronological checklist pre-seeded with 22 US seasonal tasks, checkboxes, To do / In progress / Done, filters by status and season |

## Stack

- React 19, Vite 6, TypeScript (strict)
- Tailwind CSS v4 (`@tailwindcss/vite`), Public Sans, lucide line icons
- Zustand for state, framer-motion (`LazyMotion` + `m`) for transitions
- vite-plugin-pwa: manifest, Workbox service worker, `apple-touch-icon`, `theme-color`, `display: standalone`
- Supabase: Auth (email/password, Apple-ready), Postgres with row-level security, Storage for files
- Vitest for unit tests, ESLint (flat config)

## Quick start

```bash
cd home-ops
npm install
npm run dev          # http://localhost:5173
```

With no `.env.local`, the app runs in **Demo Mode**: sign-up, data and uploaded files are kept in this browser (localStorage + IndexedDB) so you can try everything without a backend. A banner says so. Add Supabase credentials (below) to switch to the real backend; no code changes needed.

Other scripts:

```bash
npm run typecheck    # tsc -b
npm run lint         # eslint
npm test             # vitest
npm run build        # production build + service worker in dist/
npm run preview      # serve dist/ on :4173 (use this to test PWA install/offline)
```

## Architecture: the service layer

UI code never talks to Supabase. Everything goes through `src/services/index.ts`, a small typed API:

```ts
import { listAssets, upsertAsset, deleteAsset, listTasks, setTaskStatus,
         listContacts, upsertContact, uploadDocument, getDocumentUrl } from '../services';
```

```
src/
  types/            Profile, Property, Asset, MaintenanceTask, EmergencyContact, StoredDocument
  services/
    index.ts        public API used by the app (validation, starter-data seeding)
    backend.ts      HomeBackend interface both backends implement
    supabase/       the ONLY place that imports @supabase/supabase-js
    local/          Demo Mode backend (localStorage + IndexedDB)
    errors.ts       maps network / auth / RLS / storage errors to friendly ServiceErrors
  state/            Zustand stores (session, data, settings, toasts)
  features/         auth, dashboard, emergency, assets, maintenance screens
  components/       tab bar, sheets, form fields, loading/empty/error states
  data/             seeded maintenance tasks and emergency triage content
```

ESLint enforces the boundary: importing `@supabase/supabase-js` or `services/supabase/*` from anywhere outside `src/services/` is a lint error. To move to a different backend, write another `HomeBackend` and select it in `services/index.ts`.

Every data-backed view has loading, empty and error states. Errors are normalized to a `ServiceError` with a plain-English message ("Can't reach the server. Check your connection and try again."). Missing details such as an appliance model number or a contact's phone number show a quiet "Click to add info" link that opens the right form.

## Setting up Supabase

1. **Create a project** at [supabase.com/dashboard](https://supabase.com/dashboard) (the free tier is enough).
2. **Run the migration.** Either:
   - Dashboard: open **SQL Editor**, paste `supabase/migrations/20261022000000_init_home_ops.sql`, click **Run**; or
   - CLI:
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
3. **Add env vars.** Copy `.env.example` to `.env.local` and fill in **Project Settings → API**:
   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```
   The anon key is designed to be public; row-level security protects the data. Never put the `service_role` key in a `VITE_` variable, because anything prefixed `VITE_` ships to the browser.
4. **Auth settings.** In **Authentication → URL Configuration** set the Site URL to your deployed URL and add `http://localhost:5173` to Redirect URLs. Email confirmation is on by default; the sign-up screen tells the user to check their inbox.
5. Restart `npm run dev`. The Demo Mode banner disappears.

On a user's first sign-in the app seeds their account once: a "My home" property, the seasonal checklist (due dates placed across the next 12 months) and blank emergency contacts (gas, electric, water, plumber, electrician, insurance). Seeding is idempotent (`seed_key` unique per user).

### What the migration creates

| Table | Notes |
| --- | --- |
| `profiles` | one row per auth user, created by a trigger on `auth.users` |
| `properties` | address, ZIP, year built |
| `assets` | brand, model, serial, category, install date, warranty, location |
| `maintenance_tasks` | title, season, due date, status `todo` / `in_progress` / `complete` |
| `emergency_contacts` | type, name, phone, notes, sort order |
| `documents` | file metadata; `storage_path` points into the bucket, optional `asset_id` |

Every table has RLS enabled with `user_id = auth.uid()` policies for select/insert/update/delete. `user_id` defaults to `auth.uid()`, and inserts that reference another user's property or asset are rejected.

Files go to the private `home-documents` bucket at `<user-id>/<asset-id or general>/<uuid>-<file-name>`. Storage policies only allow a user to read or write under their own `<user-id>/` folder. The bucket accepts PDF, JPEG, PNG, WebP and HEIC up to 25 MB. Files are opened through short-lived signed URLs.

### Local Supabase (optional, needs Docker)

```bash
npx supabase start          # applies the migration to a local stack
npx supabase status         # prints the local API URL and anon key for .env.local
```

## Installing on iPhone

Deploy the static `dist/` folder anywhere (Vercel, Netlify, Cloudflare Pages). Open it in Safari, tap **Share → Add to Home Screen**. It launches full-screen with its own icon, respects the notch and home indicator, and the app shell works offline. (Data still needs a connection when using Supabase.)

On Vercel: set Root Directory to `home-ops`, framework Vite, and add the two `VITE_SUPABASE_*` env vars. Add a rewrite of all routes to `/index.html` if deep links 404.

## Adding "Sign in with Apple"

App Store Review Guideline 4.8 (Login Services) says that if an app offers a third-party or social login (Google, Facebook…), it must also offer an equivalent privacy-focused option; Sign in with Apple is the standard way to meet it, and many users expect it anyway. The app already has the hook: `signInWithProvider('apple')` in the service layer, and a button that appears when `VITE_ENABLE_APPLE_SIGN_IN=true`.

1. In the [Apple Developer portal](https://developer.apple.com/account) (paid membership):
   - Create an **App ID** with the *Sign in with Apple* capability.
   - Create a **Services ID** (this is the OAuth client ID for the web flow), enable Sign in with Apple, and add the return URL `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Create a **Sign in with Apple key** and download the `.p8` file.
2. In Supabase **Authentication → Providers → Apple**: enable it, enter the Services ID, Team ID, Key ID and the `.p8` secret (Supabase's docs show how to generate the client secret; it expires every 6 months).
3. Set `VITE_ENABLE_APPLE_SIGN_IN=true` and redeploy. The button follows Apple's styling guidelines (black, Apple logo, "Sign in with Apple").
4. For the native app, add `capacitor://localhost` to Supabase Redirect URLs (already in `supabase/config.toml` for local). Optionally switch to native Apple sign-in with `@capacitor-community/apple-sign-in` and pass the identity token to `supabase.auth.signInWithIdToken({ provider: 'apple', token })` inside `services/supabase/supabaseBackend.ts`. The UI does not change.

None of this needs a Mac.

## Packaging for the App Store with Capacitor

Everything up to step 3 runs on any machine. **Only steps 4 and 5 need macOS with Xcode.**

1. Add Capacitor:
   ```bash
   npm i @capacitor/core @capacitor/ios
   npm i -D @capacitor/cli
   npx cap init "Home Ops" com.yourcompany.homeops --web-dir=dist
   ```
2. Build the web app and add the iOS project:
   ```bash
   npm run build
   npx cap add ios
   npx cap sync ios
   ```
   Commit the generated `ios/` folder. The service worker is not used inside the native shell; Capacitor serves `dist/` locally.
3. Generate icons and splash screens from `public/icons/icon.svg` (for example with `@capacitor/assets`).
4. **On a Mac with Xcode:** `npx cap open ios`, set the Team and Bundle ID under *Signing & Capabilities*, add the *Sign in with Apple* capability, and run on a device or simulator.
5. **On a Mac with Xcode:** *Product → Archive → Distribute App → App Store Connect*, then submit for review in App Store Connect with screenshots, a privacy policy URL and the App Privacy answers (email address and user content are collected and linked to the user).

Before submitting, also add an in-app "Delete account" option (App Store rule 5.1.1(v)); it can call a Supabase Edge Function that deletes the user with the service role key on the server side.

## Design notes

- Warm off-white paper, dark ink, one accent (deep pine green). Amber and red are reserved for warnings and Emergency Mode.
- Liquid-glass is used only on the floating bottom tab bar (`.glass` + `.interactive`, after the Apex CRM pattern), with `env(safe-area-inset-bottom)` padding.
- Emergency Mode switches the whole app to near-black with signal amber and red, large type and 56px+ targets, readable under stress.
- Accessibility: labeled form fields, native `<dialog>` sheets (focus trap, Esc to close), visible keyboard focus, roles for switches/checkboxes/radios, 44px+ tap targets, and reduced motion honored from the OS setting or an in-app override (Home → settings).

## Disclaimer

Triage guides are general guidance for common situations, not a substitute for 911, your utility or a licensed professional.
