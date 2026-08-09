-- Feed existing and future school assignment + Writing Hub evidence into Student Learning Memory.

create or replace function public.student_learning_ingest_assignment_result(
  p_assignment_id uuid,
  p_student_id uuid,
  p_completed_at timestamptz,
  p_accuracy integer,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment record;
  v_school_id uuid;
  v_subject text;
  v_default_topic text;
  v_group record;
  v_percentage numeric;
  v_kind text;
  v_skill_key text;
  v_source_key text;
  v_had_answers boolean := false;
begin
  if p_assignment_id is null or p_student_id is null or p_completed_at is null then return; end if;

  select a.school_id,
    coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), ''), 'General') as subject_name,
    coalesce(nullif(trim(a.topic_name), ''), nullif(trim(a.title), ''), 'General') as default_topic
  into v_assignment
  from public.assignments a where a.id = p_assignment_id;
  if not found then return; end if;

  select coalesce(v_assignment.school_id, u.school_id) into v_school_id
  from public.users u where u.id = p_student_id;
  if v_school_id is null then return; end if;

  v_subject := v_assignment.subject_name;
  v_default_topic := v_assignment.default_topic;

  for v_group in
    select coalesce(nullif(trim(qd.topic_name), ''), nullif(trim(qd.topic), ''), v_default_topic) as topic_name,
      count(*)::integer as question_count,
      count(*) filter (where saa.is_correct is true)::integer as correct_count
    from public.student_assignment_answers saa
    left join public.assignment_question_details qd
      on qd.assignment_id = saa.assignment_id and qd.question_id = saa.question_id
    where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id
    group by 1
  loop
    v_had_answers := true;
    if v_group.question_count <= 0 then continue; end if;
    v_percentage := round((v_group.correct_count::numeric / v_group.question_count::numeric) * 100, 2);
    v_kind := case when v_percentage < 60 then 'focus' when v_percentage >= 80 then 'strength' else 'developing' end;
    v_skill_key := public.student_learning_build_skill_key(v_subject, v_group.topic_name, v_group.topic_name, null);
    v_source_key := concat_ws(':', 'assignment', p_assignment_id::text, md5(p_completed_at::text), md5(v_skill_key));

    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, skill_key, observation_type, source_type, source_id,
      source_key, observed_at, evidence_percentage, evidence_count, evidence, system_generated
    ) values (
      v_school_id, p_student_id, v_subject, v_group.topic_name, v_group.topic_name, v_skill_key, v_kind,
      'assignment_result', p_assignment_id, v_source_key, p_completed_at, v_percentage, 1,
      jsonb_build_object('assignment_id', p_assignment_id, 'correct', v_group.correct_count,
        'question_count', v_group.question_count, 'overall_accuracy', p_accuracy, 'overall_score', p_score), true
    ) on conflict (student_id, source_key) do nothing;
  end loop;

  if not v_had_answers then
    v_percentage := greatest(0, least(100, coalesce(p_accuracy, 0)))::numeric;
    v_kind := case when v_percentage < 60 then 'focus' when v_percentage >= 80 then 'strength' else 'developing' end;
    v_skill_key := public.student_learning_build_skill_key(v_subject, v_default_topic, v_default_topic, null);
    v_source_key := concat_ws(':', 'assignment', p_assignment_id::text, md5(p_completed_at::text), md5(v_skill_key));
    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, skill_key, observation_type, source_type, source_id,
      source_key, observed_at, evidence_percentage, evidence_count, evidence, system_generated
    ) values (
      v_school_id, p_student_id, v_subject, v_default_topic, v_default_topic, v_skill_key, v_kind,
      'assignment_result', p_assignment_id, v_source_key, p_completed_at, v_percentage, 1,
      jsonb_build_object('assignment_id', p_assignment_id, 'overall_accuracy', p_accuracy, 'overall_score', p_score, 'fallback', true), true
    ) on conflict (student_id, source_key) do nothing;
  end if;
end;
$$;
revoke all on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer) to service_role;

create or replace function public.student_learning_capture_assignment_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.completed_at is not distinct from new.completed_at
    and old.correct is not distinct from new.correct and old.incorrect is not distinct from new.incorrect
    and old.accuracy is not distinct from new.accuracy and old.score is not distinct from new.score then return new; end if;
  perform public.student_learning_ingest_assignment_result(new.assignment_id, new.student_id, new.completed_at, new.accuracy, new.score);
  return new;
end;
$$;
revoke all on function public.student_learning_capture_assignment_result() from public, anon, authenticated;
drop trigger if exists trg_student_learning_capture_assignment_result on public.student_assignment_results;
create trigger trg_student_learning_capture_assignment_result
after insert or update on public.student_assignment_results
for each row execute function public.student_learning_capture_assignment_result();

create or replace function public.student_learning_ingest_writing_attempt(p_attempt_id uuid, p_payload jsonb, p_row_created_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_student_id uuid;
  v_school_id uuid;
  v_genre text;
  v_observed_at timestamptz;
  v_assessment jsonb;
  v_tags jsonb;
  v_tag text;
  v_tag_count integer;
  v_total_score numeric;
  v_skill_key text;
  v_source_key text;
  v_subscore_key text;
  v_subscore_text text;
  v_subscore_value numeric;
  v_kind text;
begin
  if coalesce(v_payload->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return; end if;
  v_student_id := (v_payload->>'student_id')::uuid;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  if v_school_id is null then return; end if;

  v_assessment := coalesce(v_payload->'assessment', '{}'::jsonb);
  v_genre := coalesce(nullif(trim(v_payload->>'genre'), ''), nullif(trim(v_assessment->>'genre'), ''), 'Writing');
  v_observed_at := coalesce(
    case when coalesce(v_payload->>'created_at', '') ~ '^\d{4}-\d{2}-\d{2}T' then (v_payload->>'created_at')::timestamptz else null end,
    p_row_created_at, now()
  );
  if coalesce(v_assessment->>'total_score', '') ~ '^\d+(\.\d+)?$' then v_total_score := (v_assessment->>'total_score')::numeric; end if;

  v_tags := case when jsonb_typeof(v_payload->'feedback_weakness_tags') = 'array' then v_payload->'feedback_weakness_tags'
    when jsonb_typeof(v_assessment->'weakness_tags') = 'array' then v_assessment->'weakness_tags' else '[]'::jsonb end;

  for v_tag in select distinct value from jsonb_array_elements_text(v_tags) where nullif(trim(value), '') is not null loop
    v_tag_count := 1;
    if jsonb_typeof(v_payload->'feedback_weakness_tag_counts') = 'object'
      and coalesce(v_payload->'feedback_weakness_tag_counts'->>v_tag, '') ~ '^\d+$' then
      v_tag_count := greatest(1, (v_payload->'feedback_weakness_tag_counts'->>v_tag)::integer);
    end if;
    v_skill_key := public.student_learning_build_skill_key('English', 'Writing', v_tag, null);
    v_source_key := concat_ws(':', 'writing', p_attempt_id::text, 'weakness', md5(v_skill_key));
    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, subskill, skill_key, observation_type, source_type,
      source_id, source_key, observed_at, evidence_percentage, evidence_count, evidence, system_generated
    ) values (
      v_school_id, v_student_id, 'English', 'Writing', v_tag, v_genre, v_skill_key, 'focus', 'writing_attempt',
      p_attempt_id, v_source_key, v_observed_at,
      case when v_total_score is null then null else greatest(0, least(100, v_total_score * 5)) end,
      v_tag_count, jsonb_build_object('writing_attempt_id', p_attempt_id, 'genre', v_genre,
        'weakness_tag', v_tag, 'weakness_count', v_tag_count, 'total_score', v_total_score), true
    ) on conflict (student_id, source_key) do nothing;
  end loop;

  if jsonb_typeof(v_assessment->'subscores') = 'object' then
    for v_subscore_key, v_subscore_text in select key, value #>> '{}' from jsonb_each(v_assessment->'subscores') loop
      if coalesce(v_subscore_text, '') !~ '^\d+(\.\d+)?$' then continue; end if;
      v_subscore_value := v_subscore_text::numeric;
      v_kind := case when v_subscore_value <= 2 then 'focus' when v_subscore_value >= 4 then 'strength' else 'developing' end;
      v_tag := replace(initcap(replace(v_subscore_key, '_', ' ')), ' And ', ' & ');
      v_skill_key := public.student_learning_build_skill_key('English', 'Writing', v_tag, null);
      v_source_key := concat_ws(':', 'writing', p_attempt_id::text, 'rubric', md5(v_skill_key));
      insert into public.student_learning_observations (
        school_id, student_id, subject, topic, skill, subskill, skill_key, observation_type, source_type,
        source_id, source_key, observed_at, evidence_percentage, evidence_count, evidence, system_generated
      ) values (
        v_school_id, v_student_id, 'English', 'Writing', v_tag, v_genre, v_skill_key, v_kind, 'writing_attempt',
        p_attempt_id, v_source_key, v_observed_at, greatest(0, least(100, v_subscore_value * 20)), 1,
        jsonb_build_object('writing_attempt_id', p_attempt_id, 'genre', v_genre, 'rubric_dimension', v_subscore_key,
          'rubric_score', v_subscore_value, 'rubric_max', 5, 'total_score', v_total_score), true
      ) on conflict (student_id, source_key) do nothing;
    end loop;
  end if;
end;
$$;
revoke all on function public.student_learning_ingest_writing_attempt(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.student_learning_ingest_writing_attempt(uuid, jsonb, timestamptz) to service_role;

create or replace function public.student_learning_capture_writing_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.student_learning_ingest_writing_attempt(new.id, new.payload, new.created_at);
  return new;
end;
$$;
revoke all on function public.student_learning_capture_writing_attempt() from public, anon, authenticated;
drop trigger if exists trg_student_learning_capture_writing_attempt on public.bh_writing_attempts;
create trigger trg_student_learning_capture_writing_attempt
after insert or update of payload on public.bh_writing_attempts
for each row execute function public.student_learning_capture_writing_attempt();

-- Historical backfill is idempotent because automatic source keys are unique per student.
do $backfill_assignments$
declare r record;
begin
  for r in select assignment_id, student_id, completed_at, accuracy, score
    from public.student_assignment_results where completed_at is not null
    order by completed_at, assignment_id, student_id
  loop
    perform public.student_learning_ingest_assignment_result(r.assignment_id, r.student_id, r.completed_at, r.accuracy, r.score);
  end loop;
end
$backfill_assignments$;

do $backfill_writing$
declare r record;
begin
  for r in select id, payload, created_at from public.bh_writing_attempts order by created_at, id
  loop
    perform public.student_learning_ingest_writing_attempt(r.id, r.payload, r.created_at);
  end loop;
end
$backfill_writing$;
