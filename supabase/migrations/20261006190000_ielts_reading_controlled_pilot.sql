-- IELTS Bible v1.2.0: immutable, academically reviewed Reading controlled pilot.
-- No Reading public release, fabricated delivery approval, keys or content seed.
set lock_timeout = '5s';

alter table private.ielts_diagnostic_items drop constraint ielts_diagnostic_items_response_type_check;
alter table private.ielts_diagnostic_items add constraint ielts_diagnostic_items_response_type_check check(response_type in ('multiple_choice','true_false_not_given','short_answer','writing','speaking'));

create function private.validate_ielts_reading_passages(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare passage jsonb; paragraph jsonb; question jsonb;
begin
 if jsonb_typeof(p->'passages') is distinct from 'array' or jsonb_array_length(p->'passages') not between 2 and 6
   or length(p::text)>150000 then raise exception 'reading_passages_invalid'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p->'passages'))<>jsonb_array_length(p->'passages') then raise exception 'reading_passage_ids_invalid'; end if;
 for passage in select value from jsonb_array_elements(p->'passages') loop
  if jsonb_typeof(passage)<>'object' or exists(select 1 from jsonb_object_keys(passage) k where k not in ('id','title','paragraphs'))
    or coalesce(passage->>'id','') !~ '^[a-zA-Z0-9_-]{1,100}$'
    or jsonb_typeof(passage->'title') is distinct from 'string' or length(trim(passage->>'title')) not between 1 and 160
    or jsonb_typeof(passage->'paragraphs') is distinct from 'array' or jsonb_array_length(passage->'paragraphs') not between 1 and 30 then raise exception 'reading_passage_invalid'; end if;
  if (select count(distinct value->>'label') from jsonb_array_elements(passage->'paragraphs'))<>jsonb_array_length(passage->'paragraphs') then raise exception 'reading_paragraph_labels_invalid'; end if;
  for paragraph in select value from jsonb_array_elements(passage->'paragraphs') loop
   if jsonb_typeof(paragraph)<>'object' or exists(select 1 from jsonb_object_keys(paragraph) k where k not in ('label','text'))
    or jsonb_typeof(paragraph->'label') is distinct from 'string' or length(trim(paragraph->>'label')) not between 1 and 12
    or jsonb_typeof(paragraph->'text') is distinct from 'string' or length(trim(paragraph->>'text')) not between 1 and 12000 then raise exception 'reading_paragraph_invalid'; end if;
  end loop;
 end loop;
 if jsonb_typeof(p->'questions') is distinct from 'array' then raise exception 'reading_questions_required'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p->'questions'))<>jsonb_array_length(p->'questions') then raise exception 'reading_question_ids_invalid'; end if;
 for question in select value from jsonb_array_elements(p->'questions') loop
  if not exists(select 1 from jsonb_array_elements(p->'passages') x where x->>'id'=question->>'passage_id') then raise exception 'reading_passage_reference_invalid'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p->'passages') x where not exists(select 1 from jsonb_array_elements(p->'questions') q where q->>'passage_id'=x->>'id')) then raise exception 'reading_passage_has_no_items'; end if;
end; $$;
revoke all on function private.validate_ielts_reading_passages(jsonb) from public,anon,authenticated,service_role;

create or replace function private.guard_ielts_diagnostic_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.ielts_exam_forms%rowtype; item record; payload jsonb; question jsonb; questions jsonb; count_items int; count_questions int;
begin
  if tg_op<>'INSERT' and (old.state='published' or old.published_snapshot is not null) then raise exception 'published_diagnostic_is_immutable'; end if;
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

create or replace function private.guard_ielts_diagnostic_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_state text;
begin
  if tg_op='UPDATE' and new.version_id<>old.version_id then raise exception 'diagnostic_item_version_immutable'; end if;
  -- Same lock as publication prevents concurrent changes crossing the review gate.
  select state into v_state from private.ielts_diagnostic_versions
  where id=case when tg_op='DELETE' then old.version_id else new.version_id end for update;
  if v_state='published' or exists(select 1 from private.ielts_diagnostic_versions where id=case when tg_op='DELETE' then old.version_id else new.version_id end and published_snapshot is not null) then raise exception 'published_diagnostic_is_immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create or replace function private.guard_ielts_diagnostic_form() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype;
begin
  select * into v from private.ielts_diagnostic_versions where exam_form_id=old.id for update;
  if v.id is null then if tg_op='DELETE' then return old; end if; return new; end if;
  if tg_op='DELETE' then raise exception 'diagnostic_form_is_referenced'; end if;
  if (v.state='published' or v.published_snapshot is not null) and (to_jsonb(new)-'is_active') is distinct from (to_jsonb(old)-'is_active') then
    raise exception 'published_diagnostic_is_immutable';
  end if;
  if new.is_active and v.state<>'published' and not (v.state='in_review' and v.published_snapshot is not null) then raise exception 'diagnostic_not_published'; end if;
  return new;
end; $$;

create or replace function private.capture_ielts_diagnostic_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; a public.ielts_exam_assignments%rowtype;
begin
  select version.* into v from private.ielts_diagnostic_versions version
  where version.exam_form_id=new.form_id or version.id=(select version_id from private.ielts_diagnostic_attempt_evidence where attempt_id=new.id) for share;
  if v.id is null then return new; end if;
  if tg_op='UPDATE' and exists(select 1 from private.ielts_diagnostic_attempt_evidence where attempt_id=new.id) then
    if (new.id,new.student_id,new.form_id,new.assignment_id,new.exam_event_id,new.started_at)
      is distinct from (old.id,old.student_id,old.form_id,old.assignment_id,old.exam_event_id,old.started_at) then
      raise exception 'diagnostic_attempt_identity_immutable';
    end if;
    if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
      raise exception 'diagnostic_submission_time_immutable';
    end if;
    return new;
  end if;
  if v.state<>'published' and not (v.state='in_review' and v.published_snapshot is not null and private.ielts_screener_release_eligible(new.exam_event_id)) then raise exception 'diagnostic_not_published'; end if;
  if new.started_at is null then return new; end if;
  select * into a from public.ielts_exam_assignments where id=new.assignment_id;
  if a.student_id is distinct from new.student_id or a.form_id is distinct from new.form_id
    or a.exam_event_id is distinct from new.exam_event_id then raise exception 'diagnostic_assignment_mismatch'; end if;
  insert into private.ielts_diagnostic_attempt_evidence(attempt_id,version_id,student_id,school_id,class_id,form_snapshot,delivery_metadata)
  values(new.id,v.id,new.student_id,a.school_id,a.class_id,v.published_snapshot,
    jsonb_build_object('review_state',v.state,'delivery','existing_exam_mode','ends_at',new.ends_at,'accommodations','not_recorded','content_hash',v.content_hash));
  return new;
end; $$;

create or replace function private.guard_ielts_screener_release() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; f public.ielts_exam_forms%rowtype; k text;
begin
  select * into v from private.ielts_diagnostic_versions where id=new.version_id for share;
  select * into f from public.ielts_exam_forms where id=v.exam_form_id;
  if v.skills=array['reading']::text[] then
    if new.scope<>'pilot' then raise exception 'reading_public_delivery_validation_required'; end if;
    if v.state is distinct from 'in_review' or v.published_snapshot is null
      or v.review_record->'controlled_pilot' is distinct from 'true'::jsonb
      or v.provenance->>'rights_holder' is distinct from 'Brains Heist LLC'
      or f.exam_event_id is distinct from new.exam_event_id or v.content_hash is distinct from new.published_content_hash
      or new.audio_sha256<>'' or not exists(select 1 from public.ielts_exam_events where id=new.exam_event_id and school_id is null)
      then raise exception 'reading_reviewed_pilot_required'; end if;
    if tg_op='UPDATE' and (new.version_id,new.exam_event_id,new.published_content_hash,new.audio_sha256)
      is distinct from (old.version_id,old.exam_event_id,old.published_content_hash,old.audio_sha256) then raise exception 'screener_release_identity_immutable'; end if;
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
      and v.content_hash=r.published_content_hash and ((v.skills=array['reading']::text[] and r.scope='pilot' and r.audio_sha256='') or v.audio_provenance->>'sha256'=r.audio_sha256)
  );
$$;
revoke all on function private.ielts_screener_release_eligible(uuid) from public,anon,authenticated,service_role;


create or replace function private.ielts_self_screener_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.ielts_exam_assignments a
    join private.ielts_screener_releases r on r.exam_event_id=a.exam_event_id
    join private.ielts_diagnostic_versions v on v.id=r.version_id and v.exam_form_id=a.form_id
    join public.users u on u.id=a.student_id
    where a.id=p_assignment and a.delivery_kind='self_service' and a.student_id=auth.uid()
      and not coalesce(u.is_banned,false) and (v.state='published' or (v.state='in_review' and r.scope='pilot' and v.skills=array['reading']::text[] and v.published_snapshot is not null))
      and v.content_hash=r.published_content_hash
  );
$$;

create or replace function private.activate_ielts_screener_release(p_version uuid,p_scope text,p_pilot_users uuid[],
  p_authorized_by uuid,p_validation_record jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; f public.ielts_exam_forms%rowtype; e public.ielts_exam_events%rowtype;
begin
  select * into v from private.ielts_diagnostic_versions where id=p_version for share;
  select * into f from public.ielts_exam_forms where id=v.exam_form_id for update;
  select * into e from public.ielts_exam_events where id=f.exam_event_id for update;
  if (v.state is distinct from 'published' and not (p_scope='pilot' and v.state='in_review' and v.skills=array['reading']::text[] and v.published_snapshot is not null)) or e.school_id is not null then raise exception 'published_self_service_screener_required'; end if;
  if e.status not in ('draft','scheduled','live','paused') then raise exception 'screener_event_not_startable'; end if;
  insert into private.ielts_screener_releases(version_id,exam_event_id,scope,pilot_users,enabled,
    published_content_hash,audio_sha256,validation_record,authorized_by)
  values(v.id,e.id,p_scope,coalesce(p_pilot_users,'{}'),true,v.content_hash,coalesce(v.audio_provenance->>'sha256',''),
    coalesce(p_validation_record,'{}'),p_authorized_by)
  on conflict(version_id) do update set scope=excluded.scope,pilot_users=excluded.pilot_users,
    enabled=true,validation_record=excluded.validation_record,authorized_by=excluded.authorized_by,authorized_at=now();
  update public.ielts_exam_forms set is_active=true where id=f.id;
  if e.status='draft' then update public.ielts_exam_events set status='scheduled' where id=e.id; e.status:='scheduled'; end if;
  if e.status in ('scheduled','paused') then
    perform set_config('brainsheist.ielts_live_transition_exam_id',e.id::text,true);
    perform set_config('brainsheist.ielts_live_transition_actor_id',coalesce(auth.uid()::text,''),true);
    perform set_config('brainsheist.ielts_live_transition_action',case when e.status='paused' then 'resume' else 'launch' end,true);
    update public.ielts_exam_events set status='live',starts_at=least(starts_at,now()),
      ends_at=greatest(ends_at,now()+interval '1 year'),updated_at=now() where id=e.id;
    perform set_config('brainsheist.ielts_live_transition_exam_id','',true);
    perform set_config('brainsheist.ielts_live_transition_actor_id','',true);
    perform set_config('brainsheist.ielts_live_transition_action','',true);
  end if;
  insert into public.ielts_exam_audit_log(actor_id,exam_event_id,action,payload)
  values(p_authorized_by,e.id,'governed_screener_release',jsonb_build_object('version_id',v.id,
    'scope',p_scope,'content_hash',v.content_hash,'audio_sha256',v.audio_provenance->>'sha256',
    'validation_record',p_validation_record));
  return e.id;
end; $$;

create function private.prepare_ielts_reading_pilot(p_version uuid,p_reviewed_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype; h text;
begin
 select * into v from private.ielts_diagnostic_versions where id=p_version for update;
 if v.id is null or v.skills<>array['reading']::text[] or v.mode<>'screener' or v.state not in ('draft','in_review')
   or v.published_snapshot is not null then raise exception 'reading_unfrozen_draft_required'; end if;
 h:=encode(sha256(convert_to((private.ielts_diagnostic_snapshot(v.id)-'version')::text,'UTF8')),'hex');
 if h is distinct from p_reviewed_hash or v.review_record->>'reviewed_content_hash' is distinct from p_reviewed_hash
   or v.review_record->'controlled_pilot' is distinct from 'true'::jsonb then raise exception 'reviewed_version_mismatch'; end if;
 update private.ielts_diagnostic_versions set state='in_review' where id=v.id returning content_hash into h;
 return h;
end; $$;
revoke all on function private.prepare_ielts_reading_pilot(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.prepare_ielts_reading_pilot(uuid,text) to service_role;

do $patch$ declare s text; begin
 s:=pg_get_functiondef('private.score_ielts_diagnostic_submission()'::regprocedure);
 if position('item->>''response_type''=''multiple_choice''' in s)=0 then raise exception 'scorer_patch_source_mismatch'; end if;
 s:=replace(s,'item->>''response_type''=''multiple_choice''','item->>''response_type'' in (''multiple_choice'',''true_false_not_given'')');
 execute s;
end $patch$;
