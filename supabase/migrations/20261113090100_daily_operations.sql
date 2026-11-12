-- Daily operations (phase 4), part 2:
--   * check-in / check-out for the staff app's Today screen;
--   * Realtime events for new booking requests and attendance changes;
--   * the email outbox sender's claim/complete functions and its cron job;
--   * daily vaccine reminder emails to owners (soft: they never block anything).

-- ---------------------------------------------------------------------------
-- Today in Bilbao, and whether the daycare opens on a given day.
--
-- madrid_today() honours the `woof.today` setting when it is set in the
-- current transaction. Only the database tests use it (clients cannot set
-- settings through the Data API), so they can run on any day of the week.
-- ---------------------------------------------------------------------------
create function public.madrid_today() returns date
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('woof.today', true), '')::date,
    (now() at time zone 'Europe/Madrid')::date
  );
$$;

-- Open = Monday to Friday and not marked closed in `capacity`.
create function public.is_open_day(p_day date) returns boolean
language sql stable set search_path = '' as $$
  select extract(isodow from p_day) between 1 and 5
     and not exists (select 1 from public.capacity c where c.day = p_day and c.closed);
$$;

-- ---------------------------------------------------------------------------
-- Attendance. One row per dog per day (unique (dog_id, day) and
-- checked_out_at >= checked_in_at are already table constraints). These
-- functions are the app's only way in: they always use today's date in
-- Bilbao, take a row lock so two staff tapping at once can't clash, and are
-- idempotent (checking in a dog that is already in returns the row as is).
--
-- Errors raise errcode 22023 with a hint the app turns into a sentence:
--   closed_day, not_booked, inactive_dog, not_checked_in, already_checked_out,
--   bad_input.
-- ---------------------------------------------------------------------------

-- Appends a note on a new line, ignoring blanks.
create function public.append_note(p_old text, p_new text) returns text
language sql immutable set search_path = '' as $$
  select nullif(concat_ws(E'\n', nullif(trim(p_old), ''), nullif(trim(p_new), '')), '');
$$;

create function public.check_in(p_dog_id uuid, p_note text default null, p_walk_in boolean default false)
returns public.attendance
language plpgsql security invoker set search_path = '' as $$
declare
  v_day     date := public.madrid_today();
  v_dog     public.dogs;
  v_booking uuid;
  v_row     public.attendance;
begin
  if not public.is_staff() then
    raise exception 'only staff can check dogs in' using errcode = '42501';
  end if;
  if length(p_note) > 500 then
    raise exception 'note is too long' using errcode = '22023', hint = 'bad_input';
  end if;
  if not public.is_open_day(v_day) then
    raise exception 'the daycare is closed on %', v_day using errcode = '22023', hint = 'closed_day';
  end if;

  select * into v_dog from public.dogs where id = p_dog_id;
  if not found then
    raise exception 'dog % not found', p_dog_id using errcode = 'P0002';
  end if;

  select bd.booking_id into v_booking
  from public.booking_days bd
  where bd.dog_id = p_dog_id and bd.day = v_day and bd.status = 'confirmed'
  order by bd.booking_id
  limit 1;

  if v_booking is null then
    -- A walk-in: no confirmed booking today. The app asks first.
    if not coalesce(p_walk_in, false) then
      raise exception 'dog % has no confirmed booking today', p_dog_id using errcode = '22023', hint = 'not_booked';
    end if;
    if not v_dog.active then
      raise exception 'dog % is not active', p_dog_id using errcode = '22023', hint = 'inactive_dog';
    end if;
  end if;

  select * into v_row from public.attendance where dog_id = p_dog_id and day = v_day for update;
  if found then
    if v_row.checked_out_at is not null then
      raise exception 'dog % already went home today', p_dog_id using errcode = '22023', hint = 'already_checked_out';
    end if;
    if v_row.checked_in_at is not null then
      return v_row; -- someone else got there first
    end if;
    update public.attendance
    set checked_in_at = now(), checked_in_by = auth.uid(),
        booking_id = coalesce(booking_id, v_booking), note = public.append_note(note, p_note)
    where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.attendance (dog_id, booking_id, day, checked_in_at, checked_in_by, note)
  values (p_dog_id, v_booking, v_day, now(), auth.uid(), public.append_note(null, p_note))
  on conflict (dog_id, day) do nothing
  returning * into v_row;
  if not found then
    -- Another check-in for this dog committed between our lock and insert.
    select * into v_row from public.attendance where dog_id = p_dog_id and day = v_day;
  end if;
  return v_row;
end $$;

create function public.check_out(p_dog_id uuid, p_note text default null)
returns public.attendance
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.attendance;
begin
  if not public.is_staff() then
    raise exception 'only staff can check dogs out' using errcode = '42501';
  end if;
  if length(p_note) > 500 then
    raise exception 'note is too long' using errcode = '22023', hint = 'bad_input';
  end if;

  select * into v_row from public.attendance
  where dog_id = p_dog_id and day = public.madrid_today()
  for update;
  if not found or v_row.checked_in_at is null then
    raise exception 'dog % is not checked in today', p_dog_id using errcode = '22023', hint = 'not_checked_in';
  end if;
  if v_row.checked_out_at is not null then
    return v_row;
  end if;

  update public.attendance
  set checked_out_at = greatest(now(), checked_in_at), note = public.append_note(note, p_note)
  where id = v_row.id
  returning * into v_row;
  return v_row;
end $$;

-- Undo a mistaken check-out: the dog is "here" again.
create function public.undo_check_out(p_dog_id uuid)
returns public.attendance
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.attendance;
begin
  if not public.is_staff() then
    raise exception 'only staff can change attendance' using errcode = '42501';
  end if;
  update public.attendance
  set checked_out_at = null
  where dog_id = p_dog_id and day = public.madrid_today() and checked_in_at is not null
  returning * into v_row;
  if not found then
    raise exception 'dog % is not checked in today', p_dog_id using errcode = '22023', hint = 'not_checked_in';
  end if;
  return v_row;
end $$;

-- Undo a mistaken check-in: today's row goes away (the audit log keeps it).
-- Security definer because deleting attendance is otherwise admin-only; it
-- can only ever remove today's row, and only before the dog is checked out.
create function public.undo_check_in(p_dog_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.attendance;
begin
  if not public.is_staff() then
    raise exception 'only staff can change attendance' using errcode = '42501';
  end if;
  select * into v_row from public.attendance
  where dog_id = p_dog_id and day = public.madrid_today()
  for update;
  if not found then
    return;
  end if;
  if v_row.checked_out_at is not null then
    raise exception 'undo the check-out first' using errcode = '22023', hint = 'already_checked_out';
  end if;
  delete from public.attendance where id = v_row.id;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: the staff app listens for new booking requests (nav badge, toast,
-- desktop notification) and for attendance changes (two staff on Today).
-- Realtime applies each subscriber's RLS SELECT policy, so only staff get
-- these rows. (DELETE events are not filtered by RLS, but they carry only
-- the row's id.)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['booking_requests', 'attendance'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Email outbox delivery (used by the `send-messages` Edge Function, with the
-- service role).
--
-- claim_messages() moves up to p_limit queued rows to 'sending' and returns
-- them. FOR UPDATE SKIP LOCKED means two overlapping runs never get the same
-- row. A row left in 'sending' for 15 minutes (the function died mid-run) is
-- claimable again, until it has had 3 attempts.
--
-- complete_message() records the outcome of one attempt:
--   'sent'   -> sent, with sent_at;
--   'retry'  -> back to queued while attempts < 3, else failed (5xx, 429,
--               network errors);
--   'failed' -> failed for good (4xx, unknown template, bad data).
-- ---------------------------------------------------------------------------
alter table public.messages
  add column attempts        integer not null default 0 check (attempts >= 0),
  add column last_attempt_at timestamptz,
  add column provider_id     text,
  -- The dog a message is about (vaccine reminders use it to space them out).
  add column dog_id          uuid references public.dogs (id) on delete cascade;
create index messages_dog_template_idx on public.messages (dog_id, template, created_at) where dog_id is not null;
create index messages_sending_idx on public.messages (last_attempt_at) where status = 'sending';

create function public.claim_messages(p_channel public.message_channel default 'email', p_limit integer default 20)
returns setof public.messages
language plpgsql security invoker set search_path = '' as $$
begin
  -- Rows stuck in 'sending' after their last allowed attempt give up.
  update public.messages
  set status = 'failed', error = coalesce(error, 'no result after 3 attempts')
  where channel = p_channel and status = 'sending' and attempts >= 3
    and last_attempt_at < now() - interval '15 minutes';

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

create function public.complete_message(
  p_id          uuid,
  p_outcome     text,
  p_error       text default null,
  p_provider_id text default null
) returns public.messages
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.messages;
begin
  if p_outcome is null or p_outcome not in ('sent', 'retry', 'failed') then
    raise exception 'unknown outcome %', p_outcome using errcode = '22023';
  end if;
  update public.messages m
  set status = case
                 when p_outcome = 'sent' then 'sent'
                 when p_outcome = 'retry' and m.attempts < 3 then 'queued'
                 else 'failed'
               end::public.message_status,
      sent_at = case when p_outcome = 'sent' then now() end,
      error = case when p_outcome = 'sent' then null else left(coalesce(p_error, p_outcome), 1000) end,
      provider_id = coalesce(p_provider_id, m.provider_id)
  where m.id = p_id and m.status = 'sending'
  returning * into v_row;
  return v_row; -- null when the row was not being sent
end $$;

-- ---------------------------------------------------------------------------
-- Vaccine reminders. Once a day, queue a 'vaccine_reminder' email for each
-- active dog with a confirmed booking day from today on, whose owner didn't
-- confirm vaccines or whose "checked until" date is past or within 14 days.
-- At most one per dog every 30 days. A reminder only: nothing is blocked.
-- ---------------------------------------------------------------------------
create function public.queue_vaccine_reminders(p_today date default public.madrid_today())
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
begin
  -- Two runs at once would both see "no reminder yet".
  perform pg_advisory_xact_lock(hashtext('public.queue_vaccine_reminders'));

  insert into public.messages (owner_id, dog_id, recipient, template, language, data)
  select o.id, d.id, o.email, 'vaccine_reminder', o.language,
         jsonb_build_object(
           'owner', o.full_name,
           'dog', d.name,
           'next_day', nb.next_day,
           'checked_until', d.vaccines_checked_until,
           'reason', case
                       when not d.vaccines_up_to_date then 'not_confirmed'
                       when d.vaccines_checked_until < p_today then 'expired'
                       else 'expiring'
                     end
         )
  from public.dogs d
  join public.owners o on o.id = d.owner_id
  cross join lateral (
    select min(bd.day) as next_day from public.booking_days bd
    where bd.dog_id = d.id and bd.status = 'confirmed' and bd.day >= p_today
  ) nb
  where d.active
    and nb.next_day is not null
    and nullif(trim(o.email), '') is not null
    and (not d.vaccines_up_to_date or d.vaccines_checked_until <= p_today + 14)
    and not exists (
      select 1 from public.messages m
      where m.dog_id = d.id and m.template = 'vaccine_reminder'
        and m.created_at > now() - interval '30 days'
    );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 07:00 UTC = 08:00 or 09:00 in Bilbao.
select cron.schedule('queue-vaccine-reminders', '0 7 * * *', 'select public.queue_vaccine_reminders()');

-- ---------------------------------------------------------------------------
-- Calling the sender every 5 minutes (pg_cron + pg_net, the documented
-- Supabase pattern). The URL and shared secret live in Supabase Vault as
-- `send_messages_url` and `send_messages_secret`. Until both exist this is a
-- no-op, so the migration is safe everywhere and nothing fires before the
-- sender is set up. It also skips the HTTP call when there is nothing to send.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create function public.invoke_send_messages() returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'send_messages_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'send_messages_secret';
  if nullif(trim(v_url), '') is null or nullif(trim(v_secret), '') is null then
    return null;
  end if;
  if not exists (
    select 1 from public.messages
    where channel = 'email'
      and (status = 'queued' or (status = 'sending' and last_attempt_at < now() - interval '15 minutes'))
  ) then
    return null;
  end if;
  return net.http_post(
    url := trim(v_url),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || trim(v_secret)),
    timeout_milliseconds := 60000
  );
end $$;

select cron.schedule('send-messages', '*/5 * * * *', 'select public.invoke_send_messages()');

-- ---------------------------------------------------------------------------
-- Privileges. Staff call the attendance functions; only the service role
-- (Edge Functions) and the database itself (cron) run the outbox and
-- reminder functions. invoke_send_messages reads Vault: owner only.
-- ---------------------------------------------------------------------------
revoke execute on function public.madrid_today() from anon, public;
revoke execute on function public.is_open_day(date) from anon, public;
revoke execute on function public.append_note(text, text) from anon, public;
revoke execute on function public.check_in(uuid, text, boolean) from anon, public;
revoke execute on function public.check_out(uuid, text) from anon, public;
revoke execute on function public.undo_check_out(uuid) from anon, public;
revoke execute on function public.undo_check_in(uuid) from anon, public;
grant execute on function public.madrid_today() to authenticated, service_role;
grant execute on function public.is_open_day(date) to authenticated, service_role;
grant execute on function public.append_note(text, text) to authenticated, service_role;
grant execute on function public.check_in(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.check_out(uuid, text) to authenticated, service_role;
grant execute on function public.undo_check_out(uuid) to authenticated, service_role;
grant execute on function public.undo_check_in(uuid) to authenticated, service_role;

revoke execute on function public.claim_messages(public.message_channel, integer) from anon, authenticated, public;
revoke execute on function public.complete_message(uuid, text, text, text) from anon, authenticated, public;
revoke execute on function public.queue_vaccine_reminders(date) from anon, authenticated, public;
revoke execute on function public.invoke_send_messages() from anon, authenticated, service_role, public;
grant execute on function public.claim_messages(public.message_channel, integer) to service_role;
grant execute on function public.complete_message(uuid, text, text, text) to service_role;
grant execute on function public.queue_vaccine_reminders(date) to service_role;
