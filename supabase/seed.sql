-- Local development data only (applied by `supabase start` / `supabase db reset`).
-- Never run against the hosted project.
--
-- Staff logins (password for both: woofwoof):
--   admin@woof.local  (admin)
--   staff@woof.local  (staff)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin@woof.local', extensions.crypt('woofwoof', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'staff@woof.local', extensions.crypt('woofwoof', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in ('admin@woof.local', 'staff@woof.local');

insert into public.staff (user_id, full_name, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin Woof', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Staff Woof', 'staff');

insert into public.owners (id, full_name, email, phone, language, consent_at) values
  ('b0000000-0000-0000-0000-000000000001', 'Ane Etxeberria', 'ane@example.com', '+34 600 111 222', 'es', now()),
  ('b0000000-0000-0000-0000-000000000002', 'Mark Davies', 'mark@example.com', '+34 600 333 444', 'en', now());

insert into public.dogs (id, owner_id, name, breed, age_text, size, sex, neutered, vaccines_up_to_date, vaccines_checked_until, medical_notes, behaviour_notes) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Txuri', 'Mestizo', '3 años', 'm', 'f', true, true, current_date + 200, null, 'Le encanta correr por la ría'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Beltza', 'Labrador', '7 años', 'l', 'm', true, true, current_date - 10, 'Alergia al pollo', 'Tranquilo, duerme mucho'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'Pepper', 'Jack Russell', '1 year', 's', 'f', false, true, null, null, 'Very energetic, loves balls');

-- More dogs so the Today screen has a few to check in, and one (Rocky) with
-- no booking, for trying a walk-in.
insert into public.owners (id, full_name, email, phone, language, consent_at) values
  ('b0000000-0000-0000-0000-000000000003', 'Itziar Mendoza', 'itziar@example.com', '+34 600 777 888', 'es', now());

insert into public.dogs (id, owner_id, name, breed, age_text, size, sex, neutered, vaccines_up_to_date, vaccines_checked_until, medical_notes, behaviour_notes) values
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'Kira', 'Border Collie', '4 años', 'm', 'f', true, true, current_date + 9, 'Toma pastilla para el tiroides a mediodía', 'Muy lista, se escapa si puede'),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 'Rocky', 'Bulldog francés', '2 años', 's', 'm', false, false, null, null, 'Ronca'),
  ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'Biscuit', 'Beagle', '5 years', 'm', 'm', true, true, current_date + 300, null, 'Food thief');

-- Bookings from today (in Bilbao) over the next two weeks: four dogs
-- confirmed every weekday, one pending. On a weekday the Today screen shows
-- the four confirmed dogs; on a weekend it shows the closed state.
insert into public.bookings (dog_id, start_date, end_date, weekdays, status) values
  ('c0000000-0000-0000-0000-000000000001', public.madrid_today(), public.madrid_today() + 14, '{1,2,3,4,5}', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000002', public.madrid_today(), public.madrid_today() + 14, '{1,2,3,4,5}', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000004', public.madrid_today(), public.madrid_today() + 14, '{1,2,3,4,5}', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000006', public.madrid_today(), public.madrid_today() + 14, '{1,2,3,4,5}', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000003', public.madrid_today(), public.madrid_today() + 14, '{1,3,5}', 'pending');

insert into public.booking_requests (payload) values (
  '{"lang":"es","owner":{"name":"Leire Gómez","email":"leire@example.com","phone":"+34 600 555 666"},
    "dog":{"name":"Kuki","breed":null,"age":"2 años","size":"s","sex":"m","neutered":false,"vaccinated":true,"medical":null,"preferences":"Un poco tímido al principio"},
    "dates":{"from":"2026-12-01","to":"2026-12-19","weekdays":[2,4]},"notes":null,"consent":true}'
);
