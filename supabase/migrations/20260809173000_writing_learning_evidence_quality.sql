-- Phase 3: Writing Hub -> longitudinal Student Learning Memory.
-- Canonicalise weakness signals, dedupe logical attempts, quality-gate short submissions,
-- preserve rubric evidence, and require positive rubric support before recovery evidence.

create or replace function public.student_learning_canonical_writing_skill(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_tag, '')))
    when 'run_on' then 'Sentence control'
    when 'punctuation_error' then 'Punctuation'
    when 'article_error' then 'Grammar accuracy'
    when 'agreement_error' then 'Grammar accuracy'
    when 'spelling_error' then 'Spelling'
    when 'weak_word_choice' then 'Vocabulary precision'
    when 'partial_content_coverage' then 'Content coverage'
    when 'missed_content_point' then 'Content coverage'
    when 'weak_genre_convention' then 'Genre conventions'
    when 'weak_audience_awareness' then 'Audience & register'
    when 'weak_register_control' then 'Audience & register'
    when 'under_length' then 'Task completion'
    when 'poor_sequencing' then 'Organisation'
    when 'weak_paragraphing' then 'Organisation'
    when 'weak_linking' then 'Organisation'
    else initcap(replace(lower(trim(coalesce(p_tag, 'writing development'))), '_', ' '))
  end;
$$;
revoke all on function public.student_learning_canonical_writing_skill(text) from public, anon, authenticated;
grant execute on function public.student_learning_canonical_writing_skill(text) to service_role;

create or replace function public.student_learning_writing_dimension(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_tag, '')))
    when 'partial_content_coverage' then 'content'
    when 'missed_content_point' then 'content'
    when 'under_length' then 'content'
    when 'poor_sequencing' then 'organisation'
    when 'weak_paragraphing' then 'organisation'
    when 'weak_linking' then 'organisation'
    when 'weak_genre_convention' then 'communicative_achievement'
    when 'weak_audience_awareness' then 'communicative_achievement'
    when 'weak_register_control' then 'communicative_achievement'
    else 'language'
  end;
$$;
revoke all on function public.student_learning_writing_dimension(text) from public, anon, authenticated;
grant execute on function public.student_learning_writing_dimension(text) to service_role;

create or replace function public.student_learning_ingest_writing_attempt(p_attempt_id uuid, p_payload jsonb, p_row_created_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_assessment jsonb := coalesce(p_payload->'assessment', '{}'::jsonb);
  v_student_id uuid; v_school_id uuid; v_genre text; v_logical_key text; v_observed_at timestamptz;
  v_submission text; v_word_count integer := 0; v_target_words integer := 100; v_quality text; v_contributes boolean;
  v_total_score numeric; v_tags jsonb; v_counts jsonb; v_group record; v_rubric_skill text;
  v_skill_key text; v_source_key text; v_subscore_key text; v_subscore_value numeric; v_subscore_json jsonb; v_kind text;
  v_old_keys text[] := array[]::text[]; v_old_key text; v_recovery record; v_dimension_score numeric;
begin
  if coalesce(v_payload->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return; end if;
  v_student_id := (v_payload->>'student_id')::uuid;
  select u.school_id into v_school_id from public.users u where u.id = v_student_id;
  if v_school_id is null then return; end if;
  v_submission := trim(coalesce(v_payload->>'student_submission', '')); if v_submission = '' then return; end if;
  v_genre := coalesce(nullif(trim(v_payload->>'genre'), ''), nullif(trim(v_assessment->>'genre'), ''), 'writing');
  v_logical_key := coalesce(nullif(trim(v_payload->>'attempt_key'), ''), nullif(trim(v_payload->>'id'), ''), nullif(trim(v_payload->>'attempt_id'), ''), p_attempt_id::text);
  v_observed_at := coalesce(case when coalesce(v_payload->>'created_at', '') ~ '^\d{4}-\d{2}-\d{2}T' then (v_payload->>'created_at')::timestamptz end, p_row_created_at, now());

  if coalesce(v_assessment->>'actual_word_count', '') ~ '^\d+$' then v_word_count := (v_assessment->>'actual_word_count')::integer;
  elsif coalesce(v_payload->>'actual_word_count', '') ~ '^\d+$' then v_word_count := (v_payload->>'actual_word_count')::integer;
  else v_word_count := coalesce(array_length(regexp_split_to_array(v_submission, '\s+'), 1), 0); end if;
  if coalesce(v_assessment->>'target_word_count', '') ~ '^\d+$' then v_target_words := greatest(1, (v_assessment->>'target_word_count')::integer);
  elsif coalesce(v_payload->>'target_word_count', '') ~ '^\d+$' then v_target_words := greatest(1, (v_payload->>'target_word_count')::integer); end if;

  v_quality := case when v_word_count < greatest(30, ceil(v_target_words * 0.40)::integer) then 'provisional'
    when v_word_count < greatest(50, ceil(v_target_words * 0.65)::integer) then 'standard' else 'strong' end;
  v_contributes := v_quality <> 'provisional';
  if coalesce(v_assessment->>'total_score', '') ~ '^\d+(\.\d+)?$' then v_total_score := (v_assessment->>'total_score')::numeric; end if;

  select coalesce(array_agg(distinct o.skill_key), array[]::text[]) into v_old_keys
  from public.student_learning_observations o
  where o.student_id = v_student_id and o.source_type = 'writing_attempt' and o.evidence->>'logical_attempt_key' = v_logical_key;
  delete from public.student_learning_observations o
  where o.student_id = v_student_id and o.source_type = 'writing_attempt' and o.evidence->>'logical_attempt_key' = v_logical_key;

  v_tags := case when jsonb_typeof(v_payload->'feedback_weakness_tags') = 'array' then v_payload->'feedback_weakness_tags'
    when jsonb_typeof(v_assessment->'weakness_tags') = 'array' then v_assessment->'weakness_tags' else '[]'::jsonb end;
  v_counts := case when jsonb_typeof(v_payload->'feedback_weakness_tag_counts') = 'object' then v_payload->'feedback_weakness_tag_counts' else '{}'::jsonb end;

  for v_group in
    with raw_tags as (
      select lower(trim(t.value)) raw_tag,
        case when coalesce(v_counts->>t.value, '') ~ '^\d+$' then greatest(1, (v_counts->>t.value)::integer) else 1 end tag_count
      from jsonb_array_elements_text(v_tags) t(value) where nullif(trim(t.value), '') is not null
    )
    select public.student_learning_canonical_writing_skill(raw_tag) skill,
      public.student_learning_writing_dimension(raw_tag) dimension,
      sum(tag_count)::integer occurrence_count, jsonb_agg(raw_tag order by raw_tag) raw_tags
    from raw_tags group by 1,2
  loop
    v_skill_key := public.student_learning_build_skill_key('English','Writing',v_group.skill,null);
    v_source_key := concat_ws(':','writing',md5(v_logical_key),'weakness',md5(v_skill_key));
    insert into public.student_learning_observations (
      school_id,student_id,subject,topic,skill,subskill,skill_key,observation_type,source_type,source_id,source_key,observed_at,
      evidence_percentage,evidence_count,evidence,system_generated,evidence_quality,contributes_to_focus_state
    ) values (
      v_school_id,v_student_id,'English','Writing',v_group.skill,v_genre,v_skill_key,'focus','writing_attempt',p_attempt_id,v_source_key,v_observed_at,
      case when v_total_score is null then null else greatest(0,least(100,v_total_score*5)) end,v_group.occurrence_count,
      jsonb_build_object('writing_signal','weakness_tag','logical_attempt_key',v_logical_key,'attempt_id',p_attempt_id,'genre',v_genre,'raw_tags',v_group.raw_tags,
        'rubric_dimension',v_group.dimension,'word_count',v_word_count,'target_word_count',v_target_words,'total_score',v_total_score,'evidence_quality',v_quality),
      true,v_quality,v_contributes
    );
  end loop;

  if jsonb_typeof(v_assessment->'subscores') = 'object' then
    for v_subscore_key,v_subscore_json in select key,value from jsonb_each(v_assessment->'subscores') loop
      if jsonb_typeof(v_subscore_json)='number' then v_subscore_value := (v_subscore_json #>> '{}')::numeric;
      elsif jsonb_typeof(v_subscore_json)='string' and (v_subscore_json #>> '{}') ~ '^\d+(\.\d+)?$' then v_subscore_value := (v_subscore_json #>> '{}')::numeric;
      else continue; end if;
      v_kind := case when v_subscore_value <= 2 then 'focus' when v_subscore_value >= 4 then 'strength' else 'developing' end;
      v_rubric_skill := replace(initcap(replace(v_subscore_key,'_',' ')),' And ',' & ');
      v_skill_key := public.student_learning_build_skill_key('English','Writing rubric',v_rubric_skill,null);
      v_source_key := concat_ws(':','writing',md5(v_logical_key),'rubric',md5(v_skill_key));
      insert into public.student_learning_observations (
        school_id,student_id,subject,topic,skill,subskill,skill_key,observation_type,source_type,source_id,source_key,observed_at,
        evidence_percentage,evidence_count,evidence,system_generated,evidence_quality,contributes_to_focus_state
      ) values (
        v_school_id,v_student_id,'English','Writing rubric',v_rubric_skill,v_genre,v_skill_key,v_kind,'writing_attempt',p_attempt_id,v_source_key,v_observed_at,
        greatest(0,least(100,v_subscore_value*20)),1,
        jsonb_build_object('writing_signal','rubric','logical_attempt_key',v_logical_key,'attempt_id',p_attempt_id,'genre',v_genre,'rubric_dimension',v_subscore_key,
          'rubric_score',v_subscore_value,'rubric_max',5,'word_count',v_word_count,'target_word_count',v_target_words,'total_score',v_total_score,'evidence_quality',v_quality),
        true,v_quality,v_contributes
      );
    end loop;
  end if;

  if v_quality='strong' and jsonb_typeof(v_assessment->'subscores')='object' then
    for v_recovery in
      select distinct o.skill,o.skill_key,o.evidence->>'rubric_dimension' dimension
      from public.student_learning_observations o
      where o.student_id=v_student_id and o.subject='English' and o.topic='Writing' and o.source_type='writing_attempt'
        and o.observation_type='focus' and o.evidence->>'writing_signal'='weakness_tag' and o.observed_at < v_observed_at
    loop
      if exists (select 1 from jsonb_array_elements_text(v_tags) t(value)
        where public.student_learning_canonical_writing_skill(t.value)=v_recovery.skill) then continue; end if;
      v_subscore_json := v_assessment->'subscores'->v_recovery.dimension; if v_subscore_json is null then continue; end if;
      if jsonb_typeof(v_subscore_json)='number' then v_dimension_score := (v_subscore_json #>> '{}')::numeric;
      elsif jsonb_typeof(v_subscore_json)='string' and (v_subscore_json #>> '{}') ~ '^\d+(\.\d+)?$' then v_dimension_score := (v_subscore_json #>> '{}')::numeric;
      else continue; end if;
      if v_dimension_score < 4 then continue; end if;
      v_source_key := concat_ws(':','writing',md5(v_logical_key),'recovery',md5(v_recovery.skill_key));
      insert into public.student_learning_observations (
        school_id,student_id,subject,topic,skill,subskill,skill_key,observation_type,source_type,source_id,source_key,observed_at,
        evidence_percentage,evidence_count,evidence,system_generated,evidence_quality,contributes_to_focus_state
      ) values (
        v_school_id,v_student_id,'English','Writing',v_recovery.skill,v_genre,v_recovery.skill_key,'strength','writing_attempt',p_attempt_id,v_source_key,v_observed_at,
        greatest(0,least(100,v_dimension_score*20)),1,
        jsonb_build_object('writing_signal','recovery','logical_attempt_key',v_logical_key,'attempt_id',p_attempt_id,'genre',v_genre,'rubric_dimension',v_recovery.dimension,
          'rubric_score',v_dimension_score,'reason','Related weakness absent and rubric dimension scored 4 or 5','word_count',v_word_count,
          'target_word_count',v_target_words,'evidence_quality',v_quality),true,'strong',true
      );
    end loop;
  end if;

  foreach v_old_key in array v_old_keys loop perform public.student_learning_refresh_focus_state(v_student_id,v_old_key); end loop;
end;
$$;
revoke all on function public.student_learning_ingest_writing_attempt(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.student_learning_ingest_writing_attempt(uuid,jsonb,timestamptz) to service_role;

create or replace function public.student_learning_capture_writing_attempt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.student_learning_ingest_writing_attempt(new.id,new.payload,new.created_at); return new; end; $$;
revoke all on function public.student_learning_capture_writing_attempt() from public,anon,authenticated;
drop trigger if exists trg_student_learning_capture_writing_attempt on public.bh_writing_attempts;
create trigger trg_student_learning_capture_writing_attempt after insert or update of payload on public.bh_writing_attempts
for each row execute function public.student_learning_capture_writing_attempt();

-- Deterministic backfill: one canonical DB row per student + genre + logical attempt key.
delete from public.student_learning_observations where source_type='writing_attempt';
do $backfill_writing_quality$
declare r record;
begin
  for r in
    with ranked as (
      select w.id,w.payload,w.created_at,
        row_number() over (partition by w.payload->>'student_id',coalesce(w.payload->>'genre',w.payload->'assessment'->>'genre','writing'),
          coalesce(nullif(w.payload->>'attempt_key',''),nullif(w.payload->>'id',''),nullif(w.payload->>'attempt_id',''),w.id::text)
          order by w.created_at desc,w.id desc) rn
      from public.bh_writing_attempts w
      where nullif(trim(coalesce(w.payload->>'student_submission','')),'') is not null
    )
    select id,payload,created_at from ranked where rn=1 order by created_at,id
  loop perform public.student_learning_ingest_writing_attempt(r.id,r.payload,r.created_at); end loop;
end
$backfill_writing_quality$;

delete from public.student_learning_focus_states;
do $rebuild_after_writing$
declare r record;
begin
  for r in select distinct student_id,skill_key from public.student_learning_observations
  loop perform public.student_learning_refresh_focus_state(r.student_id,r.skill_key); end loop;
end
$rebuild_after_writing$;
