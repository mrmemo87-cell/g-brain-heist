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
  story text,
  class_code text
);
alter table private.demo_people add column if not exists class_code text;
revoke all on private.demo_people from public, anon, authenticated;

-- Optional: the ops (superadmin) password comes from the BH_DEMO_OPS_PASSWORD secret.
\if :{?ops_password}
\else
\set ops_password ''
\endif

insert into private.demo_people(key, user_id, full_name, email, role, story, class_code) values
  ('teacher', 'd0000000-0000-4000-8000-000000000001', 'Ms. Sarah Mitchell', 'demo.teacher@example.com',    'teacher',  null, null),
  ('superadmin', 'd0000000-0000-4000-8000-000000000002', 'Brains Heist Demo Ops', 'demo.ops@example.com',        'teacher',  'internal: platform admin for visitor analytics', null),
  ('deputy', 'd0000000-0000-4000-8000-000000000003', 'Mr. David Okafor',    'demo.deputy@example.com',     'teacher',  'delegated school administrator (Deputy Head)', null),
  ('s01', 'd0000000-0000-4000-8000-000000000101', 'Lucas Fernández',   'demo.s01@example.com', 'student', 'perfect_recovered', '7A'),
  ('s02', 'd0000000-0000-4000-8000-000000000102', 'Amara Okoye',        'demo.s02@example.com', 'student', 'perfect_recovered', '7A'),
  ('s03', 'd0000000-0000-4000-8000-000000000103', 'Ethan Walker',        'demo.s03@example.com', 'student', 'perfect_recovered', '7A'),
  ('s04', 'd0000000-0000-4000-8000-000000000104', 'Priya Sharma',     'demo.s04@example.com', 'student', 'perfect_still_measuring', '7A'),
  ('s05', 'd0000000-0000-4000-8000-000000000105', 'Noah Schmidt',      'demo.s05@example.com', 'student', 'perfect_no_change', '7A'),
  ('s06', 'd0000000-0000-4000-8000-000000000106', 'Elena Rossi',           'demo.s06@example.com', 'student', 'slipping_agreement', '7A'),
  ('s07', 'd0000000-0000-4000-8000-000000000107', 'Omar Haddad',     'demo.s07@example.com', 'student', 'low_data', '7A'),
  ('s08', 'd0000000-0000-4000-8000-000000000108', 'Hana Sato',  'demo.s08@example.com', 'student', 'strong', '7A'),
  ('s09', 'd0000000-0000-4000-8000-000000000109', 'Liam O''Brien',      'demo.s09@example.com', 'student', 'strong', '7A'),
  ('s10', 'd0000000-0000-4000-8000-000000000110', 'Zara Ahmed',     'demo.s10@example.com', 'student', 'strong', '7A'),
  ('s11', 'd0000000-0000-4000-8000-000000000111', 'Mateo Silva',       'demo.s11@example.com', 'student', 'steady', '7A'),
  ('s12', 'd0000000-0000-4000-8000-000000000112', 'Chloe Dubois',  'demo.s12@example.com', 'student', 'steady', '7A'),
  ('s13', 'd0000000-0000-4000-8000-000000000113', 'Arjun Patel',     'demo.s13@example.com', 'student', 'steady', '7A'),
  ('s14', 'd0000000-0000-4000-8000-000000000114', 'Mia Johansson',     'demo.s14@example.com', 'student', 'steady', '7A'),
  ('s15', 'd0000000-0000-4000-8000-000000000115', 'Kenji Tanaka',       'demo.s15@example.com', 'student', 'steady', '7A'),
  ('s16', 'd0000000-0000-4000-8000-000000000116', 'Sofia Petrova',      'demo.s16@example.com', 'student', 'steady', '7A'),
  ('s17', 'd0000000-0000-4000-8000-000000000117', 'Daniel Kim',    'demo.s17@example.com', 'student', 'steady', '7A'),
  ('s18', 'd0000000-0000-4000-8000-000000000118', 'Isabella Costa',  'demo.s18@example.com', 'student', 'steady', '7A'),
  ('s19', 'd0000000-0000-4000-8000-000000000119', 'Youssef Mansour',      'demo.s19@example.com', 'student', 'steady', '7A'),
  ('s20', 'd0000000-0000-4000-8000-000000000120', 'Emily Clarke', 'demo.s20@example.com', 'student', 'steady', '7A'),
  ('s21', 'd0000000-0000-4000-8000-000000000121', 'Samuel Adeyemi',       'demo.s21@example.com', 'student', 'steady', '7A'),
  ('s22', 'd0000000-0000-4000-8000-000000000122', 'Leila Rahimi',     'demo.s22@example.com', 'student', 'steady', '7A'),
  ('s23', 'd0000000-0000-4000-8000-000000000123', 'Tomás Herrera', 'demo.s23@example.com', 'student', 'steady', '7A'),
  ('s24', 'd0000000-0000-4000-8000-000000000124', 'Ava Thompson',      'demo.s24@example.com', 'student', 'steady', '7A'),
  -- Class 7B: the rival class in Class Conquest
  ('s25', 'd0000000-0000-4000-8000-000000000125', 'Aisha Khan',  'demo.s25@example.com', 'student', 'strong', '7B'),
  ('s26', 'd0000000-0000-4000-8000-000000000126', 'Oliver Bennett',       'demo.s26@example.com', 'student', 'strong', '7B'),
  ('s27', 'd0000000-0000-4000-8000-000000000127', 'Yuki Nakamura',     'demo.s27@example.com', 'student', 'strong', '7B'),
  ('s28', 'd0000000-0000-4000-8000-000000000128', 'Gabriel Santos',      'demo.s28@example.com', 'student', 'steady', '7B'),
  ('s29', 'd0000000-0000-4000-8000-000000000129', 'Nour El-Sayed',     'demo.s29@example.com', 'student', 'steady', '7B'),
  ('s30', 'd0000000-0000-4000-8000-000000000130', 'Jonas Weber',    'demo.s30@example.com', 'student', 'steady', '7B'),
  ('s31', 'd0000000-0000-4000-8000-000000000131', 'Maya Goldberg',      'demo.s31@example.com', 'student', 'steady', '7B'),
  ('s32', 'd0000000-0000-4000-8000-000000000132', 'Felix Müller',      'demo.s32@example.com', 'student', 'steady', '7B'),
  ('s33', 'd0000000-0000-4000-8000-000000000133', 'Ananya Iyer',     'demo.s33@example.com', 'student', 'steady', '7B'),
  ('s34', 'd0000000-0000-4000-8000-000000000134', 'Diego Morales', 'demo.s34@example.com', 'student', 'steady', '7B'),
  ('s35', 'd0000000-0000-4000-8000-000000000135', 'Freya Nielsen',   'demo.s35@example.com', 'student', 'steady', '7B'),
  ('s36', 'd0000000-0000-4000-8000-000000000136', 'Ibrahim Yilmaz',     'demo.s36@example.com', 'student', 'steady', '7B'),
  ('s37', 'd0000000-0000-4000-8000-000000000137', 'Grace Mwangi',  'demo.s37@example.com', 'student', 'steady', '7B'),
  ('s38', 'd0000000-0000-4000-8000-000000000138', 'Ryan Park',      'demo.s38@example.com', 'student', 'steady', '7B'),
  ('s39', 'd0000000-0000-4000-8000-000000000139', 'Camila Rodríguez',    'demo.s39@example.com', 'student', 'steady', '7B'),
  ('s40', 'd0000000-0000-4000-8000-000000000140', 'Adam Novák',    'demo.s40@example.com', 'student', 'steady', '7B'),
  ('s41', 'd0000000-0000-4000-8000-000000000141', 'Lin Wei',    'demo.s41@example.com', 'student', 'steady', '7B'),
  ('s42', 'd0000000-0000-4000-8000-000000000142', 'Marco Bianchi',   'demo.s42@example.com', 'student', 'steady', '7B'),
  ('s43', 'd0000000-0000-4000-8000-000000000143', 'Olivia Hughes',      'demo.s43@example.com', 'student', 'steady', '7B'),
  ('s44', 'd0000000-0000-4000-8000-000000000144', 'Kofi Mensah',    'demo.s44@example.com', 'student', 'steady', '7B'),
  ('s45', 'd0000000-0000-4000-8000-000000000145', 'Sara Lindqvist',    'demo.s45@example.com', 'student', 'steady', '7B'),
  ('s46', 'd0000000-0000-4000-8000-000000000146', 'Alexander Ivanov',     'demo.s46@example.com', 'student', 'steady', '7B')
on conflict (key) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role, story = excluded.story, class_code = excluded.class_code;
update private.demo_people set class_code = '7A' where role = 'student' and class_code is null;

-- Student usernames look like the ones real students pick: first name + surname initial.
create or replace function private.demo_username(p_key text, p_name text, p_role text) returns text language sql immutable as $$
  select case when p_role = 'student'
    then lower(translate(split_part(p_name, ' ', 1), 'ÁÉÍÓÚÜÑÖáéíóúüñöç', 'AEIOUUNOaeiouunoc')) || '_' || lower(left(regexp_replace(split_part(p_name, ' ', 2), '[^A-Za-z]', '', 'g'), 1))
    else 'demo_' || p_key end
$$;

-- Accounts were "created" at the start of term so nothing looks freshly made.
select private.demo_create_auth_user(
  p.user_id, p.email,
  case when p.key in ('teacher', 's01') then 'BrainsHeistDemo2026'          -- public demo logins (teacher + one student)
       when p.key = 'superadmin' then coalesce(nullif(:'ops_password', ''), encode(extensions.gen_random_bytes(24), 'base64'))
       else encode(extensions.gen_random_bytes(24), 'base64') end,
  case when p.role = 'student'
    then jsonb_build_object('role','student','username', private.demo_username(p.key, p.full_name, p.role), 'grade', '7', 'batch', p.class_code, 'full_name', p.full_name)
    else jsonb_build_object('role', p.role, 'username', 'demo_' || p.key, 'full_name', p.full_name) end,
  date_trunc('day', now()) - interval '60 days'
) from private.demo_people p;

update public.users u set
  full_name = p.full_name, username = private.demo_username(p.key, p.full_name, p.role), needs_setup = false, tutorial_completed = true,
  created_at = date_trunc('day', now()) - interval '60 days'
from private.demo_people p where p.user_id = u.id;

insert into public.superadmins(user_id)
select user_id from private.demo_people where key = 'superadmin'
on conflict do nothing;
