-- Classroom preventive hardening, 15 October 2026.
-- Incremental change: do not increase evidence worker concurrency.
-- One job per worker invocation, with a global advisory lock and retry backoff
-- already supplied by 20261015150000_classroom_async_evidence_and_incident_repairs.sql.
-- pg_cron supports second-level intervals on this Postgres 17 Supabase instance.
select cron.schedule(
 'brains-heist-assignment-evidence-worker','10 seconds',
 $cron$set lock_timeout='2s';
set statement_timeout='120s';
select private.process_one_verified_assignment_evidence();$cron$
);

-- RLS dependency fix: internal teacher/group tables remain PRIVATE.
-- Reuse exact self-scoped helper from the previous verified migration. Do not
-- grant SELECT to authenticated on school_subject_group_teachers.
alter policy saa_teacher_group_select on public.student_assignment_answers
 using (exists (
   select 1 from public.assignments a
    where a.id=student_assignment_answers.assignment_id
      and a.subject_group_id is not null
      and public.can_access_assigned_school_subject_group(
        a.school_id,a.subject_group_id,a.academic_year_id,false)
 ));
alter policy sar_teacher_group_select on public.student_assignment_results
 using (exists (
   select 1 from public.assignments a
    where a.id=student_assignment_results.assignment_id
      and a.subject_group_id is not null
      and public.can_access_assigned_school_subject_group(
        a.school_id,a.subject_group_id,a.academic_year_id,false)
 ));

-- Per-row auth() calls in high-traffic student-owned policies are invariant
-- over a SQL statement, so use initPlan form without changing row scoping.
alter policy "Students view own answers" on public.student_assignment_answers
 using (student_id=(select auth.uid()));
alter policy saa_student_self on public.student_assignment_answers
 using (student_id=(select auth.uid()));
alter policy "Students insert own answers" on public.student_assignment_answers
 with check (student_id=(select auth.uid()));
alter policy "Students can view their own attempts" on public.question_attempts
 using (student_id=(select auth.uid()));
alter policy "Students can insert their own attempts" on public.question_attempts
 with check (student_id=(select auth.uid()));
alter policy question_attempts_student_own on public.question_attempts
 using ((select auth.uid())=student_id);

-- Legacy email claims: old failures cannot be reclaimed without limit after
-- a stale processing recovery. Delivery worker already caps normal failures
-- at 5; enforce the same maximum in the DB claim path.
create or replace function public.rpc_claim_assignment_email_notifications(p_limit integer default 30)
returns setof public.assignment_email_notifications
language sql security definer set search_path = '' as $function$
  with exhausted as (
    update public.assignment_email_notifications q
      set status='failed', delivery_status='failed',
          updated_at=now(),
          last_error=coalesce(nullif(q.last_error,''),'Retry limit reached (5 attempts)')
    where q.status='pending' and q.attempts>=5
    returning q.id
  ), claimed as (
    select q.id from public.assignment_email_notifications q
    where q.status='pending' and q.attempts<5
      and q.available_at<=now()
      and coalesce(q.next_attempt_at,q.available_at)<=now()
    order by q.available_at,q.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,30),100))
  )
  update public.assignment_email_notifications q
    set status='processing',attempts=q.attempts+1,updated_at=now()
  from claimed c where q.id=c.id
  returning q.*;
$function$;
revoke all on function public.rpc_claim_assignment_email_notifications(integer)
 from public,anon,authenticated;
grant execute on function public.rpc_claim_assignment_email_notifications(integer)
 to service_role;

-- Avoid duplicating identical indexes on small, frequently updated tables.
-- Verified against live pg_indexes and Supabase's duplicate index advisor.
drop index if exists public.assignment_email_notifications_dispatch_idx;
drop index if exists public.idx_student_results_assignment;
drop index if exists public.idx_question_attempts_student_id;

-- All five changes above are reversible without touching student answers or
-- materialized academic evidence. No changes to score calculations.
