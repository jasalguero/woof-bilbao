# WoofBilbao backend (Supabase)

Everything the backend needs lives here: the database schema, its security
rules, the `submit-booking` Edge Function for the public form, and tests.
There is no server to run; Supabase hosts it all.

```
supabase/
  config.toml                       local settings (public sign-ups disabled)
  migrations/                       schema, row-level security, capacity logic
  functions/submit-booking/         public booking form endpoint (+ unit tests)
  tests/database/                   pgTAP tests for RLS and capacity
  seed.sql                          sample data for local development only
```

## Run it locally

Needs Docker and Node.js (for `npx`).

```sh
npx supabase start            # starts Postgres, Auth, API, Storage, Edge Runtime
npx supabase db reset         # applies migrations + seed.sql
npx supabase test db          # 19 database tests
npx deno test supabase/functions/submit-booking/   # form validation tests
npx supabase functions serve --no-verify-jwt       # serves the function on :54321
```

Local staff logins from `seed.sql`: `admin@woof.local` and `staff@woof.local`,
password `woofwoof`.

To try the website against the local backend:

```sh
WOOF_BOOKING_URL=http://127.0.0.1:54321/functions/v1/submit-booking python3 tools/build.py
python3 -m http.server 8000 --directory designs   # open http://localhost:8000/ria/
```

Rebuild without `WOOF_BOOKING_URL` before committing: the committed pages stay
in mock-up mode until the hosted project exists.

## Deploy to the hosted project (one time)

1. Create a project at supabase.com in an **EU region** (Frankfurt or Paris),
   on the free plan.
2. Link and push the schema:
   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push            # never run seed.sql against production
   ```
3. In the dashboard, Authentication → Sign In / Providers: turn **off**
   "Allow new users to sign up". Invite staff from Authentication → Users, then
   add each one to `public.staff` (SQL editor):
   ```sql
   insert into public.staff (user_id, full_name, role)
   select id, 'Jose', 'admin' from auth.users where email = 'you@example.com';
   ```
4. Set the function's secrets and deploy it:
   ```sh
   npx supabase secrets set ALLOWED_ORIGINS=https://your-domain STAFF_EMAIL=you@example.com
   npx supabase secrets set TURNSTILE_SECRET_KEY=...   # optional, see below
   npx supabase functions deploy submit-booking --no-verify-jwt
   ```
5. Rebuild the website pointing at it:
   ```sh
   WOOF_BOOKING_URL=https://<project-ref>.supabase.co/functions/v1/submit-booking \
   WOOF_TURNSTILE_SITE_KEY=... python3 tools/build.py
   ```

### Spam protection (optional but recommended)

The form has a hidden honeypot field already. For stronger protection, create
a free Cloudflare Turnstile widget for your domain, then set
`WOOF_TURNSTILE_SITE_KEY` when building the site and `TURNSTILE_SECRET_KEY` as
a function secret. Without the secret, the function skips the check.

## How it fits together

- The website never talks to tables: the `anon` role has no table access. The
  form posts JSON to `submit-booking`, which validates it, inserts a
  `booking_requests` row and queues emails in `messages`.
- Emails are only queued for now. A sender function (Resend) comes once the
  email domain exists; until then staff see new requests in the app.
- Staff use the desktop app (coming next) with their Supabase Auth login. Row-
  level security lets them in only if they have a row in `staff`; admins can
  also change capacity, staff and delete records.
- `confirm_booking(booking_id)` confirms a booking only if every one of its
  days is under the daily maximum (`capacity`), and serialises confirmations
  so two people can't overbook together. Pass `true` as the second argument
  to overbook on purpose.
- Vaccines are relaxed: `dogs.vaccines_up_to_date` is the owner's word from the
  form, and `vaccines_checked_until` is an optional date staff can note. Neither
  blocks a booking.
- Declined and spam requests are deleted after 90 days by a `pg_cron` job.
