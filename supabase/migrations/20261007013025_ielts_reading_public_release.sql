-- IELTS Bible v1.2.0: metadata-only publication of an unchanged reviewed Reading pilot.
-- This migration does not publish content or assert any device/delivery test passed.
set lock_timeout = '5s';

create function private.validate_ielts_reading_release(p_hash text,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare k text;
begin
 if p_record->>'content_hash' is distinct from p_hash
   or nullif(trim(p_record->>'evidence_reference'),'') is null
   or nullif(p_record->>'tested_at','') is null then raise exception 'reading_delivery_evidence_required'; end if;
 if (p_record->>'tested_at')::timestamptz>now() then raise exception 'reading_delivery_evidence_future'; end if;
 foreach k in array array['authenticated_entitlement','start_resume','autosave','refresh_resume',
   'network_interruption','background_interruption','submission','idempotency','server_scoring',
   'protected_content','result_safety','completed_persistence','mobile_browser','desktop_browser',
   'automated_checks','delivery_acceptance'] loop
  if p_record->k is distinct from 'true'::jsonb then raise exception 'reading_validation_failed:%',k; end if;
 end loop;
end; $$;
revoke all on function private.validate_ielts_reading_release(text,jsonb) from public,anon,authenticated,service_role;

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

create or replace function private.guard_ielts_screener_release() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; f public.ielts_exam_forms%rowtype; k text;
begin
  select * into v from private.ielts_diagnostic_versions where id=new.version_id for share;
  select * into f from public.ielts_exam_forms where id=v.exam_form_id;
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
      and v.content_hash=r.published_content_hash and ((v.skills=array['reading']::text[] and r.audio_sha256='') or v.audio_provenance->>'sha256'=r.audio_sha256)
  );
$$;

create function private.publish_ielts_reading_release(p_version uuid,p_pilot_hash text,p_authorized_by uuid,p_validation jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; r private.ielts_screener_releases%rowtype; h text; validation jsonb;
begin
 select * into v from private.ielts_diagnostic_versions where id=p_version for update;
 select * into r from private.ielts_screener_releases where version_id=p_version for update;
 if v.id is null or v.state<>'in_review' or v.skills<>array['reading']::text[] or v.mode<>'screener'
   or v.published_snapshot is null or v.content_hash is distinct from p_pilot_hash
   or r.version_id is null or r.scope<>'pilot' or not r.enabled
   or r.published_content_hash is distinct from p_pilot_hash
   or p_authorized_by is distinct from v.reviewed_by
   then raise exception 'reading_reviewed_pilot_required'; end if;
 perform private.validate_ielts_reading_release(p_pilot_hash,p_validation);
 update private.ielts_diagnostic_versions set state='published',
   review_record=review_record||jsonb_build_object('delivery',true,'controlled_pilot',false,
     'notes',review_record->>'notes'||' Public delivery acceptance recorded separately below.',
     'delivery_acceptance',jsonb_build_object('pilot_content_hash',p_pilot_hash,'authorized_by',p_authorized_by,
       'authorized_at',now(),'validation',p_validation))
   where id=p_version returning content_hash into h;
 validation:=p_validation||jsonb_build_object('content_hash',h,'pilot_content_hash',p_pilot_hash);
 update private.ielts_screener_releases set scope='public',pilot_users='{}',published_content_hash=h,
   validation_record=validation,authorized_by=p_authorized_by,authorized_at=now() where version_id=p_version;
 insert into public.ielts_exam_audit_log(actor_id,exam_event_id,action,payload)
 values(p_authorized_by,r.exam_event_id,'governed_reading_public_release',jsonb_build_object(
   'version_id',p_version,'pilot_content_hash',p_pilot_hash,'content_hash',h,'validation_record',validation));
 return r.exam_event_id;
end; $$;
revoke all on function private.publish_ielts_reading_release(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.publish_ielts_reading_release(uuid,text,uuid,jsonb) to service_role;
