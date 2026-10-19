-- Skill-specific practice results (pilot finding 2026-10-19: result tips were generic). The own-attempt review now
-- returns each question's approved primary construct, so the result page can show results per skill and a tip for
-- the skills missed. Unmapped legacy sets return null and keep the general guidance.
create or replace function public.rpc_ielts_practice_attempt_review(p_skill text, p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare a record; mtype text := case p_skill when 'reading' then 'ielts_reading_set' when 'listening' then 'ielts_listening_set' end;
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
        'is_correct', private.ielts_answer_matches(a.answers ->> q.id::text, q.correct_answer),
        'construct', (select jsonb_build_object('code', n.code, 'name', n.name)
                      from private.ielts_material_construct_maps m join public.academic_skill_registry_nodes n on n.id = m.node_id
                      where m.material_type = mtype and m.material_id = a.set_id::text and m.item_key = q.question_order::text
                        and m.role = 'primary' and m.status = 'approved' limit 1)) order by q.question_order)
      from (select id, question_order, correct_answer, explanation, set_id from public.ielts_reading_questions where p_skill = 'reading'
            union all select id, question_order, correct_answer, explanation, set_id from public.ielts_listening_questions where p_skill = 'listening') q
      where q.set_id = a.set_id), '[]'));
end $$;
revoke all on function public.rpc_ielts_practice_attempt_review(text, uuid) from public, anon;
grant execute on function public.rpc_ielts_practice_attempt_review(text, uuid) to authenticated;
