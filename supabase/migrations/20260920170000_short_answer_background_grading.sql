-- Short-answer grading: deterministic accepted answers first, semantic review only when needed.
--
-- Design goals:
--   * existing MCQ / true-false grading remains synchronous and authoritative;
--   * short answers may carry multiple accepted answers in the question snapshot;
--   * unmatched non-empty short answers are persisted as under_review, never as wrong;
--   * assignment submission never waits for semantic review;
--   * completed results are recalculated silently when AI review resolves;
--   * browser-supplied correctness and answer keys remain non-authoritative.

alter table public.questions
  add column if not exists accepted_answers text[] not null default '{}'::text[],
  add column if not exists grading_mode text not null default 'exact',
  add column if not exists grading_config jsonb not null default '{}'::jsonb;

update public.questions
set accepted_answers = array[correct_answer]
where cardinality(accepted_answers) = 0
  and nullif(trim(correct_answer), '') is not null;

update public.questions
set grading_mode = case
  when question_type = 'short_answer' then 'accepted_answers'
  else 'exact'
end
where grading_mode = 'exact';

alter table public.questions
  drop constraint if exists questions_grading_mode_check,
  add constraint questions_grading_mode_check
    check (grading_mode in ('exact', 'accepted_answers', 'semantic_review')),
  drop constraint if exists questions_short_answer_grading_check,
  add constraint questions_short_answer_grading_check check (
    question_type <> 'short_answer'
    or (
      cardinality(accepted_answers) > 0
      and grading_mode in ('accepted_answers', 'semantic_review')
    )
  );

alter table public.student_assignment_answers
  alter column is_correct drop not null,
  add column if not exists grading_status text not null default 'graded',
  add column if not exists grading_source text not null default 'deterministic',
  add column if not exists grading_confidence numeric(5,4),
  add column if not exists review_started_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists ai_review_model text,
  add column if not exists ai_review_rationale text,
  add column if not exists review_error text;

alter table public.student_assignment_answers
  drop constraint if exists student_assignment_answers_grading_status_check,
  add constraint student_assignment_answers_grading_status_check
    check (grading_status in ('graded', 'under_review', 'reviewing')),
  drop constraint if exists student_assignment_answers_grading_source_check,
  add constraint student_assignment_answers_grading_source_check
    check (grading_source in ('deterministic', 'ai', 'teacher')),
  drop constraint if exists student_assignment_answers_grading_consistency_check,
  add constraint student_assignment_answers_grading_consistency_check check (
    (grading_status = 'graded' and is_correct is not null)
    or (grading_status in ('under_review', 'reviewing') and is_correct is null)
  );

create index if not exists student_assignment_answers_pending_review_idx
  on public.student_assignment_answers(student_id, assignment_id, answered_at)
  where grading_status in ('under_review', 'reviewing');

alter table public.student_assignment_results
  add column if not exists pending_review_count integer not null default 0,
  add column if not exists grading_status text not null default 'final';

alter table public.student_assignment_results
  drop constraint if exists student_assignment_results_pending_review_count_check,
  add constraint student_assignment_results_pending_review_count_check
    check (pending_review_count >= 0),
  drop constraint if exists student_assignment_results_grading_status_check,
  add constraint student_assignment_results_grading_status_check
    check (grading_status in ('final', 'pending_review'));

create or replace function private.normalize_assignment_answer(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        trim(
          translate(
            translate(p_value,
              '₀₁₂₃₄₅₆₇₈₉',
              '0123456789'
            ),
            '“”‘’–—',
            '""''---'
          )
        ),
        '[.!?,;:]+$',
        '',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function private.normalize_assignment_answer(text)
  from public, anon, authenticated;

create or replace function public.rpc_submit_assignment_answer_v2(
  p_assignment_id uuid,
  p_question_id uuid,
  p_question_text text,
  p_correct_answer text,
  p_student_answer text,
  p_is_correct boolean,
  p_time_taken_ms integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_snapshot jsonb;
  v_status text;
  v_due_at timestamptz;
  v_close boolean;
  v_question_type text;
  v_grading_mode text;
  v_is_correct boolean;
  v_grading_status text := 'graded';
  v_normalized_student text;
  v_normalized_answer text;
  v_accepted_answers jsonb;
  v_answer text;
begin
  if v_student is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select aq.question_snapshot, sa.status, a.due_at, a.close_submissions_after_due
  into v_snapshot, v_status, v_due_at, v_close
  from public.assignment_questions aq
  join public.assignments a on a.id = aq.assignment_id
  join public.student_assignments sa
    on sa.assignment_id = a.id
   and sa.student_id = v_student
  where aq.assignment_id = p_assignment_id
    and aq.question_id = p_question_id;

  if not found then raise exception 'QUESTION_NOT_IN_ASSIGNED_ASSIGNMENT'; end if;
  if v_status not in ('pending', 'in_progress') then raise exception 'ASSIGNMENT_NOT_SUBMITTABLE'; end if;
  if v_close and v_due_at is not null and now() > v_due_at then raise exception 'ASSIGNMENT_CLOSED'; end if;
  if nullif(trim(v_snapshot->>'correct_answer'), '') is null then raise exception 'ASSIGNMENT_ANSWER_KEY_MISSING'; end if;

  v_question_type := coalesce(nullif(trim(v_snapshot->>'question_type'), ''), 'multiple_choice');
  v_grading_mode := coalesce(nullif(trim(v_snapshot->>'grading_mode'), ''),
    case when v_question_type = 'short_answer' then 'accepted_answers' else 'exact' end);
  v_normalized_student := private.normalize_assignment_answer(coalesce(p_student_answer, ''));

  if v_normalized_student = '' then
    v_is_correct := false;
  elsif v_question_type = 'short_answer' then
    v_accepted_answers := case
      when jsonb_typeof(v_snapshot->'accepted_answers') = 'array'
        and jsonb_array_length(v_snapshot->'accepted_answers') > 0
      then v_snapshot->'accepted_answers'
      else jsonb_build_array(v_snapshot->>'correct_answer')
    end;

    v_is_correct := false;
    for v_answer in
      select value from jsonb_array_elements_text(v_accepted_answers) accepted(value)
      union
      select v_snapshot->>'correct_answer'
    loop
      v_normalized_answer := private.normalize_assignment_answer(coalesce(v_answer, ''));
      if v_normalized_answer <> '' and v_normalized_student = v_normalized_answer then
        v_is_correct := true;
        exit;
      end if;
    end loop;

    if not v_is_correct then
      -- A non-empty short answer that misses the deterministic accepted-answer
      -- set is not automatically wrong. It is queued for semantic review.
      v_is_correct := null;
      v_grading_status := 'under_review';
    end if;
  else
    v_normalized_answer := private.normalize_assignment_answer(v_snapshot->>'correct_answer');
    v_is_correct := v_normalized_student = v_normalized_answer;
  end if;

  insert into public.student_assignment_answers (
    assignment_id, student_id, question_id, question_text, correct_answer,
    student_answer, is_correct, time_taken_ms, answered_at,
    grading_status, grading_source, grading_confidence,
    review_started_at, reviewed_at, ai_review_model, ai_review_rationale, review_error
  ) values (
    p_assignment_id, v_student, p_question_id, v_snapshot->>'question_text',
    v_snapshot->>'correct_answer', coalesce(p_student_answer, ''), v_is_correct,
    greatest(0, least(coalesce(p_time_taken_ms, 0), 3600000)), now(),
    v_grading_status, 'deterministic', case when v_grading_status = 'graded' then 1 else null end,
    null, case when v_grading_status = 'graded' then now() else null end,
    null, null, null
  ) on conflict (assignment_id, student_id, question_id) do update set
    question_text = excluded.question_text,
    correct_answer = excluded.correct_answer,
    student_answer = excluded.student_answer,
    is_correct = excluded.is_correct,
    time_taken_ms = excluded.time_taken_ms,
    answered_at = excluded.answered_at,
    grading_status = excluded.grading_status,
    grading_source = excluded.grading_source,
    grading_confidence = excluded.grading_confidence,
    review_started_at = null,
    reviewed_at = excluded.reviewed_at,
    ai_review_model = null,
    ai_review_rationale = null,
    review_error = null;

  update public.student_assignments
  set status = 'in_progress'
  where assignment_id = p_assignment_id
    and student_id = v_student
    and status = 'pending';

  return jsonb_build_object(
    'success', true,
    'is_correct', v_is_correct,
    'grading_status', v_grading_status,
    'pending_review', v_grading_status = 'under_review',
    'question_type', v_question_type,
    'grading_mode', v_grading_mode
  );
end;
$$;

revoke all on function public.rpc_submit_assignment_answer_v2(uuid,uuid,text,text,text,boolean,integer)
  from public, anon;
grant execute on function public.rpc_submit_assignment_answer_v2(uuid,uuid,text,text,text,boolean,integer)
  to authenticated, service_role;

create or replace function private.recalculate_assignment_result_after_review(
  p_assignment_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correct integer;
  v_incorrect integer;
  v_pending integer;
  v_score integer;
  v_accuracy integer;
begin
  if not exists (
    select 1 from public.student_assignment_results r
    where r.assignment_id = p_assignment_id
      and r.student_id = p_student_id
  ) then
    return;
  end if;

  select
    count(*) filter (where saa.grading_status = 'graded' and saa.is_correct is true)::integer,
    count(*) filter (where saa.grading_status = 'graded' and saa.is_correct is false)::integer,
    count(*) filter (where saa.grading_status in ('under_review', 'reviewing'))::integer,
    coalesce(sum(case
      when saa.grading_status = 'graded' and saa.is_correct is true
      then coalesce((aq.question_snapshot->>'points')::integer, 0)
      else 0
    end), 0)::integer
  into v_correct, v_incorrect, v_pending, v_score
  from public.assignment_questions aq
  left join public.student_assignment_answers saa
    on saa.assignment_id = aq.assignment_id
   and saa.question_id = aq.question_id
   and saa.student_id = p_student_id
  where aq.assignment_id = p_assignment_id;

  v_accuracy := case
    when v_correct + v_incorrect = 0 then 0
    else round((v_correct::numeric * 100.0) / (v_correct + v_incorrect))::integer
  end;

  update public.student_assignment_results
  set correct = v_correct,
      incorrect = v_incorrect,
      accuracy = v_accuracy,
      score = v_score,
      pending_review_count = v_pending,
      grading_status = case when v_pending > 0 then 'pending_review' else 'final' end
  where assignment_id = p_assignment_id
    and student_id = p_student_id;
end;
$$;

revoke all on function private.recalculate_assignment_result_after_review(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.rpc_submit_assignment_result_v2(
  p_assignment_id uuid,
  p_correct integer,
  p_incorrect integer,
  p_accuracy integer,
  p_score integer,
  p_time_taken integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_assignment_status text;
  v_question_count integer;
  v_answered_count integer;
  v_server_correct integer;
  v_server_incorrect integer;
  v_pending integer;
  v_server_accuracy integer;
  v_server_score integer;
  v_updated_assignment_id uuid;
  v_due_at timestamptz;
  v_close boolean;
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select sa.status, count(aq.question_id)::integer, a.due_at, a.close_submissions_after_due
  into v_assignment_status, v_question_count, v_due_at, v_close
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id = a.id
   and sa.student_id = v_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by sa.status, a.due_at, a.close_submissions_after_due;

  if not found then raise exception 'ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED'; end if;
  if v_close and v_due_at is not null and now() > v_due_at then raise exception 'ASSIGNMENT_CLOSED'; end if;
  if v_question_count <= 0 then raise exception 'ASSIGNMENT_HAS_NO_QUESTIONS'; end if;
  if v_assignment_status not in ('pending', 'in_progress') then raise exception 'ASSIGNMENT_NOT_SUBMITTABLE'; end if;
  if exists (
    select 1 from public.student_assignment_results r
    where r.assignment_id = p_assignment_id
      and r.student_id = v_student_id
  ) then raise exception 'ASSIGNMENT_ALREADY_SUBMITTED'; end if;
  if p_time_taken < 0 then raise exception 'INVALID_VALUES'; end if;

  select
    count(saa.question_id)::integer,
    count(*) filter (where saa.grading_status = 'graded' and saa.is_correct is true)::integer,
    count(*) filter (where saa.grading_status = 'graded' and saa.is_correct is false)::integer,
    count(*) filter (where saa.grading_status in ('under_review', 'reviewing'))::integer,
    coalesce(sum(case
      when saa.grading_status = 'graded' and saa.is_correct is true
      then coalesce((aq.question_snapshot->>'points')::integer, 0)
      else 0
    end), 0)::integer
  into v_answered_count, v_server_correct, v_server_incorrect, v_pending, v_server_score
  from public.assignment_questions aq
  left join public.student_assignment_answers saa
    on saa.assignment_id = aq.assignment_id
   and saa.question_id = aq.question_id
   and saa.student_id = v_student_id
  where aq.assignment_id = p_assignment_id;

  if v_answered_count <> v_question_count then raise exception 'MISMATCHED_QUESTION_TOTAL'; end if;
  if v_server_correct + v_server_incorrect + v_pending <> v_question_count then
    raise exception 'INVALID_GRADING_STATE';
  end if;

  v_server_accuracy := case
    when v_server_correct + v_server_incorrect = 0 then 0
    else round((v_server_correct::numeric * 100.0) / (v_server_correct + v_server_incorrect))::integer
  end;

  update public.student_assignments
  set status = 'completed', completed_at = now()
  where assignment_id = p_assignment_id
    and student_id = v_student_id
    and status in ('pending', 'in_progress')
  returning assignment_id into v_updated_assignment_id;

  if v_updated_assignment_id is null then raise exception 'ASSIGNMENT_STATE_TRANSITION_FAILED'; end if;

  insert into public.student_assignment_results (
    assignment_id, student_id, correct, incorrect, accuracy, score,
    time_taken_seconds, completed_at, submitted_late,
    pending_review_count, grading_status
  ) values (
    p_assignment_id, v_student_id, v_server_correct, v_server_incorrect,
    v_server_accuracy, v_server_score, greatest(p_time_taken, 0), now(),
    v_due_at is not null and now() > v_due_at,
    v_pending, case when v_pending > 0 then 'pending_review' else 'final' end
  );

  return jsonb_build_object(
    'success', true,
    'correct', v_server_correct,
    'incorrect', v_server_incorrect,
    'pending_review_count', v_pending,
    'confirmed_question_count', v_server_correct + v_server_incorrect,
    'accuracy', v_server_accuracy,
    'score', v_server_score,
    'grading_status', case when v_pending > 0 then 'pending_review' else 'final' end
  );
end;
$$;

revoke all on function public.rpc_submit_assignment_result_v2(uuid,integer,integer,integer,integer,integer)
  from public, anon;
grant execute on function public.rpc_submit_assignment_result_v2(uuid,integer,integer,integer,integer,integer)
  to authenticated, service_role;

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
  select saa.*, aq.question_snapshot
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

-- Keep the legacy completed-answer RPC safe now that an assignment can be
-- completed while one or more answers are still under review. Never reveal an
-- answer key or correctness while semantic grading is pending.
create or replace function public.rpc_get_my_assignment_answers(p_assignment_id uuid)
returns table(
  question_id uuid,
  question_text text,
  correct_answer text,
  student_answer text,
  is_correct boolean,
  time_taken_ms integer,
  answered_at timestamptz,
  explanation text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.student_assignments sa
    where sa.assignment_id = p_assignment_id
      and sa.student_id = v_student_id
      and sa.status = 'completed'
  ) then raise exception 'Assignment not completed or not assigned to you'; end if;

  return query
  select
    saa.question_id,
    saa.question_text,
    case when saa.grading_status = 'graded' then saa.correct_answer else '' end,
    saa.student_answer,
    saa.is_correct,
    saa.time_taken_ms,
    saa.answered_at,
    case when saa.grading_status = 'graded' then q.explanation else null end
  from public.student_assignment_answers saa
  left join public.questions q on q.id = saa.question_id
  where saa.assignment_id = p_assignment_id
    and saa.student_id = v_student_id
  order by saa.answered_at;
end;
$$;

revoke all on function public.rpc_get_my_assignment_answers(uuid) from public, anon;
grant execute on function public.rpc_get_my_assignment_answers(uuid) to authenticated, service_role;

create or replace function public.rpc_get_my_assignment_answers_v2(p_assignment_id uuid)
returns table(
  question_id uuid,
  question_text text,
  correct_answer text,
  student_answer text,
  is_correct boolean,
  grading_status text,
  grading_source text,
  grading_confidence numeric,
  time_taken_ms integer,
  answered_at timestamptz,
  explanation text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from public.student_assignments sa
    where sa.assignment_id = p_assignment_id
      and sa.student_id = v_student_id
      and sa.status = 'completed'
  ) then raise exception 'Assignment not completed or not assigned to you'; end if;

  return query
  select
    saa.question_id,
    saa.question_text,
    case when saa.grading_status = 'graded' then saa.correct_answer else '' end,
    saa.student_answer,
    saa.is_correct,
    saa.grading_status,
    saa.grading_source,
    saa.grading_confidence,
    saa.time_taken_ms,
    saa.answered_at,
    case when saa.grading_status = 'graded' then q.explanation else null end
  from public.student_assignment_answers saa
  left join public.questions q on q.id = saa.question_id
  where saa.assignment_id = p_assignment_id
    and saa.student_id = v_student_id
  order by saa.answered_at;
end;
$$;

revoke all on function public.rpc_get_my_assignment_answers_v2(uuid) from public, anon;
grant execute on function public.rpc_get_my_assignment_answers_v2(uuid) to authenticated, service_role;

create or replace function public.rpc_get_student_completed_assignments_v2()
returns table(
  assignment_id uuid,
  subject_name text,
  topic_name text,
  teacher_name text,
  score integer,
  accuracy integer,
  correct integer,
  incorrect integer,
  pending_review_count integer,
  grading_status text,
  completed_at timestamptz,
  title text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;

  return query
  select
    sar.assignment_id,
    a.subject_name,
    a.topic_name,
    u.username,
    sar.score,
    sar.accuracy,
    sar.correct,
    sar.incorrect,
    sar.pending_review_count,
    sar.grading_status,
    sar.completed_at,
    a.title
  from public.student_assignment_results sar
  join public.assignments a on a.id = sar.assignment_id
  join public.teachers t on t.id = a.teacher_id
  join public.users u on u.id = t.user_id
  where sar.student_id = v_student_id
  order by sar.completed_at desc;
end;
$$;

revoke all on function public.rpc_get_student_completed_assignments_v2() from public, anon;
grant execute on function public.rpc_get_student_completed_assignments_v2() to authenticated, service_role;
