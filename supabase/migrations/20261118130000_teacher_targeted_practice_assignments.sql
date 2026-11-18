-- Teacher portal: identify one-student targeted practice so it can be shown
-- apart from class assignments.
--
-- Targeted practice is created from a learning intervention and recorded in
-- student_learning_intervention_practice_assignments. The teacher portal used
-- to guess it from the assignment title. This read-only RPC returns the
-- authoritative link for the calling teacher's own assignments only.
create or replace function public.rpc_teacher_targeted_practice_assignments()
returns jsonb
language sql stable security definer set search_path=''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id',p.assignment_id,
    'intervention_id',p.intervention_id,
    'student_id',p.student_id,
    'student_name',coalesce(nullif(trim(u.full_name),''),u.username,'Student'),
    'diagnostic_targets',coalesce(to_jsonb(p.diagnostic_targets),'[]'::jsonb)
  ) order by p.created_at desc,p.assignment_id),'[]'::jsonb)
  from public.teachers t
  join public.assignments a
    on a.teacher_id=t.id
  join public.student_learning_intervention_practice_assignments p
    on p.assignment_id=a.id
   and p.school_id=a.school_id
  join public.users u
    on u.id=p.student_id
  where t.user_id=auth.uid();
$function$;

revoke all on function public.rpc_teacher_targeted_practice_assignments()
  from public,anon;
grant execute on function public.rpc_teacher_targeted_practice_assignments()
  to authenticated,service_role;
