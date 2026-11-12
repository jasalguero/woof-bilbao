-- WoofBilbao initial schema: owners, dogs, booking requests, bookings,
-- attendance, capacity, staff, outgoing messages and an audit log.
--
-- Access model:
--   * anon (the public website) gets NO table access. The booking form posts
--     to the `submit-booking` Edge Function, which inserts with the service role.
--   * authenticated users only see data when they have a row in `staff`.
--   * admins (staff.role = 'admin') can also change capacity, staff and delete.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.lang as enum ('es', 'en');
create type public.dog_size as enum ('s', 'm', 'l');
create type public.dog_sex as enum ('m', 'f');
create type public.staff_role as enum ('admin', 'staff');
create type public.request_status as enum ('new', 'accepted', 'declined', 'spam');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');
create type public.message_channel as enum ('email', 'whatsapp', 'sms', 'telegram');
create type public.message_status as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  role       public.staff_role not null default 'staff',
  language   public.lang not null default 'es',
  created_at timestamptz not null default now()
);

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Owners and dogs
-- ---------------------------------------------------------------------------
create table public.owners (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  email      text not null,
  phone      text,
  language   public.lang not null default 'es',
  consent_at timestamptz,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index owners_email_key on public.owners (lower(email));

create table public.dogs (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.owners (id) on delete cascade,
  name                   text not null,
  breed                  text,
  age_text               text,
  size                   public.dog_size,
  sex                    public.dog_sex,
  neutered               boolean not null default false,
  -- Vaccines are deliberately relaxed: the owner's word from the form, plus an
  -- optional date staff can note after seeing the booklet. Never blocks bookings.
  vaccines_up_to_date    boolean not null default false,
  vaccines_checked_until date,
  medical_notes          text,
  behaviour_notes        text,
  photo_path             text,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index dogs_owner_id_idx on public.dogs (owner_id);

-- ---------------------------------------------------------------------------
-- Booking requests (raw form submissions) and bookings
-- ---------------------------------------------------------------------------
create table public.booking_requests (
  id         uuid primary key default gen_random_uuid(),
  payload    jsonb not null,
  -- Sender's IP, kept for throttling abuse; purged with the request.
  client_ip  inet,
  status     public.request_status not null default 'new',
  created_at timestamptz not null default now(),
  handled_by uuid references public.staff (user_id) on delete set null,
  handled_at timestamptz
);
create index booking_requests_status_idx on public.booking_requests (status, created_at desc);
-- Used by submit-booking to throttle repeat submissions per email and per IP.
create index booking_requests_email_idx on public.booking_requests ((payload -> 'owner' ->> 'email'), created_at);
create index booking_requests_ip_idx on public.booking_requests (client_ip, created_at);

create table public.bookings (
  id         uuid primary key default gen_random_uuid(),
  dog_id     uuid not null references public.dogs (id) on delete cascade,
  request_id uuid references public.booking_requests (id) on delete set null,
  start_date date not null,
  end_date   date not null,
  -- ISO weekdays, 1 = Monday ... 5 = Friday. Full days, Monday to Friday only.
  weekdays   smallint[] not null default '{1,2,3,4,5}',
  status     public.booking_status not null default 'pending',
  notes      text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_dates_check check (end_date >= start_date),
  constraint bookings_weekdays_check check (
    cardinality(weekdays) > 0 and weekdays <@ '{1,2,3,4,5}'::smallint[]
  )
);
create index bookings_dog_id_idx on public.bookings (dog_id);
create index bookings_dates_idx on public.bookings (start_date, end_date) where status <> 'cancelled';

alter table public.booking_requests
  add column booking_id uuid references public.bookings (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Attendance (check-in / check-out)
-- ---------------------------------------------------------------------------
create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid references public.bookings (id) on delete set null,
  dog_id         uuid not null references public.dogs (id) on delete cascade,
  day            date not null default (now() at time zone 'Europe/Madrid')::date,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  checked_in_by  uuid default auth.uid(),
  note           text,
  unique (dog_id, day),
  constraint attendance_times_check check (
    checked_out_at is null or checked_in_at is null or checked_out_at >= checked_in_at
  )
);
create index attendance_day_idx on public.attendance (day);

-- ---------------------------------------------------------------------------
-- Capacity: one max number of dogs per day. The row with day = null is the
-- default; a row with a date overrides it or marks the day as closed.
-- ---------------------------------------------------------------------------
create table public.capacity (
  id       bigint generated always as identity primary key,
  day      date,
  max_dogs integer not null check (max_dogs >= 0),
  closed   boolean not null default false,
  reason   text,
  constraint capacity_day_key unique nulls not distinct (day),
  constraint capacity_default_open check (day is not null or not closed)
);
insert into public.capacity (day, max_dogs) values (null, 12);

create function public.max_dogs_on(p_day date) returns integer
language sql stable set search_path = '' as $$
  select coalesce(
    (select case when c.closed then 0 else c.max_dogs end from public.capacity c where c.day = p_day),
    (select c.max_dogs from public.capacity c where c.day is null),
    0
  );
$$;

-- ---------------------------------------------------------------------------
-- Outgoing messages (outbox). The app and Edge Functions only insert rows;
-- one sender function per channel delivers them (email first).
-- ---------------------------------------------------------------------------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references public.owners (id) on delete cascade,
  request_id uuid references public.booking_requests (id) on delete cascade,
  channel    public.message_channel not null default 'email',
  recipient  text not null,
  template   text not null,
  language   public.lang not null default 'es',
  data       jsonb not null default '{}',
  status     public.message_status not null default 'queued',
  error      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index messages_queued_idx on public.messages (created_at) where status = 'queued';
create index messages_recipient_idx on public.messages (recipient, template, created_at);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text,
  action     text not null,
  changed_by uuid,
  at         timestamptz not null default now(),
  diff       jsonb
);

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, row_id, action, changed_by, diff)
  values (
    tg_table_name,
    coalesce(v_new, v_old) ->> case when tg_table_name = 'staff' then 'user_id' else 'id' end,
    lower(tg_op),
    auth.uid(),
    jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new))
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger owners_updated_at before update on public.owners
  for each row execute function public.set_updated_at();
create trigger dogs_updated_at before update on public.dogs
  for each row execute function public.set_updated_at();
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create trigger owners_audit after insert or update or delete on public.owners
  for each row execute function public.audit_row();
create trigger dogs_audit after insert or update or delete on public.dogs
  for each row execute function public.audit_row();
create trigger bookings_audit after insert or update or delete on public.bookings
  for each row execute function public.audit_row();
create trigger attendance_audit after insert or update or delete on public.attendance
  for each row execute function public.audit_row();
create trigger capacity_audit after insert or update or delete on public.capacity
  for each row execute function public.audit_row();
create trigger staff_audit after insert or update or delete on public.staff
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Views: one row per booked day, and dogs per day vs capacity.
-- security_invoker makes them respect the caller's RLS.
-- ---------------------------------------------------------------------------
create view public.booking_days with (security_invoker = true) as
select
  b.id      as booking_id,
  b.dog_id,
  d::date   as day,
  b.status
from public.bookings b
cross join lateral generate_series(b.start_date::timestamp, b.end_date::timestamp, interval '1 day') as d
where b.status <> 'cancelled'
  and extract(isodow from d)::smallint = any (b.weekdays)
  and not exists (
    select 1 from public.capacity c where c.day = d::date and c.closed
  );

-- Counts distinct dogs, so a dog with two overlapping bookings counts once.
create view public.daily_occupancy with (security_invoker = true) as
select
  bd.day,
  count(distinct bd.dog_id) filter (where bd.status = 'confirmed')                  as confirmed,
  count(distinct bd.dog_id) filter (where bd.status = 'pending')                    as pending,
  count(distinct bd.dog_id) filter (where bd.status = 'confirmed' and g.size = 's') as confirmed_small,
  count(distinct bd.dog_id) filter (where bd.status = 'confirmed' and g.size = 'm') as confirmed_medium,
  count(distinct bd.dog_id) filter (where bd.status = 'confirmed' and g.size = 'l') as confirmed_large,
  public.max_dogs_on(bd.day)                                       as max_dogs
from public.booking_days bd
join public.dogs g on g.id = bd.dog_id
group by bd.day;

-- ---------------------------------------------------------------------------
-- Capacity invariant. A booking can only become (or stay, when its dates
-- change) 'confirmed' if every one of its days still has room, however the
-- change is made: confirm_booking, a direct UPDATE or an INSERT. The check
-- takes one advisory lock so two staff can't overbook together.
--
-- Deliberate overbooking: set `woof.allow_overbook` to 'on' for the current
-- transaction (confirm_booking(id, true) does this for you).
-- ---------------------------------------------------------------------------
create function public.check_booking_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_days date[];
  v_full date[];
begin
  if new.status <> 'confirmed' then
    return new;
  end if;
  -- Already confirmed and nothing that affects capacity changed.
  if tg_op = 'UPDATE' and old.status = 'confirmed'
     and new.dog_id = old.dog_id
     and new.start_date = old.start_date
     and new.end_date = old.end_date
     and new.weekdays = old.weekdays then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.confirm_booking'));

  -- This booking's days, by the same rules as the booking_days view.
  v_days := array(
    select d::date
    from generate_series(new.start_date::timestamp, new.end_date::timestamp, interval '1 day') as d
    where extract(isodow from d)::smallint = any (new.weekdays)
      and not exists (select 1 from public.capacity c where c.day = d::date and c.closed)
  );
  if cardinality(v_days) = 0 then
    raise exception 'booking % has no bookable days', new.id
      using errcode = '22023', hint = 'no_days';
  end if;

  if coalesce(current_setting('woof.allow_overbook', true), '') = 'on' then
    return new;
  end if;

  -- When a confirmed booking is edited, only the days it gains need room.
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    v_days := array(
      select unnest(v_days)
      except
      select d::date
      from generate_series(old.start_date::timestamp, old.end_date::timestamp, interval '1 day') as d
      where old.dog_id = new.dog_id and extract(isodow from d)::smallint = any (old.weekdays)
    );
  end if;

  -- A day is full when the other confirmed dogs (counted once each, however
  -- many bookings they have) already fill it, unless this dog is already
  -- confirmed there through another booking and so adds nobody.
  select array_agg(mine.day order by mine.day) into v_full
  from unnest(v_days) as mine (day)
  where not exists (
          select 1 from public.booking_days own
          where own.day = mine.day and own.status = 'confirmed'
            and own.dog_id = new.dog_id and own.booking_id <> new.id)
    and (
          select count(distinct other.dog_id) from public.booking_days other
          where other.day = mine.day and other.status = 'confirmed'
            and other.dog_id <> new.dog_id and other.booking_id <> new.id
        ) >= public.max_dogs_on(mine.day);

  if v_full is not null then
    raise exception 'no room on: %', array_to_string(v_full, ', ')
      using errcode = 'P0001', hint = 'full_days';
  end if;
  return new;
end $$;

create trigger bookings_capacity before insert or update on public.bookings
  for each row execute function public.check_booking_capacity();

-- confirm_booking: staff entry point. The trigger above does the capacity
-- check; p_allow_overbook switches it off for this one confirmation.
create function public.confirm_booking(p_booking_id uuid, p_allow_overbook boolean default false)
returns public.bookings
language plpgsql security invoker set search_path = '' as $$
declare
  v_booking public.bookings;
begin
  if not public.is_staff() then
    raise exception 'only staff can confirm bookings' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.confirm_booking'));

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking % not found', p_booking_id using errcode = 'P0002';
  end if;
  if v_booking.status = 'confirmed' then
    return v_booking;
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'booking % is cancelled', p_booking_id using errcode = '22023';
  end if;

  if p_allow_overbook then
    perform set_config('woof.allow_overbook', 'on', true);
  end if;
  update public.bookings set status = 'confirmed' where id = p_booking_id
  returning * into v_booking;
  if p_allow_overbook then
    perform set_config('woof.allow_overbook', 'off', true);
  end if;
  return v_booking;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.staff            enable row level security;
alter table public.owners           enable row level security;
alter table public.dogs             enable row level security;
alter table public.booking_requests enable row level security;
alter table public.bookings         enable row level security;
alter table public.attendance       enable row level security;
alter table public.capacity         enable row level security;
alter table public.messages         enable row level security;
alter table public.audit_log        enable row level security;

-- Everyday tables: staff read and write, only admins delete.
do $$
declare t text;
begin
  foreach t in array array['owners', 'dogs', 'booking_requests', 'bookings', 'attendance', 'messages'] loop
    execute format('create policy "staff can read" on public.%I for select to authenticated using ((select public.is_staff()))', t);
    execute format('create policy "staff can insert" on public.%I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy "staff can update" on public.%I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy "admins can delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- Settings-like tables: staff read, only admins change.
create policy "staff can read" on public.capacity for select to authenticated using ((select public.is_staff()));
create policy "admins can change" on public.capacity for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "staff can read" on public.staff for select to authenticated using ((select public.is_staff()));
create policy "admins can change" on public.staff for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins can read" on public.audit_log for select to authenticated using ((select public.is_admin()));

-- The public website never talks to tables directly.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for dog photos and documents, staff only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dog-files', 'dog-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "staff can read dog files" on storage.objects for select to authenticated
  using (bucket_id = 'dog-files' and (select public.is_staff()));
create policy "staff can upload dog files" on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-files' and (select public.is_staff()));
create policy "staff can update dog files" on storage.objects for update to authenticated
  using (bucket_id = 'dog-files' and (select public.is_staff()));
create policy "admins can delete dog files" on storage.objects for delete to authenticated
  using (bucket_id = 'dog-files' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Housekeeping: purge declined or spam requests after 90 days (GDPR).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'purge-old-booking-requests',
  '15 3 * * *',
  $$delete from public.booking_requests
    where status in ('declined', 'spam') and created_at < now() - interval '90 days'$$
);
