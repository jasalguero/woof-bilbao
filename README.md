# WoofBilbao

Website and staff app for a dog daycare in Bilbao. Dog owners use a public
website to request days of care; the team handles those requests, check-ins,
payments and owner emails in a desktop app. Everything is in Spanish and
English.

| Part | What it is | Where |
| --- | --- | --- |
| Public website | Static HTML in three design variants, with a booking form and a price list | `tools/` (source), `designs/` (generated pages) |
| Staff app | Desktop app (Windows, macOS, Linux) for staff only | `staff-app/` |
| Backend | Supabase: Postgres, auth, Edge Functions, email via Resend | `supabase/` |

The full reasoning behind these choices is in the
[architecture document](https://claude.ai/artifact/DWrpiwcZkQRTjgJEiVRRC8).

## How it fits together

```
 Dog owner                                   Staff
     |                                         |
 static website  (tools/build.py)        Tauri 2 + Svelte desktop app
     |  booking form        ^                  |  supabase-js, staff login
     |  prices (read)       |                  |  + Realtime updates
     v                      |                  v
 Edge Functions: submit-booking, public-prices      Postgres (row-level security)
                     \                              /
                      \----------- Supabase --------/
                                      |
                      send-messages (Edge Function) --> Resend --> owner's inbox
```

- **Website.** `tools/build.py` assembles each design template with the shared
  form, price list and i18n script into `designs/<name>/index.html`. The pages
  are plain static files you can host anywhere. The form posts to the
  `submit-booking` Edge Function, and the page reads current prices from
  `public-prices`, so prices always match what staff set in the app.
- **Backend.** Supabase hosts the database (EU region), staff logins and the
  Edge Functions. There is no server of our own to run. The public role has no
  direct table access: the website only talks to the Edge Functions, and staff
  access is controlled by row-level security. `payment-webhook` (online
  payments) is written but intentionally not deployed yet.
- **Staff app.** A Tauri 2 window around a SvelteKit single-page app (Svelte 5,
  TypeScript) that talks to Supabase directly with each person's own login.
  Screens cover today's attendance, booking requests, the calendar, dogs,
  owners, payments and settings. It updates itself from GitHub Releases.
- **Emails.** Owner emails go out through the `send-messages` function and
  Resend, in the owner's language. They stay off until a sending domain and
  Resend key are configured.

Product rules worth knowing: capacity is a maximum number of dogs per day,
stays are full days Monday to Friday, staff approve every request, and vaccine
information is a soft reminder that never blocks a booking. Pricing is
configurable in the app (default EUR 30 a day plus VAT, a 10-day pack at the
price of 9, valid 6 months).

## Repository layout

```
tools/        website generator (build.py), shared form, i18n, design templates
designs/      generated pages: comic, patas, ria (committed in mock-up mode)
staff-app/    Tauri 2 + SvelteKit desktop app, with its own README
supabase/     migrations, Edge Functions, database tests, seed data, with its own README
.github/      CI for the app and backend, and the release workflow
```

## Run the website locally

Needs Python 3 only.

```sh
python3 tools/build.py                       # regenerates designs/*/index.html
python3 -m http.server 8000 --directory designs
# open http://localhost:8000/ria/  (also /comic/ and /patas/)
```

With no environment variables the form is a mock-up that sends nothing and
the page shows default prices. To try it against a local backend (see next
section):

```sh
WOOF_BOOKING_URL=http://127.0.0.1:54321/functions/v1/submit-booking python3 tools/build.py
```

Other build options are `WOOF_PRICES_URL` and `WOOF_TURNSTILE_SITE_KEY`
(documented at the top of `tools/build.py`). Rebuild without them before
committing, so the committed pages stay in mock-up mode.

## Run the backend locally

Needs Docker and Node.js.

```sh
npx supabase start          # Postgres, Auth, API, Edge Runtime
npx supabase db reset       # applies migrations and seed.sql (sample data)
npx supabase functions serve --no-verify-jwt
npx supabase test db        # database tests
npx deno test supabase/functions/   # Edge Function unit tests
```

Sample staff logins: `admin@woof.local` and `staff@woof.local`, password
`woofwoof` (local only).

## Run the staff app locally

Needs Node.js 22+, Rust (stable) and your OS's Tauri prerequisites
([list](https://tauri.app/start/prerequisites/)). With the local backend
running:

```sh
cd staff-app
cp .env.example .env        # points at the local Supabase
npm install
npm run tauri dev           # desktop window with hot reload
```

Sign in with one of the sample logins above. `npm run dev` runs just the web
UI at http://localhost:1420. Checks: `npm run check` and `npm test`. Details,
screens and troubleshooting: [staff-app/README.md](staff-app/README.md).

## Deploy and release

**Hosted backend (one time).** Create a Supabase project in an EU region, then:

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push        # never run seed.sql against production
npx supabase functions deploy submit-booking --no-verify-jwt
npx supabase functions deploy public-prices --no-verify-jwt
npx supabase functions deploy send-messages --no-verify-jwt
```

Secrets, staff invitations, Turnstile spam protection and email setup are
covered step by step in [supabase/README.md](supabase/README.md).

**Website.** Rebuild with `WOOF_BOOKING_URL` (and `WOOF_TURNSTILE_SITE_KEY`)
pointing at the hosted project, then publish `designs/` to any static host.

**Staff app release.** Auto-updates come from GitHub Releases:

```sh
cd staff-app
node scripts/bump-version.mjs X.Y.Z
# commit, open a PR, merge into main, then run the "Release staff app" workflow
# (or push the tag app-vX.Y.Z)
```

The workflow builds all platforms and publishes the release that running apps
poll. Details, required Actions secrets and rollback:
[staff-app/README.md](staff-app/README.md#releases-and-updates).

## Further reading

- [supabase/README.md](supabase/README.md): schema, functions, payments, emails, deployment
- [staff-app/README.md](staff-app/README.md): screens, development, releases
- [Architecture document](https://claude.ai/artifact/DWrpiwcZkQRTjgJEiVRRC8): decisions and roadmap
