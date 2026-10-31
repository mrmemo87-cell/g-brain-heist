-- Demo seed 02: the school, built only through the app's own flows:
-- school application -> superadmin approval -> plan/seats -> academic year/terms ->
-- class -> students join by invite code and set up their class -> English provisioned ->
-- academic roster confirmed.

do $$ begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
end $$;

-- Act as a demo user for the rest of the transaction (auth.uid() reads these claims).
create or replace function private.demo_as(p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if to_regclass('private.demo_environment') is null then raise exception 'demo only'; end if;
  select user_id into v_id from private.demo_people where key = p_key;
  if v_id is null then raise exception 'unknown demo person %', p_key; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_id::text, true);
  return v_id;
end $$;
revoke all on function private.demo_as(text) from public, anon, authenticated;

create table if not exists private.demo_state (key text primary key, value jsonb not null);
revoke all on private.demo_state from public, anon, authenticated;

create or replace function private.demo_state_uuid(p_key text) returns uuid
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::uuid from private.demo_state where key = p_key
$$;

create or replace function private.demo_ok(p_step text, p_result jsonb) returns jsonb
language plpgsql as $$
begin
  if not coalesce((p_result->>'success')::boolean, false) then
    raise exception 'demo seed step "%" failed: %', p_step, p_result;
  end if;
  return p_result;
end $$;

do $$
declare
  v_teacher uuid := (select user_id from private.demo_people where key = 'teacher');
  v_english_academic_subject constant uuid := '0a919668-59b4-4954-aa8d-9bf70c416000'; -- English
  v_english_grade7_scope constant uuid := 'ed716eb5-eb43-679e-936d-547256bdf967';     -- English · Grade 7
  v_request uuid; v_school uuid; v_year uuid; v_class uuid; v_class_b uuid; v_code text;
  r jsonb; p record;
begin
  -- 1. School application, approved by the (internal) demo superadmin.
  insert into public.school_requests(
    requested_name, normalized_name, requested_by, requester_email, requester_role, status,
    contact_email, city, country, decision_maker_name, decision_maker_title,
    applicant_authority_confirmed, estimated_students, estimated_teachers, requested_modules
  ) values (
    'Demo International School', public.normalize_school_name('Demo International School'),
    v_teacher, 'demo.teacher@example.com', 'teacher', 'pending',
    'demo.teacher@example.com', 'London', 'United Kingdom', 'Ms. Sarah Mitchell', 'Head of English',
    true, 24, 1, array['core','cambridge']
  ) returning id into v_request;

  perform private.demo_as('superadmin');
  r := private.demo_ok('approve school',
    public.admin_review_school_request(v_request, 'approve', 'Demo school for prospective teachers'));
  v_school := (r->>'school_id')::uuid;
  perform private.demo_ok('plan', public.admin_set_school_plan(v_school, 'enterprise'));
  perform private.demo_ok('cambridge seats', public.admin_configure_school_programme_seats(v_school, 'cambridge', 60));
  -- Fixed, memorable invite code. (Approval can generate a code containing '=', which
  -- join_school_by_code strips before matching, so roughly 1 in 20 generated codes
  -- cannot be used to join; a fixed code also keeps the demo deterministic.)
  update public.schools set time_zone = 'Europe/London', invite_code = 'DEMO7A2026',
    settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('daily_mission_academic_subject_id', v_english_academic_subject)
  where id = v_school;

  -- 2. The demo teacher is the School Head and also teaches English.
  perform private.demo_as('teacher');
  perform public.rpc_school_admin_set_teaching_staff_status(v_school, v_teacher, true);

  perform public.rpc_school_admin_upsert_academic_year(v_school, null, '2026/2027', date '2026-09-01', date '2027-06-30', 'current');
  select id into v_year from public.school_academic_years where school_id = v_school and name = '2026/2027';
  perform public.rpc_school_admin_upsert_academic_term(v_school, v_year, null, 'Term 1', 1::smallint, date '2026-09-01', date '2026-12-25');
  perform public.rpc_school_admin_upsert_academic_term(v_school, v_year, null, 'Term 2', 2::smallint, date '2027-01-11', date '2027-03-19');
  perform public.rpc_school_admin_upsert_academic_term(v_school, v_year, null, 'Term 3', 3::smallint, date '2027-03-29', date '2027-06-25');

  perform public.school_admin_save_class(v_school, null, '7A', '7A', 7, true);
  perform public.school_admin_save_class(v_school, null, '7B', '7B', 7, true);
  select id into v_class from public.classes where school_id = v_school and class_code = '7A';
  select id into v_class_b from public.classes where school_id = v_school and class_code = '7B';

  -- 3. Students join with the invite code and pick their class, like real students.
  select invite_code into v_code from public.schools where id = v_school;
  for p in select key, class_code from private.demo_people where role = 'student' order by key loop
    perform private.demo_as(p.key);
    perform private.demo_ok('join ' || p.key, public.join_school_by_code(v_code, 'student'));
    perform private.demo_ok('class ' || p.key, to_jsonb(public.rpc_setup_school_class_enrollment('7', right(p.class_code, 1))));
  end loop;

  -- 4. English for Grade 7, taught by the demo teacher to 7A (the School Subjects screen's
  --    save call: subject + curriculum mapping + grade offering + teaching group); roster confirmed.
  perform private.demo_as('teacher');
  perform private.demo_ok('save English', public.rpc_school_admin_save_school_subject(
    v_school, 'English', null, 'ENG', v_english_academic_subject, v_year, '7', v_english_grade7_scope,
    'all_grade', array[]::uuid[], v_teacher, array[v_class, v_class_b], false));
  perform private.demo_ok('confirm roster', public.rpc_school_admin_confirm_academic_roster(v_school, v_year));

  -- 4b. A delegated administrator (Deputy Head) and the School Head setup checklist.
  perform private.demo_as('deputy');
  perform private.demo_ok('join deputy', public.join_school_by_code(v_code, 'teacher'));
  perform private.demo_as('teacher');
  perform private.demo_ok('deputy role', public.school_admin_transition_member_role(v_school, (select user_id from private.demo_people where key = 'deputy'), 'school_admin', false, 'Deputy Head, delegated administrator'));
  perform private.demo_ok('identity', public.rpc_school_admin_confirm_identity(v_school, 'Demo International School',
    'data:image/svg+xml;utf8,' || replace(replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#0755ab"/><path d="M30 24h20c15 0 24 9 24 24s-9 24-24 24H30z" fill="none" stroke="#2cf6c8" stroke-width="9" stroke-linejoin="round"/><circle cx="72" cy="26" r="6" fill="#ffc861"/></svg>', '#', '%23'), '"', '''')));
  set local session_replication_role = replica;
  update public.school_head_onboarding set modules_confirmed_at = now(), modules_confirmed_by = v_teacher,
    launch_test_confirmed_at = now(), launch_test_confirmed_by = v_teacher, requested_modules = array['core','cambridge'] where school_id = v_school;
  set local session_replication_role = origin;

  insert into private.demo_state(key, value) values
    ('school_id', to_jsonb(v_school)), ('academic_year_id', to_jsonb(v_year)), ('class_id', to_jsonb(v_class)), ('class_b_id', to_jsonb(v_class_b))
  on conflict (key) do update set value = excluded.value;
end $$;

-- 5. Real flows stamp "now". Put the setup where it belongs in the story: the school was
--    set up the week before term and students were placed on the first day. This matters:
--    teacher workspaces ignore evidence from before a student's current placement.
do $$
declare
  v_school uuid := private.demo_state_uuid('school_id');
  v_open timestamptz := timestamptz '2026-08-24 10:00 Europe/London';
  v_term timestamptz := timestamptz '2026-09-01 08:30 Europe/London';
begin
  set local session_replication_role = replica;
  update public.school_requests set created_at = v_open - interval '3 days', reviewed_at = v_open - interval '1 day', updated_at = v_open - interval '1 day' where approved_school_id = v_school;
  update public.schools set created_at = v_open - interval '1 day', updated_at = v_open where id = v_school;
  update public.school_members set joined_at = case when role_in_school = 'student' then v_term else v_open end where school_id = v_school;
  update public.school_head_onboarding set identity_confirmed_at = v_open, modules_confirmed_at = v_open, launch_test_confirmed_at = v_open + interval '2 days', created_at = v_open, updated_at = v_open where school_id = v_school;
  update public.school_governance_audit_log set created_at = v_open where school_id = v_school;
  update public.school_member_role_audit set created_at = v_open where school_id = v_school;
  update public.classes set created_at = v_open where school_id = v_school;
  update public.class_students set joined_at = v_term where class_id in (select id from public.classes where school_id = v_school);
  update public.school_student_placement_history set effective_date = v_term::date, recorded_at = v_term where school_id = v_school;
  update public.student_academic_enrolments set starts_on = v_term::date, created_at = v_term, updated_at = v_term where school_id = v_school;
  update public.school_academic_years set created_at = v_open, updated_at = v_open where school_id = v_school;
  update public.school_academic_terms set created_at = v_open, updated_at = v_open where school_id = v_school;
  update public.school_module_entitlements set created_at = v_open, starts_at = v_open, updated_at = v_open where school_id = v_school;
  update public.school_curriculum_scope_mappings set created_at = v_open, confirmed_at = v_open, updated_at = v_open where school_id = v_school;
  update public.school_subjects set created_at = v_open, updated_at = v_open where school_id = v_school;
  update public.school_subject_offerings set created_at = v_open, updated_at = v_open where school_id = v_school;
  update public.school_subject_groups set created_at = v_open, updated_at = v_open where school_id = v_school;
  set local session_replication_role = origin;
end $$;
