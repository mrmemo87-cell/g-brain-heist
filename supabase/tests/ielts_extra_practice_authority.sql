\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_value boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_value is not true then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

insert into public.schools (id, name, slug, status, settings)
values
  ('f1000000-0000-4000-8000-000000000001', 'IELTS enabled fixture', 'ielts-enabled-fixture', 'active', '{"ielts_extra_practice_enabled": true}'::jsonb),
  ('f1000000-0000-4000-8000-000000000002', 'IELTS disabled fixture', 'ielts-disabled-fixture', 'active', '{"ielts_extra_practice_enabled": false}'::jsonb);

insert into public.users (id, email, username, role, school_id)
values
  ('f2000000-0000-4000-8000-000000000001', 'ielts-enabled@test.invalid', 'ielts_enabled_fixture', 'student', 'f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'ielts-disabled@test.invalid', 'ielts_disabled_fixture', 'student', 'f1000000-0000-4000-8000-000000000002'),
  ('f2000000-0000-4000-8000-000000000003', 'ielts-independent@test.invalid', 'ielts_independent_fixture', 'student', null),
  ('f2000000-0000-4000-8000-000000000004', 'ielts-assigner@test.invalid', 'ielts_assigner_fixture', 'teacher', 'f1000000-0000-4000-8000-000000000002'),
  ('f2000000-0000-4000-8000-000000000005', 'ielts-admin@test.invalid', 'ielts_admin_fixture', 'school_admin', 'f1000000-0000-4000-8000-000000000002')
on conflict (id) do update
set email = excluded.email,
    username = excluded.username,
    role = excluded.role,
    school_id = excluded.school_id;

-- Reading/listening attempts reference the IELTS profile, which in turn
-- references the canonical Auth identity. Insert Auth after the fixture profile
-- so the normal signup trigger preserves the already-resolved school link.
insert into auth.users (
  id, aud, role, email, raw_user_meta_data, created_at, updated_at
) values (
  'f2000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'ielts-enabled@test.invalid',
  '{"username":"ielts_enabled_fixture","role":"student"}'::jsonb,
  now(),
  now()
);

insert into public.ielts_users (id, username, email, tier)
values (
  'f2000000-0000-4000-8000-000000000001',
  'ielts_enabled_fixture',
  'ielts-enabled@test.invalid',
  'free'
);

insert into public.school_members (id, school_id, user_id, role_in_school, status, can_teach)
values
  ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'student', 'active', false),
  ('f3000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'student', 'active', false),
  ('f3000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000004', 'teacher', 'active', true),
  ('f3000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000005', 'school_admin', 'active', false);

insert into public.ielts_reading_sets (
  id, slug, title, level, duration_minutes, is_active, required_tier
)
values
  (990000001, 'ielts-authority-fixture', 'IELTS authority fixture', 'B1', 20, true, 'free'),
  (990000002, 'ielts-authority-fixture-2', 'IELTS authority fixture 2', 'B1', 20, true, 'free');

insert into public.ielts_practice_assignments (
  id, school_id, assigned_by, title, status
)
values (
  'f4000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002',
  'f2000000-0000-4000-8000-000000000004',
  'IELTS authority fixture assignment',
  'assigned'
);

insert into public.ielts_practice_assignment_items (
  id, assignment_id, skill, content_type, content_id, title
)
values (
  'f5000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'reading',
  'ielts_reading_set',
  '990000001',
  'IELTS authority fixture'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Exact grants: RLS is the row boundary, grants are the operation boundary.
select pg_temp.assert_true(
  has_table_privilege(current_user, 'public.ielts_reading_sets', 'SELECT')
  and not has_table_privilege(current_user, 'public.ielts_reading_sets', 'INSERT')
  and not has_table_privilege(current_user, 'public.ielts_reading_sets', 'UPDATE')
  and not has_table_privilege(current_user, 'public.ielts_reading_sets', 'DELETE')
  and not has_table_privilege(current_user, 'public.ielts_reading_sets', 'TRUNCATE'),
  'authenticated content privilege must be SELECT only'
);
select pg_temp.assert_true(
  has_table_privilege(current_user, 'public.ielts_reading_attempts', 'SELECT')
  and has_table_privilege(current_user, 'public.ielts_reading_attempts', 'INSERT')
  and has_table_privilege(current_user, 'public.ielts_reading_attempts', 'UPDATE')
  and not has_table_privilege(current_user, 'public.ielts_reading_attempts', 'DELETE')
  and not has_table_privilege(current_user, 'public.ielts_reading_attempts', 'TRUNCATE'),
  'authenticated attempt privileges must be SELECT, INSERT and UPDATE only'
);
select pg_temp.assert_true(
  has_table_privilege(current_user, 'public.schools', 'SELECT')
  and not has_table_privilege(current_user, 'public.schools', 'INSERT')
  and not has_table_privilege(current_user, 'public.schools', 'UPDATE')
  and not has_table_privilege(current_user, 'public.schools', 'DELETE')
  and not has_table_privilege(current_user, 'public.schools', 'TRUNCATE'),
  'authenticated school privilege must be SELECT only'
);

-- Enabled school: free Extra Practice content is visible.
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.ielts_reading_sets where id = 990000001),
  'enabled-school student should see active free content'
);
select pg_temp.assert_true(
  (public.rpc_ielts_extra_practice_access()->>'enabled')::boolean,
  'read RPC should resolve enabled school setting'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.schools where id = 'f1000000-0000-4000-8000-000000000002'),
  'student must not read another school settings row'
);

-- An attempt opened while access is enabled must remain saveable after the
-- setting changes, but its owner and content identity cannot be retargeted.
insert into public.ielts_reading_attempts (
  id, user_id, set_id, answers
) values (
  'f7000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  990000001,
  '{}'::jsonb
);

reset role;
update public.schools
set settings = settings || '{"ielts_extra_practice_enabled": false}'::jsonb
where id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000001', true);
update public.ielts_reading_attempts
set answers = '{"1":"saved after disable"}'::jsonb
where id = 'f7000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select answers = '{"1":"saved after disable"}'::jsonb
   from public.ielts_reading_attempts
   where id = 'f7000000-0000-4000-8000-000000000001'),
  'existing attempt should remain saveable after access is disabled'
);
do $test$
begin
  begin
    insert into public.ielts_reading_attempts (id, user_id, set_id, answers)
    values (
      'f7000000-0000-4000-8000-000000000002',
      'f2000000-0000-4000-8000-000000000001',
      990000002,
      '{}'::jsonb
    );
    raise exception 'assertion failed: disabled access opened a new attempt';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;
do $test$
begin
  begin
    update public.ielts_reading_attempts
    set set_id = 990000002
    where id = 'f7000000-0000-4000-8000-000000000001';
    raise exception 'assertion failed: attempt content identity changed';
  exception when sqlstate '22023' then
    null;
  end;
end
$test$;

-- Disabled school: direct content is hidden before an assignment exists.
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.ielts_reading_sets where id = 990000001),
  'disabled-school student must not see unassigned content'
);

reset role;
insert into public.ielts_practice_assignment_students (
  id, assignment_id, student_id, status
)
values (
  'f6000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'assigned'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.ielts_reading_sets where id = 990000001),
  'live assignment should override the school toggle'
);

-- Teachers can assign content but cannot change the school-wide setting.
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000004', true);
do $test$
begin
  begin
    perform public.rpc_ielts_update_extra_practice_access(true);
    raise exception 'assertion failed: teacher changed school Extra Practice setting';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

-- The canonical school administrator may change only the resolved school.
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000005', true);
select pg_temp.assert_true(
  (public.rpc_ielts_update_extra_practice_access(true)->>'enabled')::boolean,
  'school administrator should be able to enable Extra Practice'
);
select pg_temp.assert_true(
  (select settings @> '{"ielts_extra_practice_enabled": true}'::jsonb
   from public.schools where id = 'f1000000-0000-4000-8000-000000000002'),
  'school administrator update must target the resolved school'
);

reset role;
select pg_temp.assert_true(
  (select settings @> '{"ielts_extra_practice_enabled": false}'::jsonb
   from public.schools where id = 'f1000000-0000-4000-8000-000000000001'),
  'school administrator update must not change another school'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.schools', 'SELECT')
  and not has_table_privilege('anon', 'public.ielts_reading_sets', 'SELECT')
  and not has_table_privilege('anon', 'public.ielts_reading_attempts', 'INSERT'),
  'anonymous callers must use only the deliberately public preview and school-picker RPCs'
);
select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.schools', 'SELECT,UPDATE')
  and has_table_privilege('service_role', 'public.ielts_reading_sets', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('service_role', 'public.ielts_reading_attempts', 'SELECT,INSERT,UPDATE,DELETE'),
  'server-only service access must remain explicit'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A profile with no school link or membership remains an independent learner.
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.ielts_reading_sets where id = 990000001),
  'genuinely independent learner should retain free Extra Practice access'
);

-- An authenticated UUID with no recognized profile fails closed.
select set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000099', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.ielts_reading_sets where id = 990000001),
  'missing profile must fail closed'
);
select pg_temp.assert_true(
  not (public.rpc_ielts_extra_practice_access()->>'resolved')::boolean,
  'read RPC should mark missing profile unresolved'
);

rollback;
