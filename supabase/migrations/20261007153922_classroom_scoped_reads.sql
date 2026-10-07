-- Additive read paths: preserve existing clients and all grading/write contracts.
CREATE OR REPLACE FUNCTION public.rpc_get_student_assignment_summaries()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student_id uuid:=auth.uid();
begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED';end if;
 return(select coalesce(jsonb_agg(payload order by status_priority,assigned_at),'[]'::jsonb) from(
 select jsonb_build_object(
 'assignment_id',a.id,'subject_id',a.subject_id,'subject_name',a.subject_name,'topic_name',a.topic_name,'batch',a.batch,'teacher_username',u.username,'assigned_at',a.assigned_at,'due_at',a.due_at,'title',a.title,'instructions',a.instructions,'publish_status',a.publish_status,'close_submissions_after_due',a.close_submissions_after_due,'is_late',(a.due_at is not null and a.due_at<now()),'is_closed',(a.close_submissions_after_due and a.due_at is not null and a.due_at<now()),'student_status',sa.status,
 'question_count',(select count(*) from public.assignment_questions aq where aq.assignment_id=a.id),'questions','[]'::jsonb
 ) as payload,case when sa.status='in_progress' then 0 else 1 end as status_priority,sa.assigned_at
 from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id

 where sa.student_id=v_student_id and sa.status in('pending','in_progress') and a.publish_status in('published','scheduled') and a.assigned_at<=now() and exists(select 1 from public.assignment_questions aq where aq.assignment_id=a.id)
 ) active_assignments);
end $function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_student_assignment_detail(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_student_id uuid:=auth.uid();
begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED';end if;
 return(select coalesce(jsonb_agg(payload order by status_priority,assigned_at),'[]'::jsonb) from(
 select jsonb_build_object(
 'assignment_id',a.id,'subject_id',a.subject_id,'subject_name',a.subject_name,'topic_name',a.topic_name,'batch',a.batch,'teacher_username',u.username,'assigned_at',a.assigned_at,'due_at',a.due_at,'title',a.title,'instructions',a.instructions,'publish_status',a.publish_status,'close_submissions_after_due',a.close_submissions_after_due,'is_late',(a.due_at is not null and a.due_at<now()),'is_closed',(a.close_submissions_after_due and a.due_at is not null and a.due_at<now()),'student_status',sa.status,
 'answered_question_ids',answer_state.ids,
 'resume_answered_count',answer_state.answered_count,
 'resume_correct_count',answer_state.correct_count,
 'resume_pending_review_count',answer_state.pending_count,
 'resume_score',answer_state.score,
 'resume_time_taken_ms',answer_state.time_ms,
 'questions',(select coalesce(jsonb_agg(case when aq.question_snapshot->>'question_type'='short_answer' then aq.question_snapshot-'correct_answer'-'accepted_answers'-'grading_config'-'explanation' else aq.question_snapshot end order by aq.order_index),'[]'::jsonb) from public.assignment_questions aq where aq.assignment_id=a.id)
 ) as payload,case when sa.status='in_progress' then 0 else 1 end as status_priority,sa.assigned_at
 from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id
 cross join lateral (
   select coalesce(jsonb_agg(saa.question_id order by aq.order_index),'[]'::jsonb) ids,
     count(*)::integer answered_count,
     count(*) filter(where saa.is_correct is true)::integer correct_count,
     count(*) filter(where saa.grading_status in ('under_review','reviewing'))::integer pending_count,
     coalesce(sum(case when saa.is_correct is true then coalesce((aq.question_snapshot->>'points')::integer,0) else 0 end),0)::integer score,
     coalesce(sum(saa.time_taken_ms),0)::bigint time_ms
   from public.student_assignment_answers saa
   join public.assignment_questions aq on aq.assignment_id=saa.assignment_id and aq.question_id=saa.question_id
   where saa.assignment_id=a.id and saa.student_id=v_student_id
 ) answer_state

 where a.id=p_assignment_id and sa.student_id=v_student_id and sa.status in('pending','in_progress') and a.publish_status in('published','scheduled') and a.assigned_at<=now() and exists(select 1 from public.assignment_questions aq where aq.assignment_id=a.id)
 ) active_assignments);
end $function$
;


revoke all on function public.rpc_get_student_assignment_summaries() from public, anon;
grant execute on function public.rpc_get_student_assignment_summaries() to authenticated, service_role;
revoke all on function public.rpc_get_student_assignment_detail(uuid) from public, anon;
grant execute on function public.rpc_get_student_assignment_detail(uuid) to authenticated, service_role;
