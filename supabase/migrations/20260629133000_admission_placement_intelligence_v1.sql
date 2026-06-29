-- Admission Placement Intelligence v1: safe nullable profile and diagnostic metadata.

alter table public.adm_candidates
  add column if not exists current_grade smallint check (current_grade between 1 and 13),
  add column if not exists date_of_birth date,
  add column if not exists previous_curriculum text,
  add column if not exists previous_school_language text,
  add column if not exists home_language text,
  add column if not exists years_english_medium numeric(4,1) check (years_english_medium is null or years_english_medium >= 0),
  add column if not exists admin_notes text;

alter table public.adm_questions
  add column if not exists diagnostic_skill text,
  add column if not exists stage_level smallint,
  add column if not exists grade_level smallint;

update public.adm_questions
set diagnostic_skill = coalesce(diagnostic_skill, nullif(regexp_replace(coalesce(skill_tag, topic, ''), '^math_', ''), ''))
where diagnostic_skill is null;

create index if not exists idx_adm_q_diagnostic_skill on public.adm_questions(diagnostic_skill);
create index if not exists idx_adm_q_stage_level on public.adm_questions(stage_level);
create index if not exists idx_adm_cand_school_applied_grade on public.adm_candidates(school_id, applied_grade);

create or replace function public.rpc_adm_get_candidate_report(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_attempt adm_attempts%rowtype;
    v_candidate adm_candidates%rowtype;
    v_answers jsonb;
    v_topic_breakdown jsonb;
    v_skill_breakdown jsonb;
    v_type_breakdown jsonb;
    v_difficulty_breakdown jsonb;
    v_strengths jsonb;
    v_weaknesses jsonb;
begin
    select * into v_attempt from adm_attempts where id = p_attempt_id;
    if v_attempt.id is null then
        return jsonb_build_object('success', false, 'error', 'Attempt not found');
    end if;

    if not exists (
        select 1 from school_members sm
        where sm.school_id = v_attempt.school_id
          and sm.user_id = auth.uid()
          and sm.role_in_school in ('school_admin', 'teacher')
          and sm.status = 'active'
    ) then
        return jsonb_build_object('success', false, 'error', 'Access denied');
    end if;

    select * into v_candidate from adm_candidates where id = v_attempt.candidate_id;

    select jsonb_agg(jsonb_build_object(
        'question_id', q.id,
        'question_type', q.question_type,
        'stem', q.stem,
        'subject', qp.subject,
        'topic', q.topic,
        'diagnostic_skill', coalesce(q.diagnostic_skill, regexp_replace(coalesce(q.skill_tag, q.topic, 'general'), '^math_', '')),
        'skill_tag', q.skill_tag,
        'difficulty', q.difficulty,
        'grade_level', coalesce(q.grade_level, qp.grade_level),
        'stage_level', coalesce(q.stage_level, qp.stage),
        'response', a.response,
        'correct_answer', q.correct_answer,
        'is_correct', a.is_correct,
        'marks_awarded', a.marks_awarded,
        'marks_possible', a.marks_possible,
        'explanation', q.explanation,
        'ai_feedback', a.ai_feedback
    ) order by fq.question_order) into v_answers
    from adm_answers a
    join adm_questions q on q.id = a.question_id
    join adm_question_pools qp on qp.id = q.pool_id
    join adm_test_form_questions fq on fq.question_id = q.id and fq.form_id = v_attempt.form_id
    where a.attempt_id = p_attempt_id;

    select jsonb_agg(topic_row) into v_topic_breakdown from (
        select jsonb_build_object('topic', q.topic, 'subject', qp.subject, 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible), 'percentage', round(sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric * 100)) topic_row
        from adm_answers a join adm_questions q on q.id = a.question_id join adm_question_pools qp on qp.id = q.pool_id
        where a.attempt_id = p_attempt_id and q.topic is not null group by qp.subject, q.topic
    ) sub;

    select jsonb_agg(skill_row) into v_skill_breakdown from (
        select jsonb_build_object('subject', qp.subject, 'skill', coalesce(q.diagnostic_skill, regexp_replace(coalesce(q.skill_tag, q.topic, 'general'), '^math_', '')), 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible), 'percentage', round(sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric * 100)) skill_row
        from adm_answers a join adm_questions q on q.id = a.question_id join adm_question_pools qp on qp.id = q.pool_id
        where a.attempt_id = p_attempt_id group by qp.subject, coalesce(q.diagnostic_skill, regexp_replace(coalesce(q.skill_tag, q.topic, 'general'), '^math_', ''))
    ) sub;

    select jsonb_agg(diff_row) into v_difficulty_breakdown from (
        select jsonb_build_object('subject', qp.subject, 'difficulty', q.difficulty, 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible), 'percentage', round(sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric * 100)) diff_row
        from adm_answers a join adm_questions q on q.id = a.question_id join adm_question_pools qp on qp.id = q.pool_id
        where a.attempt_id = p_attempt_id group by qp.subject, q.difficulty
    ) sub;

    select jsonb_agg(type_row) into v_type_breakdown from (
        select jsonb_build_object('type', q.question_type, 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible)) type_row
        from adm_answers a join adm_questions q on q.id = a.question_id where a.attempt_id = p_attempt_id group by q.question_type
    ) sub;

    select jsonb_agg(skill) into v_strengths from (
        select coalesce(q.diagnostic_skill, q.topic) as skill
        from adm_answers a join adm_questions q on q.id = a.question_id
        where a.attempt_id = p_attempt_id and coalesce(q.diagnostic_skill, q.topic) is not null
        group by coalesce(q.diagnostic_skill, q.topic)
        having (sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric) >= 0.7
    ) strong;

    select jsonb_agg(skill) into v_weaknesses from (
        select coalesce(q.diagnostic_skill, q.topic) as skill
        from adm_answers a join adm_questions q on q.id = a.question_id
        where a.attempt_id = p_attempt_id and coalesce(q.diagnostic_skill, q.topic) is not null
        group by coalesce(q.diagnostic_skill, q.topic)
        having (sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric) < 0.5
    ) weak;

    return jsonb_build_object(
        'success', true,
        'candidate', jsonb_build_object('id', v_candidate.id, 'name', v_candidate.full_name, 'email', v_candidate.email, 'applied_grade', v_candidate.applied_grade, 'current_grade', v_candidate.current_grade, 'date_of_birth', v_candidate.date_of_birth, 'previous_curriculum', v_candidate.previous_curriculum, 'previous_school_language', v_candidate.previous_school_language, 'home_language', v_candidate.home_language, 'years_english_medium', v_candidate.years_english_medium, 'admin_notes', coalesce(v_candidate.admin_notes, v_candidate.notes)),
        'attempt', jsonb_build_object('id', v_attempt.id, 'total_score', v_attempt.total_score, 'max_score', v_attempt.max_score, 'percentage', v_attempt.percentage, 'started_at', v_attempt.started_at, 'submitted_at', v_attempt.submitted_at),
        'band', case when v_attempt.percentage >= 80 then 'A' when v_attempt.percentage >= 65 then 'B' when v_attempt.percentage >= 50 then 'C' when v_attempt.percentage >= 35 then 'D' else 'E' end,
        'answers', coalesce(v_answers, '[]'::jsonb),
        'topic_breakdown', coalesce(v_topic_breakdown, '[]'::jsonb),
        'skill_breakdown', coalesce(v_skill_breakdown, '[]'::jsonb),
        'difficulty_breakdown', coalesce(v_difficulty_breakdown, '[]'::jsonb),
        'type_breakdown', coalesce(v_type_breakdown, '[]'::jsonb),
        'strengths', coalesce(v_strengths, '[]'::jsonb),
        'weaknesses', coalesce(v_weaknesses, '[]'::jsonb)
    );
end;
$$;

grant execute on function public.rpc_adm_get_candidate_report(uuid) to authenticated;
