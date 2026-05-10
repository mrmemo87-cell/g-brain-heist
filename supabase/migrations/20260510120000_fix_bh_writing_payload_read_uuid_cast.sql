-- Prevent malformed legacy Writing Hub payload identifiers from breaking student history reads.
-- Some older bh_writing_* payload rows can contain non-UUID values in student_id/user_id.
-- The previous read policies cast coalesce(payload->>'student_id', payload->>'user_id')::uuid
-- unconditionally for teacher/school access, so one malformed row could raise a Postgres
-- cast error during RLS evaluation and make the student archive request fail.

create or replace function public.bh_writing_payload_student_uuid(p_payload jsonb)
returns uuid
language sql
immutable
as $$
  select case
    when p_payload->>'student_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (p_payload->>'student_id')::uuid
    when p_payload->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (p_payload->>'user_id')::uuid
    else null
  end;
$$;

comment on function public.bh_writing_payload_student_uuid(jsonb)
  is 'Safely extracts a UUID student identifier from legacy BH writing JSON payloads without throwing on email/username identifiers.';

-- Ensure payload-table reads are safe for legacy non-UUID identifiers while preserving
-- direct student self-access and roster-scoped staff access for UUID-backed payloads.
drop policy if exists "bh writing attempts read" on public.bh_writing_attempts;
create policy "bh writing attempts read" on public.bh_writing_attempts
for select
using (
  payload->>'student_id' = auth.uid()::text
  or payload->>'user_id' = auth.uid()::text
  or public.can_access_bh_writing_student(public.bh_writing_payload_student_uuid(payload))
);

drop policy if exists "bh writing weekly plans read" on public.bh_writing_weekly_plans;
create policy "bh writing weekly plans read" on public.bh_writing_weekly_plans
for select
using (
  payload->>'student_id' = auth.uid()::text
  or payload->>'user_id' = auth.uid()::text
  or public.can_access_bh_writing_student(public.bh_writing_payload_student_uuid(payload))
);

drop policy if exists "bh writing daily tasks read" on public.bh_writing_daily_tasks;
create policy "bh writing daily tasks read" on public.bh_writing_daily_tasks
for select
using (
  payload->>'student_id' = auth.uid()::text
  or payload->>'user_id' = auth.uid()::text
  or public.can_access_bh_writing_student(public.bh_writing_payload_student_uuid(payload))
);

drop policy if exists "bh writing submissions read" on public.bh_writing_daily_submissions;
create policy "bh writing submissions read" on public.bh_writing_daily_submissions
for select
using (
  payload->>'student_id' = auth.uid()::text
  or payload->>'user_id' = auth.uid()::text
  or public.can_access_bh_writing_student(public.bh_writing_payload_student_uuid(payload))
);

drop policy if exists "bh writing evaluations read" on public.bh_writing_daily_evaluations;
create policy "bh writing evaluations read" on public.bh_writing_daily_evaluations
for select
using (
  payload->>'student_id' = auth.uid()::text
  or payload->>'user_id' = auth.uid()::text
  or public.can_access_bh_writing_student(public.bh_writing_payload_student_uuid(payload))
);

drop policy if exists "bh writing monthly reports read" on public.bh_writing_monthly_reports;
create policy "bh writing monthly reports read" on public.bh_writing_monthly_reports
for select
using (
  payload->>'student_id' = auth.uid()::text
  or payload->>'user_id' = auth.uid()::text
  or public.can_access_bh_writing_student(public.bh_writing_payload_student_uuid(payload))
);

drop policy if exists "bh writing memory read" on public.bh_writing_memory_snapshots;
create policy "bh writing memory read" on public.bh_writing_memory_snapshots
for select
using (
  payload->>'student_id' = auth.uid()::text
  or payload->>'user_id' = auth.uid()::text
  or public.can_access_bh_writing_student(public.bh_writing_payload_student_uuid(payload))
);
