-- Review detail names the student and class (teacher Speaking/Writing review header).

-- 3. Review detail names the student and class -------------------------------------------------------------------
create or replace function public.rpc_ielts_review_detail(p_skill text, p_attempt_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_payload jsonb;
  v_student_id uuid;
  v_school_id uuid;
  v_class_id uuid;
  v_review public.ielts_productive_skill_reviews%rowtype;
  v_for_student boolean := false;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;
  if p_skill not in ('writing', 'speaking') then raise exception 'invalid_skill'; end if;

  v_payload := public.ielts_review_attempt_payload(p_skill, p_attempt_id, false);
  v_student_id := nullif(v_payload->>'student_id', '')::uuid;
  if v_student_id is null then raise exception 'submission_not_found'; end if;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  select cs.class_id into v_class_id from public.class_students cs join public.classes c on c.id = cs.class_id and c.school_id = v_school_id where cs.student_id = v_student_id limit 1;

  v_for_student := (v_actor_id = v_student_id);
  if not v_for_student and not public.can_review_ielts_productive_submission(v_school_id, v_class_id, v_student_id) then
    raise exception 'forbidden';
  end if;

  perform public.ielts_productive_review_seed(p_skill, p_attempt_id, v_student_id, v_school_id);
  select * into v_review from public.ielts_productive_skill_reviews where attempt_type = p_skill and attempt_id = p_attempt_id;

  if v_for_student then
    v_payload := public.ielts_review_attempt_payload(p_skill, p_attempt_id, true);
  end if;

  return v_payload || jsonb_build_object(
    'review_id', v_review.id,
    'review_status', v_review.review_status,
    'rubric', v_review.rubric,
    'overall_band', v_review.overall_band,
    'strengths', v_review.strengths,
    'improvements', v_review.improvements,
    'next_steps', v_review.next_steps,
    'teacher_feedback', v_review.teacher_feedback,
    'private_notes', case when v_for_student then null else v_review.private_notes end,
    'reviewed_by', v_review.reviewed_by,
    'reviewed_at', v_review.reviewed_at,
    'student_name', (select coalesce(nullif(u.full_name, ''), u.username) from public.users u where u.id = v_student_id),
    'class_name', (select c.class_name from public.classes c where c.id = v_class_id)
  );
end;
$function$;
revoke all on function public.rpc_ielts_review_detail(text,text) from public, anon;
grant execute on function public.rpc_ielts_review_detail(text,text) to authenticated;
