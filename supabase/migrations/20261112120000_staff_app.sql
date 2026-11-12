-- Staff app (phase 2): handle booking requests in one transaction, and let
-- every staff member change their own UI language.

-- ---------------------------------------------------------------------------
-- accept_booking_request: books the chosen dog for the request's dates and
-- marks the request accepted, all or nothing.
--
-- p_mode:
--   'confirm'  create the booking and confirm it; if a day is full the whole
--              call fails with 'no room on: <dates>' (hint 'full_days') and
--              nothing is saved, so the app can ask what to do;
--   'overbook' confirm even if days are full (confirm_booking(id, true));
--   'pending'  accept the request but leave the booking pending.
--
-- Queues a 'request_accepted' email for the dog's owner, in the owner's
-- language; data.booking_status says whether the booking is confirmed yet.
-- ---------------------------------------------------------------------------
create function public.accept_booking_request(
  p_request_id uuid,
  p_dog_id     uuid,
  p_start_date date,
  p_end_date   date,
  p_weekdays   smallint[],
  p_mode       text default 'confirm'
) returns public.bookings
language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.booking_requests;
  v_dog     public.dogs;
  v_owner   public.owners;
  v_booking public.bookings;
begin
  if not public.is_staff() then
    raise exception 'only staff can handle requests' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('confirm', 'overbook', 'pending') then
    raise exception 'unknown mode %', p_mode using errcode = '22023', hint = 'bad_mode';
  end if;

  select * into v_request from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'request % not found', p_request_id using errcode = 'P0002';
  end if;
  if v_request.status <> 'new' then
    raise exception 'request % was already handled', p_request_id
      using errcode = '22023', hint = 'already_handled';
  end if;

  select * into v_dog from public.dogs where id = p_dog_id;
  if not found then
    raise exception 'dog % not found', p_dog_id using errcode = 'P0002';
  end if;
  select * into v_owner from public.owners where id = v_dog.owner_id;

  insert into public.bookings (dog_id, request_id, start_date, end_date, weekdays, status, notes)
  values (p_dog_id, p_request_id, p_start_date, p_end_date, p_weekdays, 'pending',
          nullif(trim(v_request.payload ->> 'notes'), ''))
  returning * into v_booking;

  if p_mode <> 'pending' then
    v_booking := public.confirm_booking(v_booking.id, p_mode = 'overbook');
  end if;

  update public.booking_requests
  set status = 'accepted', handled_by = auth.uid(), handled_at = now(), booking_id = v_booking.id
  where id = p_request_id;

  insert into public.messages (owner_id, request_id, recipient, template, language, data)
  values (
    v_owner.id, p_request_id, v_owner.email, 'request_accepted', v_owner.language,
    jsonb_build_object(
      'owner', v_owner.full_name,
      'dog', v_dog.name,
      'from', v_booking.start_date,
      'to', v_booking.end_date,
      'weekdays', to_jsonb(v_booking.weekdays),
      'booking_status', v_booking.status
    )
  );

  return v_booking;
end $$;

-- ---------------------------------------------------------------------------
-- decline_booking_request: marks a new request 'declined' (and queues a
-- 'request_declined' email to the address on the form) or 'spam' (no email:
-- never write back to spammers).
-- ---------------------------------------------------------------------------
create function public.decline_booking_request(
  p_request_id uuid,
  p_status     public.request_status default 'declined'
) returns public.booking_requests
language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.booking_requests;
  v_owner   public.owners;
  v_email   text;
begin
  if not public.is_staff() then
    raise exception 'only staff can handle requests' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('declined', 'spam') then
    raise exception 'status must be declined or spam' using errcode = '22023', hint = 'bad_status';
  end if;

  select * into v_request from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'request % not found', p_request_id using errcode = 'P0002';
  end if;
  if v_request.status <> 'new' then
    raise exception 'request % was already handled', p_request_id
      using errcode = '22023', hint = 'already_handled';
  end if;

  update public.booking_requests
  set status = p_status, handled_by = auth.uid(), handled_at = now()
  where id = p_request_id
  returning * into v_request;

  v_email := nullif(trim(v_request.payload -> 'owner' ->> 'email'), '');
  if p_status = 'declined' and v_email is not null then
    select * into v_owner from public.owners where lower(email) = lower(v_email);
    insert into public.messages (owner_id, request_id, recipient, template, language, data)
    values (
      v_owner.id, p_request_id, coalesce(v_owner.email, v_email), 'request_declined',
      coalesce(v_owner.language,
               case when v_request.payload ->> 'lang' = 'en' then 'en' else 'es' end::public.lang),
      jsonb_build_object(
        'owner', coalesce(v_owner.full_name, v_request.payload -> 'owner' ->> 'name'),
        'dog', v_request.payload -> 'dog' ->> 'name',
        'from', v_request.payload -> 'dates' ->> 'from',
        'to', v_request.payload -> 'dates' ->> 'to',
        'weekdays', v_request.payload -> 'dates' -> 'weekdays'
      )
    );
  end if;

  return v_request;
end $$;

-- ---------------------------------------------------------------------------
-- set_my_language: the `staff` table is admin-only for writes, but everyone
-- picks their own UI language.
-- ---------------------------------------------------------------------------
create function public.set_my_language(p_language public.lang) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_language is null then
    raise exception 'language is required' using errcode = '22023';
  end if;
  update public.staff set language = p_language where user_id = (select auth.uid());
  if not found then
    raise exception 'only staff can set a language' using errcode = '42501';
  end if;
end $$;

revoke execute on function public.accept_booking_request(uuid, uuid, date, date, smallint[], text) from anon, public;
revoke execute on function public.decline_booking_request(uuid, public.request_status) from anon, public;
revoke execute on function public.set_my_language(public.lang) from anon, public;
grant execute on function public.accept_booking_request(uuid, uuid, date, date, smallint[], text) to authenticated, service_role;
grant execute on function public.decline_booking_request(uuid, public.request_status) to authenticated, service_role;
grant execute on function public.set_my_language(public.lang) to authenticated, service_role;
