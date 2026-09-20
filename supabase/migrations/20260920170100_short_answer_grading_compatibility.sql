-- Compatibility hardening for all existing question creation paths.
-- Teacher/PDF imports do not need to know about the new columns immediately:
-- the database derives a safe one-answer marking scheme from correct_answer.

create or replace function private.initialize_question_grading_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.question_type = 'short_answer' then
    if cardinality(coalesce(new.accepted_answers, '{}'::text[])) = 0
       and nullif(trim(new.correct_answer), '') is not null then
      new.accepted_answers := array[new.correct_answer];
    end if;
    if coalesce(nullif(trim(new.grading_mode), ''), 'exact') = 'exact' then
      new.grading_mode := 'accepted_answers';
    end if;
  else
    if cardinality(coalesce(new.accepted_answers, '{}'::text[])) = 0
       and nullif(trim(new.correct_answer), '') is not null then
      new.accepted_answers := array[new.correct_answer];
    end if;
    new.grading_mode := 'exact';
  end if;
  new.grading_config := coalesce(new.grading_config, '{}'::jsonb);
  return new;
end;
$$;

revoke all on function private.initialize_question_grading_metadata()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_01_initialize_question_grading_metadata on public.questions;
create trigger trg_01_initialize_question_grading_metadata
before insert or update of question_type, correct_answer, accepted_answers, grading_mode, grading_config
on public.questions
for each row execute function private.initialize_question_grading_metadata();

-- Correct the service-only review application RPC to select the answer row as
-- one composite value. The function stays idempotent and recalculates a result
-- only after a semantic decision is persisted.
create or replace function public.rpc_apply_short_answer_review(
  p_answer_id uuid,
  p_is_correct boolean,
  p_confidence numeric,
  p_model text,
  p_rationale text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer public.student_assignment_answers%rowtype;
  v_snapshot jsonb;
begin
  select saa, aq.question_snapshot
  into v_answer, v_snapshot
  from public.student_assignment_answers saa
  join public.assignment_questions aq
    on aq.assignment_id = saa.assignment_id
   and aq.question_id = saa.question_id
  where saa.id = p_answer_id
    and saa.grading_status in ('under_review', 'reviewing')
  for update of saa;

  if v_answer.id is null then
    return jsonb_build_object('success', true, 'already_resolved', true);
  end if;
  if coalesce(v_snapshot->>'question_type', '') <> 'short_answer' then
    raise exception 'SHORT_ANSWER_REVIEW_ONLY';
  end if;

  update public.student_assignment_answers
  set is_correct = p_is_correct,
      grading_status = 'graded',
      grading_source = 'ai',
      grading_confidence = greatest(0, least(coalesce(p_confidence, 0), 1)),
      reviewed_at = now(),
      ai_review_model = left(coalesce(p_model, 'unknown'), 120),
      ai_review_rationale = left(coalesce(p_rationale, ''), 2000),
      review_error = null
  where id = v_answer.id;

  perform private.recalculate_assignment_result_after_review(v_answer.assignment_id, v_answer.student_id);

  return jsonb_build_object(
    'success', true,
    'already_resolved', false,
    'is_correct', p_is_correct
  );
end;
$$;

revoke all on function public.rpc_apply_short_answer_review(uuid,boolean,numeric,text,text)
  from public, anon, authenticated;
grant execute on function public.rpc_apply_short_answer_review(uuid,boolean,numeric,text,text)
  to service_role;
