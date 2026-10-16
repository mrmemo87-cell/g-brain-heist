-- Fresh checks cannot reuse exposed material or void source evidence.
create or replace function public.rpc_ielts_learning_allocate(p_school uuid,p_student uuid,p_task text,p_source uuid,p_reason text,p_due timestamptz,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare task private.ielts_learning_tasks%rowtype; result uuid; existing private.ielts_learning_allocations%rowtype;
begin
 if not public.can_manage_ielts_practice_school(p_school) or not private.ielts_speaking_student_eligible(p_student)
 or not exists(select 1 from public.school_members where school_id=p_school and user_id=p_student and status='active')
 or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into task from private.ielts_learning_tasks where code=p_task;
 if task.code is null or task.pilot_student<>p_student then raise exception 'pilot_scope_only'; end if;
 if not exists(select 1 from private.ielts_diagnostic_attempt_evidence e join private.ielts_diagnostic_scoring_runs s on s.attempt_id=e.attempt_id
 join public.ielts_exam_attempts a on a.id=e.attempt_id
 where a.status in ('submitted','auto_submitted') and e.attempt_id=p_source and e.student_id=p_student and e.school_id=p_school and s.server_verified)
 then raise exception 'reviewed_source_required'; end if;
 if p_request is null or length(trim(coalesce(p_reason,''))) not between 10 and 1200 or p_due<=now() then raise exception 'assignment_details_required'; end if;
 select * into existing from private.ielts_learning_allocations where request_id=p_request;
 if existing.id is not null then
  if (existing.school_id,existing.student_id,existing.task_code,existing.source_attempt_id,existing.reason,existing.due_at)
   is distinct from (p_school,p_student,p_task,p_source,p_reason,p_due) then raise exception 'request_conflict'; end if;
  return existing.id;
 end if;
 if task.purpose='independent_check' and exists(select 1 from private.ielts_learning_allocations where student_id=p_student and task_code=p_task) then raise exception 'independent_check_already_exposed'; end if;
 insert into private.ielts_learning_allocations(school_id,student_id,task_code,source_attempt_id,reason,teacher_id,request_id,due_at)
 values(p_school,p_student,p_task,p_source,p_reason,auth.uid(),p_request,p_due) returning id into result;
 return result;
end; $$;

revoke all on function public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid) from public,anon;
