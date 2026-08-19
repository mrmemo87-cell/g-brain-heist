-- Rebuild historical official Academic Profile evidence after verified-question
-- curriculum coverage repair. The ingestion function is idempotent by source_key.
do $$
declare
  v_result record;
  v_state record;
begin
  for v_result in
    select r.assignment_id, r.student_id, r.completed_at, r.accuracy, r.score
    from public.student_assignment_results r
    where r.completed_at is not null
      and exists (
        select 1
        from public.assignment_questions aq
        join public.questions q on q.id = aq.question_id
        where aq.assignment_id = r.assignment_id
          and q.content_origin = 'brain_heist'
          and q.verification_status = 'verified'
      )
  loop
    perform public.student_learning_ingest_assignment_result(
      v_result.assignment_id,
      v_result.student_id,
      v_result.completed_at,
      v_result.accuracy,
      v_result.score
    );
  end loop;

  for v_state in
    select distinct o.student_id, o.skill_key
    from public.student_learning_observations o
    where o.contributes_to_focus_state
      and nullif(trim(o.skill_key), '') is not null
  loop
    perform public.student_learning_refresh_focus_state(
      v_state.student_id,
      v_state.skill_key
    );
  end loop;
end;
$$;
