-- Persist evaluator-specific, grounded writing strengths as longitudinal learning
-- evidence. This supplements the existing rubric-level strengths without ever
-- promoting generic praise or unverified assessments into the academic profile.

create or replace function public.student_learning_writing_strength_dimension(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_tag, '')))
    when 'strong_content_coverage' then 'content'
    when 'strong_task_completion' then 'content'
    when 'strong_idea_development' then 'content'
    when 'strong_organisation' then 'organisation'
    when 'strong_genre_convention' then 'communicative_achievement'
    when 'strong_audience_awareness' then 'communicative_achievement'
    else 'language'
  end;
$$;
revoke all on function public.student_learning_writing_strength_dimension(text) from public, anon, authenticated;
grant execute on function public.student_learning_writing_strength_dimension(text) to service_role;

create or replace function public.student_learning_canonical_writing_strength(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_tag, '')))
    when 'strong_content_coverage' then 'Content coverage'
    when 'strong_task_completion' then 'Task completion'
    when 'strong_idea_development' then 'Idea development'
    when 'strong_organisation' then 'Organisation'
    when 'strong_genre_convention' then 'Genre conventions'
    when 'strong_audience_awareness' then 'Audience & register'
    when 'strong_vocabulary' then 'Vocabulary precision'
    when 'strong_sentence_control' then 'Sentence control'
    when 'strong_language_accuracy' then 'Grammar accuracy'
    when 'strong_punctuation' then 'Punctuation'
    when 'strong_spelling' then 'Spelling'
    else null
  end;
$$;
revoke all on function public.student_learning_canonical_writing_strength(text) from public, anon, authenticated;
grant execute on function public.student_learning_canonical_writing_strength(text) to service_role;

create or replace function public.student_learning_ingest_writing_strength_evidence(
  p_attempt_id uuid,
  p_payload jsonb,
  p_row_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_assessment jsonb := coalesce(p_payload->'assessment', '{}'::jsonb);
  v_feedback jsonb := coalesce(p_payload->'rich_feedback', '{}'::jsonb);
  v_student_id uuid;
  v_school_id uuid;
  v_submission text;
  v_genre text;
  v_logical_key text;
  v_observed_at timestamptz;
  v_strength jsonb;
  v_tag text;
  v_skill text;
  v_dimension text;
  v_dimension_score numeric;
  v_evidence text;
  v_explanation text;
  v_start integer;
  v_end integer;
  v_skill_key text;
  v_source_key text;
begin
  if coalesce(v_assessment->>'assessment_status', '') <> 'verified'
    or coalesce((v_assessment->>'academic_profile_ready')::boolean, false) is not true then
    return;
  end if;
  if coalesce(v_payload->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return; end if;
  v_student_id := (v_payload->>'student_id')::uuid;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  if v_school_id is null then return; end if;
  v_submission := coalesce(v_payload->>'student_submission', '');
  if trim(v_submission) = '' then return; end if;
  if jsonb_typeof(v_feedback->'strength_evidence') <> 'array' then return; end if;

  v_genre := coalesce(nullif(trim(v_payload->>'genre'), ''), nullif(trim(v_assessment->>'genre'), ''), 'writing');
  v_logical_key := coalesce(nullif(trim(v_payload->>'attempt_key'), ''), nullif(trim(v_payload->>'id'), ''), p_attempt_id::text);
  v_observed_at := coalesce(
    case when coalesce(v_payload->>'created_at', '') ~ '^\d{4}-\d{2}-\d{2}T' then (v_payload->>'created_at')::timestamptz end,
    p_row_created_at,
    now()
  );

  for v_strength in select value from jsonb_array_elements(v_feedback->'strength_evidence')
  loop
    v_tag := lower(trim(coalesce(v_strength->>'strength_tag', '')));
    v_skill := public.student_learning_canonical_writing_strength(v_tag);
    v_dimension := public.student_learning_writing_strength_dimension(v_tag);
    v_evidence := coalesce(v_strength->>'evidence', '');
    v_explanation := trim(coalesce(v_strength->>'explanation', ''));
    if v_skill is null or v_evidence = '' or v_explanation = '' then continue; end if;
    if coalesce(v_strength->>'start_char', '') !~ '^\d+$' or coalesce(v_strength->>'end_char', '') !~ '^\d+$' then continue; end if;
    v_start := (v_strength->>'start_char')::integer;
    v_end := (v_strength->>'end_char')::integer;
    if v_end <= v_start or substr(v_submission, v_start + 1, v_end - v_start) <> v_evidence then continue; end if;
    if coalesce(v_assessment->'subscores'->>v_dimension, '') !~ '^\d+(\.\d+)?$' then continue; end if;
    v_dimension_score := (v_assessment->'subscores'->>v_dimension)::numeric;
    if v_dimension_score < 4 then continue; end if;

    v_skill_key := public.student_learning_build_skill_key('English', 'Writing', v_skill, null);
    v_source_key := concat_ws(':', 'writing', md5(v_logical_key), 'grounded-strength', md5(v_tag || ':' || v_start::text || ':' || v_end::text));
    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence, system_generated,
      evidence_quality, contributes_to_focus_state
    ) values (
      v_school_id, v_student_id, 'English', 'Writing', v_skill, v_genre, v_skill_key,
      'strength', 'writing_attempt', p_attempt_id, v_source_key, v_observed_at,
      greatest(0, least(100, v_dimension_score * 20)), 1,
      jsonb_build_object(
        'writing_signal', 'grounded_strength',
        'logical_attempt_key', v_logical_key,
        'attempt_id', p_attempt_id,
        'genre', v_genre,
        'strength_tag', v_tag,
        'rubric_dimension', v_dimension,
        'rubric_score', v_dimension_score,
        'quote', v_evidence,
        'explanation', v_explanation,
        'start_char', v_start,
        'end_char', v_end,
        'evaluator_version', v_assessment->>'evaluator_version'
      ),
      true, 'strong', true
    )
    on conflict (student_id, source_key) do update set
      evidence_percentage = excluded.evidence_percentage,
      evidence = excluded.evidence,
      observed_at = excluded.observed_at;
    perform public.student_learning_refresh_focus_state(v_student_id, v_skill_key);
  end loop;
end;
$$;
revoke all on function public.student_learning_ingest_writing_strength_evidence(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.student_learning_ingest_writing_strength_evidence(uuid, jsonb, timestamptz) to service_role;

-- The legacy capture trigger called the general ingester for every locally saved
-- attempt. Gate it here so neither weaknesses nor rubric strengths from a
-- provisional/needs-review assessment can enter the academic profile.
create or replace function public.student_learning_capture_writing_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.payload->'assessment'->>'assessment_status', '') = 'verified'
    and coalesce((new.payload->'assessment'->>'academic_profile_ready')::boolean, false) is true then
    perform public.student_learning_ingest_writing_attempt(new.id, new.payload, new.created_at);
  end if;
  return new;
end;
$$;
revoke all on function public.student_learning_capture_writing_attempt() from public, anon, authenticated;
grant execute on function public.student_learning_capture_writing_attempt() to service_role;

create or replace function public.student_learning_capture_writing_strength_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.student_learning_ingest_writing_strength_evidence(new.id, new.payload, new.created_at);
  return new;
end;
$$;
revoke all on function public.student_learning_capture_writing_strength_evidence() from public, anon, authenticated;
grant execute on function public.student_learning_capture_writing_strength_evidence() to service_role;

drop trigger if exists zzz_student_learning_capture_writing_strength_evidence on public.bh_writing_attempts;
create trigger zzz_student_learning_capture_writing_strength_evidence
after insert or update of payload on public.bh_writing_attempts
for each row execute function public.student_learning_capture_writing_strength_evidence();
