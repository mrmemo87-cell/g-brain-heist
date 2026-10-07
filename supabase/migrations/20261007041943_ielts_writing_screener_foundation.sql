-- IELTS Bible v1.2.0. Additive Task 2 evidence and qualitative teacher review.
-- No content publication, AI score, band conversion or changes to historical attempts.
set lock_timeout='5s';

create function private.ielts_writing_rubric_snapshot(p_registry uuid,p_mappings jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version','bh-ielts-task2-observations-v1','criterion_mappings',p_mappings,
   'criterion_nodes',coalesce((select jsonb_object_agg(k.key,(select coalesce(jsonb_agg(to_jsonb(n) order by n.code),'[]')
     from public.academic_skill_registry_nodes n where n.registry_version_id=p_registry and n.code=any(select jsonb_array_elements_text(k.value))))
     from jsonb_each(p_mappings) k),'{}'));
$$;
revoke all on function private.ielts_writing_rubric_snapshot(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.ielts_writing_review_hash(p_version uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('content',private.ielts_diagnostic_snapshot(v.id)-'version',
   'rubric',private.ielts_writing_rubric_snapshot(v.taxonomy_version_id,v.provenance->'criterion_mappings'),'scoring_policy',v.scoring_policy_version)::text,'UTF8')),'hex')
 from private.ielts_diagnostic_versions v where v.id=p_version;
$$;
revoke all on function private.ielts_writing_review_hash(uuid) from public,anon,authenticated,service_role;

create function private.validate_ielts_writing_version(v private.ielts_diagnostic_versions) returns void
language plpgsql security definer set search_path='' as $$
declare f public.ielts_exam_forms%rowtype; i private.ielts_diagnostic_items%rowtype; k text; mapping jsonb;
begin
 select * into f from public.ielts_exam_forms where id=v.exam_form_id;
 if v.state<>'published' or v.mode<>'screener' or v.test_type<>'academic' or v.skills<>array['writing']::text[]
   or v.provenance->>'rights_holder' is distinct from 'Brains Heist LLC'
   or not exists(select 1 from public.ielts_exam_events where id=f.exam_event_id and duration_minutes=40)
   or v.audio_provenance<>'{}'::jsonb then raise exception 'writing_task2_policy_required'; end if;
 if v.reviewed_by is null or v.reviewed_at is null or v.reviewed_at>now()
   or not (v.review_record @> '{"human_editorial":true,"rubric":true,"taxonomy":true,"difficulty":true,"delivery":true}')
   or length(trim(coalesce(v.review_record->>'notes','')))=0
   or length(trim(coalesce(v.provenance->>'author','')))=0
   or length(trim(coalesce(v.provenance->>'rights_basis','')))=0
   or length(trim(coalesce(v.provenance->>'content_version','')))=0
   then raise exception 'writing_human_review_required'; end if;
 if v.review_record->>'reviewed_content_hash' is distinct from encode(sha256(convert_to(jsonb_build_object('content',private.ielts_diagnostic_snapshot(v.id)-'version','rubric',private.ielts_writing_rubric_snapshot(v.taxonomy_version_id,v.provenance->'criterion_mappings'),'scoring_policy',v.scoring_policy_version)::text,'UTF8')),'hex')
   then raise exception 'diagnostic_review_does_not_match_content'; end if;
 if not exists(select 1 from public.academic_skill_registry_versions where id=v.taxonomy_version_id and status='published')
   then raise exception 'diagnostic_reviewed_taxonomy_required'; end if;
 -- Both rating criteria and teachable micro-skills belong to the frozen rubric snapshot.
 mapping:=v.provenance->'criterion_mappings';
 if jsonb_typeof(mapping) is distinct from 'object' or (select count(*) from jsonb_object_keys(mapping))<>4
   then raise exception 'writing_criterion_mappings_required'; end if;
 foreach k in array array['task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy'] loop
   if jsonb_typeof(mapping->k) is distinct from 'array' or jsonb_array_length(mapping->k)=0 or exists(
     select 1 from jsonb_array_elements_text(mapping->k) m where not exists(select 1 from public.academic_skill_registry_nodes n
       where n.registry_version_id=v.taxonomy_version_id and n.code=m and n.node_type='subskill' and n.status='active'))
     then raise exception 'writing_criterion_mapping_invalid:%',k; end if;
 end loop;
 if f.reading_payload<>'{}'::jsonb or f.listening_payload<>'{}'::jsonb or coalesce(f.speaking_payload,'{}')<>'{}'::jsonb
   or f.answer_key is distinct from '{}'::jsonb or jsonb_typeof(f.writing_payload)<>'object'
   or exists(select 1 from jsonb_object_keys(f.writing_payload) as fields(field) where fields.field not in ('assessment_mode','title','instructions','questions','task_type','minimum_words','rubric_version'))
   or f.writing_payload->>'assessment_mode' is distinct from 'screener'
   or f.writing_payload->>'task_type' is distinct from 'academic_task2'
   or f.writing_payload->'minimum_words' is distinct from '250'::jsonb
   or f.writing_payload->>'rubric_version' is distinct from 'bh-ielts-task2-observations-v1'
   or length(trim(coalesce(f.writing_payload->>'instructions','')))=0
   or jsonb_typeof(f.writing_payload->'questions') is distinct from 'array' or jsonb_array_length(f.writing_payload->'questions')<>1
   then raise exception 'writing_delivery_payload_invalid'; end if;
 if (select count(*) from private.ielts_diagnostic_items where version_id=v.id)<>1 then raise exception 'writing_single_task_required'; end if;
 select * into i from private.ielts_diagnostic_items where version_id=v.id;
 if i.skill<>'writing' or i.response_type<>'writing' or i.options<>'[]' or i.accepted_answers<>'[]' or i.max_words is not null
   or not exists(select 1 from public.academic_skill_registry_nodes n where n.id=i.taxonomy_node_id and n.registry_version_id=v.taxonomy_version_id and n.code=any(
      select jsonb_array_elements_text(mapping->'task_response')) and n.node_type='subskill' and n.status='active')
   or (f.writing_payload->'questions'->0) is distinct from jsonb_build_object('id',i.item_key,'prompt',i.prompt,'type','essay')
   then raise exception 'writing_delivery_task_mismatch'; end if;
end; $$;
revoke all on function private.validate_ielts_writing_version(private.ielts_diagnostic_versions) from public,anon,authenticated,service_role;

create function private.validate_ielts_writing_release(p_hash text,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare k text;
begin
 if p_record->>'content_hash' is distinct from p_hash or nullif(trim(p_record->>'evidence_reference'),'') is null
   or nullif(p_record->>'tested_at','') is null or (p_record->>'tested_at')::timestamptz>now()
   then raise exception 'writing_delivery_evidence_required'; end if;
 foreach k in array array['authenticated_entitlement','start_resume','autosave','refresh_resume','network_interruption',
   'background_interruption','submission','idempotency','immutable_original','protected_content','result_safety',
   'teacher_review','review_scope','completed_persistence','mobile_browser','desktop_browser','automated_checks','delivery_acceptance'] loop
   if p_record->k is distinct from 'true'::jsonb then raise exception 'writing_validation_failed:%',k; end if;
 end loop;
end; $$;
revoke all on function private.validate_ielts_writing_release(text,jsonb) from public,anon,authenticated,service_role;
create or replace function private.guard_ielts_diagnostic_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.ielts_exam_forms%rowtype; item record; payload jsonb; question jsonb; questions jsonb; count_items int; count_questions int;
begin
  if tg_op<>'INSERT' and old.state='published' then raise exception 'published_diagnostic_is_immutable'; end if;
  if tg_op<>'INSERT' and old.published_snapshot is not null then
    -- The only allowed frozen-pilot change is publication metadata. All content,
    -- provenance, academic approvals and identities remain exactly unchanged.
    if tg_op<>'UPDATE' then raise exception 'published_diagnostic_is_immutable'; end if;
    if old.state<>'in_review' or old.skills<>array['reading']::text[] or new.state<>'published'
      or old.review_record->'controlled_pilot' is distinct from 'true'::jsonb
      or new.review_record->'controlled_pilot' is distinct from 'false'::jsonb
      or (to_jsonb(new)-array['state','published_at','published_snapshot','content_hash','review_record'])
         is distinct from (to_jsonb(old)-array['state','published_at','published_snapshot','content_hash','review_record'])
      or (new.review_record-array['delivery','controlled_pilot','notes','delivery_acceptance'])
         is distinct from (old.review_record-array['delivery','controlled_pilot','notes','delivery_acceptance'])
      or new.review_record->'delivery_acceptance'->>'pilot_content_hash' is distinct from old.content_hash
      or new.review_record->'delivery_acceptance'->>'authorized_by' is distinct from old.reviewed_by::text
      or (private.ielts_diagnostic_snapshot(old.id)-'version') is distinct from (old.published_snapshot-'version')
      then raise exception 'published_diagnostic_is_immutable'; end if;
    perform private.validate_ielts_reading_release(old.content_hash,new.review_record->'delivery_acceptance'->'validation');
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and (new.id,new.exam_form_id,new.definition_id,new.version) is distinct from
    (old.id,old.exam_form_id,old.definition_id,old.version) then raise exception 'diagnostic_version_identity_immutable'; end if;
  select * into f from public.ielts_exam_forms where id=new.exam_form_id for update;
  if tg_op='INSERT' and exists(select 1 from public.ielts_exam_attempts where form_id=f.id) then
    raise exception 'legacy_attempts_cannot_be_promoted';
  end if;
  if new.state<>'published' and not (new.state='in_review' and new.review_record @> '{"controlled_pilot":true}'::jsonb) then
    if f.is_active then raise exception 'draft_diagnostic_form_must_be_inactive'; end if;
    return new;
  end if;
  if new.scoring_policy_version='ielts-writing-task2-snapshot-v1' then
    perform private.validate_ielts_writing_version(new);
    new.published_at:=now();
    new.published_snapshot:=jsonb_set(private.ielts_diagnostic_snapshot(new.id),'{version}',to_jsonb(new)-'content_hash'-'published_snapshot');
    new.published_snapshot:=new.published_snapshot||jsonb_build_object('writing_rubric',private.ielts_writing_rubric_snapshot(new.taxonomy_version_id,new.provenance->'criterion_mappings'));
    new.content_hash:=encode(sha256(convert_to(new.published_snapshot::text,'UTF8')),'hex');
    return new;
  end if;
  if new.state='in_review' and (new.skills<>array['reading']::text[] or new.provenance->>'rights_holder' is distinct from 'Brains Heist LLC') then raise exception 'reading_controlled_pilot_required'; end if;
  -- Other modes are modelled but deliberately cannot be launched with this policy.
  if new.mode<>'screener' or new.scoring_policy_version<>'ielts-objective-screener-v1'
    or not new.skills <@ array['listening','reading']::text[] then
    raise exception 'diagnostic_scoring_policy_not_implemented';
  end if;
  if new.review_record->>'reviewed_content_hash' is distinct from encode(sha256(convert_to((private.ielts_diagnostic_snapshot(new.id)-'version')::text,'UTF8')),'hex') then
    raise exception 'diagnostic_review_does_not_match_content';
  end if;
  if new.reviewed_by is null or new.reviewed_at is null or new.reviewed_at>now()
    or not (new.review_record @> '{"human_editorial":true,"answer_key":true,"taxonomy":true,"difficulty":true}'::jsonb)
    or (new.state='published' and new.review_record->'delivery' is distinct from 'true'::jsonb)
    or length(trim(coalesce(new.review_record->>'notes','')))=0
    or length(trim(coalesce(new.provenance->>'author','')))=0
    or length(trim(coalesce(new.provenance->>'rights_basis','')))=0
    or length(trim(coalesce(new.provenance->>'content_version','')))=0 then
    raise exception 'diagnostic_human_review_and_provenance_required';
  end if;
  if not exists(select 1 from public.academic_skill_registry_versions where id=new.taxonomy_version_id and status='published') then
    raise exception 'diagnostic_reviewed_taxonomy_required';
  end if;
  if 'listening'=any(new.skills) and not (new.audio_provenance @> '{"human_reviewed":true}'::jsonb
    and length(trim(coalesce(new.audio_provenance->>'rights_basis','')))>0
    and coalesce(new.audio_provenance->>'sha256','') ~ '^[a-f0-9]{64}$'
    and coalesce(new.audio_provenance->>'url','') ~ '^https://') then
    raise exception 'diagnostic_reviewed_audio_required';
  end if;
  if ('reading'=any(new.skills) and new.test_type='shared') or exists(
    select 1 from unnest(new.skills) requested(skill_name) where (select count(*) from private.ielts_diagnostic_items i where i.version_id=new.id and i.skill=requested.skill_name)<4
  ) then raise exception 'diagnostic_skill_coverage_invalid'; end if;
  select count(*) into count_items from private.ielts_diagnostic_items where version_id=new.id;
  if count_items<8 or (select count(distinct taxonomy_node_id) from private.ielts_diagnostic_items where version_id=new.id)<3
    or (select count(distinct task_key) from private.ielts_diagnostic_items where version_id=new.id)<2 then
    raise exception 'diagnostic_screener_coverage_insufficient';
  end if;
  foreach payload in array array[f.reading_payload,f.listening_payload,f.writing_payload,coalesce(f.speaking_payload,'{}'::jsonb)] loop
    -- Allowlist prevents keys, transcripts, rationales or hidden hints in delivery JSON.
    if jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('title','instructions','questions','audio_url','assessment_mode','passages')) then
      raise exception 'diagnostic_public_payload_not_allowlisted';
    end if;
  end loop;
  if f.listening_payload ? 'passages' or f.writing_payload ? 'passages' or coalesce(f.speaking_payload,'{}'::jsonb) ? 'passages' then raise exception 'passages_are_reading_only'; end if;
  if f.reading_payload ? 'passages' then perform private.validate_ielts_reading_passages(f.reading_payload); end if;
  if new.state='in_review' and not f.reading_payload ? 'passages' then raise exception 'reading_passages_required'; end if;
  count_questions:=0;
  for item in select * from private.ielts_diagnostic_items where version_id=new.id order by order_index loop
    if not item.skill=any(new.skills) or item.response_type not in ('multiple_choice','true_false_not_given','short_answer') or item.marks_possible<>1
      or not exists(select 1 from public.academic_skill_registry_nodes where id=item.taxonomy_node_id
        and registry_version_id=new.taxonomy_version_id and node_type='subskill' and status='active') then
      raise exception 'diagnostic_item_mapping_invalid';
    end if;
    if jsonb_array_length(item.accepted_answers)=0 or exists(select 1 from jsonb_array_elements(item.accepted_answers) a
      where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}'))=0) then raise exception 'diagnostic_answer_key_invalid'; end if;
    if item.response_type='multiple_choice' and (jsonb_array_length(item.options)<>4
      or (select count(distinct lower(trim(o))) from jsonb_array_elements_text(item.options) o)<>4
      or exists(select 1 from jsonb_array_elements(item.options) o where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}'))=0)
      or jsonb_array_length(item.accepted_answers)<>1
      or not item.options @> item.accepted_answers) then raise exception 'diagnostic_mcq_key_invalid'; end if;
    if item.response_type='true_false_not_given' and (item.skill<>'reading' or item.options is distinct from '["TRUE","FALSE","NOT GIVEN"]'::jsonb or jsonb_array_length(item.accepted_answers)<>1 or not item.options @> item.accepted_answers) then raise exception 'diagnostic_tfng_key_invalid'; end if;
    payload:=case item.skill when 'listening' then f.listening_payload else f.reading_payload end;
    if payload->>'assessment_mode' is distinct from 'screener' then raise exception 'diagnostic_delivery_mode_required'; end if;
    questions:=payload->'questions';
    if jsonb_typeof(questions) is distinct from 'array' then raise exception 'diagnostic_delivery_questions_required'; end if;
    select q into question from jsonb_array_elements(questions) q where q->>'id'=item.item_key;
    if question is null or question->>'prompt' is distinct from item.prompt
      or question->>'type' is distinct from item.response_type
      or coalesce(question->'options','[]') is distinct from item.options
      or exists(select 1 from jsonb_object_keys(question) k where k not in ('id','prompt','type','options','passage_id')) then
      raise exception 'diagnostic_delivery_item_mismatch';
    end if;
    if payload ? 'passages' and question->>'passage_id' is distinct from item.task_key then raise exception 'reading_task_link_mismatch'; end if;
    if not payload ? 'passages' and question ? 'passage_id' then raise exception 'reading_passage_reference_invalid'; end if;
  end loop;
  for payload in select unnest(array[f.reading_payload,f.listening_payload,f.writing_payload,coalesce(f.speaking_payload,'{}'::jsonb)]) loop
    if payload ? 'questions' then
      if jsonb_typeof(payload->'questions')<>'array' then raise exception 'diagnostic_delivery_invalid'; end if;
      count_questions:=count_questions+jsonb_array_length(payload->'questions');
    end if;
  end loop;
  if count_questions<>count_items then raise exception 'diagnostic_delivery_item_count_mismatch'; end if;
  if 'listening'=any(new.skills) and f.listening_payload->>'audio_url' is distinct from new.audio_provenance->>'url' then
    raise exception 'diagnostic_audio_mismatch';
  end if;
  new.published_at:=case when new.state='published' then now() else null end;
  -- Payload/items are locked by the same version lock. Review metadata is hashed too.
  new.published_snapshot:=jsonb_set(private.ielts_diagnostic_snapshot(new.id),'{version}',to_jsonb(new)-'content_hash'-'published_snapshot');
  new.content_hash:=encode(sha256(convert_to(new.published_snapshot::text,'UTF8')),'hex');
  return new;
end; $$;

revoke all on function private.guard_ielts_diagnostic_version() from public,anon,authenticated,service_role;
create or replace function private.guard_ielts_screener_release() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; f public.ielts_exam_forms%rowtype; k text;
begin
  select * into v from private.ielts_diagnostic_versions where id=new.version_id for share;
  select * into f from public.ielts_exam_forms where id=v.exam_form_id;
  if v.skills=array['writing']::text[] then
    if v.state<>'published' or v.scoring_policy_version<>'ielts-writing-task2-snapshot-v1'
      or v.mode<>'screener' or f.exam_event_id is distinct from new.exam_event_id
      or v.content_hash is distinct from new.published_content_hash or new.audio_sha256<>''
      or not exists(select 1 from public.ielts_exam_events where id=new.exam_event_id and school_id is null)
      then raise exception 'writing_reviewed_version_required'; end if;
    if tg_op='UPDATE' and (new.version_id,new.exam_event_id,new.published_content_hash,new.audio_sha256)
      is distinct from (old.version_id,old.exam_event_id,old.published_content_hash,old.audio_sha256)
      then raise exception 'screener_release_identity_immutable'; end if;
    if new.enabled and new.scope='public' then
      perform private.validate_ielts_writing_release(new.published_content_hash,new.validation_record);
    end if;
    return new;
  end if;
  if v.skills=array['reading']::text[] then
    if v.mode<>'screener' or v.published_snapshot is null
      or v.provenance->>'rights_holder' is distinct from 'Brains Heist LLC'
      or f.exam_event_id is distinct from new.exam_event_id or v.content_hash is distinct from new.published_content_hash
      or new.audio_sha256<>'' or not exists(select 1 from public.ielts_exam_events where id=new.exam_event_id and school_id is null)
      then raise exception 'reading_reviewed_version_required'; end if;
    if new.scope='pilot' and not (v.state='in_review' and v.review_record->'controlled_pilot'='true'::jsonb)
      and v.state<>'published' then raise exception 'reading_reviewed_pilot_required'; end if;
    if new.scope='public' and v.state<>'published' then raise exception 'reading_public_delivery_validation_required'; end if;
    if tg_op='UPDATE' and (new.version_id,new.exam_event_id,new.audio_sha256)
      is distinct from (old.version_id,old.exam_event_id,old.audio_sha256) then raise exception 'screener_release_identity_immutable'; end if;
    if tg_op='UPDATE' and new.published_content_hash is distinct from old.published_content_hash then
      if old.scope<>'pilot' or new.scope<>'public' or v.state<>'published'
        or v.review_record->'delivery_acceptance'->>'pilot_content_hash' is distinct from old.published_content_hash
        or new.validation_record->>'pilot_content_hash' is distinct from old.published_content_hash
        then raise exception 'screener_release_identity_immutable'; end if;
    end if;
    if new.enabled and new.scope='public' then
      perform private.validate_ielts_reading_release(new.published_content_hash,new.validation_record);
    end if;
    return new;
  end if;
  if v.state is distinct from 'published' or v.mode<>'screener' or v.skills<>array['listening']::text[]
     or f.exam_event_id is distinct from new.exam_event_id
     or v.content_hash is distinct from new.published_content_hash
     or v.audio_provenance->>'sha256' is distinct from new.audio_sha256
     or v.provenance->>'rights_holder' is distinct from 'Brains Heist LLC'
     or v.audio_provenance->>'rights_holder' is distinct from 'Brains Heist LLC' then
    raise exception 'screener_release_version_mismatch';
  end if;
  if not exists(select 1 from public.ielts_exam_events where id=new.exam_event_id and school_id is null) then
    raise exception 'self_service_event_required';
  end if;
  if tg_op='UPDATE' and (new.version_id,new.exam_event_id,new.published_content_hash,new.audio_sha256)
    is distinct from (old.version_id,old.exam_event_id,old.published_content_hash,old.audio_sha256) then
    raise exception 'screener_release_identity_immutable';
  end if;
  -- A controlled pilot is allowed to establish delivery evidence. Broad release
  -- is impossible until the exact published content/audio has a recorded pass.
  if new.enabled and new.scope='public' then
    if new.validation_record->>'content_hash' is distinct from new.published_content_hash
       or new.validation_record->>'audio_sha256' is distinct from new.audio_sha256
       or nullif(new.validation_record->>'tested_at','') is null
       or nullif(new.validation_record->>'evidence_reference','') is null then
      raise exception 'screener_controlled_validation_required';
    end if;
    foreach k in array array['authenticated_entitlement','start_resume','audio_loading','reading_intervals',
      'response_intervals','pause_replay','autosave','refresh_resume','network_interruption',
      'background_interruption','submission','idempotency','server_scoring','protected_content',
      'result_safety','completed_persistence','mobile_browser','desktop_browser','automated_checks'] loop
      if new.validation_record->k is distinct from 'true'::jsonb then
        raise exception 'screener_validation_failed:%',k;
      end if;
    end loop;
  end if;
  return new;
end; $$;

revoke all on function private.guard_ielts_screener_release() from public,anon,authenticated,service_role;
create or replace function private.ielts_screener_release_eligible(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from private.ielts_screener_releases r
    join private.ielts_diagnostic_versions v on v.id=r.version_id
    join public.ielts_exam_forms f on f.id=v.exam_form_id
    join public.users u on u.id=auth.uid()
    where r.exam_event_id=p_event and r.enabled and (v.state='published' or (v.state='in_review' and r.scope='pilot' and v.skills=array['reading']::text[] and v.published_snapshot is not null)) and f.is_active
      and not coalesce(u.is_banned,false)
      and ((r.scope='public' and private.actor_has_programme_access('ielts',true))
        or (r.scope='pilot' and auth.uid()=any(r.pilot_users)))
      and v.content_hash=r.published_content_hash and ((v.skills in (array['reading']::text[],array['writing']::text[]) and r.audio_sha256='') or v.audio_provenance->>'sha256'=r.audio_sha256)
  );
$$;

revoke all on function private.ielts_screener_release_eligible(uuid) from public,anon,authenticated,service_role;

-- A productive observation has no objective mark or band. Preserve the same attempt/submission engine.
create table private.ielts_writing_screener_submissions (
 attempt_id uuid primary key references private.ielts_diagnostic_attempt_evidence(attempt_id) on delete restrict,
 submission_id uuid not null unique references public.ielts_exam_submissions(id) on delete restrict,
 response_text text not null check(length(response_text)<=100000),
 response_state text not null check(response_state in ('answered','unanswered','invalid')),
 response_sha256 text not null check(response_sha256 ~ '^[a-f0-9]{64}$'),
 word_count integer not null check(word_count>=0),
 evidence_kind text not null check(evidence_kind in ('first_sitting','same_prompt_practice')),
 rubric_snapshot jsonb not null,
 submitted_at timestamptz not null
);
create table private.ielts_writing_screener_reviews (
 id uuid primary key,
 attempt_id uuid not null references private.ielts_writing_screener_submissions(attempt_id) on delete restrict,
 run_version integer not null check(run_version>0),
 supersedes_id uuid references private.ielts_writing_screener_reviews(id) on delete restrict,
 response_sha256 text not null,
 criterion_observations jsonb not null,
 next_step text not null,
 delivery_comment text not null,
 reviewed_by uuid not null references public.users(id) on delete restrict,
 reviewed_at timestamptz not null default now(),
 unique(attempt_id,run_version)
);
alter table private.ielts_writing_screener_submissions enable row level security;
alter table private.ielts_writing_screener_reviews enable row level security;
create index ielts_writing_review_reviewer on private.ielts_writing_screener_reviews(reviewed_by);
create index ielts_writing_review_supersedes on private.ielts_writing_screener_reviews(supersedes_id);
revoke all on private.ielts_writing_screener_submissions,private.ielts_writing_screener_reviews from public,anon,authenticated,service_role;
grant select on private.ielts_writing_screener_submissions,private.ielts_writing_screener_reviews to service_role;
create trigger immutable_ielts_writing_submissions before update or delete on private.ielts_writing_screener_submissions for each row execute function private.ielts_diagnostic_immutable();
create trigger immutable_ielts_writing_reviews before update or delete on private.ielts_writing_screener_reviews for each row execute function private.ielts_diagnostic_immutable();

create table private.ielts_writing_screener_revisions (
 id uuid primary key,
 attempt_id uuid not null references private.ielts_writing_screener_submissions(attempt_id) on delete restrict,
 source_review_id uuid not null references private.ielts_writing_screener_reviews(id) on delete restrict,
 response_text text not null check(length(response_text) between 1 and 100000),
 response_sha256 text not null,
 created_at timestamptz not null default now()
);
alter table private.ielts_writing_screener_revisions enable row level security;
revoke all on private.ielts_writing_screener_revisions from public,anon,authenticated,service_role;
grant select on private.ielts_writing_screener_revisions to service_role;
create index ielts_writing_revision_review on private.ielts_writing_screener_revisions(source_review_id);
create index ielts_writing_revision_attempt_time on private.ielts_writing_screener_revisions(attempt_id,created_at desc);
create trigger immutable_ielts_writing_revisions before update or delete on private.ielts_writing_screener_revisions for each row execute function private.ielts_diagnostic_immutable();

create function private.capture_ielts_writing_submission(s public.ielts_exam_submissions,e private.ielts_diagnostic_attempt_evidence) returns void
language plpgsql security definer set search_path='' as $$
declare i jsonb; answer jsonb; txt text; response_state text; wc int; repeated boolean;
begin
 i:=e.form_snapshot->'items'->0;
 answer:=s.payload #> array['writing',i->>'item_key'];
 response_state:=case when answer is null or answer='null'::jsonb then 'unanswered'
   when jsonb_typeof(answer)<>'string' or length(answer#>>'{}')>100000 then 'invalid'
   when trim(regexp_replace(answer#>>'{}','\s+',' ','g'))='' then 'unanswered' else 'answered' end;
 txt:=case when response_state='invalid' then '' else coalesce(answer#>>'{}','') end;
 wc:=case when response_state<>'answered' then 0 else cardinality(regexp_split_to_array(trim(regexp_replace(txt,'\s+',' ','g')),'\s+')) end;
 select exists(select 1 from private.ielts_writing_screener_submissions prior
   join private.ielts_diagnostic_attempt_evidence pe on pe.attempt_id=prior.attempt_id
   where pe.student_id=e.student_id and pe.version_id=e.version_id and prior.attempt_id<>e.attempt_id) into repeated;
 insert into private.ielts_diagnostic_responses(attempt_id,item_key,item_version,skill,task_key,taxonomy_snapshot,response_state,response,submitted_at)
 values(e.attempt_id,i->>'item_key',(i->>'item_version')::int,'writing',i->>'task_key',i->'taxonomy',response_state,answer,s.submitted_at);
 insert into private.ielts_writing_screener_submissions(attempt_id,submission_id,response_text,response_state,response_sha256,word_count,evidence_kind,rubric_snapshot,submitted_at)
 values(e.attempt_id,s.id,txt,response_state,encode(sha256(convert_to(txt,'UTF8')),'hex'),wc,
   case when repeated then 'same_prompt_practice' else 'first_sitting' end,
   jsonb_build_object('version','bh-ielts-task2-observations-v1','rubric',e.form_snapshot->'writing_rubric',
     'scoring_policy','ielts-writing-task2-snapshot-v1','content_hash',e.delivery_metadata->>'content_hash'),s.submitted_at);
end; $$;
revoke all on function private.capture_ielts_writing_submission(public.ielts_exam_submissions,private.ielts_diagnostic_attempt_evidence) from public,anon,authenticated,service_role;
-- Fail closed if the canonical scorer no longer contains the expected branch point.
do $patch$ declare s text; anchor text:='  for item in select value from jsonb_array_elements(e.form_snapshot->''items'') loop'; begin
 s:=pg_get_functiondef('private.score_ielts_diagnostic_submission()'::regprocedure);
 if position(anchor in s)=0 then raise exception 'writing_scorer_source_mismatch'; end if;
 s:=replace(s,anchor,'  if e.form_snapshot#>>''{version,scoring_policy_version}''=''ielts-writing-task2-snapshot-v1'' then
    perform private.capture_ielts_writing_submission(new,e);
    return new;
  end if;
'||anchor);
 execute s;
end $patch$;

create function private.can_review_ielts_writing_screener(p_attempt uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
   select 1 from private.ielts_diagnostic_attempt_evidence e join public.ielts_exam_attempts a on a.id=e.attempt_id
   join public.users actor on actor.id=auth.uid() where e.attempt_id=p_attempt and not coalesce(actor.is_banned,false)
   and e.student_id<>auth.uid() and (
     public.is_superadmin(auth.uid())
     or (e.school_id is not null and private.actor_can_access_school_programme(e.school_id,'ielts',false) and (
       exists(select 1 from public.school_members m where m.user_id=auth.uid() and m.school_id=e.school_id and m.status='active' and m.role_in_school in ('school_admin','admin','owner'))
       or exists(select 1 from private.teacher_current_teaching_roster(auth.uid(),e.school_id) r where r.student_id=e.student_id
         and (lower(coalesce(r.academic_subject_code,'')) in ('english','ielts')
           or lower(trim(r.school_subject_name)) like 'english%' or lower(trim(r.school_subject_name)) like 'ielts%' or lower(trim(r.school_subject_name))='esl'))
       or (not exists(select 1 from private.teacher_current_teaching_groups(auth.uid(),e.school_id)) and exists(
         select 1 from public.class_students cs join public.classes cl on cl.id=cs.class_id and cl.school_id=e.school_id
         join public.class_teacher_assignments c on c.class_id=cs.class_id and c.school_id=e.school_id and c.teacher_user_id=auth.uid() and coalesce(c.active,true)
         where cs.student_id=e.student_id and (lower(trim(coalesce(c.subject,cl.subject,''))) like 'english%' or lower(trim(coalesce(c.subject,cl.subject,''))) like 'ielts%')))

     ))));
$$;
revoke all on function private.can_review_ielts_writing_screener(uuid) from public,anon,authenticated,service_role;

create function public.rpc_ielts_writing_screener_result(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e private.ielts_diagnostic_attempt_evidence%rowtype; s private.ielts_writing_screener_submissions%rowtype; r private.ielts_writing_screener_reviews%rowtype; incidents int;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authenticated'; end if;
 select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=p_attempt_id;
 if e.attempt_id is null then return null; end if;
 if not exists(select 1 from public.users where id=auth.uid() and not coalesce(is_banned,false))
   or (e.student_id<>auth.uid() and not private.can_review_ielts_writing_screener(p_attempt_id)) then
   raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_writing_screener_submissions where attempt_id=p_attempt_id;
 if s.attempt_id is null then return null; end if;
 select * into r from private.ielts_writing_screener_reviews where attempt_id=p_attempt_id order by run_version desc limit 1;
 select count(*) into incidents from public.ielts_exam_incidents where attempt_id=p_attempt_id;
 return jsonb_build_object('attempt_id',p_attempt_id,'student_id',e.student_id,'submitted_at',s.submitted_at,
   'prompt',e.form_snapshot#>>'{items,0,prompt}','response_text',s.response_text,'response_sha256',s.response_sha256,
   'response_state',s.response_state,'word_count',s.word_count,'evidence_kind',s.evidence_kind,
   'review_status',case when r.id is null then 'pending' else 'teacher_reviewed' end,'review_id',r.id,
   'criterion_observations',coalesce(r.criterion_observations,'{}'),'next_step',r.next_step,'delivery_comment',r.delivery_comment,
   'reviewed_at',r.reviewed_at,'confidence','low','incident_count',incidents,
   'practice_revision',(select jsonb_build_object('id',rev.id,'response_text',rev.response_text,'created_at',rev.created_at,'source_review_id',rev.source_review_id)
     from private.ielts_writing_screener_revisions rev where rev.attempt_id=p_attempt_id order by rev.created_at desc,rev.id limit 1),
   'can_review',private.can_review_ielts_writing_screener(p_attempt_id),'readiness_available',false,'persistent_weakness_available',false);
end; $$;
revoke all on function public.rpc_ielts_writing_screener_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_writing_screener_result(uuid) to authenticated;

create function public.rpc_ielts_writing_screener_review_queue() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x.row order by x.submitted_at),'[]') from (
   select s.submitted_at,jsonb_build_object('attempt_id',s.attempt_id,'student_name',u.username,'submitted_at',s.submitted_at,
     'word_count',s.word_count,'evidence_kind',s.evidence_kind,'review_status',case when exists(select 1 from private.ielts_writing_screener_reviews r where r.attempt_id=s.attempt_id) then 'teacher_reviewed' else 'pending' end) row
   from private.ielts_writing_screener_submissions s join private.ielts_diagnostic_attempt_evidence e on e.attempt_id=s.attempt_id
   join public.users u on u.id=e.student_id where private.can_review_ielts_writing_screener(s.attempt_id)
   order by s.submitted_at desc limit 100) x;
$$;
revoke all on function public.rpc_ielts_writing_screener_review_queue() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_writing_screener_review_queue() to authenticated;

create function public.rpc_ielts_submit_writing_screener_review(p_attempt_id uuid,p_review_id uuid,p_expected_review_id uuid,
 p_response_sha256 text,p_criterion_observations jsonb,p_next_step text,p_delivery_comment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.ielts_writing_screener_submissions%rowtype; prior private.ielts_writing_screener_reviews%rowtype;
 replay private.ielts_writing_screener_reviews%rowtype; k text; o jsonb; ev jsonb; start_pos int; end_pos int;
begin
 if not private.can_review_ielts_writing_screener(p_attempt_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ielts-writing-review:'||p_attempt_id::text,0));
 select * into s from private.ielts_writing_screener_submissions where attempt_id=p_attempt_id;
 if s.attempt_id is null or p_review_id is null or p_response_sha256 is distinct from s.response_sha256 then raise exception 'writing_review_source_mismatch'; end if;
 select * into replay from private.ielts_writing_screener_reviews where id=p_review_id;
 if replay.id is not null then
   if replay.attempt_id<>p_attempt_id or replay.reviewed_by<>auth.uid() or replay.response_sha256 is distinct from p_response_sha256
     or replay.criterion_observations is distinct from p_criterion_observations or replay.next_step is distinct from p_next_step
     or replay.delivery_comment is distinct from p_delivery_comment then raise exception 'writing_review_idempotency_conflict'; end if;
   return public.rpc_ielts_writing_screener_result(p_attempt_id);
 end if;
 select * into prior from private.ielts_writing_screener_reviews where attempt_id=p_attempt_id order by run_version desc limit 1;
 if prior.id is distinct from p_expected_review_id then raise exception 'writing_review_changed_reload'; end if;
 if jsonb_typeof(p_criterion_observations) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_criterion_observations))<>4
   or length(trim(coalesce(p_next_step,''))) not between 10 and 2000 or length(coalesce(p_delivery_comment,''))>2000
   then raise exception 'writing_review_incomplete'; end if;
 foreach k in array array['task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy'] loop
   o:=p_criterion_observations->k;
   if jsonb_typeof(o) is distinct from 'object' or exists(select 1 from jsonb_object_keys(o) f where f not in ('status','comment','evidence'))
     or coalesce(o->>'status','') not in ('observed','developing','insufficient_evidence')
     or jsonb_typeof(o->'comment') is distinct from 'string' or length(trim(o->>'comment')) not between 20 and 2000
     or jsonb_typeof(o->'evidence') is distinct from 'array' or jsonb_array_length(o->'evidence')>5
     or (o->>'status'<>'insufficient_evidence' and (jsonb_array_length(o->'evidence')=0 or s.response_state<>'answered'))
     then raise exception 'writing_criterion_incomplete:%',k; end if;
   for ev in select value from jsonb_array_elements(o->'evidence') loop
     if jsonb_typeof(ev)<>'object' or exists(select 1 from jsonb_object_keys(ev) f where f not in ('quote','start_char','end_char'))
       or jsonb_typeof(ev->'quote') is distinct from 'string' or length(ev->>'quote') not between 1 and 2000
       or coalesce(ev->>'start_char','') !~ '^[0-9]{1,6}$' or coalesce(ev->>'end_char','') !~ '^[0-9]{1,6}$'
       then raise exception 'writing_evidence_invalid'; end if;
     start_pos:=(ev->>'start_char')::int; end_pos:=(ev->>'end_char')::int;
     if end_pos<=start_pos or end_pos>length(s.response_text)
       or substring(s.response_text from start_pos+1 for end_pos-start_pos) is distinct from ev->>'quote'
       then raise exception 'writing_evidence_does_not_match_original'; end if;
   end loop;
 end loop;
 if exists(select 1 from public.ielts_exam_incidents where attempt_id=p_attempt_id) and length(trim(coalesce(p_delivery_comment,'')))<10
   then raise exception 'writing_delivery_review_required'; end if;
 insert into private.ielts_writing_screener_reviews(id,attempt_id,run_version,supersedes_id,response_sha256,criterion_observations,next_step,delivery_comment,reviewed_by)
 values(p_review_id,p_attempt_id,coalesce(prior.run_version,0)+1,prior.id,s.response_sha256,p_criterion_observations,p_next_step,coalesce(p_delivery_comment,''),auth.uid());
 return public.rpc_ielts_writing_screener_result(p_attempt_id);
end; $$;
revoke all on function public.rpc_ielts_submit_writing_screener_review(uuid,uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_submit_writing_screener_review(uuid,uuid,uuid,text,jsonb,text,text) to authenticated;

create function public.rpc_ielts_save_writing_screener_revision(p_attempt_id uuid,p_revision_id uuid,p_source_review_id uuid,p_response_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior private.ielts_writing_screener_revisions%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from private.ielts_diagnostic_attempt_evidence e join public.users u on u.id=e.student_id
   where e.attempt_id=p_attempt_id and e.student_id=auth.uid() and not coalesce(u.is_banned,false))
   then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_revision_id is null or length(trim(coalesce(p_response_text,''))) not between 1 and 100000
   or not exists(select 1 from private.ielts_writing_screener_reviews where id=p_source_review_id and attempt_id=p_attempt_id)
   then raise exception 'writing_revision_requires_reviewed_source'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ielts-writing-revision:'||p_attempt_id::text,0));
 select * into prior from private.ielts_writing_screener_revisions where id=p_revision_id;
 if prior.id is not null then
   if (prior.attempt_id,prior.source_review_id,prior.response_text) is distinct from (p_attempt_id,p_source_review_id,p_response_text)
     then raise exception 'writing_revision_idempotency_conflict'; end if;
 else
   insert into private.ielts_writing_screener_revisions(id,attempt_id,source_review_id,response_text,response_sha256)
   values(p_revision_id,p_attempt_id,p_source_review_id,p_response_text,encode(sha256(convert_to(p_response_text,'UTF8')),'hex'));
 end if;
 return public.rpc_ielts_writing_screener_result(p_attempt_id);
end; $$;
revoke all on function public.rpc_ielts_save_writing_screener_revision(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_save_writing_screener_revision(uuid,uuid,uuid,text) to authenticated;

-- Persist the existing live same-form practice behaviour in migrations too.
-- School assignments remain unique; self-service repeats receive a fresh attempt.
alter table public.ielts_exam_assignments drop constraint if exists ielts_exam_assignments_exam_event_id_student_id_key;
create unique index if not exists ielts_exam_assignments_school_event_student_uidx on public.ielts_exam_assignments(exam_event_id,student_id) where delivery_kind<>'self_service';
create or replace function public.rpc_ielts_screener_self_assign(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.ielts_screener_releases%rowtype; v private.ielts_diagnostic_versions%rowtype;
 e public.ielts_exam_events%rowtype; a public.ielts_exam_assignments%rowtype; t public.ielts_exam_attempts%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authenticated'; end if;
 select release.* into r from private.ielts_screener_releases release
   join private.ielts_diagnostic_versions version on version.id=release.version_id
   join private.ielts_diagnostic_definitions d on d.id=version.definition_id
   where d.code=p_code and private.ielts_screener_release_eligible(release.exam_event_id)
   order by release.authorized_at desc limit 1 for share of release;
 if r.version_id is null then raise exception using errcode='42501',message='screener_unavailable'; end if;
 -- Repeated launch clicks cannot create two fresh assignments for one student.
 perform pg_advisory_xact_lock(hashtextextended('ielts-self-assign:'||r.exam_event_id::text||':'||auth.uid()::text,0));
 select * into v from private.ielts_diagnostic_versions where id=r.version_id;
 select * into e from public.ielts_exam_events where id=r.exam_event_id for share;
 select * into a from public.ielts_exam_assignments where exam_event_id=e.id and student_id=auth.uid() order by created_at desc,id desc limit 1;
 if a.id is not null then select * into t from public.ielts_exam_attempts where assignment_id=a.id; end if;
 if a.id is null or (a.delivery_kind='self_service' and t.status in ('submitted','auto_submitted')) then
   if e.status<>'live' or now()<e.starts_at or now()>=e.ends_at then raise exception 'screener_unavailable'; end if;
   insert into public.ielts_exam_assignments(exam_event_id,student_id,school_id,form_id,delivery_kind)
   select e.id,u.id,u.school_id,v.exam_form_id,'self_service' from public.users u where u.id=auth.uid() and not coalesce(u.is_banned,false) returning * into a;
   t:=null;
 end if;
 if not private.ielts_self_screener_assignment(a.id) or a.status='void' then raise exception 'screener_unavailable'; end if;
 if t.id is null then select * into t from public.ielts_exam_attempts where assignment_id=a.id; end if;
 return jsonb_build_object('exam_event_id',e.id,'assignment_id',a.id,'attempt_id',t.id);
end; $$;
revoke all on function public.rpc_ielts_screener_self_assign(text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_screener_self_assign(text) to authenticated;
