# WoofBilbao backend (Supabase)

Everything the backend needs lives here: the database schema, its security
rules, the `submit-booking` Edge Function for the public form, the
`send-messages` Edge Function that emails owners, and tests. There is no
server to run; Supabase hosts it all.

```
supabase/
  config.toml                       local settings (public sign-ups disabled)
  migrations/                       schema, row-level security, capacity logic
  functions/submit-booking/         public booking form endpoint (+ unit tests)
  functions/send-messages/          email sender (Resend) + bilingual templates (+ unit tests)
  tests/database/                   pgTAP tests (RLS, capacity, requests, attendance, outbox)
  seed.sql                          sample data for local development only
```

## Run it locally

Needs Docker and Node.js (for `npx`).

```sh
npx supabase start            # starts Postgres, Auth, API, Storage, Edge Runtime
npx supabase db reset         # applies migrations + seed.sql
npx supabase test db          # 134 database tests
npx deno test supabase/functions/                  # form validation, email templates, sender
npx supabase functions serve --no-verify-jwt       # serves the functions on :54321
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
   npx supabase secrets set TURNSTILE_SECRET_KEY=... REQUIRE_TURNSTILE=true   # see below
   npx supabase functions deploy submit-booking --no-verify-jwt
   npx supabase functions deploy send-messages --no-verify-jwt     # sends nothing until set up (below)
   ```
5. Rebuild the website pointing at it:
   ```sh
   WOOF_BOOKING_URL=https://<project-ref>.supabase.co/functions/v1/submit-booking \
   WOOF_TURNSTILE_SITE_KEY=... python3 tools/build.py
   ```

### Spam protection

Built in, no setup needed:

- a hidden honeypot field (`hp_extra`) and a minimum of 3 seconds between the
  page loading and the form being sent; bots that trip either get a fake
  success and nothing is stored;
- throttling: more than 3 requests from one email address, or 10 from one IP,
  in an hour get `429 Too Many Requests`;
- at most one "we got your request" email per address every 30 minutes.

**Cloudflare Turnstile is required before the email sender goes live**:
without it, anyone can make the function email arbitrary addresses. Create a
free Turnstile widget for your domain, set `WOOF_TURNSTILE_SITE_KEY` when
building the site and `TURNSTILE_SECRET_KEY` as a function secret, and set
`REQUIRE_TURNSTILE=true` so the function refuses every submission if the
secret ever goes missing. Without `REQUIRE_TURNSTILE`, a missing secret means
the check is skipped (fine for local development only).

## How it fits together

- The website never talks to tables: the `anon` role has no table access. The
  form posts JSON to `submit-booking`, which validates it, inserts a
  `booking_requests` row and queues emails in `messages`.
- Emails are queued in the `messages` outbox and delivered by `send-messages`
  (see "Sending emails" below). Until the email domain exists and its secrets
  are set, they just stay queued; staff still see every request in the app,
  live.
- Staff use the desktop app (`staff-app/`) with their Supabase Auth login. Row-
  level security lets them in only if they have a row in `staff`; admins can
  also change capacity, staff and delete records.
- The app handles a request with one call each, so nothing is half-done:
  `accept_booking_request(request, dog, start, end, weekdays, mode, owner_id,
  new_owner, new_dog)` books an existing dog, or creates the new dog (for an
  existing owner, or a new owner created in the same transaction; both are
  validated jsonb), creates the booking, confirms it (`mode` `'confirm'`, failing with the capacity
  error if a day is full; `'overbook'`; or `'pending'` to leave it pending),
  marks the request accepted with `handled_by`/`handled_at`/`booking_id`, and
  queues a `request_accepted` email in the owner's language.
  `decline_booking_request(request, 'declined' | 'spam')` marks it and, for a
  decline only, queues `request_declined` to the form's address. Both refuse a
  request that is no longer `new`. `set_my_language(lang)` lets any staff
  member change their own UI language (the `staff` table is admin-only).
- Capacity is enforced by a trigger on `bookings`: a booking can only become
  `confirmed` (by `confirm_booking`, a direct update or an insert), or have a
  confirmed booking's dates moved, if every new day is under the daily
  maximum (`capacity`), counting each dog once. Checks are serialised so two
  people can't overbook together, and a booking with no bookable days can't
  be confirmed. `confirm_booking(booking_id, true)` overbooks on purpose (it
  sets `woof.allow_overbook` for that one change).
- Vaccines are relaxed: `dogs.vaccines_up_to_date` is the owner's word from the
  form, and `vaccines_checked_until` is an optional date staff can note. Neither
  blocks a booking.
- Declined and spam requests are deleted after 90 days by a `pg_cron` job.
- Staff check dogs in and out on the app's Today screen through
  `check_in(dog, note?, walk_in?)`, `check_out(dog, note?)`,
  `undo_check_in(dog)` and `undo_check_out(dog)`. They always use today's
  date in Bilbao (`madrid_today()`), keep one `attendance` row per dog per day,
  refuse weekends and closed days, and need `walk_in => true` for a dog with
  no confirmed booking today (an active dog only). Repeating a check-in or
  check-out is harmless. Errors carry a hint the app translates
  (`closed_day`, `not_booked`, `inactive_dog`, `not_checked_in`,
  `already_checked_out`). Undoing a check-in deletes today's row (the audit log
  keeps it), which is why it is the one attendance delete plain staff can do.
  (`madrid_today()` honours a `woof.today` setting so the database tests can
  pretend it is a Monday; clients cannot set it.)
- Realtime: `booking_requests` and `attendance` are in the `supabase_realtime`
  publication. The app listens for new requests (badge, toast, desktop
  notification) and attendance changes (Today stays in sync between staff).
  Realtime applies each subscriber's RLS, so only staff receive rows; DELETE
  events (only possible on attendance, via undo) carry nothing but the row id.
- Vaccine reminders: every day at 07:00 UTC `queue_vaccine_reminders()` queues
  a `vaccine_reminder` email for each active dog with a confirmed booking day
  from today on whose owner didn't confirm vaccines, or whose "checked until"
  date has passed or is within 14 days. At most one per dog every 30 days. It
  never blocks a booking or a check-in.

## Sending emails (`send-messages`)

The database and the website only ever *queue* emails in `messages`
(`request_received`, `new_request`, `request_accepted`, `request_declined`,
`vaccine_reminder`). The `send-messages` Edge Function delivers them through
[Resend](https://resend.com)'s HTTP API with Spanish and English templates
(`functions/send-messages/templates.ts`).

Every 5 minutes a `pg_cron` job (`send-messages`) calls the function through
`pg_net`, but only when two Supabase Vault secrets exist and there is
something queued. The function:

- refuses callers without `Authorization: Bearer <SEND_MESSAGES_SECRET>`
  (401). Gateway JWT checking is off (`verify_jwt = false`) because the caller
  is the database, not a user, so this shared secret is what keeps the public
  from triggering it;
- does nothing (rows stay `queued`) while `RESEND_API_KEY` or `EMAIL_FROM` is
  missing: that is the state until the domain exists;
- claims up to 25 rows atomically (`claim_messages`: `queued` → `sending`,
  `FOR UPDATE SKIP LOCKED`), so overlapping runs never send a row twice, and
  sends each with an `Idempotency-Key` so Resend never duplicates one either;
- marks each row `sent` (with `sent_at` and Resend's id in `provider_id`), or
  puts it back to `queued` after a 5xx, 429 or network error (`attempts`
  counts them; the third failure is final), or `failed` with the error for
  anything else (bad address, unknown template). A row stuck in `sending` for
  15 minutes (a run that died) is picked up again. Staff can see each
  owner's messages and their status on the owner page.

### Setting it up (once the domain is bought)

**Turnstile must be on before the sender goes live** (see "Spam protection"):
otherwise anyone could use the booking form to make us email any address.

1. In Resend, add the domain (Domains → Add domain, EU region), add the DNS
   records it shows (SPF and DKIM; a DMARC record is a good idea too) at the
   domain registrar, and wait until Resend says **Verified**.
2. Create an API key with **sending access** only, limited to that domain.
3. Set the function's secrets (use a long random shared secret):
   ```sh
   SECRET=$(openssl rand -hex 32)
   npx supabase secrets set SEND_MESSAGES_SECRET=$SECRET RESEND_API_KEY=re_... \
     EMAIL_FROM='Woof Bilbao <hola@your-domain>' EMAIL_REPLY_TO=hola@your-domain
   npx supabase functions deploy send-messages --no-verify-jwt
   ```
4. Try it by hand; it answers with what it did:
   ```sh
   curl -X POST https://<project-ref>.supabase.co/functions/v1/send-messages \
     -H "Authorization: Bearer $SECRET"
   ```
5. Turn on the schedule by storing the URL and the same secret in Vault (SQL
   editor):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-messages', 'send_messages_url');
   select vault.create_secret('<the same SEND_MESSAGES_SECRET>', 'send_messages_secret');
   ```
   To change one later: `select vault.update_secret(id, 'new value') from
   vault.secrets where name = 'send_messages_secret';`. To pause sending,
   delete either Vault secret, or unset `RESEND_API_KEY` (emails then wait in
   the queue).
6. Check it is working:
   ```sql
   select status, count(*) from messages group by 1;
   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'send-messages') order by start_time desc limit 5;
   select id, status_code, content, error_msg from net._http_response order by id desc limit 5;
   ```
   To send a `failed` message again: `update messages set status = 'queued',
   attempts = 0, error = null where id = '...';`.

Why the schedule lives in a migration rather than a snippet to paste: the job
and `invoke_send_messages()` are created everywhere by `db push`, are tested
(pgTAP), and stay a no-op until the Vault secrets exist, so nothing can fire
early and there is no manual SQL to forget or get wrong; the only manual step
is storing two secrets. The URL and secret live in Vault, never in the
migration or the repository.

### Testing the sender locally

No real credentials are needed. Point the function at a mock of Resend
(any small HTTP server that answers `POST /emails` with `{"id": "..."}`):

```sh
cat > /tmp/send.env <<'ENV'
SEND_MESSAGES_SECRET=local-test-secret
RESEND_API_KEY=re_fake
EMAIL_FROM=Woof Bilbao <hola@example.com>
RESEND_API_URL=http://host.docker.internal:8787
ENV
npx supabase functions serve --no-verify-jwt --env-file /tmp/send.env
curl -X POST http://127.0.0.1:54321/functions/v1/send-messages -H 'Authorization: Bearer local-test-secret'
```

To try the cron path too, store Vault secrets that the database container can
reach (the API gateway's container name):

```sql
select vault.create_secret('http://supabase_kong_woof-bilbao:8000/functions/v1/send-messages', 'send_messages_url');
select vault.create_secret('local-test-secret', 'send_messages_secret');
select public.invoke_send_messages();   -- or wait for the next 5-minute tick
```

`npx supabase db reset` removes them again.
