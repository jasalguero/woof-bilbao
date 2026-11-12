# Woof Bilbao Staff (desktop app)

The app the team uses to handle booking requests, see the calendar and keep
dog and owner records. Staff only, on Windows, macOS and Linux; owners never
install it (they use the website form).

It is a [Tauri 2](https://tauri.app) window around a SvelteKit single-page app
(Svelte 5, TypeScript). The UI talks straight to Supabase with
`@supabase/supabase-js` and the staff member's own login; row-level security
in the database decides what each person may do. There are no custom Rust
commands and no server of our own.

## Run it in development

Needs Node.js 22+, Rust (stable) and, on Linux, the WebKit libraries:

```sh
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev pkg-config build-essential
```

(macOS needs the Xcode command line tools; Windows needs the MSVC build tools
and WebView2, which Windows 10/11 already have. See
[Tauri's prerequisites](https://tauri.app/start/prerequisites/).)

1. Start the local backend from the repository root (see `supabase/README.md`):
   ```sh
   npx supabase start
   npx supabase db reset        # schema + sample data
   ```
2. Configure and start the app:
   ```sh
   cd staff-app
   cp .env.example .env         # local URL + local publishable key
   npm install
   npm run tauri dev            # opens the desktop window with hot reload
   ```
3. Sign in as `admin@woof.local` or `staff@woof.local` (password `woofwoof`).

`npm run dev` runs only the web UI at http://localhost:1420, which is handy
for quick UI work in a normal browser.

### Checks

```sh
npm run check     # svelte-check (types)
npm test          # vitest unit tests
npm run build     # static build into build/
npm run tauri build -- --debug --no-bundle   # desktop binary, no installer
npm run tauri build                          # installers for this OS
```

After changing the database schema, regenerate the TypeScript types with the
local stack running: `npm run gen-types` (writes `src/lib/database.types.ts`).

## Point it at the hosted project

Vite bakes the connection settings into the build, so make a production
env file before building the installers:

```sh
cat > .env.production <<'EOF'
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # Project Settings -> API Keys
EOF
npm run tauri build
```

Only ever use the **publishable** key. The secret / service-role key bypasses
row-level security and must never ship inside the app.

The window's Content Security Policy (`src-tauri/tauri.conf.json`) allows
`http://127.0.0.1:54321` and `https://*.supabase.co`. If the project ever uses a
custom domain, add it to `connect-src` and `img-src` there.

New staff: invite them from the Supabase dashboard (Authentication → Users →
Invite user) and add their row to `public.staff`, as described in
`supabase/README.md`. A login without a `staff` row is told it is not
authorised and signed out.

## Screens

- **Requests**: the inbox of new booking requests from the website, newest
  first, plus a tab for handled ones. Opening one shows the form as sent.
  Staff pick the owner (an existing one with the same email is suggested) or
  create one, pick one of the owner's dogs or create one (prefilled from the
  form), check the dates and weekdays, then:
  - **Accept** books the dog and confirms it. If a day is full the app lists
    the full days and offers **Confirm anyway** (overbook) or **Leave as
    pending**;
  - **Decline** or **Mark as spam**.
  Accepting or declining queues an email to the owner in their language
  (emails are only queued for now; the sender comes later). Spam gets none.
- **Calendar**: a month of Monday–Friday days showing confirmed dogs against
  the daily maximum, plus pending ones. Days near or at the limit are
  coloured, closed days are grey. Clicking a day lists its dogs with size,
  status and a soft vaccine reminder.
- **Dogs**: a searchable list and a profile page to edit the dog (including
  "vaccines checked until" and notes), upload a photo (private `dog-files`
  bucket, shown with a signed URL), see the owner's contact details, confirm,
  cancel or move bookings, and see attendance history (read-only for now).
- **Owners**: a searchable list, and an editable detail page with contact
  details, language, notes, their dogs and the messages queued to them.
- **Settings** (admins only): default daily maximum, closed days, staff roles,
  and your own language. Everyone can switch between Spanish and English from
  the header; the choice is saved for the staff member and on the computer.

Vaccines never block anything: the reminder appears when the owner didn't
confirm vaccines or the "checked until" date has passed.

## Layout

```
staff-app/
  src/
    routes/                 one folder per screen (+layout.svelte = login gate + header)
    lib/
      api/                  small typed wrappers around supabase-js, one per area
      logic/                pure functions (calendar grid, dates, request prefill,
                            error parsing, vaccine reminder) with *.test.ts beside them
      i18n/                 es/en dictionary (dict.ts) and the t() helper
      components/           shared Svelte components
      database.types.ts     generated by `supabase gen types`
      session.svelte.ts     who is signed in; staff check
      toast.svelte.ts       error/success toasts, friendly database errors
  src-tauri/                Tauri 2 shell: window, log and window-state plugins
  static/                   favicon and logo
```

Imports inside the app use the `#lib/...` subpath alias (SvelteKit 3).

## Later phases

- Phase 3: signed auto-updates (`tauri-plugin-updater`).
- Phase 4: check-in/check-out screen, Realtime updates and desktop
  notifications for new requests.
