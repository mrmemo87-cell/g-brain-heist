\set ON_ERROR_STOP on

-- Adversarial IELTS Exam Mode lifecycle harness.
-- This file is intentionally transaction-scoped and always rolls back. Run it
-- only against a disposable/staging database with all repository migrations
-- applied; never point the wrapper at production.

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

create or replace function pg_temp.assert_raises(
  p_statement text,
  p_error_fragment text,
  p_message text
)
returns void
language plpgsql
as $$
declare
  v_raised boolean := false;
  v_error text;
begin
  begin
    execute p_statement;
  exception
    when others then
      v_raised := true;
      v_error := sqlerrm;
  end;

  if not v_raised then
    raise exception 'assertion failed: % (statement did not fail)', p_message;
  end if;
  if position(p_error_fragment in coalesce(v_error, '')) = 0 then
    raise exception 'assertion failed: % (expected %, received %)',
      p_message,
      p_error_fragment,
      coalesce(v_error, '<no error>');
  end if;
end;
$$;

insert into public.schools (id, name, slug, status, settings)
values
  ('e1000000-0000-4000-8000-000000000001', 'IELTS lifecycle school', 'ielts-lifecycle-school-fixture', 'active', '{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000002', 'IELTS foreign school', 'ielts-foreign-school-fixture', 'active', '{}'::jsonb);

insert into public.users (id, email, username, role, school_id)
values
  ('e2000000-0000-4000-8000-000000000001', 'ielts-lifecycle-admin@test.invalid', 'ielts_lifecycle_admin', 'school_admin', 'e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002', 'ielts-lifecycle-student@test.invalid', 'ielts_lifecycle_student', 'student', 'e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000003', 'ielts-foreign-student@test.invalid', 'ielts_foreign_student', 'student', 'e1000000-0000-4000-8000-000000000002'),
  ('e2000000-0000-4000-8000-000000000004', 'ielts-lifecycle-teacher@test.invalid', 'ielts_lifecycle_teacher', 'teacher', 'e1000000-0000-4000-8000-000000000001');

-- Live class and assignment foreign keys point to Auth identities. Insert Auth
-- after the canonical profiles so the signup trigger cannot replace the
-- fixture's explicit school links.
insert into auth.users (
  id, aud, role, email, raw_user_meta_data, created_at, updated_at
)
values
  ('e2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ielts-lifecycle-admin@test.invalid', '{"username":"ielts_lifecycle_admin","role":"school_admin"}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ielts-lifecycle-student@test.invalid', '{"username":"ielts_lifecycle_student","role":"student"}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'ielts-foreign-student@test.invalid', '{"username":"ielts_foreign_student","role":"student"}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'ielts-lifecycle-teacher@test.invalid', '{"username":"ielts_lifecycle_teacher","role":"teacher"}'::jsonb, now(), now());

insert into public.school_members (
  id,
  school_id,
  user_id,
  role_in_school,
  status,
  is_owner,
  can_teach
)
values
  ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'school_admin', 'active', true, false),
  ('e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'student', 'active', false, false),
  ('e3000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000003', 'student', 'active', false, false),
  ('e3000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000004', 'teacher', 'active', false, true);

insert into public.classes (
  id,
  school_id,
  class_name,
  class_code,
  grade_level,
  is_active
)
values (
  'e4000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'IELTS lifecycle class',
  'IELTS-LIFECYCLE-FIXTURE',
  '8',
  true
);

insert into public.class_teacher_assignments (
  school_id,
  class_id,
  teacher_user_id,
  subject,
  active,
  created_by
)
values (
  'e1000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000004',
  'English',
  true,
  'e2000000-0000-4000-8000-000000000001'
);

insert into public.ielts_exam_events (
  id,
  school_id,
  title,
  description,
  status,
  starts_at,
  ends_at,
  duration_minutes,
  created_by
)
values (
  'e5000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'IELTS lifecycle fixture',
  'Rollback-only adversarial lifecycle test',
  'scheduled',
  now() - interval '5 minutes',
  now() + interval '2 hours',
  60,
  'e2000000-0000-4000-8000-000000000001'
);

insert into public.ielts_exam_forms (
  id,
  exam_event_id,
  form_code,
  reading_payload,
  listening_payload,
  writing_payload,
  speaking_payload,
  answer_key,
  is_active
)
values (
  'e6000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'IELTS-LIFECYCLE-A',
  '{"questions":[{"id":"r1","prompt":"Fixture reading question"}]}'::jsonb,
  '{"questions":[{"id":"l1","prompt":"Fixture listening question"}]}'::jsonb,
  '{"questions":[{"id":"w1","prompt":"Fixture writing question"}]}'::jsonb,
  null,
  '{"r1":"fixture answer"}'::jsonb,
  true
);

insert into public.ielts_exam_assignments (
  id,
  exam_event_id,
  student_id,
  school_id,
  class_id,
  form_id,
  status
)
values (
  'e7000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000001',
  'assigned'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Reaching starts_at is insufficient: scheduled content and attempt start both
-- remain blocked until an administrator explicitly launches the event.
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  not (public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  'scheduled event must not be available to its assigned student'
);
select pg_temp.assert_true(
  public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'form_public_payload' = 'null'::jsonb,
  'scheduled event must not expose form content'
);
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'drafts') = 0,
  'scheduled event must not expose drafts'
);
select pg_temp.assert_raises(
  $sql$select public.rpc_ielts_start_attempt('e7000000-0000-4000-8000-000000000001')$sql$,
  'exam_not_startable',
  'scheduled event must deny attempt start'
);

-- A student in another school must receive neither the assignment nor event
-- metadata, and cannot start the known assignment UUID.
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true(
  not (public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001') ? 'exam_event_id'),
  'cross-school whoami must not expose the event identifier'
);
select pg_temp.assert_true(
  public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->>'reason' = 'not_assigned',
  'cross-school whoami must fail as not assigned'
);
select pg_temp.assert_raises(
  $sql$select public.rpc_ielts_start_attempt('e7000000-0000-4000-8000-000000000001')$sql$,
  'forbidden',
  'cross-school student must not start another student assignment'
);

-- Explicit school-admin launch makes the event and first attempt available.
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true(
  public.rpc_ielts_launch_exam(
    'e5000000-0000-4000-8000-000000000001',
    'LAUNCH',
    'Rollback-only lifecycle verification'
  )->>'status' = 'live',
  'confirmed launch must move a ready scheduled event to live'
);

select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  (public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  'launched event must be available to the exact assigned student'
);
select pg_temp.assert_true(
  public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'form_public_payload'->>'id'
    = 'e6000000-0000-4000-8000-000000000001',
  'live whoami must return only the assigned active form'
);
select pg_temp.assert_true(
  public.rpc_ielts_start_attempt('e7000000-0000-4000-8000-000000000001')->>'status' = 'in_progress',
  'live event must allow the exact assigned student to start'
);

-- An active assigned teacher may use emergency controls. Leaving the stale
-- class_teacher_assignments row active must not preserve control after the
-- canonical school membership is suspended.
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select pg_temp.assert_true(
  public.rpc_ielts_pause_exam('e5000000-0000-4000-8000-000000000001', 'Active teacher control check')->>'status' = 'paused',
  'active assigned teacher should retain emergency pause control'
);
select pg_temp.assert_true(
  public.rpc_ielts_resume_exam('e5000000-0000-4000-8000-000000000001', 'Active teacher control check')->>'status' = 'live',
  'active assigned teacher should retain emergency resume control'
);
select pg_temp.assert_true(
  public.rpc_ielts_extend_attempt(
    (
      select a.id
      from public.ielts_exam_attempts a
      where a.assignment_id = 'e7000000-0000-4000-8000-000000000001'
    ),
    90,
    'Approved extended-time fixture'
  )->>'attempt_id' = (
    select a.id::text
    from public.ielts_exam_attempts a
    where a.assignment_id = 'e7000000-0000-4000-8000-000000000001'
  ),
  'active assigned teacher should be able to grant the fixture extension'
);

reset role;
update public.school_members
set status = 'suspended'
where school_id = 'e1000000-0000-4000-8000-000000000001'
  and user_id = 'e2000000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select pg_temp.assert_raises(
  $sql$select public.rpc_ielts_pause_exam('e5000000-0000-4000-8000-000000000001', 'Removed teacher must fail')$sql$,
  'forbidden',
  'removed teacher must not control an exam through a stale active class link'
);

-- A manager-approved extension can outlive the shared event window. Preserve
-- that exact in-progress attempt, its form, drafts, and resume token only until
-- the attempt's own ends_at.
reset role;
select pg_temp.assert_true(
  exists (
    select 1
    from public.ielts_exam_audit_log l
    join public.ielts_exam_attempts a on a.id = l.attempt_id
    where a.assignment_id = 'e7000000-0000-4000-8000-000000000001'
      and l.action = 'extend_attempt'
  ),
  'extended attempt fixture must have a manager/monitor audit record'
);
insert into public.ielts_exam_drafts (
  id,
  attempt_id,
  student_id,
  section,
  payload,
  draft_version
)
select
  'e8000000-0000-4000-8000-000000000001',
  a.id,
  a.student_id,
  'reading',
  '{"r1":"student fixture answer"}'::jsonb,
  1
from public.ielts_exam_attempts a
where a.assignment_id = 'e7000000-0000-4000-8000-000000000001';

update public.ielts_exam_events
set ends_at = now() - interval '1 minute'
where id = 'e5000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  (public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  'unexpired in-progress extension must remain available past the event end'
);
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'drafts') = 1,
  'unexpired in-progress extension must retain its own drafts'
);
select pg_temp.assert_true(
  public.rpc_ielts_start_attempt('e7000000-0000-4000-8000-000000000001')->>'attempt_id'
    = (
      select a.id::text
      from public.ielts_exam_attempts a
      where a.assignment_id = 'e7000000-0000-4000-8000-000000000001'
    ),
  'unexpired extension resume must return the existing attempt without restarting it'
);

-- Once the attempt's own timer expires, neither form content, drafts, nor a
-- resume token may cross the student boundary.
reset role;
update public.ielts_exam_attempts
set ends_at = now() - interval '1 minute'
where assignment_id = 'e7000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  not (public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  'expired attempt must not remain available'
);
select pg_temp.assert_true(
  public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'form_public_payload' = 'null'::jsonb,
  'expired attempt must not expose form content'
);
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'drafts') = 0,
  'expired attempt must not expose drafts'
);
select pg_temp.assert_raises(
  $sql$select public.rpc_ielts_start_attempt('e7000000-0000-4000-8000-000000000001')$sql$,
  'attempt_expired',
  'expired in-progress attempt must not return a resume token'
);

-- Terminal state denies content even if a future timer remains in the row.
reset role;
update public.ielts_exam_attempts
set status = 'submitted',
    ends_at = now() + interval '20 minutes',
    submitted_at = now()
where assignment_id = 'e7000000-0000-4000-8000-000000000001';
update public.ielts_exam_assignments
set status = 'submitted'
where id = 'e7000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  not (public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->>'allowed')::boolean,
  'submitted attempt must not remain available'
);
select pg_temp.assert_true(
  public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'form_public_payload' = 'null'::jsonb,
  'submitted attempt must not expose form content'
);
select pg_temp.assert_true(
  jsonb_array_length(public.rpc_ielts_exam_whoami('e5000000-0000-4000-8000-000000000001')->'drafts') = 0,
  'submitted attempt must not expose drafts'
);
select pg_temp.assert_raises(
  $sql$select public.rpc_ielts_start_attempt('e7000000-0000-4000-8000-000000000001')$sql$,
  'assignment_not_startable',
  'submitted assignment must not return a resume token'
);

rollback;
