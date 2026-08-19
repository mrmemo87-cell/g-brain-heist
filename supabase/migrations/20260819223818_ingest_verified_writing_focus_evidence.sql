-- Restore verified Writing Hub focus evidence in the shared Student Learning Memory.
-- Only verified, academic-profile-ready assessments contribute. Every granular
-- correction is re-grounded against the exact submitted text before ingestion.

create or replace function public.student_learning_writing_correction_skill(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_tag, '')))
    when 'article_number' then 'Grammar accuracy'
    when 'article_error' then 'Grammar accuracy'
    when 'subject_verb_agreement' then 'Grammar accuracy'
    when 'agreement_error' then 'Grammar accuracy'
    when 'verb_form' then 'Grammar accuracy'
    when 'tense_error' then 'Grammar accuracy'
    when 'preposition_error' then 'Grammar accuracy'
    when 'capitalization' then 'Punctuation'
    when 'list_punctuation' then 'Punctuation'
    when 'introductory_phrase_punctuation' then 'Punctuation'
    when 'punctuation_error' then 'Punctuation'
    when 'missing_sentence_boundary' then 'Sentence control'
    when 'comma_splice' then 'Sentence control'
    when 'run_on' then 'Sentence control'
    when 'fragment' then 'Sentence control'
    when 'spelling_error' then 'Spelling'
    when 'weak_word_choice' then 'Vocabulary precision'
    else public.student_learning_canonical_writing_skill(p_tag)
  end;
$$;

create or replace function public.student_learning_writing_correction_subskill(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_tag, '')))
    when 'article_number' then 'Articles & number'
    when 'article_error' then 'Articles & number'
    when 'subject_verb_agreement' then 'Subject–verb agreement'
    when 'agreement_error' then 'Subject–verb agreement'
    when 'verb_form' then 'Verb form'
    when 'tense_error' then 'Tense control'
    when 'preposition_error' then 'Prepositions'
    when 'capitalization' then 'Capitalization'
    when 'list_punctuation' then 'List punctuation'
    when 'introductory_phrase_punctuation' then 'Introductory phrase punctuation'
    when 'punctuation_error' then 'Punctuation control'
    when 'missing_sentence_boundary' then 'Sentence boundaries'
    when 'comma_splice' then 'Comma splices'
    when 'run_on' then 'Run-on sentences'
    when 'fragment' then 'Sentence fragments'
    when 'spelling_error' then 'Spelling accuracy'
    when 'weak_word_choice' then 'Word choice'
    else nullif(initcap(replace(lower(trim(coalesce(p_tag, ''))), '_', ' ')), '')
  end;
$$;

create or replace function public.student_learning_writing_correction_dimension(p_tag text)
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

revoke all on function public.student_learning_writing_correction_skill(text) from public, anon, authenticated;
revoke all on function public.student_learning_writing_correction_subskill(text) from public, anon, authenticated;
revoke all on function public.student_learning_writing_correction_dimension(text) from public, anon, authenticated;
grant execute on function public.student_learning_writing_correction_skill(text) to service_role;
grant execute on function public.student_learning_writing_correction_subskill(text) to service_role;
grant execute on function public.student_learning_writing_correction_dimension(text) to service_role;

create or replace function public.student_learning_ingest_writing_focus_evidence(
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
  v_word_count integer := 0;
  v_target_words integer := 100;
  v_quality text;
  v_contributes boolean;
  v_group record;
  v_skill_key text;
  v_source_key text;
  v_dimension_score numeric;
  v_total_score numeric;
  v_old_keys text[] := array[]::text[];
  v_old_key text;
  v_new_key record;
  v_criterion record;
  v_criterion_json jsonb;
  v_criterion_score numeric;
  v_evidence_count integer;
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
  v_genre := coalesce(nullif(trim(v_payload->>'genre'), ''), nullif(trim(v_assessment->>'genre'), ''), 'writing');
  v_logical_key := coalesce(nullif(trim(v_payload->>'attempt_key'), ''), nullif(trim(v_payload->>'id'), ''), p_attempt_id::text);
  v_observed_at := coalesce(case when coalesce(v_payload->>'created_at', '') ~ '^\d{4}-\d{2}-\d{2}T' then (v_payload->>'created_at')::timestamptz end, p_row_created_at, now());
  if coalesce(v_assessment->>'actual_word_count', '') ~ '^\d+$' then v_word_count := (v_assessment->>'actual_word_count')::integer;
  else v_word_count := coalesce(array_length(regexp_split_to_array(trim(v_submission), '\s+'), 1), 0); end if;
  if coalesce(v_assessment->>'target_word_count', '') ~ '^\d+$' then v_target_words := greatest(1, (v_assessment->>'target_word_count')::integer); end if;
  v_quality := case
    when v_word_count < greatest(30, ceil(v_target_words * 0.40)::integer) then 'provisional'
    when v_word_count < greatest(50, ceil(v_target_words * 0.65)::integer) then 'standard'
    else 'strong' end;
  v_contributes := v_quality <> 'provisional';
  if coalesce(v_assessment->>'total_score', '') ~ '^\d+(\.\d+)?$' then v_total_score := (v_assessment->>'total_score')::numeric; end if;

  select coalesce(array_agg(distinct o.skill_key), array[]::text[]) into v_old_keys
  from public.student_learning_observations o
  where o.student_id = v_student_id and o.source_type = 'writing_attempt'
    and o.evidence->>'logical_attempt_key' = v_logical_key
    and o.evidence->>'writing_signal' in ('grounded_weakness','rubric_focus');
  delete from public.student_learning_observations o
  where o.student_id = v_student_id and o.source_type = 'writing_attempt'
    and o.evidence->>'logical_attempt_key' = v_logical_key
    and o.evidence->>'writing_signal' in ('grounded_weakness','rubric_focus');

  for v_group in
    with correction_items as (
      select value as item from jsonb_array_elements(case when jsonb_typeof(v_feedback->'grammar_fixes')='array' then v_feedback->'grammar_fixes' else '[]'::jsonb end)
      union all
      select value as item from jsonb_array_elements(case when jsonb_typeof(v_feedback->'punctuation_fixes')='array' then v_feedback->'punctuation_fixes' else '[]'::jsonb end)
      union all
      select value as item from jsonb_array_elements(case when jsonb_typeof(v_feedback->'natural_phrase_upgrades')='array' then v_feedback->'natural_phrase_upgrades' else '[]'::jsonb end)
    ), grounded as (
      select item, lower(trim(coalesce(item->>'weakness_tag',''))) raw_tag,
        (item->>'start_char')::integer start_char, (item->>'end_char')::integer end_char,
        coalesce(item->>'original','') original
      from correction_items
      where nullif(trim(coalesce(item->>'weakness_tag','')), '') is not null
        and coalesce(item->>'start_char','') ~ '^\d+$' and coalesce(item->>'end_char','') ~ '^\d+$'
        and coalesce(item->>'original','') <> ''
    ), validated as (
      select * from grounded where end_char > start_char
        and substr(v_submission,start_char+1,end_char-start_char)=original
    ), mapped as (
      select public.student_learning_writing_correction_skill(raw_tag) skill,
        public.student_learning_writing_correction_subskill(raw_tag) subskill,
        public.student_learning_writing_correction_dimension(raw_tag) dimension,
        raw_tag,item,start_char,end_char,original
      from validated
    )
    select skill,subskill,dimension,count(*)::integer occurrence_count,
      jsonb_agg(jsonb_build_object('tag',raw_tag,'original',original,'better_version',item->>'better_version',
        'issue',coalesce(item->>'issue',item->>'why_it_helps'),'start_char',start_char,'end_char',end_char)
        order by start_char,end_char) corrections
    from mapped where skill is not null group by skill,subskill,dimension
  loop
    v_skill_key := public.student_learning_build_skill_key('English','Writing',v_group.skill,v_group.subskill);
    v_source_key := concat_ws(':','writing',md5(v_logical_key),'grounded-weakness',md5(v_skill_key));
    v_dimension_score := null;
    if coalesce(v_assessment->'subscores'->>v_group.dimension,'') ~ '^\d+(\.\d+)?$' then v_dimension_score := (v_assessment->'subscores'->>v_group.dimension)::numeric; end if;
    insert into public.student_learning_observations(
      school_id,student_id,subject,topic,skill,subskill,skill_key,observation_type,source_type,source_id,source_key,observed_at,
      evidence_percentage,evidence_count,evidence,system_generated,evidence_quality,contributes_to_focus_state
    ) values (
      v_school_id,v_student_id,'English','Writing',v_group.skill,v_group.subskill,v_skill_key,'focus','writing_attempt',p_attempt_id,v_source_key,v_observed_at,
      case when v_dimension_score is not null then greatest(0,least(100,v_dimension_score*20)) when v_total_score is not null then greatest(0,least(100,v_total_score*5)) else null end,
      v_group.occurrence_count,
      jsonb_build_object('writing_signal','grounded_weakness','logical_attempt_key',v_logical_key,'attempt_id',p_attempt_id,
        'assessment_id',nullif(v_assessment->>'assessment_id',''),'genre',v_genre,'rubric_dimension',v_group.dimension,
        'rubric_score',v_dimension_score,'corrections',v_group.corrections,'word_count',v_word_count,'target_word_count',v_target_words,
        'total_score',v_total_score,'evidence_quality',v_quality,'evaluator_version',v_assessment->>'evaluator_version','evaluator_model',v_assessment->>'evaluator_model'),
      true,v_quality,v_contributes
    ) on conflict (student_id,source_key) do update set source_id=excluded.source_id,observed_at=excluded.observed_at,
      evidence_percentage=excluded.evidence_percentage,evidence_count=excluded.evidence_count,evidence=excluded.evidence,
      evidence_quality=excluded.evidence_quality,contributes_to_focus_state=excluded.contributes_to_focus_state;
  end loop;

  for v_criterion in select * from (values
    ('content','Content'),('communicative_achievement','Communicative Achievement'),('organisation','Organisation'),('language','Language')
  ) c(dimension_key,display_name)
  loop
    if coalesce(v_assessment->'subscores'->>v_criterion.dimension_key,'') !~ '^\d+(\.\d+)?$' then continue; end if;
    v_criterion_score := (v_assessment->'subscores'->>v_criterion.dimension_key)::numeric;
    if v_criterion_score > 2 then continue; end if;
    v_criterion_json := coalesce(v_assessment->'criteria'->v_criterion.dimension_key,'{}'::jsonb);
    v_evidence_count := case when jsonb_typeof(v_criterion_json->'evidence')='array' then greatest(1,jsonb_array_length(v_criterion_json->'evidence')) else 1 end;
    v_skill_key := public.student_learning_build_skill_key('English','Writing rubric',v_criterion.display_name,null);
    v_source_key := concat_ws(':','writing',md5(v_logical_key),'rubric-focus',md5(v_skill_key));
    insert into public.student_learning_observations(
      school_id,student_id,subject,topic,skill,subskill,skill_key,observation_type,source_type,source_id,source_key,observed_at,
      evidence_percentage,evidence_count,evidence,system_generated,evidence_quality,contributes_to_focus_state
    ) values (
      v_school_id,v_student_id,'English','Writing rubric',v_criterion.display_name,v_genre,v_skill_key,'focus','writing_attempt',p_attempt_id,v_source_key,v_observed_at,
      greatest(0,least(100,v_criterion_score*20)),v_evidence_count,
      jsonb_build_object('writing_signal','rubric_focus','logical_attempt_key',v_logical_key,'attempt_id',p_attempt_id,
        'assessment_id',nullif(v_assessment->>'assessment_id',''),'genre',v_genre,'rubric_dimension',v_criterion.dimension_key,
        'rubric_score',v_criterion_score,'rubric_max',5,'criterion_evidence',v_criterion_json->'evidence',
        'justification',v_criterion_json->>'justification','improvement_action',v_criterion_json->>'improvement_action',
        'word_count',v_word_count,'target_word_count',v_target_words,'total_score',v_total_score,'evidence_quality',v_quality,
        'evaluator_version',v_assessment->>'evaluator_version','evaluator_model',v_assessment->>'evaluator_model'),
      true,v_quality,v_contributes
    ) on conflict (student_id,source_key) do update set source_id=excluded.source_id,observed_at=excluded.observed_at,
      evidence_percentage=excluded.evidence_percentage,evidence_count=excluded.evidence_count,evidence=excluded.evidence,
      evidence_quality=excluded.evidence_quality,contributes_to_focus_state=excluded.contributes_to_focus_state;
  end loop;

  foreach v_old_key in array v_old_keys loop perform public.student_learning_refresh_focus_state(v_student_id,v_old_key); end loop;
  for v_new_key in select distinct o.skill_key from public.student_learning_observations o
    where o.student_id=v_student_id and o.source_type='writing_attempt' and o.evidence->>'logical_attempt_key'=v_logical_key
      and o.evidence->>'writing_signal' in ('grounded_weakness','rubric_focus')
  loop perform public.student_learning_refresh_focus_state(v_student_id,v_new_key.skill_key); end loop;
end;
$$;

revoke all on function public.student_learning_ingest_writing_focus_evidence(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.student_learning_ingest_writing_focus_evidence(uuid,jsonb,timestamptz) to service_role;

create or replace function public.student_learning_capture_writing_focus_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.student_learning_ingest_writing_focus_evidence(new.id,new.payload,new.created_at);
  return new;
end;
$$;
revoke all on function public.student_learning_capture_writing_focus_evidence() from public,anon,authenticated;
grant execute on function public.student_learning_capture_writing_focus_evidence() to service_role;

drop trigger if exists trg_student_learning_capture_writing_focus_evidence on public.bh_writing_attempts;
create trigger trg_student_learning_capture_writing_focus_evidence
after insert or update of payload on public.bh_writing_attempts
for each row execute function public.student_learning_capture_writing_focus_evidence();

do $backfill_verified_writing_focus$
declare r record;
begin
  for r in select w.id,w.payload,w.created_at from public.bh_writing_attempts w
    where w.payload->'assessment'->>'assessment_status'='verified'
      and coalesce((w.payload->'assessment'->>'academic_profile_ready')::boolean,false)=true
    order by w.created_at,w.id
  loop perform public.student_learning_ingest_writing_focus_evidence(r.id,r.payload,r.created_at); end loop;
end
$backfill_verified_writing_focus$;
