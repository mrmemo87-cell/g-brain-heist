\set ON_ERROR_STOP on

-- Adversarial school-plan authority harness. Run only on a disposable/staging
-- database with all repository migrations applied; every fixture is rolled back.

begin;

create or replace function pg_temp.assert_true(p_value boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_value is not true then raise exception 'assertion failed: %', p_message; end if;
end;
$$;

create or replace function pg_temp.assert_feature_route_denied(p_path text, p_message text)
returns void language plpgsql as $$
begin
  perform set_config('request.path', p_path, true);
  begin
    perform public.enforce_request_entitlement();
    raise exception 'assertion failed: % (route was allowed)', p_message;
  exception when sqlstate 'PGRST' then null;
  end;
end;
$$;

insert into public.schools (id, name, slug, status, settings, school_plan, trial_ends_at)
values
  ('d1000000-0000-4000-8000-000000000001', 'Free authority fixture', 'free-authority-fixture', 'active', '{}'::jsonb, 'none', null),
  ('d1000000-0000-4000-8000-000000000002', 'Pilot authority fixture', 'pilot-authority-fixture', 'active', '{}'::jsonb, 'pilot', now() + interval '30 days');

insert into public.users (id, email, username, role, school_id, account_tier)
values
  ('d2000000-0000-4000-8000-000000000001', 'free-teacher@test.invalid', 'free_teacher_fixture', 'teacher', 'd1000000-0000-4000-8000-000000000001', 'pro'),
  ('d2000000-0000-4000-8000-000000000002', 'pilot-student@test.invalid', 'pilot_student_fixture', 'student', 'd1000000-0000-4000-8000-000000000002', 'free'),
  ('d2000000-0000-4000-8000-000000000003', 'individual@test.invalid', 'individual_fixture', 'student', null, 'free');

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('d2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'free-teacher@test.invalid', '{"username":"free_teacher_fixture","role":"teacher"}'::jsonb, now(), now()),
  ('d2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pilot-student@test.invalid', '{"username":"pilot_student_fixture","role":"student"}'::jsonb, now(), now()),
  ('d2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'individual@test.invalid', '{"username":"individual_fixture","role":"student"}'::jsonb, now(), now());

insert into public.school_members (id, school_id, user_id, role_in_school, status, can_teach)
values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'teacher', 'active', true),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'student', 'active', false);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A legacy personal Pro flag cannot override the school agreement.
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true(public.get_effective_tier() = 'free', 'None school must resolve to Free even when account_tier is Pro');
select pg_temp.assert_true(not public.can_use_feature('assignments', false), 'Free school must not use assignments');
select pg_temp.assert_true(not public.can_use_feature('reports', false), 'Free school must not use reports');
select pg_temp.assert_true(not public.can_use_feature('question_bank', false), 'Free school must not use the question bank');
select pg_temp.assert_true(not public.can_use_feature('clans', true), 'Free school must not use clans');
select pg_temp.assert_true(not public.can_use_feature('pvp_battles', true), 'Free school must not use PvP');
select pg_temp.assert_true(public.can_use_feature('lockdown_mode', true), 'Free school must retain Lockdown');
select pg_temp.assert_true((public.check_lockdown_limits()->>'max_duration_minutes')::int = 15, 'Free Lockdown duration must be 15 minutes');
select pg_temp.assert_true((public.check_lockdown_limits()->>'max_students')::int = 20, 'Free Lockdown student cap must be 20');
select pg_temp.assert_true(jsonb_array_length(public.check_lockdown_limits()->'allowed_maps') = 3, 'Free Lockdown must expose exactly three valid maps');
select pg_temp.assert_feature_route_denied('/rpc/rpc_create_assignment', 'assignment RPC must fail before execution');
select pg_temp.assert_feature_route_denied('/rpc/rpc_hack_attempt', 'PvP RPC must fail before execution');
select pg_temp.assert_feature_route_denied('/clans', 'clan table route must fail before execution');

-- An active Pilot receives the complete feature set for the full trial period.
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(public.get_effective_tier() = 'pilot', 'active Pilot must resolve to Pilot');
select pg_temp.assert_true(public.can_use_feature('assignments', false), 'Pilot must use assignments');
select pg_temp.assert_true(public.can_use_feature('clans', true), 'Pilot must use clans');
select pg_temp.assert_true(public.can_use_feature('pvp_battles', true), 'Pilot must use PvP');
select pg_temp.assert_true(public.check_lockdown_limits()->'max_duration_minutes' = 'null'::jsonb, 'Pilot Lockdown must be unlimited');

-- Individual mode remains separate from school billing.
select set_config('request.jwt.claim.sub', 'd2000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true(public.can_use_feature('clans', true), 'individual clan access must remain available');
select pg_temp.assert_true(public.can_use_feature('pvp_battles', true), 'individual PvP access must remain available');

rollback;
