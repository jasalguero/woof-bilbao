# Woof Bilbao Staff (desktop app)

The app the team uses every day: check dogs in and out, handle booking
requests, see the calendar and keep dog and owner records. Staff only, on Windows, macOS and Linux; owners never
install it (they use the website form).

It is a [Tauri 2](https://tauri.app) window around a SvelteKit single-page app
(Svelte 5, TypeScript). The UI talks straight to Supabase with
`@supabase/supabase-js` and the staff member's own login; row-level security
in the database decides what each person may do. There are no custom Rust
commands and no server of our own. Supabase Realtime keeps screens live (new
requests, check-ins by a colleague) and the Tauri notification plugin raises
a desktop notification when a request comes in.

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
`http://127.0.0.1:54321` and `https://*.supabase.co`. **A custom Supabase
domain (e.g. `api.woofbilbao.com`) must be added to `connect-src` (as both
`https://` and `wss://`) and `img-src` in `src-tauri/tauri.conf.json`**, or
the app will not be able to reach it or show dog photos.

New staff: invite them from the Supabase dashboard (Authentication → Users →
Invite user) and add their row to `public.staff`, as described in
`supabase/README.md`. A login without a `staff` row is told it is not
authorised and signed out.

## Screens

The app opens on **Today** after signing in.

- **Today**: the dogs expected today (confirmed bookings for today's date in
  Bilbao), each with photo, name, size, owner and phone (a `tel:` link), a
  health alert when the dog has medical notes, and the soft vaccine reminder.
  One big tap checks a dog **in**, then **out**; "With a note…" adds an
  optional note first. Mistakes can be undone (**Undo check-in** before the
  check-out, **Undo check-out** after it). **Walk-in check-in** picks any
  active dog with no booking today and asks for confirmation first. Counters
  show expected (and how many are still to come), here now, gone home and
  walk-ins. Weekends and closed days show a friendly closed message instead.
  The screen updates live when a colleague checks a dog in or out on another
  computer, and moves to the new day at midnight if left open. All of it goes
  through the `check_in` / `check_out` / `undo_*` database functions, which
  always use today's date and keep one attendance row per dog per day.
- **Requests**: the inbox of new booking requests from the website, newest
  first, plus a tab for handled ones. Opening one shows the form as sent.
  Staff pick the owner (an existing one with the same email is suggested) or
  create one, pick one of the owner's dogs or create one (prefilled from the
  form), check the dates and weekdays, then:
  - **Accept** books the dog and confirms it, creating the new owner and/or
    dog in the same database transaction (`accept_booking_request`), so a
    failed or abandoned accept leaves nothing behind. If a day is full the
    app lists the full days and offers **Confirm anyway** (overbook) or
    **Leave as pending**;
  - **Decline** or **Mark as spam**.
  Accepting or declining queues an email to the owner in their language
  (the `send-messages` function delivers it once email is set up; see
  `supabase/README.md`). Spam gets none.
- **Calendar**: a month of Monday–Friday days showing confirmed dogs against
  the daily maximum, plus pending ones. Days near or at the limit are
  coloured, closed days are grey. Clicking a day lists its dogs with size,
  status and a soft vaccine reminder.
- **Dogs**: a searchable list and a profile page to edit the dog (including
  "vaccines checked until" and notes), upload a photo (private `dog-files`
  bucket at `dogs/<dog_id>/photo`, shown with a signed URL), see the owner's contact details, confirm,
  cancel or move bookings, and see attendance history (check-in and check-out
  happen on Today).
- **Owners**: a searchable list, and an editable detail page with contact
  details, language, notes, their dogs and the messages queued to them.
- **Settings** (admins only): default daily maximum, closed days (closing a
  day that has bookings asks first and lists the dogs), staff roles,
  and your own language. Everyone can switch between Spanish and English from
  the header; the choice is saved for the staff member and on the computer.

Vaccines never block anything: the reminder appears when the owner didn't
confirm vaccines or the "checked until" date has passed. (Owners also get a
gentle reminder email; see `supabase/README.md`.)

## Live updates and notifications

When someone sends the booking form, every signed-in staff member sees it at
once, wherever they are in the app:

- the **Requests** badge in the header goes up, and the Requests inbox
  refreshes itself if it is open;
- a yellow toast says which dog and owner it is;
- the desktop app also shows a **system notification**. The first one asks
  the operating system for permission; if it is refused, the toast and badge
  still work. In a plain browser (`npm run dev` / `npm run preview`) there is
  no system notification, only the toast and badge.

This uses Supabase Realtime (`postgres_changes` on `booking_requests` inserts
and on `attendance`). Realtime applies row-level security, so a login that is
not staff receives nothing. The badge is also re-counted every minute, in
case the connection dropped while the laptop slept. On the hosted project
nothing needs switching on: the migration adds both tables to the
`supabase_realtime` publication.

## Layout

```
staff-app/
  src/
    routes/                 one folder per screen (+layout.svelte = login gate + header)
    lib/
      api/                  small typed wrappers around supabase-js, one per area
      logic/                pure functions (calendar grid, dates, request prefill,
                            error parsing, vaccine reminder, Today list and counters)
                            with *.test.ts beside them
      i18n/                 es/en dictionary (dict.ts) and the t() helper
      components/           shared Svelte components
      database.types.ts     generated by `supabase gen types`
      session.svelte.ts     who is signed in; staff check
      realtime.ts           Supabase Realtime subscriptions (new requests, attendance)
      notify.ts             desktop notifications (Tauri only; no-op in a browser)
      toast.svelte.ts       error/success/info toasts, friendly database errors
  src-tauri/                Tauri 2 shell: window, log, window-state and notification plugins
  static/                   favicon and logo
```

Imports inside the app use the `#lib/...` subpath alias (SvelteKit 3).

## Later phases

- Phase 3: signed auto-updates (`tauri-plugin-updater`).
