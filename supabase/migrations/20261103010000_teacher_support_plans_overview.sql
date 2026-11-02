-- Teacher "Today" overview for the intervention loop.
--
-- Read-only. Lists the support plans the signed-in teacher created that are still open,
-- plus plans completed in the last 14 days, so the Follow-ups page can say
-- "2 plans have results" without the teacher opening every student.
-- Every row is re-checked with student_learning_can_manage_intervention, so a teacher who
-- has lost access to a student (roster change, subject change) no longer sees that plan.
-- practised_question_ids lists every question already used in targeted practice for the same
-- student and skill, so a later independent quick check can avoid rehearsed items.
-- Nothing here changes evidence, plan state, or the academic profile.

create or replace function public.rpc_teacher_support_plans_overview()
returns table (
  intervention_id uuid,
  student_id uuid,
  student_name text,
  subject text,
  skill text,
  status text,
  approval_status text,
  started_at timestamptz,
  completed_at timestamptz,
  target_date date,
  baseline_evidence_items integer,
  target_min_followup_observations integer,
  target_min_successful_observations integer,
  follow_up_qualifying_observations integer,
  follow_up_successful_observations integer,
  system_outcome_status text,
  outcome_status text,
  skill_key text,
  practised_question_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         i.student_id,
         coalesce(nullif(u.full_name, ''), u.username) as student_name,
         i.subject,
         i.skill,
         i.status,
         i.approval_status,
         i.started_at,
         i.completed_at,
         i.target_date,
         i.baseline_evidence_items,
         i.target_min_followup_observations,
         i.target_min_successful_observations,
         coalesce(i.follow_up_qualifying_observations, 0),
         coalesce(i.follow_up_successful_observations, 0),
         i.system_outcome_status,
         i.outcome_status,
         i.skill_key,
         coalesce((
           select array_agg(distinct aq.question_id)
           from public.student_learning_intervention_practice_assignments p
           join public.assignment_questions aq on aq.assignment_id = p.assignment_id
           where p.student_id = i.student_id
             and p.skill_key = i.skill_key
         ), '{}'::uuid[])
  from public.student_learning_interventions i
  join public.users u on u.id = i.student_id
  where i.created_by = auth.uid()
    and (
      i.status in ('planned', 'active')
      or (i.status = 'completed' and i.completed_at >= now() - interval '14 days')
    )
    and public.student_learning_can_manage_intervention(i.student_id, i.subject)
  order by case i.status when 'active' then 0 when 'planned' then 1 else 2 end,
           coalesce(i.completed_at, i.started_at, i.created_at) desc
  limit 200;
$$;

revoke all on function public.rpc_teacher_support_plans_overview() from public, anon;
grant execute on function public.rpc_teacher_support_plans_overview() to authenticated, service_role;
