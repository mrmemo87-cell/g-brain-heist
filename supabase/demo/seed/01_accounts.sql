-- Demo seed 01: accounts (demo teacher, internal demo superadmin, 24 Grade 7 students).
-- DEMO PROJECT ONLY. All names are fictional. Emails use the reserved example.com domain.

do $$
begin
  if to_regclass('private.demo_environment') is null then
    raise exception 'Refusing: not the demo database (private.demo_environment missing)';
  end if;
end $$;

create or replace function private.demo_create_auth_user(
  p_id uuid, p_email text, p_password text, p_meta jsonb, p_created_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if to_regclass('private.demo_environment') is null then
    raise exception 'demo only';
  end if;
  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), p_created_at,
    '{"provider":"email","providers":["email"]}'::jsonb, p_meta, p_created_at, p_created_at, null,
    '', '', '', '', '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities(
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_id::text, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email', null, p_created_at, p_created_at
  ) on conflict (provider_id, provider) do nothing;
  return p_id;
end $$;
revoke all on function private.demo_create_auth_user(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;

-- Fixed ids keep the demo stable across nightly resets.
create table if not exists private.demo_people (
  key text primary key,
  user_id uuid not null unique,
  full_name text not null,
  email text not null unique,
  role text not null,
  story text
);
revoke all on private.demo_people from public, anon, authenticated;

insert into private.demo_people(key, user_id, full_name, email, role, story) values
  ('teacher',    'd0000000-0000-4000-8000-000000000001', 'Ms. Aigerim Sadykova', 'demo.teacher@example.com',    'teacher',  null),
  ('superadmin', 'd0000000-0000-4000-8000-000000000002', 'Brains Heist Demo Ops', 'demo.ops@example.com',        'teacher',  'internal: configures plan/seats only'),
  ('s01', 'd0000000-0000-4000-8000-000000000101', 'Aibek Toktogulov',   'demo.s01@example.com', 'student', 'perfect_recovered'),
  ('s02', 'd0000000-0000-4000-8000-000000000102', 'Nurai Bekova',        'demo.s02@example.com', 'student', 'perfect_recovered'),
  ('s03', 'd0000000-0000-4000-8000-000000000103', 'Timur Asanov',        'demo.s03@example.com', 'student', 'perfect_recovered'),
  ('s04', 'd0000000-0000-4000-8000-000000000104', 'Aruuke Mamytova',     'demo.s04@example.com', 'student', 'perfect_still_measuring'),
  ('s05', 'd0000000-0000-4000-8000-000000000105', 'Daniyar Usenov',      'demo.s05@example.com', 'student', 'perfect_no_change'),
  ('s06', 'd0000000-0000-4000-8000-000000000106', 'Elina Kim',           'demo.s06@example.com', 'student', 'slipping_agreement'),
  ('s07', 'd0000000-0000-4000-8000-000000000107', 'Bakyt Omurzakov',     'demo.s07@example.com', 'student', 'low_data'),
  ('s08', 'd0000000-0000-4000-8000-000000000108', 'Saltanat Ismailova',  'demo.s08@example.com', 'student', 'strong'),
  ('s09', 'd0000000-0000-4000-8000-000000000109', 'Erlan Jumabaev',      'demo.s09@example.com', 'student', 'strong'),
  ('s10', 'd0000000-0000-4000-8000-000000000110', 'Aliya Nurlanova',     'demo.s10@example.com', 'student', 'strong'),
  ('s11', 'd0000000-0000-4000-8000-000000000111', 'Ruslan Petrov',       'demo.s11@example.com', 'student', 'steady'),
  ('s12', 'd0000000-0000-4000-8000-000000000112', 'Kanykei Abdyldaeva',  'demo.s12@example.com', 'student', 'steady'),
  ('s13', 'd0000000-0000-4000-8000-000000000113', 'Adilet Sultanov',     'demo.s13@example.com', 'student', 'steady'),
  ('s14', 'd0000000-0000-4000-8000-000000000114', 'Meerim Kasymova',     'demo.s14@example.com', 'student', 'steady'),
  ('s15', 'd0000000-0000-4000-8000-000000000115', 'Islam Karimov',       'demo.s15@example.com', 'student', 'steady'),
  ('s16', 'd0000000-0000-4000-8000-000000000116', 'Sofia Lebedeva',      'demo.s16@example.com', 'student', 'steady'),
  ('s17', 'd0000000-0000-4000-8000-000000000117', 'Bektur Alymkulov',    'demo.s17@example.com', 'student', 'steady'),
  ('s18', 'd0000000-0000-4000-8000-000000000118', 'Zhanyl Toktosunova',  'demo.s18@example.com', 'student', 'steady'),
  ('s19', 'd0000000-0000-4000-8000-000000000119', 'Arsen Mukashev',      'demo.s19@example.com', 'student', 'steady'),
  ('s20', 'd0000000-0000-4000-8000-000000000120', 'Dinara Satybaldieva', 'demo.s20@example.com', 'student', 'steady'),
  ('s21', 'd0000000-0000-4000-8000-000000000121', 'Kirill Volkov',       'demo.s21@example.com', 'student', 'steady'),
  ('s22', 'd0000000-0000-4000-8000-000000000122', 'Aizhan Osmonova',     'demo.s22@example.com', 'student', 'steady'),
  ('s23', 'd0000000-0000-4000-8000-000000000123', 'Nursultan Beishenov', 'demo.s23@example.com', 'student', 'steady'),
  ('s24', 'd0000000-0000-4000-8000-000000000124', 'Asel Zhakypova',      'demo.s24@example.com', 'student', 'steady')
on conflict (key) do nothing;

-- Accounts were "created" at the start of term so nothing looks freshly made.
select private.demo_create_auth_user(
  p.user_id, p.email,
  case when p.key = 'teacher' then 'BrainsHeistDemo2026' else encode(extensions.gen_random_bytes(24), 'base64') end,
  case when p.role = 'student'
    then jsonb_build_object('role','student','username', 'demo_' || p.key, 'grade', '7', 'batch', '7A', 'full_name', p.full_name)
    else jsonb_build_object('role', p.role, 'username', 'demo_' || p.key, 'full_name', p.full_name) end,
  date_trunc('day', now()) - interval '60 days'
) from private.demo_people p;

update public.users u set
  full_name = p.full_name, needs_setup = false, tutorial_completed = true,
  created_at = date_trunc('day', now()) - interval '60 days'
from private.demo_people p where p.user_id = u.id;

insert into public.superadmins(user_id)
select user_id from private.demo_people where key = 'superadmin'
on conflict do nothing;
