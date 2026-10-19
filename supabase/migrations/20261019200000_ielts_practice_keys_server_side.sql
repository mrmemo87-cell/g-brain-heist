-- Pilot finding 2026-10-19: Reading and Listening practice pages downloaded every question with its answer key and
-- evidence, and the attempt score was computed and saved by the browser. Any signed-in user could also read the keys of
-- every set, including unreleased drafts.
-- Now: students read questions without keys; the database scores each attempt from the real keys (overriding any
-- client score); after submitting, a student reads the keys and evidence for her own attempt only; staff read keys
-- through rpc_ielts_admin_set_questions. Matching mirrors src/lib/ieltsPracticeScoring.ts (trim + lower case; a key is a
-- JSON array of accepted answers, a JSON-array string, or a single value).

create or replace function private.ielts_answer_matches(p_student text, p_correct jsonb) returns boolean
language plpgsql immutable set search_path to '' as $$
declare s text := lower(btrim(coalesce(p_student, ''))); accepted jsonb;
begin
  if s = '' or p_correct is null or jsonb_typeof(p_correct) = 'null' then return false; end if;
  if jsonb_typeof(p_correct) = 'array' then accepted := p_correct;
  elsif jsonb_typeof(p_correct) = 'string' and btrim(p_correct #>> '{}') ~ '^\[.*\]$' then
    begin accepted := (p_correct #>> '{}')::jsonb; exception when others then accepted := jsonb_build_array(p_correct); end;
    if jsonb_typeof(accepted) <> 'array' then accepted := jsonb_build_array(p_correct); end if;
  else accepted := jsonb_build_array(p_correct);
  end if;
  return exists(select 1 from jsonb_array_elements(accepted) a
                where lower(btrim(case when jsonb_typeof(a) = 'string' then a #>> '{}' else a::text end)) = s
                  and btrim(case when jsonb_typeof(a) = 'string' then a #>> '{}' else a::text end) <> '');
end $$;

create or replace function private.ielts_score_objective_attempt() returns trigger
language plpgsql security definer set search_path to '' as $$
declare total int; correct int;
begin
  if tg_table_name = 'ielts_reading_attempts' then
    select count(*), count(*) filter (where private.ielts_answer_matches(new.answers ->> q.id::text, q.correct_answer))
      into total, correct from public.ielts_reading_questions q where q.set_id = new.set_id;
  else
    select count(*), count(*) filter (where private.ielts_answer_matches(new.answers ->> q.id::text, q.correct_answer))
      into total, correct from public.ielts_listening_questions q where q.set_id = new.set_id;
  end if;
  new.raw_score := correct;
  new.total_questions := total;
  new.percent := case when total > 0 then round(correct * 100.0 / total, 2) else 0 end;
  return new;
end $$;

create or replace trigger score_objective_attempt before insert or update of answers on public.ielts_reading_attempts
  for each row execute function private.ielts_score_objective_attempt();
create or replace trigger score_objective_attempt before insert or update of answers on public.ielts_listening_attempts
  for each row execute function private.ielts_score_objective_attempt();

-- The student's own completed attempt, with keys and evidence (shown only after submitting).
create or replace function public.rpc_ielts_practice_attempt_review(p_skill text, p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare a record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_skill = 'reading' then
    select t.id, t.user_id, t.set_id, t.answers, t.raw_score, t.total_questions, t.percent, t.completed_at into a from public.ielts_reading_attempts t where t.id = p_attempt;
  elsif p_skill = 'listening' then
    select t.id, t.user_id, t.set_id, t.answers, t.raw_score, t.total_questions, t.percent, t.completed_at into a from public.ielts_listening_attempts t where t.id = p_attempt;
  else raise exception 'invalid_skill'; end if;
  if a.id is null or a.user_id <> auth.uid() or a.completed_at is null then raise exception 'attempt_not_found'; end if;
  return jsonb_build_object('raw_score', a.raw_score, 'total', a.total_questions, 'percent', a.percent,
    'items', coalesce((select jsonb_agg(jsonb_build_object('question_id', q.id, 'correct_answer', q.correct_answer, 'explanation', q.explanation,
        'is_correct', private.ielts_answer_matches(a.answers ->> q.id::text, q.correct_answer)) order by q.question_order)
      from (select id, question_order, correct_answer, explanation, set_id from public.ielts_reading_questions where p_skill = 'reading'
            union all select id, question_order, correct_answer, explanation, set_id from public.ielts_listening_questions where p_skill = 'listening') q
      where q.set_id = a.set_id), '[]'));
end $$;
revoke all on function public.rpc_ielts_practice_attempt_review(text, uuid) from public, anon;
grant execute on function public.rpc_ielts_practice_attempt_review(text, uuid) to authenticated;

-- Staff read keys for editing (same roles as the existing content-management policies).
create or replace function public.rpc_ielts_admin_set_questions(p_skill text, p_set bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not exists(select 1 from public.users u where u.id = auth.uid() and not coalesce(u.is_banned, false)
                and (u.is_admin = true or u.role in ('school_admin','admin','superadmin','teacher'))) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('question_order', q.question_order, 'question_type', q.question_type, 'body', q.body,
      'options', q.options, 'correct_answer', q.correct_answer, 'explanation', q.explanation) order by q.question_order)
    from (select set_id, question_order, question_type, body, options, correct_answer, explanation from public.ielts_reading_questions where p_skill = 'reading'
          union all select set_id, question_order, question_type, body, options, correct_answer, explanation from public.ielts_listening_questions where p_skill = 'listening') q
    where q.set_id = p_set), '[]');
end $$;
revoke all on function public.rpc_ielts_admin_set_questions(text, bigint) from public, anon;
grant execute on function public.rpc_ielts_admin_set_questions(text, bigint) to authenticated;

revoke all on function private.ielts_score_objective_attempt() from public, anon, authenticated;
revoke all on function private.ielts_answer_matches(text, jsonb) from public, anon, authenticated;
