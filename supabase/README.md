# WoofBilbao backend (Supabase)

Everything the backend needs lives here: the database schema, its security
rules, the `submit-booking` Edge Function for the public form, the
`send-messages` Edge Function that emails owners, the `public-prices` Edge
Function the website reads its prices from, payments, and tests. There is no
server to run; Supabase hosts it all.

```
supabase/
  config.toml                       local settings (public sign-ups disabled)
  migrations/                       schema, row-level security, capacity logic
  functions/submit-booking/         public booking form endpoint (+ unit tests)
  functions/send-messages/          email sender (Resend) + bilingual templates (+ unit tests)
  functions/public-prices/          public, read-only price list for the website (+ unit tests)
  functions/payment-webhook/        online payments, prepared but disabled (+ unit tests)
  tests/database/                   pgTAP tests (RLS, capacity, requests, attendance, outbox, payments)
  seed.sql                          sample data for local development only
```

## Run it locally

Needs Docker and Node.js (for `npx`).

```sh
npx supabase start            # starts Postgres, Auth, API, Storage, Edge Runtime
npx supabase db reset         # applies migrations + seed.sql
npx supabase test db          # 230 database tests
npx deno test supabase/functions/                  # form validation, email templates, sender, prices, webhooks
npx supabase functions serve --no-verify-jwt       # serves the functions on :54321
```

Local staff logins from `seed.sql`: `admin@woof.local` and `staff@woof.local`,
password `woofwoof`.

To try the website against the local backend:

```sh
WOOF_BOOKING_URL=http://127.0.0.1:54321/functions/v1/submit-booking python3 tools/build.py
python3 -m http.server 8000 --directory designs   # open http://localhost:8000/ria/
```

With `WOOF_BOOKING_URL` set, the pages also fetch their prices from the
`public-prices` function next to it (or from `WOOF_PRICES_URL`). Rebuild
without them before committing: the committed pages stay in mock-up mode
(form sends nothing, default prices) until the hosted project exists.

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
   npx supabase functions deploy public-prices --no-verify-jwt     # prices for the website
   ```
   (Do not deploy `payment-webhook` yet; see "Online payments (later)".)
5. Rebuild the website pointing at it (the prices URL is derived from the
   booking URL; set `WOOF_PRICES_URL` only if it lives elsewhere):
   ```sh
   WOOF_BOOKING_URL=https://<project-ref>.supabase.co/functions/v1/submit-booking \
   WOOF_TURNSTILE_SITE_KEY=... python3 tools/build.py
   ```
6. Check the prices in the staff app (Settings → Prices, as an admin). The
   payments migration creates the default list (EUR 30 a day, 10-day pack
   EUR 270, valid 6 months, VAT 21 %, no second-dog discount) **valid from the
   day `db push` runs**: billing starts that day, so existing customers start
   at zero.

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

- Nobody writes the `messages` outbox from the app: staff can read it (and
  admins delete), but INSERT and UPDATE are revoked from `authenticated`, so a
  staff login can't make the sender email arbitrary text to anyone or re-send
  old mail. Rows are written only by the service role (`submit-booking`,
  `send-messages`) and by database functions. `accept_booking_request` and
  `decline_booking_request` queue their email through
  `queue_request_email(request)`, a narrow security definer helper that builds
  the message itself from the request (recipient: the booked owner's address,
  or the form's address for a decline), and queues at most one per request
  and template.
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
  no confirmed booking today (an active dog only). Walk-ins count against the
  daily maximum: when today's dogs (every dog with an attendance row plus every
  confirmed booked dog, each once) already reach `max_dogs_on(today)`, a
  walk-in fails with `no room today: N/M` (hint `over_capacity`) unless
  `allow_over => true`; the app asks first. Booked dogs never hit this (the
  booking was already counted when it was confirmed). Repeating a check-in or
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

## Payments

Staff record every payment by hand in the app (cash, card terminal, Bizum,
bank transfer). Nothing online yet, but the tables are ready for it. Money is
always integer euro **cents**; the currency is EUR.

### Tables

- `price_lists`: dated price lists. Each row has the day price, pack price,
  days per pack, pack validity in months, VAT rate and the second-dog
  discount (0 % = off), and applies from `valid_from` until the next row.
  `prices_on(day)` returns the row in force. Admins add rows (Settings →
  Prices); a future row schedules a price change. Same price for every dog
  size, no monthly plans. Billing starts on the first row's `valid_from`;
  nothing before it is ever charged.
- `charges`: what an owner owes, one row per item: `day` (one dog, one day),
  `pack` (a pack sold) or `adjustment` (an admin correction, may be
  negative). Each row keeps its own net unit price, discount, VAT rate and
  computed `net_cents`, `vat_cents`, `total_cents` (generated columns), so a
  price change never rewrites history and the rows are ready to become
  invoice lines later (invoices and TicketBAI are out of scope). A day
  covered by a pack points at it (`pack_id`) and costs 0. `payment_id` says
  which payment settled it. Voided rows (`voided_at`, `void_reason`) stay for
  the record and stop counting.
- `packs`: prepaid days that belong to the owner, usable by any of their
  dogs, from `starts_on` to `expires_on`. `pack_balances` adds `days_used` and
  `days_left`. A pack keeps the price it was sold at. Unused days are never
  refunded (they stay as credit until the pack expires).
- `payments`: money in (`kind = 'payment'`) or back out (`'refund'`).
  Provider-neutral: `method` (`cash`, `card`, `bizum`, `transfer`),
  `provider` (`manual` for staff-recorded ones), `external_id` (the
  provider's id; unique per provider), `status` (`pending`, `succeeded`,
  `failed`, `cancelled`; manual ones are always `succeeded`), `metadata`
  (jsonb) and `refund_of`. `recorded_by` is the staff member.
- `absences`: an owner told us a booked dog won't come on a day, and when
  (`notified_at`). It does not free the place in the capacity count.
- `owner_balances` (view): per owner, `charged_cents`, `paid_cents`
  (payments minus refunds, succeeded only), `balance_cents` (positive = owes,
  negative = credit), `unpaid_days` and `oldest_unpaid_day`.
- `bookings` gained `confirmed_at` and `cancelled_at` (set by a trigger), so a
  late cancellation can still be charged.

### What gets charged

`charge_days(from, to, owner?)` turns days into `day` charges. A pg_cron job
(`charge-days`, 19:00 UTC) runs it every evening for the last 31 days, and the
app runs it for one owner when their page opens, so today's day can be paid on
the spot. It is idempotent: a dog's day is charged once, ever (a voided day is
not charged again). A dog's day is charged, at the price in force that day,
when it is an open day (Mon-Fri, not closed), on or after billing started and
not in the future, and:

- it has a **confirmed booking**, unless an absence was notified with **24
  hours' notice** (at or before 08:00 Bilbao time the day before;
  `notice_cutoff(day)`); or
- its booking was **cancelled late** (after that cutoff) having been
  confirmed; or
- it was **checked in** (a walk-in is charged at the day price).

Pending bookings, closed days and cancellations with notice are never
charged. If the owner has a pack valid that day with days left, the day uses
it (the pack that expires first goes first). From the owner's second dog
charged on the same day, the second-dog discount applies (off by default).
Two triggers keep it honest afterwards: an absence recorded later but notified
in time voids that day's charge, and closing a day voids every charge on it
(a voided paid day leaves the payment as credit).

Single days can be paid on the day or settled at the end of the month; packs
are paid upfront. Unpaid days never block a check-in.

### Who can do what

| | Staff | Admins |
|---|---|---|
| See balances, charges, packs, payments | yes | yes |
| Record a payment, sell a pack (`record_payment`, `sell_pack`), changing prices on the fly | yes | yes |
| Add or remove absences, send a balance reminder | yes | yes |
| Edit or delete payments, void or edit charges, record refunds and corrections | no | yes |
| Change price lists (`price_lists`) | no | yes |
| Monthly report (`monthly_report`) | no | yes |

All enforced by row-level security and the functions' own checks. Staff can
insert a manual, succeeded payment directly but never a refund, an online
one, or any update or delete. `record_payment` and `sell_pack` are security
definer functions that check `is_staff()` and only reprice the day charges
being paid (the audit log keeps the old values). `charge_days` runs for staff
or for the cron job (no user); non-staff logins are refused.

### Functions the app uses

- `record_payment(owner, amount_cents, method, charge_ids?, overrides?, paid_at?, note?)`:
  links the given unpaid charges to the payment (or, with none, the oldest
  unpaid charges that fit in the amount). `overrides` is
  `[{id, unit_price_cents?, discount_pct?}]` for selected uncovered days.
  Errors carry a hint: `bad_amount`, `bad_input`, `charge_not_open`.
- `sell_pack(owner, method, price_cents?, days?, expires_on?, vat_rate?, starts_on?, amount_cents?, paid_at?, note?)`:
  anything left out comes from the price list in force; expiry defaults to
  start + validity months - 1 day. Creates the pack, its charge and its
  payment, then moves the owner's unpaid, uncovered days from the start date
  onto it. Hint `no_prices` before billing starts.
- `queue_balance_reminder(owner)`: queues a `balance_reminder` email (amount
  owed, unpaid days, the owner's dogs) in the owner's language through the
  normal outbox, at most one every 3 days (hints `nothing_owed`, `no_email`,
  `recently_reminded`). It is sent once the email sender is set up (below),
  and is dropped as stale if it has waited more than 3 days.
- `monthly_report(month)` (admins): `{income: [per method: payments,
  received_cents, refunds, refunded_cents, net_cents], charges: [per kind:
  items, net/vat/total cents, pack_days], owing: [owners with a positive
  balance at the end of the month]}`. Income counts by the day the money came
  in (Bilbao time). The app exports it as CSV.

### The website's prices (`public-prices`)

The website stays static. When a page loads it fetches
`GET /functions/v1/public-prices` (no key, CORS per `ALLOWED_ORIGINS`,
cached 5 minutes), which returns the price list in force and the next
scheduled one, net of VAT:

```json
{"currency":"EUR","current":{"valid_from":"2026-11-15","day_price_cents":3000,"pack_price_cents":27000,"pack_days":10,"pack_valid_months":6,"vat_rate":21,"second_dog_discount_pct":0},"next":null}
```

The page shows "EUR 30 + VAT", the pack and the VAT rate in Spanish and
English, so changing prices in the app changes the site within minutes. The
function reads through `public_prices()` with the service role; the website
still never touches a table. If the fetch fails the prices section stays
hidden rather than show a stale price; in mock-up mode (no URL at build time)
the page shows the default prices from `tools/common/i18n.js`.

### Online payments (later)

Prepared, not switched on, and no keys anywhere. To add Stripe or Bizum
(through Redsys):

1. Write the provider's adapter in `functions/payment-webhook/providers.ts`:
   verify the webhook signature with the provider's secret and map the event
   to a `ProviderEvent` (owner id and charge ids travel in the checkout's
   metadata). Register it in `adapters`.
2. Set its secret (`npx supabase secrets set STRIPE_WEBHOOK_SECRET=...`), set
   `enabled = true` for `payment-webhook` in `config.toml`, deploy it with
   `--no-verify-jwt`, and point the provider at
   `https://<project-ref>.supabase.co/functions/v1/payment-webhook/<provider>`.
3. Creating the checkout (a small function that calls the provider's API and
   returns its URL) is the only other new piece.

The database needs no change: the webhook calls
`record_provider_payment(provider, external_id, owner, amount_cents, method, status, paid_at?, metadata?, charge_ids?)`
(service role only), which inserts or updates the payment by
`(provider, external_id)`, so repeated webhooks are harmless, and settles the
charges once the status is `succeeded`. Balances and the monthly report
already count only `succeeded` payments. New methods can be added to the
`payment_method` enum with `alter type ... add value`.

## Sending emails (`send-messages`)

The database and the website only ever *queue* emails in `messages`
(`request_received`, `new_request`, `request_accepted`, `request_declined`,
`vaccine_reminder`, `balance_reminder`). The `send-messages` Edge Function delivers them through
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
  15 minutes (a run that died) is picked up again. If that happens after the
  third attempt the row is failed with `unknown: no result after final attempt
  (may have been sent; check Resend dashboard)`: the run died after calling
  Resend but before recording the answer, so the email may well have gone
  out. Look it up in the Resend dashboard (search by recipient) before
  re-queueing it. Staff can see each owner's messages and their status on the
  owner page;
- does not send mail that has gone out of date; it is failed with error
  `stale` instead. This matters most the day the sender is switched on, when
  weeks of queued mail would otherwise all go at once:

  | Template | Stale when |
  |---|---|
  | `vaccine_reminder` | queued more than 3 days ago, or its `next_day` has passed (a new one is queued after 30 days if still needed) |
  | `request_received`, `new_request` | queued more than 7 days ago (a "we got it" that late is noise; staff see requests live in the app) |
  | `request_accepted`, `request_declined` | the requested dates (`data.to`) have passed |
  | `balance_reminder` | queued more than 3 days ago (staff can send a fresh one) |

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
