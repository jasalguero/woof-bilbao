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
  active dog with no booking today and asks for confirmation first; if today
  is already at the daily maximum it says so ("There are already 12/12 dogs
  today") and only checks the dog in if you choose **Let in anyway**. Counters
  show expected (and how many are still to come), here now, gone home and
  walk-ins. Weekends and closed days show a friendly closed message instead.
  The screen updates live when a colleague checks a dog in or out on another
  computer, and moves to the new day at midnight if left open; tapping a
  button on yesterday's list just reloads today's instead. All of it goes
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
- **Settings**: for everyone, your own language and the **app version** with
  a **Check for updates** button (see "Releases and updates"). Admins also
  get the default daily maximum, closed days (closing a day that has
  bookings asks first and lists the dogs) and staff roles. Everyone can switch between Spanish and English from
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
      updater.svelte.ts     auto-update checks/install (Tauri only; no-op in a browser);
                            the pure state machine is logic/updates.ts
      toast.svelte.ts       error/success/info toasts, friendly database errors
  src-tauri/                Tauri 2 shell: window, log, window-state, notification,
                            updater and process plugins
  scripts/bump-version.mjs  sets the version in package.json, tauri.conf.json, Cargo.toml/lock
  static/                   favicon and logo
```

Imports inside the app use the `#lib/...` subpath alias (SvelteKit 3).

## Releases and updates

### How releases are built

Releases are built by GitHub Actions (`.github/workflows/release-app.yml`)
when a tag named `app-vX.Y.Z` is pushed. It:

1. checks that the repository variables `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` are set, and that the tag matches the version in
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
   `Cargo.lock`. If any of these checks fails, nothing is published;
2. creates the GitHub Release as a *pre-release*, so the updater does not see
   it yet;
3. builds on four runners with `tauri-apps/tauri-action`: macOS Apple Silicon,
   macOS Intel, Linux (Ubuntu 22.04: AppImage + .deb) and Windows (NSIS
   `-setup.exe`). The web UI is built with the production Supabase URL and
   publishable key from the Actions variables. The updater bundles are signed
   with `TAURI_SIGNING_PRIVATE_KEY` (Actions secret), and each job uploads its
   files and adds its platform to `latest.json`;
4. checks that `latest.json` lists all four platforms (it adds back any entry
   that was lost when two jobs finished at the same moment), then publishes
   the release and marks it **latest**. Only then does
   `https://github.com/jasalguero/woof-bilbao/releases/latest/download/latest.json`
   point at the new version.

It can also be started by hand (Actions → Release staff app → Run
workflow). Run it on a tag to retry that release, or on the default branch to
release the version in `tauri.conf.json`; in that case it creates the
`app-vX.Y.Z` tag on that commit. A failed run can be re-run: it reuses the
unfinished pre-release.

**Before the first release**, set these under Settings → Secrets and variables →
Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| Variable | `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (never the secret/service-role key) |
| Secret | `TAURI_SIGNING_PRIVATE_KEY` | the updater private key (already added) |
| Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password (already added) |

The two Supabase values are *variables*, not secrets, because the publishable
key is public: it ends up inside the app anyway.

### Making a release

```sh
cd staff-app
node scripts/bump-version.mjs 0.2.0   # package.json(+lock), tauri.conf.json, Cargo.toml(+lock)
node scripts/bump-version.mjs --check # prints the versions; fails if they differ
git commit -am "Release staff app 0.2.0"
# open a PR and merge it into the default branch, then on the merged commit:
git fetch origin
git tag app-v0.2.0 origin/<default-branch>
git push origin app-v0.2.0
```

The script refreshes `Cargo.lock` with `cargo update -p woof-bilbao-staff
--offline`. If `cargo` is not installed it edits the lock entry directly.
Versions only go up, and each version can be released only once.

### First install (what staff download)

From the latest release on
<https://github.com/jasalguero/woof-bilbao/releases/latest>:

| Computer | File |
| --- | --- |
| Mac with Apple Silicon (M1/M2/M3/M4…; Apple menu → About This Mac says "Chip") | `Woof.Bilbao.Staff_X.Y.Z_aarch64.dmg` |
| Mac with Intel (About This Mac says "Processor … Intel") | `Woof.Bilbao.Staff_X.Y.Z_x64.dmg` |
| Windows 10/11 | `Woof.Bilbao.Staff_X.Y.Z_x64-setup.exe` (installs for the current user, no admin needed) |
| Linux | `Woof.Bilbao.Staff_X.Y.Z_amd64.AppImage` (`chmod +x`, then run it; updates itself) or the `.deb` (`sudo apt install ./file.deb`; does **not** auto-update, install new .debs by hand) |

The `.app.tar.gz`, `.sig` and `latest.json` files are for the updater. Staff
don't need them.

### First launch: the app is not signed by Apple or Microsoft

We have no Apple Developer ID or Windows code-signing certificate, which is
fine for an internal app, but the first launch shows a warning:

- **macOS** ("cannot be opened because the developer cannot be verified" /
  "is damaged"): drag the app to Applications, then **right-click (or
  Control-click) the app → Open → Open**. On recent macOS versions, if there
  is no Open button, go to System Settings → Privacy & Security and click
  **Open Anyway** after the first attempt. Or, in Terminal:
  ```sh
  xattr -dr com.apple.quarantine "/Applications/Woof Bilbao Staff.app"
  ```
  This is needed only once; updates installed by the app keep working.
- **Windows** SmartScreen ("Windows protected your PC"): click **More info →
  Run anyway**. Some antivirus tools may also ask the first time.
- **Linux**: no warning. The AppImage needs FUSE (`libfuse2` on Ubuntu
  22.04+) and execute permission.

To sign later, the workflow has commented-out `APPLE_*` variables
(notarization) and a note on `bundle.windows.certificateThumbprint` /
`signCommand`. Add the secrets and uncomment them; nothing else changes.

### How auto-update works

- The app checks
  `https://github.com/jasalguero/woof-bilbao/releases/latest/download/latest.json`
  at startup and then every 6 hours while it is open (desktop only; in a
  browser nothing happens). **Settings → Check for updates** checks right
  away, and Settings always shows the running version.
- If `latest.json` lists a higher version, a small card in the bottom-left
  corner says "Nueva versión X disponible" / "Version X available", with the
  release notes. Staff can keep working. **Actualizar y reiniciar / Update
  and restart** downloads the update with a progress bar, checks its
  signature against the public key in `src-tauri/tauri.conf.json`
  (`plugins.updater.pubkey`), installs it and restarts the app. On Windows
  the installer runs in passive mode (a small progress window, no
  questions). **Later** hides the card for that version until the next
  manual check or a newer release.
- Failed checks (offline, GitHub down) are only logged and shown quietly in
  Settings. A failed install shows in the card with **Try again**. Nothing
  ever blocks work.
- An update whose signature does not match is refused.

### Rolling back

The updater only moves **forward**: it installs a version only if it is
higher than the running one. Deleting or un-publishing a bad release does not
downgrade anyone who already installed it, and it can leave
`/releases/latest` pointing at an older release that has no `latest.json`. To
roll back, **release a new, higher version** that contains the old code:

```sh
git revert <bad commits>          # or check out the good code
node scripts/bump-version.mjs 0.2.1
# commit, merge, tag app-v0.2.1, push the tag
```

Staff on the bad version get 0.2.1 at the next check. In an emergency, staff
can also install an older release by hand from its installer.

### Updater key safety

- The **private key** (`TAURI_SIGNING_PRIVATE_KEY`) and its password sign
  every update. Keep an offline backup of both (e.g. in the team password
  manager), separate from GitHub. GitHub secrets cannot be read back once
  saved.
- **If the private key or its password is lost**, no new update can be
  signed for the installed apps. They only trust the public key they were
  built with. Generate a new pair (`npx tauri signer generate -w
  ~/.tauri/woof-bilbao.key`), put the new public key in `tauri.conf.json` and
  the new private key in the secrets, release, and then **every computer must
  install that release by hand once** (download the installer as for a first
  install). After that, auto-update works again.
- **If the private key leaks**, someone with write access to the releases
  could ship a signed update. Rotate the key the same way (new pair, release,
  manual reinstall) and revoke whatever leaked it.
- The public key in `tauri.conf.json` is not secret.
