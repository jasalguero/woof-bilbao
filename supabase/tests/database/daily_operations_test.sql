-- Tests for daily operations (migrations 20261113090000/090100): check-in and
-- check-out, Realtime publication, the email outbox claim/complete functions,
-- vaccine reminders and the cron jobs.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@test.local');
insert into public.staff (user_id, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Staff', 'staff');

update public.capacity set max_dogs = 12 where day is null;
-- Tuesday 2030-01-08 is closed.
insert into public.capacity (day, max_dogs, closed, reason) values ('2030-01-08', 0, true, 'holiday');

insert into public.owners (id, full_name, email, language) values
  ('10000000-0000-0000-0000-000000000001', 'Ane', 'ane@test.local', 'es'),
  ('10000000-0000-0000-0000-000000000002', 'Mark', 'mark@test.local', 'en');

-- Attendance dogs: Txuri booked Mon 2030-01-07, Beltza not booked,
-- Gorri inactive and not booked, Urdin booked but only pending.
insert into public.dogs (id, owner_id, name, active, vaccines_up_to_date) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Txuri', true, true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Beltza', true, true),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Gorri', false, true),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Urdin', true, true);
insert into public.bookings (id, dog_id, start_date, end_date, weekdays, status) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{1,2,3,4,5}', 'confirmed'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', '2030-01-07', '2030-01-11', '{1,2,3,4,5}', 'pending');

-- ---------------------------------------------------------------------------
-- madrid_today
-- ---------------------------------------------------------------------------
select is(public.madrid_today(), (now() at time zone 'Europe/Madrid')::date, 'madrid_today is the date in Bilbao');
select set_config('woof.today', '2030-01-07', true);
select is(public.madrid_today(), '2030-01-07'::date, 'madrid_today honours woof.today (tests only)');
select ok(public.is_open_day('2030-01-07') and not public.is_open_day('2030-01-08')
          and not public.is_open_day('2030-01-12'), 'is_open_day: weekdays only, closed days excluded');

-- ---------------------------------------------------------------------------
-- Check-in / check-out: who may call them
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.check_in('20000000-0000-0000-0000-000000000001')$$, '42501', null, 'anon cannot check in');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select throws_ok($$select public.check_in('20000000-0000-0000-0000-000000000001')$$, '42501', null, 'non-staff cannot check in');
select throws_ok($$select public.check_out('20000000-0000-0000-0000-000000000001')$$, '42501', null, 'non-staff cannot check out');
select throws_ok($$select public.undo_check_in('20000000-0000-0000-0000-000000000001')$$, '42501', null, 'non-staff cannot undo a check-in');
select throws_ok($$select public.undo_check_out('20000000-0000-0000-0000-000000000001')$$, '42501', null, 'non-staff cannot undo a check-out');
reset role;

-- ---------------------------------------------------------------------------
-- Check-in / check-out as staff (plain staff, not admin)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select results_eq(
  $$select day, booking_id, checked_in_by, checked_in_at is not null, checked_out_at, note
    from public.check_in('20000000-0000-0000-0000-000000000001', '  came with a toy ')$$,
  $$values ('2030-01-07'::date, '30000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-00000000000b'::uuid, true, null::timestamptz, 'came with a toy')$$,
  'check_in records today, the booking, who did it and the note');
select is(
  (select id from public.check_in('20000000-0000-0000-0000-000000000001')),
  (select id from public.attendance where dog_id = '20000000-0000-0000-0000-000000000001'),
  'checking in twice returns the same row');
select is((select count(*)::int from public.attendance), 1, 'still one row per dog per day');

select throws_like(
  $$select public.check_in('20000000-0000-0000-0000-000000000002')$$,
  '%no confirmed booking today%', 'a dog without a confirmed booking needs the walk-in flag');
select throws_like(
  $$select public.check_in('20000000-0000-0000-0000-000000000004')$$,
  '%no confirmed booking today%', 'a pending booking does not count as booked');
select results_eq(
  $$select booking_id, checked_in_at is not null from public.check_in('20000000-0000-0000-0000-000000000002', null, true)$$,
  $$values (null::uuid, true)$$,
  'a walk-in checks in an active dog with no booking');
select throws_like(
  $$select public.check_in('20000000-0000-0000-0000-000000000003', null, true)$$,
  '%is not active%', 'an inactive dog cannot walk in');
select throws_ok(
  $$select public.check_in('20000000-0000-0000-0000-000000000099', null, true)$$,
  'P0002', null, 'an unknown dog is refused');
select throws_like(
  $$select public.check_in('20000000-0000-0000-0000-000000000001', repeat('x', 501))$$,
  '%note is too long%', 'notes are limited to 500 characters');

select throws_like(
  $$select public.check_out('20000000-0000-0000-0000-000000000004')$$,
  '%not checked in today%', 'a dog that is not here cannot check out');
select results_eq(
  $$select checked_out_at >= checked_in_at, note from public.check_out('20000000-0000-0000-0000-000000000001', 'tired and happy')$$,
  $$values (true, E'came with a toy\ntired and happy')$$,
  'check_out sets the time and appends the note');
select is(
  (select checked_out_at from public.check_out('20000000-0000-0000-0000-000000000001')),
  (select checked_out_at from public.attendance where dog_id = '20000000-0000-0000-0000-000000000001'),
  'checking out twice changes nothing');
select throws_like(
  $$select public.check_in('20000000-0000-0000-0000-000000000001')$$,
  '%already went home%', 'a dog that went home cannot check in again');
select throws_like(
  $$select public.undo_check_in('20000000-0000-0000-0000-000000000001')$$,
  '%undo the check-out first%', 'a check-in cannot be undone after the check-out');

select is(
  (select checked_out_at from public.undo_check_out('20000000-0000-0000-0000-000000000001')),
  null, 'undo_check_out puts the dog back to "here"');
select throws_like(
  $$select public.undo_check_out('20000000-0000-0000-0000-000000000004')$$,
  '%not checked in today%', 'undo_check_out needs a check-in');

select lives_ok($$select public.undo_check_in('20000000-0000-0000-0000-000000000002')$$, 'staff (not only admins) can undo a check-in');
select is((select count(*)::int from public.attendance where dog_id = '20000000-0000-0000-0000-000000000002'), 0, 'undoing a check-in removes the row');
select lives_ok($$select public.undo_check_in('20000000-0000-0000-0000-000000000002')$$, 'undoing a missing check-in is a no-op');
delete from public.attendance where dog_id = '20000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.attendance where dog_id = '20000000-0000-0000-0000-000000000001'),
  1, 'staff still cannot delete attendance directly');

-- The table constraints hold for direct writes too.
select throws_ok(
  $$update public.attendance set checked_out_at = checked_in_at - interval '1 minute' where dog_id = '20000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'checked_out_at cannot be before checked_in_at');
select throws_ok(
  $$insert into public.attendance (dog_id, day, checked_in_at) values ('20000000-0000-0000-0000-000000000001', '2030-01-07', now())$$,
  '23505', null, 'one row per dog per day');

-- Closed days and weekends.
select set_config('woof.today', '2030-01-08', true);
select throws_like(
  $$select public.check_in('20000000-0000-0000-0000-000000000001')$$,
  '%closed on 2030-01-08%', 'no check-in on a closed day');
select set_config('woof.today', '2030-01-12', true);
select throws_like(
  $$select public.check_in('20000000-0000-0000-0000-000000000002', null, true)$$,
  '%closed on 2030-01-12%', 'no check-in (or walk-in) at the weekend');
select set_config('woof.today', '2030-01-07', true);
reset role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_requests'),
  'booking_requests changes are published to Realtime');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance'),
  'attendance changes are published to Realtime');
select is(
  (select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('owners', 'dogs', 'messages', 'staff', 'audit_log')),
  0, 'tables the app does not listen to are not published');

-- Realtime only delivers rows the subscriber may SELECT.
insert into public.booking_requests (payload) values ('{"owner":{"name":"Zoe"}}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*)::int from public.booking_requests), 0, 'non-staff cannot see booking requests (so get no events)');
select is((select count(*)::int from public.attendance), 0, 'non-staff cannot see attendance (so get no events)');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select ok((select count(*)::int from public.booking_requests) > 0, 'staff can see booking requests (and get events)');
reset role;

-- ---------------------------------------------------------------------------
-- Email outbox: claim_messages / complete_message
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.claim_messages()$$, '42501', null, 'even admins cannot claim messages (service role only)');
select throws_ok($$select public.queue_vaccine_reminders()$$, '42501', null, 'staff cannot run the reminder job');
reset role;

delete from public.messages;
insert into public.messages (id, recipient, template, channel, created_at) values
  ('50000000-0000-0000-0000-000000000001', 'a@test.local', 'request_received', 'email', now() - interval '3 minutes'),
  ('50000000-0000-0000-0000-000000000002', 'b@test.local', 'request_received', 'email', now() - interval '2 minutes'),
  ('50000000-0000-0000-0000-000000000003', 'c@test.local', 'request_received', 'email', now() - interval '1 minute'),
  ('50000000-0000-0000-0000-000000000004', '+34600', 'request_received', 'whatsapp', now() - interval '4 minutes');

set local role service_role;
select results_eq(
  $$select id, status::text, attempts from public.claim_messages('email', 2) order by id$$,
  $$values ('50000000-0000-0000-0000-000000000001'::uuid, 'sending', 1), ('50000000-0000-0000-0000-000000000002'::uuid, 'sending', 1)$$,
  'claim_messages takes the oldest queued emails and marks them sending');
select results_eq(
  $$select id from public.claim_messages('email', 10)$$,
  $$values ('50000000-0000-0000-0000-000000000003'::uuid)$$,
  'a second claim does not take rows already being sent, nor other channels');
select is((select count(*)::int from public.claim_messages('email', 10)), 0, 'nothing left to claim');

select results_eq(
  $$select status::text, sent_at is not null, error, provider_id from public.complete_message('50000000-0000-0000-0000-000000000001', 'sent', null, 're_123')$$,
  $$values ('sent', true, null::text, 're_123')$$,
  'a sent message gets sent_at and the provider id');
select results_eq(
  $$select status::text, error from public.complete_message('50000000-0000-0000-0000-000000000002', 'failed', '422 invalid address')$$,
  $$values ('failed', '422 invalid address')$$,
  'a permanent failure is failed straight away');
select results_eq(
  $$select status::text, attempts, error from public.complete_message('50000000-0000-0000-0000-000000000003', 'retry', '503 unavailable')$$,
  $$values ('queued', 1, '503 unavailable')$$,
  'a transient failure goes back to the queue');
select is((select attempts from public.claim_messages('email', 10)), 2, 'the retry is claimed again (attempt 2)');
select is((select status::text from public.complete_message('50000000-0000-0000-0000-000000000003', 'retry', 'network')), 'queued', 'attempt 2 fails: queued again');
select is((select attempts from public.claim_messages('email', 10)), 3, 'attempt 3');
select results_eq(
  $$select status::text, attempts, error from public.complete_message('50000000-0000-0000-0000-000000000003', 'retry', '500 boom')$$,
  $$values ('failed', 3, '500 boom')$$,
  'after 3 attempts a transient failure becomes failed');
select is(
  (select count(*)::int from public.complete_message('50000000-0000-0000-0000-000000000001', 'retry', 'late')  where id is not null),
  0, 'complete_message ignores rows that are not being sent');
select throws_ok($$select public.complete_message('50000000-0000-0000-0000-000000000001', 'maybe')$$, '22023', null, 'unknown outcomes are refused');
reset role;

-- A run that died mid-send: its rows are claimable again after 15 minutes,
-- and given up on after the third attempt.
update public.messages set status = 'sending', attempts = 1, last_attempt_at = now() - interval '20 minutes'
where id = '50000000-0000-0000-0000-000000000002';
update public.messages set status = 'sending', attempts = 3, last_attempt_at = now() - interval '20 minutes', error = null
where id = '50000000-0000-0000-0000-000000000003';
set local role service_role;
select results_eq(
  $$select id, attempts from public.claim_messages('email', 10)$$,
  $$values ('50000000-0000-0000-0000-000000000002'::uuid, 2)$$,
  'a stale sending row is claimed again');
reset role;
select results_eq(
  $$select status::text, error from public.messages where id = '50000000-0000-0000-0000-000000000003'$$,
  $$values ('failed', 'no result after 3 attempts')$$,
  'a stale row with no attempts left is failed');

-- ---------------------------------------------------------------------------
-- Vaccine reminders (today = Mon 2030-01-07)
-- ---------------------------------------------------------------------------
delete from public.messages;
insert into public.dogs (id, owner_id, name, active, vaccines_up_to_date, vaccines_checked_until) values
  -- due: not confirmed / expiring within 14 days / expired / last reminder 40 days ago
  ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Ace',   true,  false, null),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Bat',   true,  true,  '2030-01-21'),
  ('21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Cat',   true,  true,  '2030-01-01'),
  ('21000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Dot',   true,  false, null),
  -- not due: fine vaccines / no confirmed future booking / inactive / reminded 10 days ago / 15 days left
  ('21000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Eel',   true,  true,  '2030-06-01'),
  ('21000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Fox',   true,  false, null),
  ('21000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Gnu',   false, false, null),
  ('21000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Hen',   true,  false, null),
  ('21000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Ibis',  true,  false, null),
  ('21000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'Jay',   true,  true,  '2030-01-22');
insert into public.bookings (dog_id, start_date, end_date, weekdays, status)
select id, '2030-01-09', '2030-01-25', '{1,2,3,4,5}', 'confirmed'
from public.dogs where id::text like '21000000-%' and name not in ('Fox', 'Hen');
-- Fox: only a pending booking. Hen: only past days.
insert into public.bookings (dog_id, start_date, end_date, weekdays, status) values
  ('21000000-0000-0000-0000-000000000006', '2030-01-09', '2030-01-25', '{1,2,3,4,5}', 'pending'),
  ('21000000-0000-0000-0000-000000000008', '2029-12-03', '2029-12-07', '{1,2,3,4,5}', 'confirmed');
insert into public.messages (dog_id, recipient, template, created_at) values
  ('21000000-0000-0000-0000-000000000004', 'ane@test.local', 'vaccine_reminder', now() - interval '40 days'),
  ('21000000-0000-0000-0000-000000000009', 'ane@test.local', 'vaccine_reminder', now() - interval '10 days');

select is(public.queue_vaccine_reminders('2030-01-07'), 4, 'four dogs are due a vaccine reminder');
select results_eq(
  $$select d.name, m.recipient, m.language::text, m.owner_id, m.data ->> 'reason', m.data ->> 'next_day', m.status::text
    from public.messages m join public.dogs d on d.id = m.dog_id
    where m.template = 'vaccine_reminder' and m.created_at = now() order by d.name$$,
  $$values
    ('Ace', 'mark@test.local', 'en', '10000000-0000-0000-0000-000000000002'::uuid, 'not_confirmed', '2030-01-09', 'queued'),
    ('Bat', 'ane@test.local',  'es', '10000000-0000-0000-0000-000000000001'::uuid, 'expiring',      '2030-01-09', 'queued'),
    ('Cat', 'ane@test.local',  'es', '10000000-0000-0000-0000-000000000001'::uuid, 'expired',       '2030-01-09', 'queued'),
    ('Dot', 'ane@test.local',  'es', '10000000-0000-0000-0000-000000000001'::uuid, 'not_confirmed', '2030-01-09', 'queued')$$,
  'reminders go to the owner, in their language, with the reason and next booked day');
select is(
  (select data ->> 'checked_until' from public.messages where dog_id = '21000000-0000-0000-0000-000000000002' and created_at = now()),
  '2030-01-21', 'the reminder carries the "checked until" date');
select is(public.queue_vaccine_reminders('2030-01-07'), 0, 'at most one reminder per dog every 30 days');

-- ---------------------------------------------------------------------------
-- Cron jobs and the sender's trigger
-- ---------------------------------------------------------------------------
select results_eq(
  $$select jobname, schedule from cron.job where jobname in ('send-messages', 'queue-vaccine-reminders') order by jobname$$,
  $$values ('queue-vaccine-reminders', '0 7 * * *'), ('send-messages', '*/5 * * * *')$$,
  'the reminder and sender jobs are scheduled');

delete from vault.secrets where name in ('send_messages_url', 'send_messages_secret');
select is(public.invoke_send_messages(), null, 'without the vault secrets the sender job does nothing');
select vault.create_secret('http://127.0.0.1:9/functions/v1/send-messages', 'send_messages_url');
select vault.create_secret('test-secret', 'send_messages_secret');
update public.messages set status = 'sent';
select is(public.invoke_send_messages(), null, 'with nothing queued the sender job makes no call');
update public.messages set status = 'queued' where template = 'vaccine_reminder' and created_at = now();
select ok(public.invoke_send_messages() is not null, 'with the secrets and queued emails it calls the function through pg_net');
select results_eq(
  $$select url, headers ->> 'Authorization' from net.http_request_queue order by id desc limit 1$$,
  $$values ('http://127.0.0.1:9/functions/v1/send-messages', 'Bearer test-secret')$$,
  'the call carries the shared secret as a bearer token');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok($$select public.invoke_send_messages()$$, '42501', null, 'staff cannot trigger the sender (it reads Vault)');
reset role;

select * from finish();
rollback;
