-- Tests for the staff app functions (migration 20261112120000_staff_app.sql).
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@test.local');
insert into public.staff (user_id, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Staff', 'staff');

-- One dog per day for this test.
update public.capacity set max_dogs = 1 where day is null;

insert into public.owners (id, full_name, email, language) values
  ('10000000-0000-0000-0000-000000000001', 'Mark', 'Mark@Test.local', 'en');
insert into public.dogs (id, owner_id, name, size) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Pepper', 's'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Salt', 'm'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Chili', 'l');

-- Requests: 1-4 accepted in different ways, 5 declined by a known owner,
-- 6 declined by a stranger, 7 spam.
insert into public.booking_requests (id, payload) values
  ('40000000-0000-0000-0000-000000000001', '{"lang":"es","owner":{"name":"Mark","email":"mark@test.local"},"dog":{"name":"Pepper"},"dates":{"from":"2030-01-07","to":"2030-01-11","weekdays":[1,2]},"notes":"  Bring toy  "}'),
  ('40000000-0000-0000-0000-000000000002', '{"lang":"en","owner":{"name":"Mark","email":"mark@test.local"},"dog":{"name":"Salt"},"dates":{"from":"2030-01-07","to":"2030-01-07","weekdays":[1]}}'),
  ('40000000-0000-0000-0000-000000000003', '{"lang":"en","owner":{"name":"Mark","email":"mark@test.local"},"dog":{"name":"Chili"},"dates":{"from":"2030-01-07","to":"2030-01-07","weekdays":[1]}}'),
  ('40000000-0000-0000-0000-000000000004', '{"lang":"en","owner":{"name":"Mark","email":"mark@test.local"},"dog":{"name":"Salt"},"dates":{"from":"2030-01-08","to":"2030-01-08","weekdays":[2]}}'),
  ('40000000-0000-0000-0000-000000000005', '{"lang":"es","owner":{"name":"Mark","email":"MARK@test.local"},"dog":{"name":"Pepper"},"dates":{"from":"2030-02-04","to":"2030-02-08","weekdays":[1]}}'),
  ('40000000-0000-0000-0000-000000000006', '{"lang":"en","owner":{"name":"Zoe","email":"zoe@test.local"},"dog":{"name":"Rex"},"dates":{"from":"2030-02-04","to":"2030-02-08","weekdays":[1]}}'),
  ('40000000-0000-0000-0000-000000000007', '{"lang":"es","owner":{"name":"Bot","email":"bot@test.local"},"dog":{"name":"X"},"dates":{"from":"2030-02-04","to":"2030-02-08","weekdays":[1]}}');

-- Anonymous visitors and non-staff users can't call the functions.
set local role anon;
select throws_ok(
  $$select public.accept_booking_request('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{1,2}')$$,
  '42501', null, 'anon cannot accept requests');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select throws_ok(
  $$select public.accept_booking_request('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{1,2}')$$,
  '42501', null, 'non-staff cannot accept requests');
select throws_ok(
  $$select public.decline_booking_request('40000000-0000-0000-0000-000000000005')$$,
  '42501', null, 'non-staff cannot decline requests');
select throws_ok(
  $$select public.set_my_language('en')$$,
  '42501', null, 'non-staff cannot set a staff language');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

-- Accept and confirm.
select is(
  (select status::text from public.accept_booking_request(
     '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{1,2}')),
  'confirmed', 'accepting confirms the booking');
select results_eq(
  $$select status::text, handled_by, booking_id is not null from public.booking_requests where id = '40000000-0000-0000-0000-000000000001'$$,
  $$values ('accepted', '00000000-0000-0000-0000-00000000000b'::uuid, true)$$,
  'the request is accepted, handled by the caller and linked to the booking');
select results_eq(
  $$select b.dog_id, b.request_id, b.notes from public.bookings b
    join public.booking_requests r on r.booking_id = b.id
    where r.id = '40000000-0000-0000-0000-000000000001'$$,
  $$values ('20000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 'Bring toy')$$,
  'the booking points back at the request and keeps the notes');
select results_eq(
  $$select recipient, language::text, owner_id, data ->> 'dog', data ->> 'booking_status'
    from public.messages where request_id = '40000000-0000-0000-0000-000000000001' and template = 'request_accepted'$$,
  $$values ('Mark@Test.local', 'en', '10000000-0000-0000-0000-000000000001'::uuid, 'Pepper', 'confirmed')$$,
  'an acceptance email is queued to the owner in their language');
select throws_ok(
  $$select public.accept_booking_request('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{1,2}')$$,
  '22023', null, 'a request cannot be accepted twice');
select throws_ok(
  $$select public.accept_booking_request('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '2030-01-07', '2030-01-07', '{1}', 'maybe')$$,
  '22023', null, 'an unknown mode is refused');

-- Monday 2030-01-07 is now full: confirm mode fails and saves nothing.
select throws_like(
  $$select public.accept_booking_request('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '2030-01-07', '2030-01-07', '{1}')$$,
  'no room on: 2030-01-07', 'accepting onto a full day reports the full days');
select is(
  (select status::text from public.booking_requests where id = '40000000-0000-0000-0000-000000000002'),
  'new', 'a refused acceptance leaves the request new');
select is(
  (select count(*)::int from public.bookings where request_id = '40000000-0000-0000-0000-000000000002'),
  0, 'a refused acceptance creates no booking');
select is(
  (select count(*)::int from public.messages where request_id = '40000000-0000-0000-0000-000000000002'),
  0, 'a refused acceptance queues no email');

-- Overbook on purpose.
select is(
  (select status::text from public.accept_booking_request(
     '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '2030-01-07', '2030-01-07', '{1}', 'overbook')),
  'confirmed', 'overbook mode confirms a full day');
select is(
  (select confirmed::int from public.daily_occupancy where day = '2030-01-07'),
  2, 'the overbooked dog counts in daily_occupancy');
select is(current_setting('woof.allow_overbook', true), 'off', 'the overbook flag is off again');

-- Leave as pending.
select is(
  (select status::text from public.accept_booking_request(
     '40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '2030-01-07', '2030-01-07', '{1}', 'pending')),
  'pending', 'pending mode leaves the booking pending');
select is(
  (select status::text from public.booking_requests where id = '40000000-0000-0000-0000-000000000003'),
  'accepted', 'pending mode still accepts the request');
select is(
  (select data ->> 'booking_status' from public.messages where request_id = '40000000-0000-0000-0000-000000000003'),
  'pending', 'the queued email says the booking is pending');

-- A booking with no bookable days can't be confirmed (Tuesday-only on a Monday).
select throws_like(
  $$select public.accept_booking_request('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', '2030-01-07', '2030-01-07', '{2}')$$,
  '%has no bookable days', 'accepting with no bookable days is refused');

-- Decline: the email goes to the known owner, in the owner's language.
select is(
  (select status::text from public.decline_booking_request('40000000-0000-0000-0000-000000000005')),
  'declined', 'staff can decline a request');
select results_eq(
  $$select recipient, language::text, owner_id, handled_by from public.messages m
    join public.booking_requests r on r.id = m.request_id
    where m.request_id = '40000000-0000-0000-0000-000000000005' and m.template = 'request_declined'$$,
  $$values ('Mark@Test.local', 'en', '10000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-00000000000b'::uuid)$$,
  'a decline email is queued to the matched owner in their language');

-- Decline from someone who isn't an owner yet: form email and form language.
select lives_ok(
  $$select public.decline_booking_request('40000000-0000-0000-0000-000000000006', 'declined')$$,
  'declining an unknown owner works');
select results_eq(
  $$select recipient, language::text, owner_id is null from public.messages
    where request_id = '40000000-0000-0000-0000-000000000006'$$,
  $$values ('zoe@test.local', 'en', true)$$,
  'an unknown owner gets the email at the form address in the form language');

-- Spam: marked, no email.
select is(
  (select status::text from public.decline_booking_request('40000000-0000-0000-0000-000000000007', 'spam')),
  'spam', 'staff can mark a request as spam');
select is(
  (select count(*)::int from public.messages where request_id = '40000000-0000-0000-0000-000000000007'),
  0, 'spam gets no email');
select throws_ok(
  $$select public.decline_booking_request('40000000-0000-0000-0000-000000000004', 'accepted')$$,
  '22023', null, 'decline only takes declined or spam');

-- Own language: staff can change theirs even though staff rows are admin-only.
select public.set_my_language('en');
reset role;
select is(
  (select language::text from public.staff where user_id = '00000000-0000-0000-0000-00000000000b'),
  'en', 'staff can change their own language');

select * from finish();
rollback;
