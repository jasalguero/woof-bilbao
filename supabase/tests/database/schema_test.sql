-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Users: one admin, one staff member, one logged-in stranger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@test.local');
insert into public.staff (user_id, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Staff', 'staff');

-- Capacity: 2 dogs per day for this test; one closed day.
update public.capacity set max_dogs = 2 where day is null;
insert into public.capacity (day, max_dogs, closed, reason) values ('2030-01-09', 0, true, 'holiday');

-- Three dogs, each booked Mon 2030-01-07 to Fri 2030-01-11.
insert into public.owners (id, full_name, email) values
  ('10000000-0000-0000-0000-000000000001', 'Ane', 'ane@test.local');
insert into public.dogs (id, owner_id, name, size) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Txuri', 's'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Beltza', 'l'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Gorri', 'm'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Urdin', 'm'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Berde', 's');
insert into public.bookings (id, dog_id, start_date, end_date, weekdays) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{1,2,3,4,5}'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '2030-01-07', '2030-01-11', '{1,2,3,4,5}'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '2030-01-07', '2030-01-11', '{1,3}'),
  -- Urdin on Monday only; Txuri again Mon-Tue (overlaps booking 1);
  -- Urdin on the closed Wednesday only; Berde on Monday only.
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', '2030-01-07', '2030-01-07', '{1}'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-08', '{1,2}'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', '2030-01-09', '2030-01-09', '{3}'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000005', '2030-01-07', '2030-01-07', '{1}');

select is(
  (select count(*)::int from public.booking_days where booking_id = '30000000-0000-0000-0000-000000000001'),
  4, 'booking_days skips the closed day');
select is(
  (select count(*)::int from public.booking_days where booking_id = '30000000-0000-0000-0000-000000000003'),
  1, 'booking_days respects weekdays (Mon only, Wed is closed)');
select throws_ok(
  $$insert into public.bookings (dog_id, start_date, end_date, weekdays)
    values ('20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{6}')$$,
  '23514', null, 'weekend days are rejected');
select throws_ok(
  $$insert into public.bookings (dog_id, start_date, end_date)
    values ('20000000-0000-0000-0000-000000000001', '2030-01-11', '2030-01-07')$$,
  '23514', null, 'end date before start date is rejected');

-- Anonymous visitors (the public website) can't touch tables.
set local role anon;
select throws_ok($$select * from public.owners$$, '42501', null, 'anon cannot read owners');
select throws_ok($$insert into public.booking_requests (payload) values ('{}')$$, '42501', null, 'anon cannot insert requests');
reset role;

-- A logged-in user who is not staff sees nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*)::int from public.dogs), 0, 'non-staff sees no dogs');
select throws_ok(
  $$select public.confirm_booking('30000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'non-staff cannot confirm');
reset role;

-- Staff can work with the data.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.dogs where owner_id = '10000000-0000-0000-0000-000000000001'), 5, 'staff sees all dogs');
select is(
  (select status::text from public.confirm_booking('30000000-0000-0000-0000-000000000001')),
  'confirmed', 'first booking confirms');
select is(
  (select status::text from public.confirm_booking('30000000-0000-0000-0000-000000000003')),
  'confirmed', 'second booking confirms');
select throws_like(
  $$select public.confirm_booking('30000000-0000-0000-0000-000000000002')$$,
  'no room on: 2030-01-07', 'third dog is refused on the full Monday only');
select is(
  (select status::text from public.confirm_booking('30000000-0000-0000-0000-000000000002', true)),
  'confirmed', 'staff can deliberately overbook');
select is(
  (select confirmed::int from public.daily_occupancy where day = '2030-01-07'),
  3, 'daily_occupancy counts confirmed dogs');
select is(
  (select max_dogs from public.daily_occupancy where day = '2030-01-07'),
  2, 'daily_occupancy shows the daily maximum');

-- The capacity rule holds however the status is changed.
select throws_like(
  $$update public.bookings set status = 'confirmed' where id = '30000000-0000-0000-0000-000000000004'$$,
  'no room on: 2030-01-07', 'a direct status update cannot overbook');
select throws_like(
  $$insert into public.bookings (dog_id, start_date, end_date, weekdays, status)
    values ('20000000-0000-0000-0000-000000000004', '2030-01-07', '2030-01-07', '{1}', 'confirmed')$$,
  'no room on: 2030-01-07', 'inserting a confirmed booking cannot overbook');
select throws_like(
  $$update public.bookings set weekdays = '{1,2}' where id = '30000000-0000-0000-0000-000000000003'$$,
  'no room on: 2030-01-08', 'moving a confirmed booking onto a full day is refused');
select is(
  (select status::text from public.confirm_booking('30000000-0000-0000-0000-000000000005')),
  'confirmed', 'a dog already confirmed on a full day can get a second booking');
select is(
  (select confirmed::int from public.daily_occupancy where day = '2030-01-07'),
  3, 'daily_occupancy counts each dog once');
select throws_like(
  $$select public.confirm_booking('30000000-0000-0000-0000-000000000006')$$,
  '%has no bookable days', 'a booking with no bookable days cannot be confirmed');
select set_config('woof.allow_overbook', 'on', true);
select lives_ok(
  $$update public.bookings set status = 'confirmed' where id = '30000000-0000-0000-0000-000000000004'$$,
  'the overbook flag allows a deliberate direct confirmation');
select set_config('woof.allow_overbook', 'off', true);
select is(
  (select status::text from public.confirm_booking('30000000-0000-0000-0000-000000000007', true)),
  'confirmed', 'confirm_booking overbooks when asked');
select is(current_setting('woof.allow_overbook', true), 'off', 'confirm_booking turns the overbook flag off again');
select throws_like(
  $$insert into public.bookings (dog_id, start_date, end_date, weekdays, status)
    values ('20000000-0000-0000-0000-000000000003', '2030-01-08', '2030-01-08', '{2}', 'confirmed')$$,
  'no room on: 2030-01-08', 'the check is back on after a deliberate overbook');
update public.capacity set max_dogs = 50 where day is null;
select is((select max_dogs from public.capacity where day is null), 2, 'staff cannot change capacity');
delete from public.dogs where id = '20000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.dogs where owner_id = '10000000-0000-0000-0000-000000000001'), 5, 'staff cannot delete dogs');
reset role;

-- Admins can change settings, and changes are audited.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update public.capacity set max_dogs = 15 where day is null;
select is((select max_dogs from public.capacity where day is null), 15, 'admin can change capacity');
select ok(
  exists (select 1 from public.audit_log where table_name = 'capacity' and action = 'update'
          and changed_by = '00000000-0000-0000-0000-00000000000a'),
  'capacity change is in the audit log');
reset role;

select * from finish();
rollback;
