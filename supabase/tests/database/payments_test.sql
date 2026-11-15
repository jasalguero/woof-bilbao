-- Tests for payments (migration 20261115120000): prices, day charges (booked,
-- walk-in, notice, closed days, second-dog discount), packs, payments,
-- balances, roles, reminders, the monthly report, the provider hook and the
-- public price list.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(136);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@test.local');
insert into public.staff (user_id, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Staff', 'staff');

-- Start from an empty ledger (seed.sql has sample money data for local use).
delete from public.charges;
delete from public.payments;
delete from public.packs;

-- Friday 2030-01-11 is "today". Thursday 2030-01-10 is closed.
select set_config('woof.today', '2030-01-11', true);
update public.capacity set max_dogs = 12 where day is null;
insert into public.capacity (day, max_dogs, closed, reason) values ('2030-01-10', 0, true, 'holiday');

-- Two price lists: the default one from December, and new prices from Friday
-- (EUR 35 a day, pack EUR 315, 50 % off the second dog).
insert into public.price_lists (valid_from, day_price_cents, pack_price_cents, pack_days, pack_valid_months, vat_rate, second_dog_discount_pct) values
  ('2029-12-01', 3000, 27000, 10, 6, 21, 0),
  ('2030-01-11', 3500, 31500, 10, 6, 21, 50);

insert into public.owners (id, full_name, email, language) values
  ('10000000-0000-0000-0000-000000000001', 'Ane', 'ane@test.local', 'es'),
  ('10000000-0000-0000-0000-000000000002', 'Mark', 'mark@test.local', 'en'),
  ('10000000-0000-0000-0000-000000000003', 'Nobody', 'nobody@test.local', 'es');
insert into public.dogs (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Txuri'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Beltza'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Pepper'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'Gorri');

insert into public.bookings (id, dog_id, start_date, end_date, weekdays, status) values
  -- Txuri all week, Beltza on Monday only.
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-11', '{1,2,3,4,5}', 'confirmed'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '2030-01-07', '2030-01-07', '{1}', 'confirmed'),
  -- Gorri: Tuesday (cancelled late), Wednesday (cancelled in time), Friday.
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004', '2030-01-08', '2030-01-08', '{2}', 'confirmed'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', '2030-01-09', '2030-01-09', '{3}', 'confirmed'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000004', '2030-01-11', '2030-01-11', '{5}', 'confirmed'),
  -- Pepper on Friday; a pending booking on Wednesday is never charged.
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', '2030-01-11', '2030-01-11', '{5}', 'confirmed'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', '2030-01-09', '2030-01-09', '{3}', 'pending');

-- ---------------------------------------------------------------------------
-- Booking status times
-- ---------------------------------------------------------------------------
select ok((select confirmed_at is not null and cancelled_at is null from public.bookings
           where id = '30000000-0000-0000-0000-000000000001'), 'a confirmed booking records when it was confirmed');
update public.bookings set status = 'cancelled' where id in ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004');
select ok((select bool_and(cancelled_at = now()) from public.bookings
           where id in ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004')),
          'cancelling a booking records when');
-- Tuesday's was cancelled on Monday at noon (after Monday 08:00, the cutoff
-- for Tuesday): late. Wednesday's at the same time: in time.
update public.bookings set cancelled_at = '2030-01-07 12:00+01'
where id in ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004');
select is(public.notice_cutoff('2030-01-09'), '2030-01-08 08:00+01'::timestamptz, 'the notice cutoff is 08:00 the day before, Bilbao time');
select is((public.prices_on('2030-01-10')).day_price_cents, 3000, 'prices_on picks the price list in force that day');

-- Absences: Txuri off on Wednesday (told Monday: in time) and on Friday
-- (told Thursday noon: late). Pepper walks in on Tuesday.
insert into public.absences (dog_id, day, notified_at) values
  ('20000000-0000-0000-0000-000000000001', '2030-01-09', '2030-01-07 10:00+01'),
  ('20000000-0000-0000-0000-000000000001', '2030-01-11', '2030-01-10 12:00+01');
insert into public.attendance (dog_id, day, checked_in_at) values
  ('20000000-0000-0000-0000-000000000003', '2030-01-08', '2030-01-08 09:00+01');

-- ---------------------------------------------------------------------------
-- charge_days: who may run it
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.charge_days('2030-01-01', '2030-01-31')$$, '42501', null, 'anon cannot charge days');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select throws_ok($$select public.charge_days('2030-01-01', '2030-01-31')$$, '42501', null, 'non-staff cannot charge days');
select is((select count(*)::int from public.owner_balances), 0, 'non-staff see no balances');
reset role;

-- ---------------------------------------------------------------------------
-- charge_days as plain staff
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(public.charge_days('2030-01-01', '2030-01-31'), 8, 'eight dog-days are charged up to today');
select results_eq(
  $$select g.name, c.day, c.unit_price_cents, c.discount_pct, c.net_cents, c.vat_cents, c.total_cents, c.walk_in
    from public.charges c join public.dogs g on g.id = c.dog_id
    order by c.day, g.name$$,
  $$values
    ('Beltza', '2030-01-07'::date, 3000, 0.00, 3000, 630, 3630, false),
    ('Txuri',  '2030-01-07'::date, 3000, 0.00, 3000, 630, 3630, false),
    ('Gorri',  '2030-01-08'::date, 3000, 0.00, 3000, 630, 3630, false),
    ('Pepper', '2030-01-08'::date, 3000, 0.00, 3000, 630, 3630, true),
    ('Txuri',  '2030-01-08'::date, 3000, 0.00, 3000, 630, 3630, false),
    ('Gorri',  '2030-01-11'::date, 3500, 50.00, 1750, 368, 2118, false),
    ('Pepper', '2030-01-11'::date, 3500, 0.00, 3500, 735, 4235, false),
    ('Txuri',  '2030-01-11'::date, 3500, 0.00, 3500, 735, 4235, false)$$,
  'booked days, a walk-in, a late cancellation and a late absence are charged at that day''s price; notice, closed days, pending bookings and the future are not');
select is(public.charge_days('2030-01-01', '2030-01-31'), 0, 'charging again adds nothing');
select is(public.charge_days('2030-01-01', '2030-03-31'), 0, 'future days are never charged');
select is(
  (select count(*)::int from public.charges where day < public.billing_start()), 0,
  'nothing is charged before billing starts');

select results_eq(
  $$select full_name, charged_cents, paid_cents, balance_cents, unpaid_days, oldest_unpaid_day
    from public.owner_balances where owner_id::text like '10000000-%' order by full_name$$,
  $$values
    ('Ane',    15125, 0, 15125, 4, '2030-01-07'::date),
    ('Mark',   13613, 0, 13613, 4, '2030-01-08'::date),
    ('Nobody', 0,     0, 0,     0, null::date)$$,
  'owner balances add up the charges');

-- Staff cannot touch money tables directly.
update public.charges set unit_price_cents = 1;
select is((select count(*)::int from public.charges where unit_price_cents = 1), 0, 'staff cannot edit charges');
delete from public.charges;
select is((select count(*)::int from public.charges), 8, 'staff cannot delete charges');
select throws_ok(
  $$insert into public.price_lists (valid_from, day_price_cents, pack_price_cents, pack_days, pack_valid_months, vat_rate)
    values ('2030-02-01', 1, 1, 1, 1, 0)$$,
  '42501', null, 'staff cannot change prices');
select throws_ok(
  $$insert into public.charges (owner_id, kind, day, unit_price_cents, vat_rate)
    values ('10000000-0000-0000-0000-000000000001', 'adjustment', '2030-01-11', -500, 0)$$,
  '42501', null, 'staff cannot record corrections');

-- ---------------------------------------------------------------------------
-- record_payment
-- ---------------------------------------------------------------------------
-- Ane pays Txuri's Monday and Tuesday in cash, Tuesday at a special EUR 25.
select results_eq(
  $$select kind::text, method::text, provider, status::text, amount_cents, recorded_by
    from public.record_payment(
      '10000000-0000-0000-0000-000000000001', 6655, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day in ('2030-01-07', '2030-01-08')),
      jsonb_build_array(jsonb_build_object(
        'id', (select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-08'),
        'unit_price_cents', 2500)),
      '2030-01-11 10:00+01', 'paid at the door')$$,
  $$values ('payment', 'cash', 'manual', 'succeeded', 6655, '00000000-0000-0000-0000-00000000000b'::uuid)$$,
  'staff record a manual payment');
select results_eq(
  $$select day, total_cents, payment_id is not null from public.charges
    where dog_id = '20000000-0000-0000-0000-000000000001' order by day$$,
  $$values ('2030-01-07'::date, 3630, true), ('2030-01-08'::date, 3025, true), ('2030-01-11'::date, 4235, false)$$,
  'the selected charges are settled, one at the price set on the fly');
select is((select balance_cents from public.owner_balances where full_name = 'Ane'), 7865, 'the balance goes down');
select results_eq(
  $$select g.name, a.day, a.owing_cents from public.charge_allocation('10000000-0000-0000-0000-000000000001') a
    join public.charges c on c.id = a.charge_id join public.dogs g on g.id = c.dog_id
    where a.day < '2030-01-11' order by a.day, g.name$$,
  $$values ('Beltza', '2030-01-07'::date, 3630), ('Txuri', '2030-01-07'::date, 0), ('Txuri', '2030-01-08'::date, 0)$$,
  'a payment pays the items it was recorded for, not another dog''s older day');

-- Mark pays EUR 50 by Bizum without picking days: the oldest charge that fits is settled.
select lives_ok(
  $$select public.record_payment('10000000-0000-0000-0000-000000000002', 5000, 'bizum', null, null, '2030-01-11 11:00+01')$$,
  'a payment without charges is fine');
select results_eq(
  $$select count(*)::int, min(day) from public.charges
    where owner_id = '10000000-0000-0000-0000-000000000002' and payment_id is not null$$,
  $$values (1, '2030-01-08'::date)$$,
  'it settles the oldest charges that fit in the amount');
select is((select balance_cents from public.owner_balances where full_name = 'Mark'), 8613, 'and lowers the balance by the amount');

select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-07'))$$,
  '%not open%', 'a charge cannot be paid twice');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000003' and day = '2030-01-11'))$$,
  '%not open%', 'nor can another owner''s charge');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 0, 'cash')$$,
  '%must be positive%', 'the amount must be positive');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash', null, null, '2031-01-01')$$,
  '%future%', 'a payment cannot be dated in the future');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-11'),
      '[{"id": "00000000-0000-0000-0000-000000000000", "unit_price_cents": 1}]')$$,
  '%selected charge%', 'overrides only apply to the selected charges');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-11'))$$,
  '%does not cover%', 'a payment for picked items must cover them (a part payment picks none)');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-11'),
      jsonb_build_array(jsonb_build_object('id', (select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-11'),
                                           'unit_price_cents', 0)))$$,
  '%only admins%', 'staff cannot give a day for free');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000001', 100, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-11'),
      jsonb_build_array(jsonb_build_object('id', (select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-11'),
                                           'discount_pct', 60)))$$,
  '%only admins%', 'nor at less than half price');
select results_eq(
  $$select price_overridden_by, price_overridden_at is not null from public.charges
    where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-08'$$,
  $$values ('00000000-0000-0000-0000-00000000000b'::uuid, true)$$,
  'a price changed on the fly records who changed it');

-- Direct writes to payments: plain staff can add a manual payment, nothing else.
select lives_ok(
  $$insert into public.payments (owner_id, method, amount_cents, paid_at) values ('10000000-0000-0000-0000-000000000003', 'card', 100, '2030-01-11 12:00+01')$$,
  'staff can insert a manual payment directly');
select throws_ok(
  $$insert into public.payments (owner_id, kind, method, amount_cents, refund_of)
    values ('10000000-0000-0000-0000-000000000001', 'refund', 'cash', 100, (select id from public.payments where note = 'paid at the door'))$$,
  '42501', null, 'staff cannot record refunds');
select throws_ok(
  $$insert into public.payments (owner_id, method, amount_cents, recorded_by) values ('10000000-0000-0000-0000-000000000003', 'cash', 100, '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'staff cannot record a payment in someone else''s name');
select throws_ok(
  $$insert into public.payments (owner_id, method, amount_cents, paid_at) values ('10000000-0000-0000-0000-000000000003', 'cash', 100, '2031-01-01')$$,
  '42501', null, 'nor date it in the future');
select throws_ok(
  $$insert into public.payments (owner_id, method, amount_cents, provider, external_id) values ('10000000-0000-0000-0000-000000000001', 'card', 100, 'stripe', 'pi_1')$$,
  '42501', null, 'staff cannot fake an online payment');
update public.payments set amount_cents = 1;
select is((select count(*)::int from public.payments where amount_cents = 1), 0, 'staff cannot edit payments');
delete from public.payments;
select is((select count(*)::int from public.payments), 3, 'staff cannot delete payments');

-- ---------------------------------------------------------------------------
-- Packs
-- ---------------------------------------------------------------------------
select results_eq(
  $$select days_total, starts_on, expires_on from public.sell_pack(
      '10000000-0000-0000-0000-000000000001', 'card', p_paid_at => '2030-01-11 12:00+01')$$,
  $$values (10, '2030-01-11'::date, '2030-07-10'::date)$$,
  'staff sell a pack at today''s prices: 10 days, valid 6 months');
select results_eq(
  $$select c.unit_price_cents, c.total_cents, p.amount_cents, p.method::text
    from public.charges c join public.payments p on p.id = c.payment_id
    where c.kind = 'pack' and c.owner_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values (31500, 38115, 38115, 'card')$$,
  'the pack is charged at its price plus VAT and paid upfront');
select results_eq(
  $$select total_cents, pack_id is not null from public.charges
    where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-11'$$,
  $$values (0, true)$$,
  'an unpaid day from the pack''s start moves onto the pack');
-- Beltza walks in today: covered by the pack (packs belong to the owner).
insert into public.attendance (dog_id, day, checked_in_at) values
  ('20000000-0000-0000-0000-000000000002', '2030-01-11', '2030-01-11 09:30+01');
select is(public.charge_days('2030-01-11', '2030-01-11', '10000000-0000-0000-0000-000000000001'), 1, 'charging one owner''s day');
select results_eq(
  $$select c.unit_price_cents, c.discount_pct, c.total_cents, c.walk_in from public.charges c
    where c.dog_id = '20000000-0000-0000-0000-000000000002' and c.day = '2030-01-11'$$,
  $$values (0, 0.00, 0, true)$$,
  'any of the owner''s dogs uses the pack, without the second-dog discount');
select results_eq(
  $$select days_used, days_left, total_cents from public.pack_balances where owner_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values (2, 8, 38115)$$,
  'the pack counts the days used and left');
select is((select balance_cents from public.owner_balances where full_name = 'Ane'), 7865 - 4235, 'the pack covers the day that was owed');

select results_eq(
  $$select days_total, expires_on from public.sell_pack(
      '10000000-0000-0000-0000-000000000002', 'transfer', p_price_cents => 10000, p_days => 5,
      p_expires_on => '2030-03-31', p_vat_rate => 10, p_amount_cents => 5000, p_paid_at => '2030-01-11 12:30+01')$$,
  $$values (5, '2030-03-31'::date)$$,
  'price, size, expiry and VAT can be set on the fly');
select results_eq(
  $$select c.total_cents, p.amount_cents from public.charges c join public.payments p on p.id = c.payment_id
    where c.kind = 'pack' and c.owner_id = '10000000-0000-0000-0000-000000000002'$$,
  $$values (11000, 5000)$$,
  'the pack keeps its own price; a part payment leaves the rest owed');
select is(
  (select count(*)::int from public.charges where owner_id = '10000000-0000-0000-0000-000000000002' and kind = 'day' and day = '2030-01-11' and pack_id is not null),
  2, 'both of Mark''s unpaid Friday days move onto his new pack');
select throws_like(
  $$select public.sell_pack('10000000-0000-0000-0000-000000000001', 'cash', p_days => 0)$$,
  '%1 to 100 days%', 'a pack needs days');
select throws_like(
  $$select public.sell_pack('10000000-0000-0000-0000-000000000001', 'cash', p_starts_on => '2000-01-01')$$,
  '%no prices%', 'no pack before billing starts');
select throws_like(
  $$select public.sell_pack('10000000-0000-0000-0000-000000000001', 'cash', p_price_cents => 0)$$,
  '%only admins%', 'staff cannot give a pack away');
select throws_like(
  $$select public.sell_pack('10000000-0000-0000-0000-000000000001', 'cash', p_days => 30)$$,
  '%only admins%', 'nor 30 days for the price of 10');
select throws_like(
  $$select public.sell_pack('10000000-0000-0000-0000-000000000001', 'cash', p_expires_on => '2031-01-31')$$,
  '%only admins%', 'nor valid for longer than the price list says');
update public.packs set expires_on = '2040-01-01';
select is((select count(*)::int from public.packs where expires_on = '2040-01-01'), 0, 'staff cannot change packs');
reset role;

-- ---------------------------------------------------------------------------
-- Absences in time and closed days void charges
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_like(
  $$insert into public.absences (dog_id, day, notified_at) values ('20000000-0000-0000-0000-000000000004', '2030-01-11', '2030-01-09 18:00+01')$$,
  '%only admins%', 'staff cannot enter an earlier notice time');
select lives_ok(
  $$insert into public.absences (dog_id, day) values ('20000000-0000-0000-0000-000000000003', '2030-01-14')$$,
  'staff record a notice as it comes in');
select ok((select notified_at > now() from public.absences where dog_id = '20000000-0000-0000-0000-000000000003' and day = '2030-01-14'),
          'notified now (the test''s "now" is in 2030)');
select throws_like(
  $$update public.absences set notified_at = '2030-01-01' where dog_id = '20000000-0000-0000-0000-000000000003' and day = '2030-01-14'$$,
  '%only admins%', 'nor move a notice back later');
select throws_like(
  $$insert into public.absences (dog_id, day, notified_at) values ('20000000-0000-0000-0000-000000000003', '2030-01-15', '2031-01-01')$$,
  '%future%', 'an absence cannot be notified in the future');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.absences (dog_id, day, notified_at) values
  ('20000000-0000-0000-0000-000000000004', '2030-01-11', '2030-01-09 18:00+01'),
  -- A walk-in day and a paid day are not voided by an absence.
  ('20000000-0000-0000-0000-000000000003', '2030-01-08', '2030-01-06 18:00+01'),
  ('20000000-0000-0000-0000-000000000001', '2030-01-08', '2030-01-06 18:00+01');
select results_eq(
  $$select voided_at is not null, void_reason from public.charges where dog_id = '20000000-0000-0000-0000-000000000004' and day = '2030-01-11'$$,
  $$values (true, 'absence_notified')$$,
  'an admin enters a call taken earlier: notified in time, the booked day is voided');
select results_eq(
  $$select g.name, c.voided_at is null from public.charges c join public.dogs g on g.id = c.dog_id
    where c.day = '2030-01-08' and g.name in ('Pepper', 'Txuri') order by g.name$$,
  $$values ('Pepper', true), ('Txuri', true)$$,
  'an absence never voids a walk-in or a paid day');
select is(public.charge_days('2030-01-01', '2030-01-31'), 0, 'a voided day is not charged again');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_like(
  $$update public.absences set dog_id = '20000000-0000-0000-0000-000000000002'
    where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-08'$$,
  '%only admins%', 'staff cannot move an old notice to another dog');
select throws_like(
  $$update public.absences set day = '2030-01-07'
    where dog_id = '20000000-0000-0000-0000-000000000001' and day = '2030-01-08'$$,
  '%only admins%', 'or to another day');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.capacity (day, max_dogs, closed, reason) values ('2030-01-07', 0, true, 'flood');
select results_eq(
  $$select g.name, c.void_reason from public.charges c join public.dogs g on g.id = c.dog_id where c.day = '2030-01-07' order by g.name$$,
  $$values ('Beltza', 'closed_day'), ('Txuri', 'closed_day')$$,
  'closing a day voids its charges');
select is((select balance_cents from public.owner_balances where full_name = 'Ane'), 7865 - 4235 - 3630 - 3630, 'a voided paid day becomes credit');

-- ---------------------------------------------------------------------------
-- Admins: refunds, corrections, editing, prices
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.payments (owner_id, kind, method, amount_cents, paid_at, note, refund_of)
    values ('10000000-0000-0000-0000-000000000001', 'refund', 'cash', 1000, '2030-01-11 13:00+01', 'goodwill',
            (select id from public.payments where note = 'paid at the door'))$$,
  'admins record refunds');
select throws_like(
  $$insert into public.payments (owner_id, kind, method, amount_cents, refund_of)
    values ('10000000-0000-0000-0000-000000000001', 'refund', 'cash', 6000, (select id from public.payments where note = 'paid at the door'))$$,
  '%more than what is left%', 'a refund is never more than what is left of the payment');
select throws_like(
  $$insert into public.payments (owner_id, kind, method, amount_cents, refund_of)
    values ('10000000-0000-0000-0000-000000000001', 'refund', 'cash', 100, (select id from public.payments where method = 'bizum'))$$,
  '%same owner%', 'nor of another owner''s payment');
select throws_ok(
  $$insert into public.payments (owner_id, kind, method, amount_cents) values ('10000000-0000-0000-0000-000000000001', 'refund', 'cash', 100)$$,
  '22023', null, 'a refund always names the payment it gives back');
select throws_like(
  $$update public.payments set amount_cents = 500 where note = 'paid at the door'$$,
  '%has refunds%', 'a payment cannot be edited below what was refunded of it');
select throws_ok(
  $$delete from public.payments where note = 'paid at the door'$$,
  '23503', null, 'nor deleted while it has refunds');
select lives_ok(
  $$insert into public.charges (owner_id, kind, day, unit_price_cents, vat_rate, description)
    values ('10000000-0000-0000-0000-000000000002', 'adjustment', '2030-01-11', -613, 0, 'rounding')$$,
  'admins record corrections');
select is((select balance_cents from public.owner_balances where full_name = 'Mark'), 7647, 'corrections change the balance');
select ok(exists (select 1 from public.audit_log where table_name = 'charges' and action = 'update'
                  and (diff -> 'old' ->> 'unit_price_cents') = '3000' and (diff -> 'new' ->> 'unit_price_cents') = '2500'),
          'the on-the-fly price change is in the audit log (admins read it)');
update public.payments set amount_cents = 5100 where method = 'bizum';
select is((select amount_cents from public.payments where method = 'bizum'), 5100, 'admins can edit payments');
select lives_ok(
  $$insert into public.price_lists (valid_from, day_price_cents, pack_price_cents, pack_days, pack_valid_months, vat_rate)
    values ('2030-02-01', 3200, 28800, 10, 6, 21)$$,
  'admins can schedule new prices');
select throws_like(
  $$insert into public.price_lists (valid_from, day_price_cents, pack_price_cents, pack_days, pack_valid_months, vat_rate)
    values ('2030-01-11', 3200, 28800, 10, 6, 21)$$,
  '%tomorrow%', 'new prices cannot start today or earlier');
select throws_like(
  $$update public.price_lists set day_price_cents = 1 where valid_from = '2030-01-11'$$,
  '%in force%', 'prices in force cannot change');
select throws_like(
  $$delete from public.price_lists where valid_from = '2029-12-01'$$,
  '%in force%', 'nor can past prices be deleted');
select throws_like(
  $$update public.price_lists set valid_from = '2030-01-10' where valid_from = '2030-02-01'$$,
  '%tomorrow%', 'a planned list cannot be moved into the past');
select lives_ok(
  $$update public.price_lists set day_price_cents = 3300 where valid_from = '2030-02-01'$$,
  'planned prices can be changed');
update public.billing_settings set billing_start = '2030-01-01';
select isnt(public.billing_start(), '2030-01-01'::date, 'billing start is not changed from the app');
reset role;

-- ---------------------------------------------------------------------------
-- Balance reminders
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select throws_ok($$select public.queue_balance_reminder('10000000-0000-0000-0000-000000000002')$$, '42501', null, 'non-staff cannot send reminders');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select ok(public.queue_balance_reminder('10000000-0000-0000-0000-000000000002') is not null, 'staff queue a balance reminder');
select results_eq(
  $$select recipient, template, language::text, status::text, (data ->> 'balance_cents')::int, data -> 'dogs'
    from public.messages where template = 'balance_reminder'$$,
  $$values ('mark@test.local', 'balance_reminder', 'en', 'queued', 7547, '["Gorri", "Pepper"]'::jsonb)$$,
  'to the owner, in their language, with the balance and dogs');
select throws_like($$select public.queue_balance_reminder('10000000-0000-0000-0000-000000000002')$$, '%recently%', 'at most one every 3 days');
select throws_like($$select public.queue_balance_reminder('10000000-0000-0000-0000-000000000003')$$, '%owes nothing%', 'no reminder without a debt');
reset role;
update public.messages set created_at = now() - interval '4 days' where template = 'balance_reminder';
select is((select count(*)::int from public.claim_messages('email', 10)), 0, 'an old balance reminder is not sent');
select is((select error from public.messages where template = 'balance_reminder'), 'stale', 'it is failed as stale');

-- ---------------------------------------------------------------------------
-- Monthly report
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok($$select public.monthly_report('2030-01-01')$$, '42501', null, 'only admins see the report');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  public.monthly_report('2030-01-20') -> 'income',
  '[{"method": "cash", "net_cents": 5655, "refunds": 1, "payments": 1, "refunded_cents": 1000, "received_cents": 6655},
    {"method": "card", "net_cents": 38215, "refunds": 0, "payments": 2, "refunded_cents": 0, "received_cents": 38215},
    {"method": "bizum", "net_cents": 5100, "refunds": 0, "payments": 1, "refunded_cents": 0, "received_cents": 5100},
    {"method": "transfer", "net_cents": 5000, "refunds": 0, "payments": 1, "refunded_cents": 0, "received_cents": 5000}]'::jsonb,
  'income by payment method, refunds taken off');
select is(
  public.monthly_report('2030-01-20') -> 'owing',
  '[{"owner_id": "10000000-0000-0000-0000-000000000002", "full_name": "Mark", "email": "mark@test.local", "phone": null,
     "balance_cents": 7547, "unpaid_days": 1, "oldest_unpaid_day": "2030-01-08"}]'::jsonb,
  'who owes what at the end of the month');
select is(
  (select jsonb_agg(c -> 'kind' order by c ->> 'kind') from jsonb_array_elements(public.monthly_report('2030-01-01') -> 'charges') c),
  '["adjustment", "day", "pack"]'::jsonb, 'charges by kind');
select is(public.monthly_report('2029-12-01') -> 'income', '[]'::jsonb, 'an empty month is empty');
reset role;

-- ---------------------------------------------------------------------------
-- Online providers (future webhooks) and the public price list
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$select public.record_provider_payment('stripe', 'pi_1', '10000000-0000-0000-0000-000000000002', 100, 'card', 'succeeded')$$,
  '42501', null, 'staff cannot call the provider hook');
select throws_ok($$select public.public_prices()$$, '42501', null, 'the price function is for the Edge Function only');
reset role;
set local role anon;
select throws_ok($$select public.public_prices()$$, '42501', null, 'anon cannot call it directly either');
select throws_ok($$select * from public.payments$$, '42501', null, 'anon cannot read payments');
reset role;

set local role service_role;
select is(
  (public.record_provider_payment('stripe', 'pi_1', '10000000-0000-0000-0000-000000000002', 4235, 'card', 'pending',
     p_metadata => '{"event": "evt_1"}')).status::text,
  'pending', 'a provider payment starts pending');
select is(
  (public.record_provider_payment('stripe', 'pi_1', '10000000-0000-0000-0000-000000000002', 4235, 'card', 'succeeded',
     '2030-01-11 14:00+01', '{"event": "evt_2"}',
     array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000003' and day = '2030-01-11'))).status::text,
  'succeeded', 'the same payment is then confirmed');
select results_eq(
  $$select count(*)::int, min(metadata ->> 'event'), bool_and(recorded_by is null) from public.payments where provider = 'stripe'$$,
  $$values (1, 'evt_2', true)$$, 'webhooks are idempotent on the provider''s id');
select ok(
  (select payment_id is not null from public.charges where dog_id = '20000000-0000-0000-0000-000000000003' and day = '2030-01-11'),
  'a succeeded provider payment settles its charges');
select is(
  (public.record_provider_payment('stripe', 'pi_1', '10000000-0000-0000-0000-000000000002', 4235, 'card', 'failed',
     p_metadata => '{"event": "evt_3"}')).status::text,
  'succeeded', 'succeeded is final: a late event does not undo it');
select throws_like(
  $$select public.record_provider_payment('stripe', 'pi_1', '10000000-0000-0000-0000-000000000001', 4235, 'card', 'succeeded')$$,
  '%does not match%', 'a replay for another owner is refused');
select throws_like(
  $$select public.record_provider_payment('stripe', 'pi_1', '10000000-0000-0000-0000-000000000002', 1, 'card', 'succeeded')$$,
  '%does not match%', 'and for another amount');
select results_eq(
  $$select (public_prices() -> 'current' ->> 'day_price_cents')::int, (public_prices() -> 'current' ->> 'vat_rate')::numeric,
           (public_prices() -> 'next' ->> 'valid_from')$$,
  $$values (3500, 21.00, '2030-02-01')$$,
  'the public price list shows today''s prices and the next change');
reset role;

-- ---------------------------------------------------------------------------
-- Billing start, undone check-ins, cancellations with notice, the second dog
-- (deterministic), part payments and the month-end state
-- ---------------------------------------------------------------------------
update public.billing_settings set billing_start = '2030-01-09';
insert into public.owners (id, full_name, email, language) values
  ('10000000-0000-0000-0000-000000000004', 'Iker', 'iker@test.local', 'es');
-- Kuki is the older dog: she pays full price; Luna gets the second-dog discount.
insert into public.dogs (id, owner_id, name, created_at) values
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004', 'Kuki', '2029-01-01'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000004', 'Luna', '2029-06-01');
insert into public.bookings (id, dog_id, start_date, end_date, weekdays, status) values
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000005', '2030-01-08', '2030-01-09', '{2,3}', 'confirmed');
insert into public.attendance (dog_id, day, checked_in_at) values
  ('20000000-0000-0000-0000-000000000005', '2030-01-11', '2030-01-11 09:00+01');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(public.charge_days('2030-01-01', '2030-01-31', '10000000-0000-0000-0000-000000000004'), 2,
          'nothing before billing start is charged (Tuesday), Wednesday and a walk-in are');
select throws_like(
  $$select public.sell_pack('10000000-0000-0000-0000-000000000004', 'cash', p_starts_on => '2030-01-08')$$,
  '%no prices%', 'no pack starts before billing start');
reset role;
insert into public.attendance (dog_id, day, checked_in_at) values
  ('20000000-0000-0000-0000-000000000006', '2030-01-11', '2030-01-11 09:05+01');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(public.charge_days('2030-01-11', '2030-01-11', '10000000-0000-0000-0000-000000000004'), 1, 'Luna walks in too');
select lives_ok($$select public.undo_check_in('20000000-0000-0000-0000-000000000005')$$, 'Kuki''s check-in is undone');
select results_eq(
  $$select voided_at is not null, void_reason from public.charges
    where dog_id = '20000000-0000-0000-0000-000000000005' and day = '2030-01-11'$$,
  $$values (true, 'check_in_undone')$$,
  'undoing a walk-in''s check-in voids its day');
select is(public.charge_days('2030-01-11', '2030-01-11', '10000000-0000-0000-0000-000000000004'), 0, 'and it is not charged while she is away');
reset role;
insert into public.attendance (dog_id, day, checked_in_at) values
  ('20000000-0000-0000-0000-000000000005', '2030-01-11', '2030-01-11 10:00+01');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(public.charge_days('2030-01-11', '2030-01-11', '10000000-0000-0000-0000-000000000004'), 1, 'checked in again, she is charged again');
select results_eq(
  $$select g.name, c.discount_pct, c.total_cents from public.charges c join public.dogs g on g.id = c.dog_id
    where c.owner_id = '10000000-0000-0000-0000-000000000004' and c.day = '2030-01-11' and c.voided_at is null order by g.name$$,
  $$values ('Kuki', 0.00, 4235), ('Luna', 50.00, 2118)$$,
  'the older dog pays full price and the other gets the discount, whatever order they were charged in');

-- A cancellation in time voids a day already charged (here "now" is long
-- before the cutoff); staff cannot move the cancel time, admins can.
update public.bookings set status = 'cancelled' where id = '30000000-0000-0000-0000-000000000008';
select results_eq(
  $$select voided_at is not null, void_reason from public.charges
    where dog_id = '20000000-0000-0000-0000-000000000005' and day = '2030-01-09'$$,
  $$values (true, 'cancelled_with_notice')$$,
  'a booking cancelled in time voids its charged days');
update public.bookings set cancelled_at = '2030-01-08 12:00+01' where id = '30000000-0000-0000-0000-000000000008';
select ok((select cancelled_at < '2030-01-01' from public.bookings where id = '30000000-0000-0000-0000-000000000008'),
          'staff cannot change when a booking was cancelled');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update public.bookings set cancelled_at = '2030-01-08 12:00+01' where id = '30000000-0000-0000-0000-000000000008';
select is(public.charge_days('2030-01-01', '2030-01-31', '10000000-0000-0000-0000-000000000004'), 1,
          'an admin corrects it to a late cancellation: the day is charged again');
reset role;

-- An absence removed after it voided a day: the day is charged again.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
delete from public.absences where dog_id = '20000000-0000-0000-0000-000000000004' and day = '2030-01-11';
select is(public.charge_days('2030-01-11', '2030-01-11', '10000000-0000-0000-0000-000000000002'), 1,
          'removing an absence that voided a day charges it again');
select results_eq(
  $$select count(*)::int, bool_and(pack_id is not null) from public.charges
    where dog_id = '20000000-0000-0000-0000-000000000004' and day = '2030-01-11' and voided_at is null$$,
  $$values (1, true)$$, 'once, from Mark''s pack');
reset role;

-- A part payment leaves the oldest day part paid, not paid.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok(
  $$select public.record_payment('10000000-0000-0000-0000-000000000004', 2000, 'cash', null, null, '2030-01-11 18:00+01')$$,
  'Iker pays EUR 20 on account');
select is((select count(*)::int from public.charges where owner_id = '10000000-0000-0000-0000-000000000004' and payment_id is not null), 0,
          'no item is linked to a payment that does not cover it');
select results_eq(
  $$select a.day, a.total_cents, a.owing_cents from public.charge_allocation('10000000-0000-0000-0000-000000000004') a
    order by a.day, a.total_cents desc$$,
  $$values ('2030-01-09'::date, 3630, 1630), ('2030-01-11'::date, 4235, 4235), ('2030-01-11'::date, 2118, 2118)$$,
  'money pays the oldest charges first');
select results_eq(
  $$select balance_cents, unpaid_days, oldest_unpaid_day from public.owner_balances where full_name = 'Iker'$$,
  $$values (7983, 3, '2030-01-09'::date)$$,
  'a part-paid day still counts as unpaid');
select lives_ok(
  $$select public.record_payment('10000000-0000-0000-0000-000000000004', 2118, 'card',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000006' and day = '2030-01-11' and voided_at is null),
      null, '2030-01-11 18:10+01')$$,
  'Iker pays Luna''s Friday, a newer day, while Kuki''s Wednesday is part paid');
select results_eq(
  $$select a.day, a.total_cents, a.owing_cents from public.charge_allocation('10000000-0000-0000-0000-000000000004') a
    order by a.day, a.total_cents desc$$,
  $$values ('2030-01-09'::date, 3630, 1630), ('2030-01-11'::date, 4235, 4235), ('2030-01-11'::date, 2118, 0)$$,
  'the ticked day is paid; the older day still owes what it did');
select throws_like(
  $$select public.record_payment('10000000-0000-0000-0000-000000000004', 1000, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000005' and day = '2030-01-09' and voided_at is null))$$,
  '%does not cover%', 'paying a part-paid item needs what is left of it');
select lives_ok(
  $$select public.record_payment('10000000-0000-0000-0000-000000000004', 1630, 'cash',
      array(select id from public.charges where dog_id = '20000000-0000-0000-0000-000000000005' and day = '2030-01-09' and voided_at is null), null, '2030-01-11 18:30+01')$$,
  'which settles it');
reset role;
-- The rest is paid in February.
insert into public.payments (owner_id, method, amount_cents, paid_at)
values ('10000000-0000-0000-0000-000000000004', 'transfer', 4235, '2030-02-03 10:00+01');
select results_eq(
  $$select balance_cents, unpaid_days, oldest_unpaid_day from public.owner_balances where full_name = 'Iker'$$,
  $$values (0, 0, null::date)$$,
  'all paid now');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select w from jsonb_array_elements(public.monthly_report('2030-01-01') -> 'owing') w where w ->> 'full_name' = 'Iker'),
  '{"owner_id": "10000000-0000-0000-0000-000000000004", "full_name": "Iker", "email": "iker@test.local", "phone": null,
    "balance_cents": 4235, "unpaid_days": 1, "oldest_unpaid_day": "2030-01-11"}'::jsonb,
  'the report shows what was owed at the end of the month, not now');
reset role;

select is(
  (select count(*)::int from public.owner_balances b
   where b.owner_id::text like '10000000-%'
     and greatest(b.balance_cents, 0) <> coalesce((select sum(a.owing_cents) from public.charge_allocation(b.owner_id) a), 0)),
  0, 'what each owner owes item by item adds up to their balance');

-- Rounding: halves go away from zero, like the staff app's lineTotals().
insert into public.charges (owner_id, kind, day, unit_price_cents, discount_pct, vat_rate, description) values
  ('10000000-0000-0000-0000-000000000003', 'adjustment', '2030-01-11', 50, 0, 21, 'r1'),
  ('10000000-0000-0000-0000-000000000003', 'adjustment', '2030-01-11', 1001, 50, 10, 'r2'),
  ('10000000-0000-0000-0000-000000000003', 'adjustment', '2030-01-11', 1000, 12.35, 21, 'r3'),
  ('10000000-0000-0000-0000-000000000003', 'adjustment', '2030-01-11', -50, 0, 21, 'r4');
select results_eq(
  $$select description, net_cents, vat_cents, total_cents from public.charges where description ~ '^r[0-9]$' order by description$$,
  $$values ('r1', 50, 11, 61), ('r2', 501, 50, 551), ('r3', 877, 184, 1061), ('r4', -50, -11, -61)$$,
  'half cents round away from zero');
delete from public.charges where description ~ '^r[0-9]$';

-- Pack expiry at the end of a month.
select results_eq(
  $$values (public.pack_expiry('2030-01-11', 6), public.pack_expiry('2030-08-31', 6), public.pack_expiry('2030-01-31', 1),
            public.pack_expiry('2030-03-01', 1), public.pack_expiry('2031-08-31', 6))$$,
  $$values ('2030-07-10'::date, '2031-02-28'::date, '2030-02-28'::date, '2030-03-31'::date, '2032-02-29'::date)$$,
  'a pack runs to the day before the same date N months on, or to the end of a shorter month');

select results_eq(
  $$select jobname, schedule from cron.job where jobname = 'charge-days'$$,
  $$values ('charge-days', '0 19 * * *')$$,
  'days are charged every evening');

select * from finish();
rollback;
