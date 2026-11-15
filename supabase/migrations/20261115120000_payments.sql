-- Payments (phase 5): prices, day charges, packs, payments, owner balances,
-- the monthly report, balance reminders and the public price list.
--
-- Money model (all amounts are integer euro cents):
--   * price_lists   dated price lists (day price, pack price/size/validity,
--                   VAT rate, second-dog discount). The row in force on a day
--                   is the latest one with valid_from <= that day. Billing
--                   starts on the first row's valid_from: nothing before it is
--                   ever charged (existing customers start at zero).
--   * charges       what an owner owes, one row per item: a dog's day ('day'),
--                   a pack sold ('pack') or an admin correction ('adjustment').
--                   Each row keeps its own net price, discount and VAT rate,
--                   so later price changes never touch it (invoice-ready).
--   * packs         prepaid days that belong to the owner (any of their dogs).
--                   A day charge covered by a pack points at it and costs 0.
--   * payments      money received ('payment') or given back ('refund'),
--                   provider-neutral: staff record cash, card terminal, Bizum
--                   and transfers by hand (provider 'manual'); online
--                   providers (Stripe, Redsys/Bizum) will write the same table
--                   through record_provider_payment() from a webhook.
--   * balance       sum(charges) - sum(succeeded payments) + sum(succeeded
--                   refunds). Positive = the owner owes us; negative = credit.
--
-- Roles: every staff member can see all of it, record payments and sell
-- packs (through the functions below, which also let them override the price
-- on the fly). Only admins change prices, edit or delete payments and
-- charges, record refunds and corrections. Unpaid days never block anything.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.payment_method as enum ('cash', 'card', 'bizum', 'transfer');
create type public.payment_kind as enum ('payment', 'refund');
-- Manual payments are always 'succeeded'; the others are for online providers
-- (a checkout that is started, then confirmed or abandoned by a webhook).
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled');
create type public.charge_kind as enum ('day', 'pack', 'adjustment');

-- ---------------------------------------------------------------------------
-- Price lists
-- ---------------------------------------------------------------------------
create table public.price_lists (
  id                      bigint generated always as identity primary key,
  valid_from              date not null unique,
  day_price_cents         integer not null check (day_price_cents between 0 and 100000),
  pack_price_cents        integer not null check (pack_price_cents between 0 and 1000000),
  pack_days               integer not null check (pack_days between 1 and 100),
  pack_valid_months       integer not null check (pack_valid_months between 1 and 36),
  vat_rate                numeric(5, 2) not null check (vat_rate >= 0 and vat_rate < 100),
  second_dog_discount_pct numeric(5, 2) not null default 0 check (second_dog_discount_pct between 0 and 100),
  created_by              uuid default auth.uid(),
  created_at              timestamptz not null default now()
);

-- Jose's prices: EUR 30 + VAT a day; a 10-day pack for the price of 9
-- (EUR 270 + VAT), valid 6 months; VAT 21 %; no second-dog discount.
-- Billing starts the day this migration runs.
insert into public.price_lists (valid_from, day_price_cents, pack_price_cents, pack_days, pack_valid_months, vat_rate, second_dog_discount_pct)
values ((now() at time zone 'Europe/Madrid')::date, 3000, 27000, 10, 6, 21, 0);

-- The price list in force on a day (null before billing starts).
create function public.prices_on(p_day date) returns public.price_lists
language sql stable set search_path = '' as $$
  select * from public.price_lists where valid_from <= p_day order by valid_from desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Booking status times: when a booking was confirmed and cancelled, so a late
-- cancellation (less than 24 h notice) can still be charged.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column confirmed_at timestamptz,
  add column cancelled_at timestamptz;
update public.bookings set confirmed_at = created_at where status = 'confirmed';
update public.bookings set cancelled_at = updated_at where status = 'cancelled';

create function public.set_booking_status_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    new.cancelled_at := now();
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;
  return new;
end $$;

create trigger bookings_status_times before insert or update of status on public.bookings
  for each row execute function public.set_booking_status_times();

-- The latest time staff may enter for something that already happened (a
-- payment, an absence notice): now, or the end of madrid_today() when the
-- database tests pretend it is another day.
create function public.latest_allowed_time() returns timestamptz
language sql stable set search_path = '' as $$
  select greatest(now() + interval '5 minutes',
                  ((public.madrid_today() + 1)::timestamp at time zone 'Europe/Madrid'));
$$;

-- The notice deadline for a day: 24 hours before opening time (08:00 in
-- Bilbao). A day cancelled at or before this moment is not charged.
create function public.notice_cutoff(p_day date) returns timestamptz
language sql stable set search_path = '' as $$
  select ((p_day + time '08:00') at time zone 'Europe/Madrid') - interval '24 hours';
$$;

-- ---------------------------------------------------------------------------
-- Absences: an owner tells us a booked dog won't come on a day. With notice
-- (notified_at <= notice_cutoff(day)) the day is not charged; later, it is.
-- It does not free the place in the capacity count.
-- ---------------------------------------------------------------------------
create table public.absences (
  id          uuid primary key default gen_random_uuid(),
  dog_id      uuid not null references public.dogs (id) on delete cascade,
  day         date not null,
  notified_at timestamptz not null default now(),
  note        text check (length(note) <= 500),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (dog_id, day)
);

-- ---------------------------------------------------------------------------
-- Packs
-- ---------------------------------------------------------------------------
create table public.packs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.owners (id) on delete restrict,
  days_total    integer not null check (days_total between 1 and 100),
  starts_on     date not null,
  expires_on    date not null,
  price_list_id bigint references public.price_lists (id) on delete set null,
  note          text check (length(note) <= 500),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint packs_dates_check check (expires_on >= starts_on)
);
create index packs_owner_idx on public.packs (owner_id, expires_on);

-- ---------------------------------------------------------------------------
-- Payments (provider-neutral)
-- ---------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.owners (id) on delete restrict,
  kind         public.payment_kind not null default 'payment',
  method       public.payment_method not null,
  -- 'manual' = recorded by staff. Online providers use their own name
  -- ('stripe', 'redsys') and their id for the payment in external_id.
  provider     text not null default 'manual' check (provider ~ '^[a-z0-9_]{1,30}$'),
  external_id  text check (length(external_id) <= 200),
  status       public.payment_status not null default 'succeeded',
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 10000000),
  currency     text not null default 'EUR' check (currency = 'EUR'),
  paid_at      timestamptz not null default now(),
  refund_of    uuid references public.payments (id) on delete set null,
  note         text check (length(note) <= 500),
  -- Raw provider details (webhook event ids, card brand, ...). Never secrets.
  metadata     jsonb not null default '{}',
  recorded_by  uuid default auth.uid() references public.staff (user_id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint payments_external_key unique (provider, external_id),
  constraint payments_external_check check (provider = 'manual' or external_id is not null),
  constraint payments_refund_check check (kind = 'refund' or refund_of is null)
);
create index payments_owner_idx on public.payments (owner_id, paid_at desc);
create index payments_paid_at_idx on public.payments (paid_at);

-- ---------------------------------------------------------------------------
-- Charges
-- ---------------------------------------------------------------------------
create table public.charges (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.owners (id) on delete restrict,
  dog_id           uuid references public.dogs (id) on delete set null,
  kind             public.charge_kind not null,
  -- The day of care ('day'), the sale date ('pack') or the date of the correction.
  day              date not null,
  booking_id       uuid references public.bookings (id) on delete set null,
  walk_in          boolean not null default false,
  description      text check (length(description) <= 200),
  -- Net unit price before discount, in cents. 0 for a day covered by a pack.
  -- A correction can be negative (a credit).
  unit_price_cents integer not null check (unit_price_cents between -1000000 and 1000000),
  discount_pct     numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  vat_rate         numeric(5, 2) not null check (vat_rate >= 0 and vat_rate < 100),
  net_cents        integer generated always as (round(unit_price_cents * (100 - discount_pct) / 100)::integer) stored,
  vat_cents        integer generated always as (round(round(unit_price_cents * (100 - discount_pct) / 100) * vat_rate / 100)::integer) stored,
  total_cents      integer generated always as (
                     (round(unit_price_cents * (100 - discount_pct) / 100)
                      + round(round(unit_price_cents * (100 - discount_pct) / 100) * vat_rate / 100))::integer) stored,
  -- kind 'pack': the pack sold. kind 'day': the pack that covers this day.
  pack_id          uuid references public.packs (id) on delete restrict,
  price_list_id    bigint references public.price_lists (id) on delete set null,
  -- The payment that settled it (null = unpaid). The balance is what counts;
  -- this link says which items a payment was for.
  payment_id       uuid references public.payments (id) on delete set null,
  voided_at        timestamptz,
  voided_by        uuid,
  void_reason      text check (length(void_reason) <= 200),
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint charges_day_dog check (kind <> 'day' or dog_id is not null or voided_at is not null),
  constraint charges_positive check (kind = 'adjustment' or unit_price_cents >= 0),
  constraint charges_pack_check check (kind <> 'pack' or pack_id is not null)
);
-- One day charge per dog per day, ever (a voided one stays, so the daily run
-- never charges that day again).
create unique index charges_dog_day_key on public.charges (dog_id, day) where kind = 'day';
create index charges_owner_idx on public.charges (owner_id, day);
create index charges_day_idx on public.charges (day);
create index charges_pack_idx on public.charges (pack_id) where pack_id is not null;
create index charges_payment_idx on public.charges (payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at and the audit log
-- ---------------------------------------------------------------------------
create trigger packs_updated_at before update on public.packs
  for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger charges_updated_at before update on public.charges
  for each row execute function public.set_updated_at();

create trigger price_lists_audit after insert or update or delete on public.price_lists
  for each row execute function public.audit_row();
create trigger absences_audit after insert or update or delete on public.absences
  for each row execute function public.audit_row();
create trigger packs_audit after insert or update or delete on public.packs
  for each row execute function public.audit_row();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit_row();
create trigger charges_audit after insert or update or delete on public.charges
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Views (security_invoker: they respect the caller's RLS)
-- ---------------------------------------------------------------------------
create view public.pack_balances with (security_invoker = true) as
select
  p.*,
  coalesce(u.used, 0)                                   as days_used,
  greatest(p.days_total - coalesce(u.used, 0), 0)       as days_left,
  s.total_cents                                         as total_cents
from public.packs p
left join lateral (
  select count(*)::integer as used from public.charges c
  where c.pack_id = p.id and c.kind = 'day' and c.voided_at is null
) u on true
left join lateral (
  select c.total_cents from public.charges c
  where c.pack_id = p.id and c.kind = 'pack' and c.voided_at is null
  order by c.created_at limit 1
) s on true;

create view public.owner_balances with (security_invoker = true) as
select
  o.id                                                    as owner_id,
  o.full_name,
  o.email,
  o.phone,
  coalesce(c.charged, 0)                                  as charged_cents,
  coalesce(p.paid, 0)                                     as paid_cents,
  coalesce(c.charged, 0) - coalesce(p.paid, 0)            as balance_cents,
  coalesce(c.unpaid_days, 0)                              as unpaid_days,
  c.oldest_unpaid_day
from public.owners o
left join lateral (
  select
    sum(x.total_cents)::integer as charged,
    (count(*) filter (where x.kind = 'day' and x.payment_id is null and x.total_cents > 0))::integer as unpaid_days,
    min(x.day) filter (where x.payment_id is null and x.total_cents > 0) as oldest_unpaid_day
  from public.charges x
  where x.owner_id = o.id and x.voided_at is null
) c on true
left join lateral (
  select sum(case when y.kind = 'refund' then -y.amount_cents else y.amount_cents end)::integer as paid
  from public.payments y
  where y.owner_id = o.id and y.status = 'succeeded'
) p on true;

-- ---------------------------------------------------------------------------
-- charge_days: turns booked and attended days into day charges. Idempotent:
-- a dog's day is charged at most once (voided charges count too). Run every
-- evening by cron for the last 31 days, and by the app (for one owner) when
-- staff open the payment screen, so today's day can be paid on the spot.
--
-- A dog's day is charged when, on an open day (Mon-Fri, not closed) on or
-- after billing started and up to today:
--   * it has a confirmed booking and no absence notified with 24 h notice; or
--   * its booking was cancelled late (after the day's notice cutoff), having
--     been confirmed; or
--   * it was checked in (a walk-in, or a booked dog that came anyway).
-- Price: the price list in force that day. If the owner has a pack valid that
-- day with days left, the day uses it instead (price 0); the pack that
-- expires first is used first. From the owner's second dog charged that day,
-- the second-dog discount applies (0 % by default, i.e. off).
-- ---------------------------------------------------------------------------
create function public.charge_days(p_from date, p_to date, p_owner_id uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_start date := (select min(valid_from) from public.price_lists);
  v_from  date := greatest(p_from, v_start);
  v_to    date := least(p_to, public.madrid_today());
  v_count integer := 0;
  v_price public.price_lists;
  v_pack  uuid;
  v_rank  integer;
  r       record;
begin
  -- Staff from the app; the cron job runs as the database owner (no user).
  if (select auth.uid()) is not null and not public.is_staff() then
    raise exception 'only staff can charge days' using errcode = '42501';
  end if;
  if v_from is null or v_to is null or v_from > v_to then
    return 0;
  end if;
  if v_to - v_from > 400 then
    raise exception 'date range too long' using errcode = '22023', hint = 'bad_input';
  end if;

  -- Two runs at once would both see a day as not charged yet.
  perform pg_advisory_xact_lock(hashtext('public.charge_days'));

  for r in
    with booked as (
      select b.dog_id, d::date as day, b.id as booking_id
      from public.bookings b
      cross join lateral generate_series(greatest(b.start_date, v_from)::timestamp,
                                         least(b.end_date, v_to)::timestamp, interval '1 day') as d
      where b.start_date <= v_to and b.end_date >= v_from
        and extract(isodow from d)::smallint = any (b.weekdays)
        and (b.status = 'confirmed'
             or (b.status = 'cancelled' and b.confirmed_at is not null
                 and b.cancelled_at > public.notice_cutoff(d::date)))
        and public.is_open_day(d::date)
        and not exists (
          select 1 from public.absences a
          where a.dog_id = b.dog_id and a.day = d::date and a.notified_at <= public.notice_cutoff(d::date))
    ),
    attended as (
      select a.dog_id, a.day, null::uuid as booking_id
      from public.attendance a
      where a.day between v_from and v_to and a.checked_in_at is not null
    ),
    dog_days as (
      select x.dog_id, x.day,
             (array_agg(x.booking_id order by x.booking_id) filter (where x.booking_id is not null))[1] as booking_id
      from (select * from booked union all select * from attended) x
      group by x.dog_id, x.day
    )
    select dd.dog_id, dd.day, dd.booking_id, g.owner_id
    from dog_days dd
    join public.dogs g on g.id = dd.dog_id
    where (p_owner_id is null or g.owner_id = p_owner_id)
      and not exists (select 1 from public.charges c where c.kind = 'day' and c.dog_id = dd.dog_id and c.day = dd.day)
    order by dd.day, g.owner_id, g.created_at, g.id
  loop
    v_price := public.prices_on(r.day);
    continue when v_price.id is null;

    select p.id into v_pack
    from public.packs p
    where p.owner_id = r.owner_id and r.day between p.starts_on and p.expires_on
      and p.days_total > (select count(*) from public.charges c
                          where c.pack_id = p.id and c.kind = 'day' and c.voided_at is null)
    order by p.expires_on, p.created_at
    limit 1;

    select count(*) into v_rank from public.charges c
    where c.kind = 'day' and c.owner_id = r.owner_id and c.day = r.day and c.voided_at is null;

    insert into public.charges (owner_id, dog_id, kind, day, booking_id, walk_in,
                                unit_price_cents, discount_pct, vat_rate, pack_id, price_list_id, created_by)
    values (
      r.owner_id, r.dog_id, 'day', r.day, r.booking_id, r.booking_id is null,
      case when v_pack is null then v_price.day_price_cents else 0 end,
      case when v_pack is null and v_rank >= 1 then v_price.second_dog_discount_pct else 0 end,
      v_price.vat_rate, v_pack, v_price.id, auth.uid()
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 19:00 UTC = 20:00 or 21:00 in Bilbao, after closing. The 31-day window
-- picks up late changes (a check-in recorded the next day, a backdated booking).
select cron.schedule('charge-days', '0 19 * * *',
  $$select public.charge_days(public.madrid_today() - 31, public.madrid_today())$$);

-- ---------------------------------------------------------------------------
-- Voiding day charges that should not exist: an absence notified in time, or
-- a day closed after it was charged ("closed days are never charged"). A paid
-- charge is voided too; its payment then stays on the account as credit.
-- ---------------------------------------------------------------------------
create function public.void_day_charges_for_absence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.notified_at > public.latest_allowed_time() then
    raise exception 'notified_at cannot be in the future' using errcode = '22023', hint = 'bad_input';
  end if;
  if new.notified_at <= public.notice_cutoff(new.day) then
    update public.charges
    set voided_at = now(), voided_by = auth.uid(), void_reason = 'absence_notified'
    where kind = 'day' and dog_id = new.dog_id and day = new.day and voided_at is null;
  end if;
  return new;
end $$;

create trigger absences_void_charges before insert or update on public.absences
  for each row execute function public.void_day_charges_for_absence();

create function public.void_day_charges_for_closed_day() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.day is not null and new.closed then
    update public.charges
    set voided_at = now(), voided_by = auth.uid(), void_reason = 'closed_day'
    where kind = 'day' and day = new.day and voided_at is null;
  end if;
  return new;
end $$;

create trigger capacity_void_charges after insert or update on public.capacity
  for each row execute function public.void_day_charges_for_closed_day();

-- ---------------------------------------------------------------------------
-- record_payment: any staff member records money received, by hand.
--
-- p_charge_ids: the unpaid charges this payment is for (they get linked to
--   it). Without them, the oldest unpaid charges that fit in the amount are
--   linked. The amount does not have to match: the balance is what counts.
-- p_overrides: [{id, unit_price_cents?, discount_pct?}, ...] changes the
--   price of selected, uncovered day charges on the fly (e.g. a special price
--   or the second-dog discount). The audit log keeps the old values.
-- p_paid_at: when the money came in (default now; may be in the past, e.g. a
--   transfer seen today).
-- Errors (22023) carry a hint: bad_amount, bad_input, charge_not_open.
-- ---------------------------------------------------------------------------
create function public.record_payment(
  p_owner_id     uuid,
  p_amount_cents integer,
  p_method       public.payment_method,
  p_charge_ids   uuid[] default null,
  p_overrides    jsonb default null,
  p_paid_at      timestamptz default null,
  p_note         text default null
) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_ids     uuid[] := coalesce(p_charge_ids, '{}');
  v_item    jsonb;
  v_id      uuid;
  v_unit    integer;
  v_disc    numeric;
  v_left    integer;
  r         record;
begin
  if not public.is_staff() then
    raise exception 'only staff can record payments' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000 then
    raise exception 'amount must be positive' using errcode = '22023', hint = 'bad_amount';
  end if;
  if p_method is null then
    raise exception 'method is required' using errcode = '22023', hint = 'bad_input';
  end if;
  if p_paid_at > public.latest_allowed_time() then
    raise exception 'paid_at cannot be in the future' using errcode = '22023', hint = 'bad_input';
  end if;
  if length(p_note) > 500 then
    raise exception 'note is too long' using errcode = '22023', hint = 'bad_input';
  end if;
  -- One payment at a time per owner.
  perform 1 from public.owners where id = p_owner_id for update;
  if not found then
    raise exception 'owner % not found', p_owner_id using errcode = 'P0002';
  end if;

  if exists (
    select 1 from unnest(v_ids) as s (id)
    where not exists (
      select 1 from public.charges c
      where c.id = s.id and c.owner_id = p_owner_id and c.voided_at is null and c.payment_id is null)
  ) then
    raise exception 'a charge is not open for this owner' using errcode = '22023', hint = 'charge_not_open';
  end if;

  if p_overrides is not null then
    if jsonb_typeof(p_overrides) <> 'array' then
      raise exception 'p_overrides must be an array' using errcode = '22023', hint = 'bad_input';
    end if;
    for v_item in select * from jsonb_array_elements(p_overrides) loop
      begin
        v_id := (v_item ->> 'id')::uuid;
        v_unit := (v_item ->> 'unit_price_cents')::integer;
        v_disc := (v_item ->> 'discount_pct')::numeric;
      exception when others then
        raise exception 'bad override %', v_item using errcode = '22023', hint = 'bad_input';
      end;
      if v_id is null or not (v_id = any (v_ids)) then
        raise exception 'an override must be for a selected charge' using errcode = '22023', hint = 'bad_input';
      end if;
      if (v_unit is not null and (v_unit < 0 or v_unit > 100000)) or (v_disc is not null and (v_disc < 0 or v_disc > 100)) then
        raise exception 'override out of range' using errcode = '22023', hint = 'bad_input';
      end if;
      update public.charges
      set unit_price_cents = coalesce(v_unit, unit_price_cents),
          discount_pct = coalesce(v_disc, discount_pct)
      where id = v_id and kind = 'day' and pack_id is null;
      if not found then
        raise exception 'only uncovered day charges can be repriced' using errcode = '22023', hint = 'bad_input';
      end if;
    end loop;
  end if;

  insert into public.payments (owner_id, kind, method, provider, status, amount_cents, paid_at, note, recorded_by)
  values (p_owner_id, 'payment', p_method, 'manual', 'succeeded', p_amount_cents,
          coalesce(p_paid_at, now()), nullif(trim(p_note), ''), auth.uid())
  returning * into v_payment;

  if cardinality(v_ids) > 0 then
    update public.charges set payment_id = v_payment.id where id = any (v_ids);
  else
    v_left := p_amount_cents;
    for r in
      select c.id, c.total_cents from public.charges c
      where c.owner_id = p_owner_id and c.voided_at is null and c.payment_id is null and c.total_cents > 0
      order by c.day, c.created_at
    loop
      exit when r.total_cents > v_left;
      update public.charges set payment_id = v_payment.id where id = r.id;
      v_left := v_left - r.total_cents;
    end loop;
  end if;

  return v_payment;
end $$;

-- ---------------------------------------------------------------------------
-- sell_pack: any staff member sells a pack, paid upfront. Defaults come from
-- the price list in force on p_starts_on (default today); staff can override
-- the net price, number of days, expiry and VAT rate on the fly. The pack
-- keeps that price for good. Unpaid, uncovered day charges of the owner from
-- p_starts_on on are moved onto the new pack straight away.
-- ---------------------------------------------------------------------------
create function public.sell_pack(
  p_owner_id     uuid,
  p_method       public.payment_method,
  p_price_cents  integer default null,
  p_days         integer default null,
  p_expires_on   date default null,
  p_vat_rate     numeric default null,
  p_starts_on    date default null,
  p_amount_cents integer default null,
  p_paid_at      timestamptz default null,
  p_note         text default null
) returns public.packs
language plpgsql security definer set search_path = '' as $$
declare
  v_start   date := coalesce(p_starts_on, public.madrid_today());
  v_price   public.price_lists := public.prices_on(v_start);
  v_pack    public.packs;
  v_charge  public.charges;
  v_payment public.payments;
  v_days    integer;
begin
  if not public.is_staff() then
    raise exception 'only staff can sell packs' using errcode = '42501';
  end if;
  if v_price.id is null then
    raise exception 'no prices set for %', v_start using errcode = '22023', hint = 'no_prices';
  end if;
  if p_method is null then
    raise exception 'method is required' using errcode = '22023', hint = 'bad_input';
  end if;
  if (p_price_cents is not null and (p_price_cents < 0 or p_price_cents > 1000000))
     or (p_vat_rate is not null and (p_vat_rate < 0 or p_vat_rate >= 100))
     or (p_amount_cents is not null and p_amount_cents <= 0)
     or p_paid_at > public.latest_allowed_time()
     or length(p_note) > 500 then
    raise exception 'bad pack details' using errcode = '22023', hint = 'bad_input';
  end if;
  v_days := coalesce(p_days, v_price.pack_days);
  if v_days < 1 or v_days > 100 then
    raise exception 'a pack has 1 to 100 days' using errcode = '22023', hint = 'bad_input';
  end if;
  perform 1 from public.owners where id = p_owner_id for update;
  if not found then
    raise exception 'owner % not found', p_owner_id using errcode = 'P0002';
  end if;

  insert into public.packs (owner_id, days_total, starts_on, expires_on, price_list_id, note)
  values (
    p_owner_id, v_days, v_start,
    coalesce(p_expires_on, (v_start + make_interval(months => v_price.pack_valid_months))::date - 1),
    v_price.id, nullif(trim(p_note), '')
  )
  returning * into v_pack;

  insert into public.charges (owner_id, kind, day, unit_price_cents, discount_pct, vat_rate, pack_id, price_list_id)
  values (p_owner_id, 'pack', v_start, coalesce(p_price_cents, v_price.pack_price_cents), 0,
          coalesce(p_vat_rate, v_price.vat_rate), v_pack.id, v_price.id)
  returning * into v_charge;

  if coalesce(p_amount_cents, v_charge.total_cents) > 0 then
    insert into public.payments (owner_id, kind, method, provider, status, amount_cents, paid_at, note, recorded_by)
    values (p_owner_id, 'payment', p_method, 'manual', 'succeeded',
            coalesce(p_amount_cents, v_charge.total_cents), coalesce(p_paid_at, now()),
            nullif(trim(p_note), ''), auth.uid())
    returning * into v_payment;
    update public.charges set payment_id = v_payment.id where id = v_charge.id;
  end if;

  update public.charges c
  set pack_id = v_pack.id, unit_price_cents = 0, discount_pct = 0
  where c.id in (
    select x.id from public.charges x
    where x.owner_id = p_owner_id and x.kind = 'day' and x.pack_id is null
      and x.payment_id is null and x.voided_at is null
      and x.day between v_pack.starts_on and v_pack.expires_on
    order by x.day, x.created_at
    limit v_pack.days_total
  );

  return v_pack;
end $$;

-- ---------------------------------------------------------------------------
-- record_provider_payment: the single entry point for online payment
-- providers (Stripe, Redsys/Bizum), called by their webhook Edge Functions
-- with the service role once a signature has been verified. Idempotent on
-- (provider, external_id): a repeated or later webhook updates the status of
-- the same row. A payment that becomes 'succeeded' settles the given charges.
-- Not callable by staff.
-- ---------------------------------------------------------------------------
create function public.record_provider_payment(
  p_provider     text,
  p_external_id  text,
  p_owner_id     uuid,
  p_amount_cents integer,
  p_method       public.payment_method,
  p_status       public.payment_status,
  p_paid_at      timestamptz default null,
  p_metadata     jsonb default '{}',
  p_charge_ids   uuid[] default null
) returns public.payments
language plpgsql security invoker set search_path = '' as $$
declare
  v_payment public.payments;
begin
  if p_provider is null or p_provider = 'manual' or nullif(trim(p_external_id), '') is null then
    raise exception 'provider and external id are required' using errcode = '22023', hint = 'bad_input';
  end if;
  insert into public.payments (owner_id, kind, method, provider, external_id, status, amount_cents, paid_at, metadata, recorded_by)
  values (p_owner_id, 'payment', p_method, p_provider, p_external_id, p_status, p_amount_cents,
          coalesce(p_paid_at, now()), coalesce(p_metadata, '{}'), null)
  on conflict (provider, external_id) do update
    set status = excluded.status,
        paid_at = coalesce(p_paid_at, public.payments.paid_at),
        metadata = public.payments.metadata || excluded.metadata
  returning * into v_payment;

  if v_payment.status = 'succeeded' and p_charge_ids is not null then
    update public.charges set payment_id = v_payment.id
    where id = any (p_charge_ids) and owner_id = v_payment.owner_id
      and payment_id is null and voided_at is null;
  end if;
  return v_payment;
end $$;

-- ---------------------------------------------------------------------------
-- Balance reminder email (soft: it never blocks anything). Staff press a
-- button on the owner page; at most one every 3 days per owner. Delivered by
-- send-messages like every other email (stays queued until it is set up).
-- Errors (22023) carry a hint: nothing_owed, no_email, recently_reminded.
-- ---------------------------------------------------------------------------
create function public.queue_balance_reminder(p_owner_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner   public.owners;
  v_balance public.owner_balances;
  v_dogs    jsonb;
  v_id      uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff can send reminders' using errcode = '42501';
  end if;
  select * into v_owner from public.owners where id = p_owner_id for update;
  if not found then
    raise exception 'owner % not found', p_owner_id using errcode = 'P0002';
  end if;
  select * into v_balance from public.owner_balances where owner_id = p_owner_id;
  if coalesce(v_balance.balance_cents, 0) <= 0 then
    raise exception 'owner owes nothing' using errcode = '22023', hint = 'nothing_owed';
  end if;
  if nullif(trim(v_owner.email), '') is null then
    raise exception 'owner has no email' using errcode = '22023', hint = 'no_email';
  end if;
  if exists (
    select 1 from public.messages
    where owner_id = p_owner_id and template = 'balance_reminder'
      and status in ('queued', 'sending', 'sent') and created_at > now() - interval '3 days'
  ) then
    raise exception 'a reminder was sent recently' using errcode = '22023', hint = 'recently_reminded';
  end if;

  select coalesce(jsonb_agg(d.name order by d.name), '[]') into v_dogs
  from public.dogs d where d.owner_id = p_owner_id and d.active;

  insert into public.messages (owner_id, recipient, template, language, data)
  values (
    p_owner_id, v_owner.email, 'balance_reminder', v_owner.language,
    jsonb_build_object(
      'owner', v_owner.full_name,
      'dogs', v_dogs,
      'balance_cents', v_balance.balance_cents,
      'unpaid_days', v_balance.unpaid_days,
      'since', v_balance.oldest_unpaid_day
    )
  )
  returning id into v_id;
  return v_id;
end $$;

-- The sender fails out-of-date mail instead of sending it late; a balance
-- reminder is stale after 3 days (staff can send a fresh one). Otherwise
-- unchanged from 20261113090100_daily_operations.sql.
create or replace function public.claim_messages(p_channel public.message_channel default 'email', p_limit integer default 20)
returns setof public.messages
language plpgsql security invoker set search_path = '' as $$
begin
  update public.messages
  set status = 'failed',
      error = 'unknown: no result after final attempt (may have been sent; check Resend dashboard)'
  where channel = p_channel and status = 'sending' and attempts >= 3
    and last_attempt_at < now() - interval '15 minutes';

  update public.messages
  set status = 'failed', error = 'stale'
  where channel = p_channel and status = 'queued'
    and case template
          when 'vaccine_reminder' then
            created_at < now() - interval '3 days'
            or public.jsonb_date(data, 'next_day') < public.madrid_today()
          when 'request_received' then created_at < now() - interval '7 days'
          when 'new_request' then created_at < now() - interval '7 days'
          when 'request_accepted' then public.jsonb_date(data, 'to') < public.madrid_today()
          when 'request_declined' then public.jsonb_date(data, 'to') < public.madrid_today()
          when 'balance_reminder' then created_at < now() - interval '3 days'
          else false
        end;

  return query
  update public.messages m
  set status = 'sending', attempts = m.attempts + 1, last_attempt_at = now()
  where m.id in (
    select q.id from public.messages q
    where q.channel = p_channel
      and (q.status = 'queued'
           or (q.status = 'sending' and q.last_attempt_at < now() - interval '15 minutes'))
    order by q.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  )
  returning m.*;
end $$;

-- ---------------------------------------------------------------------------
-- monthly_report (admins): income by payment method (by the day the money
-- came in, Bilbao time), what was charged (net, VAT, total by kind), and who
-- owed what at the end of the month.
-- ---------------------------------------------------------------------------
create function public.monthly_report(p_month date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date - 1;
  v_income  jsonb;
  v_charges jsonb;
  v_owing   jsonb;
begin
  if not public.is_admin() then
    raise exception 'only admins can see reports' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'month is required' using errcode = '22023', hint = 'bad_input';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.method), '[]') into v_income
  from (
    select p.method,
           (count(*) filter (where p.kind = 'payment'))::integer                          as payments,
           coalesce(sum(p.amount_cents) filter (where p.kind = 'payment'), 0)::integer     as received_cents,
           (count(*) filter (where p.kind = 'refund'))::integer                           as refunds,
           coalesce(sum(p.amount_cents) filter (where p.kind = 'refund'), 0)::integer      as refunded_cents,
           sum(case when p.kind = 'refund' then -p.amount_cents else p.amount_cents end)::integer as net_cents
    from public.payments p
    where p.status = 'succeeded'
      and (p.paid_at at time zone 'Europe/Madrid')::date between v_from and v_to
    group by p.method
  ) i;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.kind), '[]') into v_charges
  from (
    select x.kind,
           count(*)::integer                as items,
           sum(x.net_cents)::integer        as net_cents,
           sum(x.vat_cents)::integer        as vat_cents,
           sum(x.total_cents)::integer      as total_cents,
           (count(*) filter (where x.pack_id is not null and x.kind = 'day'))::integer as pack_days
    from public.charges x
    where x.voided_at is null and x.day between v_from and v_to
    group by x.kind
  ) c;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.balance_cents desc, w.full_name), '[]') into v_owing
  from (
    select o.id as owner_id, o.full_name, o.email, o.phone,
           (coalesce(ch.charged, 0) - coalesce(pa.paid, 0))::integer as balance_cents,
           coalesce(ch.unpaid_days, 0)::integer as unpaid_days,
           ch.oldest_unpaid_day
    from public.owners o
    left join lateral (
      select sum(x.total_cents) as charged,
             count(*) filter (where x.kind = 'day' and x.payment_id is null and x.total_cents > 0) as unpaid_days,
             min(x.day) filter (where x.payment_id is null and x.total_cents > 0) as oldest_unpaid_day
      from public.charges x
      where x.owner_id = o.id and x.voided_at is null and x.day <= v_to
    ) ch on true
    left join lateral (
      select sum(case when y.kind = 'refund' then -y.amount_cents else y.amount_cents end) as paid
      from public.payments y
      where y.owner_id = o.id and y.status = 'succeeded'
        and (y.paid_at at time zone 'Europe/Madrid')::date <= v_to
    ) pa on true
    where coalesce(ch.charged, 0) - coalesce(pa.paid, 0) > 0
  ) w;

  return jsonb_build_object(
    'month', to_char(v_from, 'YYYY-MM'),
    'from', v_from,
    'to', v_to,
    'income', v_income,
    'charges', v_charges,
    'owing', v_owing
  );
end $$;

-- ---------------------------------------------------------------------------
-- public_prices: what the website shows (via the `public-prices` Edge
-- Function, with the service role; the website never talks to tables).
-- Prices are net; the site adds a "+ VAT" note with the rate.
-- ---------------------------------------------------------------------------
create function public.public_prices() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with cur as (select * from public.prices_on(public.madrid_today()) where id is not null),
       nxt as (select * from public.price_lists where valid_from > public.madrid_today() order by valid_from limit 1)
  select jsonb_build_object(
    'currency', 'EUR',
    'current', (select jsonb_build_object(
                  'valid_from', valid_from,
                  'day_price_cents', day_price_cents,
                  'pack_price_cents', pack_price_cents,
                  'pack_days', pack_days,
                  'pack_valid_months', pack_valid_months,
                  'vat_rate', vat_rate,
                  'second_dog_discount_pct', second_dog_discount_pct) from cur),
    'next', (select jsonb_build_object(
                  'valid_from', valid_from,
                  'day_price_cents', day_price_cents,
                  'pack_price_cents', pack_price_cents,
                  'pack_days', pack_days,
                  'pack_valid_months', pack_valid_months,
                  'vat_rate', vat_rate,
                  'second_dog_discount_pct', second_dog_discount_pct) from nxt)
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.price_lists enable row level security;
alter table public.absences    enable row level security;
alter table public.packs       enable row level security;
alter table public.payments    enable row level security;
alter table public.charges     enable row level security;

-- Settings-like and money tables: staff read; only admins change them
-- directly. Staff record payments and sell packs through the functions above.
do $$
declare t text;
begin
  foreach t in array array['price_lists', 'packs', 'charges', 'payments'] loop
    execute format('create policy "staff can read" on public.%I for select to authenticated using ((select public.is_staff()))', t);
    execute format('create policy "admins can change" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- Plain staff may also insert a manual payment directly (never a refund, an
-- online one or one that is not 'succeeded').
create policy "staff can insert manual payments" on public.payments for insert to authenticated
  with check ((select public.is_staff()) and kind = 'payment' and provider = 'manual' and status = 'succeeded'
              and external_id is null and refund_of is null);

-- Absences are everyday data: staff read, add and remove them.
create policy "staff can read" on public.absences for select to authenticated using ((select public.is_staff()));
create policy "staff can insert" on public.absences for insert to authenticated with check ((select public.is_staff()));
create policy "staff can update" on public.absences for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "staff can delete" on public.absences for delete to authenticated using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.price_lists, public.absences, public.packs, public.payments, public.charges,
              public.owner_balances, public.pack_balances from anon;

revoke execute on function public.prices_on(date) from anon, public;
revoke execute on function public.notice_cutoff(date) from anon, public;
revoke execute on function public.latest_allowed_time() from anon, public;
revoke execute on function public.set_booking_status_times() from anon, public;
revoke execute on function public.charge_days(date, date, uuid) from anon, public;
revoke execute on function public.void_day_charges_for_absence() from anon, public;
revoke execute on function public.void_day_charges_for_closed_day() from anon, public;
revoke execute on function public.record_payment(uuid, integer, public.payment_method, uuid[], jsonb, timestamptz, text) from anon, public;
revoke execute on function public.sell_pack(uuid, public.payment_method, integer, integer, date, numeric, date, integer, timestamptz, text) from anon, public;
revoke execute on function public.queue_balance_reminder(uuid) from anon, public;
revoke execute on function public.monthly_report(date) from anon, public;
grant execute on function public.prices_on(date) to authenticated, service_role;
grant execute on function public.notice_cutoff(date) to authenticated, service_role;
grant execute on function public.latest_allowed_time() to authenticated, service_role;
grant execute on function public.charge_days(date, date, uuid) to authenticated, service_role;
grant execute on function public.record_payment(uuid, integer, public.payment_method, uuid[], jsonb, timestamptz, text) to authenticated, service_role;
grant execute on function public.sell_pack(uuid, public.payment_method, integer, integer, date, numeric, date, integer, timestamptz, text) to authenticated, service_role;
grant execute on function public.queue_balance_reminder(uuid) to authenticated, service_role;
grant execute on function public.monthly_report(date) to authenticated, service_role;

-- Service role only: online provider webhooks and the public price list.
revoke execute on function public.record_provider_payment(text, text, uuid, integer, public.payment_method, public.payment_status, timestamptz, jsonb, uuid[]) from anon, authenticated, public;
revoke execute on function public.public_prices() from anon, authenticated, public;
grant execute on function public.record_provider_payment(text, text, uuid, integer, public.payment_method, public.payment_status, timestamptz, jsonb, uuid[]) to service_role;
grant execute on function public.public_prices() to service_role;
