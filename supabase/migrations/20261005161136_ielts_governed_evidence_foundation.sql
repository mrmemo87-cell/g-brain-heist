-- IELTS Bible v1.1.0. Additive evidence layer over existing Exam Mode.
-- No legacy content promotion, readiness conversion, or student launch.
set lock_timeout = '5s';

create table private.ielts_diagnostic_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(length(trim(code)) between 3 and 120),
  title text not null check(length(trim(title)) between 3 and 160),
  created_at timestamptz not null default now()
);
create table private.ielts_diagnostic_versions (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references private.ielts_diagnostic_definitions(id) on delete restrict,
  version integer not null check(version>0),
  exam_form_id uuid not null unique references public.ielts_exam_forms(id) on delete restrict,
  mode text not null check(mode in ('screener','baseline','reassessment','benchmark','practice')),
  test_type text not null check(test_type in ('academic','general_training','shared')),
  skills text[] not null check(cardinality(skills)>0 and skills <@ array['listening','reading','writing','speaking']::text[]),
  state text not null default 'draft' check(state in ('draft','in_review','published')),
  taxonomy_version_id uuid references public.academic_skill_registry_versions(id) on delete restrict,
  scoring_policy_version text not null,
  provenance jsonb not null default '{}' check(jsonb_typeof(provenance)='object'),
  audio_provenance jsonb not null default '{}' check(jsonb_typeof(audio_provenance)='object'),
  review_record jsonb not null default '{}' check(jsonb_typeof(review_record)='object'),
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  content_hash text,
  published_snapshot jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(definition_id,version)
);
create table private.ielts_diagnostic_items (
  version_id uuid not null references private.ielts_diagnostic_versions(id) on delete restrict,
  item_key text not null check(item_key ~ '^[a-zA-Z0-9_-]{1,100}$'),
  item_version integer not null default 1 check(item_version>0),
  task_key text not null check(length(trim(task_key))>0),
  skill text not null check(skill in ('listening','reading','writing','speaking')),
  order_index integer not null check(order_index>0),
  response_type text not null check(response_type in ('multiple_choice','short_answer','writing','speaking')),
  prompt text not null check(length(trim(prompt))>0),
  options jsonb not null default '[]' check(jsonb_typeof(options)='array'),
  accepted_answers jsonb not null default '[]' check(jsonb_typeof(accepted_answers)='array'),
  max_words integer check(max_words>0),
  marks_possible integer not null default 1 check(marks_possible between 1 and 100),
  taxonomy_node_id uuid references public.academic_skill_registry_nodes(id) on delete restrict,
  primary key(version_id,item_key),
  unique(version_id,order_index)
);
-- One evidence envelope per EXISTING attempt; this is not another attempt engine.
create table private.ielts_diagnostic_attempt_evidence (
  attempt_id uuid primary key references public.ielts_exam_attempts(id) on delete restrict,
  version_id uuid not null references private.ielts_diagnostic_versions(id) on delete restrict,
  student_id uuid not null references public.users(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid references public.classes(id) on delete restrict,
  form_snapshot jsonb not null,
  delivery_metadata jsonb not null default '{}',
  started_at timestamptz not null default now()
);
create table private.ielts_diagnostic_responses (
  attempt_id uuid not null references private.ielts_diagnostic_attempt_evidence(attempt_id) on delete restrict,
  item_key text not null,
  item_version integer not null,
  skill text not null,
  task_key text not null,
  taxonomy_snapshot jsonb not null,
  response_state text not null check(response_state in ('answered','unanswered','invalid')),
  response jsonb,
  submitted_at timestamptz not null,
  primary key(attempt_id,item_key)
);
create table private.ielts_diagnostic_scoring_runs (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references private.ielts_diagnostic_attempt_evidence(attempt_id) on delete restrict,
  submission_id uuid not null references public.ielts_exam_submissions(id) on delete restrict,
  scoring_policy_version text not null,
  run_version integer not null check(run_version>0),
  supersedes_id uuid references private.ielts_diagnostic_scoring_runs(id) on delete restrict,
  outcomes jsonb not null,
  raw_score integer not null check(raw_score>=0),
  marks_possible integer not null check(marks_possible>0 and raw_score<=marks_possible),
  confidence jsonb not null,
  warnings jsonb not null,
  integrity_state text not null check(integrity_state in ('unreviewed','review_required')),
  reviewer_provenance jsonb not null default '{}',
  server_verified boolean not null default true check(server_verified),
  created_at timestamptz not null default now(),
  unique(attempt_id,run_version)
);

alter table private.ielts_diagnostic_definitions enable row level security;
alter table private.ielts_diagnostic_versions enable row level security;
alter table private.ielts_diagnostic_items enable row level security;
alter table private.ielts_diagnostic_attempt_evidence enable row level security;
alter table private.ielts_diagnostic_responses enable row level security;
alter table private.ielts_diagnostic_scoring_runs enable row level security;
revoke all on private.ielts_diagnostic_definitions, private.ielts_diagnostic_versions,
  private.ielts_diagnostic_items, private.ielts_diagnostic_attempt_evidence,
  private.ielts_diagnostic_responses, private.ielts_diagnostic_scoring_runs
  from public,anon,authenticated,service_role;
-- Content maintenance is service-side only. Even the service cannot rewrite history.
grant select,insert,update on private.ielts_diagnostic_definitions,
  private.ielts_diagnostic_versions,private.ielts_diagnostic_items to service_role;
grant select on private.ielts_diagnostic_attempt_evidence,
  private.ielts_diagnostic_responses,private.ielts_diagnostic_scoring_runs to service_role;

create function private.ielts_diagnostic_snapshot(p_version uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',to_jsonb(v)-'content_hash'-'published_snapshot',
    'items',coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('taxonomy',to_jsonb(n)) order by i.order_index)
      from private.ielts_diagnostic_items i left join public.academic_skill_registry_nodes n on n.id=i.taxonomy_node_id
      where i.version_id=v.id),'[]'::jsonb),
    'delivery',jsonb_build_object('reading',f.reading_payload,'listening',f.listening_payload,
      'writing',f.writing_payload,'speaking',f.speaking_payload))
  from private.ielts_diagnostic_versions v join public.ielts_exam_forms f on f.id=v.exam_form_id where v.id=p_version;
$$;
revoke all on function private.ielts_diagnostic_snapshot(uuid) from public,anon,authenticated,service_role;

create function private.ielts_diagnostic_immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception using errcode='23514',message='diagnostic_evidence_is_immutable'; end;
$$;
revoke all on function private.ielts_diagnostic_immutable() from public,anon,authenticated,service_role;
create trigger immutable_ielts_attempt_evidence before update or delete on private.ielts_diagnostic_attempt_evidence
for each row execute function private.ielts_diagnostic_immutable();
create trigger immutable_ielts_responses before update or delete on private.ielts_diagnostic_responses
for each row execute function private.ielts_diagnostic_immutable();
create trigger immutable_ielts_scoring_runs before update or delete on private.ielts_diagnostic_scoring_runs
for each row execute function private.ielts_diagnostic_immutable();

create function private.guard_ielts_diagnostic_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_state text;
begin
  if tg_op='UPDATE' and new.version_id<>old.version_id then raise exception 'diagnostic_item_version_immutable'; end if;
  -- Same lock as publication prevents concurrent changes crossing the review gate.
  select state into v_state from private.ielts_diagnostic_versions
  where id=case when tg_op='DELETE' then old.version_id else new.version_id end for update;
  if v_state='published' then raise exception 'published_diagnostic_is_immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.guard_ielts_diagnostic_item() from public,anon,authenticated,service_role;
create trigger guard_ielts_diagnostic_item before insert or update or delete on private.ielts_diagnostic_items
for each row execute function private.guard_ielts_diagnostic_item();

create function private.guard_ielts_diagnostic_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.ielts_exam_forms%rowtype; item record; payload jsonb; question jsonb; questions jsonb; count_items int; count_questions int;
begin
  if tg_op<>'INSERT' and old.state='published' then raise exception 'published_diagnostic_is_immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and (new.id,new.exam_form_id,new.definition_id,new.version) is distinct from
    (old.id,old.exam_form_id,old.definition_id,old.version) then raise exception 'diagnostic_version_identity_immutable'; end if;
  select * into f from public.ielts_exam_forms where id=new.exam_form_id for update;
  if tg_op='INSERT' and exists(select 1 from public.ielts_exam_attempts where form_id=f.id) then
    raise exception 'legacy_attempts_cannot_be_promoted';
  end if;
  if new.state<>'published' then
    if f.is_active then raise exception 'draft_diagnostic_form_must_be_inactive'; end if;
    return new;
  end if;
  -- Other modes are modelled but deliberately cannot be launched with this policy.
  if new.mode<>'screener' or new.scoring_policy_version<>'ielts-objective-screener-v1'
    or not new.skills <@ array['listening','reading']::text[] then
    raise exception 'diagnostic_scoring_policy_not_implemented';
  end if;
  if new.review_record->>'reviewed_content_hash' is distinct from encode(sha256(convert_to((private.ielts_diagnostic_snapshot(new.id)-'version')::text,'UTF8')),'hex') then
    raise exception 'diagnostic_review_does_not_match_content';
  end if;
  if new.reviewed_by is null or new.reviewed_at is null or new.reviewed_at>now()
    or not (new.review_record @> '{"human_editorial":true,"answer_key":true,"taxonomy":true,"difficulty":true,"delivery":true}'::jsonb)
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
    if jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('title','instructions','questions','audio_url','assessment_mode')) then
      raise exception 'diagnostic_public_payload_not_allowlisted';
    end if;
  end loop;
  count_questions:=0;
  for item in select * from private.ielts_diagnostic_items where version_id=new.id order by order_index loop
    if not item.skill=any(new.skills) or item.response_type not in ('multiple_choice','short_answer') or item.marks_possible<>1
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
    payload:=case item.skill when 'listening' then f.listening_payload else f.reading_payload end;
    if payload->>'assessment_mode' is distinct from 'screener' then raise exception 'diagnostic_delivery_mode_required'; end if;
    questions:=payload->'questions';
    if jsonb_typeof(questions) is distinct from 'array' then raise exception 'diagnostic_delivery_questions_required'; end if;
    select q into question from jsonb_array_elements(questions) q where q->>'id'=item.item_key;
    if question is null or question->>'prompt' is distinct from item.prompt
      or question->>'type' is distinct from item.response_type
      or coalesce(question->'options','[]') is distinct from item.options
      or exists(select 1 from jsonb_object_keys(question) k where k not in ('id','prompt','type','options')) then
      raise exception 'diagnostic_delivery_item_mismatch';
    end if;
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
  new.published_at:=now();
  -- Payload/items are locked by the same version lock. Review metadata is hashed too.
  new.published_snapshot:=jsonb_set(private.ielts_diagnostic_snapshot(new.id),'{version}',to_jsonb(new)-'content_hash'-'published_snapshot');
  new.content_hash:=encode(sha256(convert_to(new.published_snapshot::text,'UTF8')),'hex');
  return new;
end; $$;
revoke all on function private.guard_ielts_diagnostic_version() from public,anon,authenticated,service_role;
create trigger guard_ielts_diagnostic_version before insert or update or delete on private.ielts_diagnostic_versions
for each row execute function private.guard_ielts_diagnostic_version();

create function private.guard_ielts_diagnostic_form() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.ielts_diagnostic_versions%rowtype;
begin
  select * into v from private.ielts_diagnostic_versions where exam_form_id=old.id for update;
  if v.id is null then if tg_op='DELETE' then return old; end if; return new; end if;
  if tg_op='DELETE' then raise exception 'diagnostic_form_is_referenced'; end if;
  if v.state='published' and (to_jsonb(new)-'is_active') is distinct from (to_jsonb(old)-'is_active') then
    raise exception 'published_diagnostic_is_immutable';
  end if;
  if new.is_active and v.state<>'published' then raise exception 'diagnostic_not_published'; end if;
  return new;
end; $$;
revoke all on function private.guard_ielts_diagnostic_form() from public,anon,authenticated,service_role;
create trigger guard_ielts_diagnostic_form before update or delete on public.ielts_exam_forms
for each row execute function private.guard_ielts_diagnostic_form();

create function private.capture_ielts_diagnostic_attempt() returns trigger
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
  if v.state<>'published' then raise exception 'diagnostic_not_published'; end if;
  if new.started_at is null then return new; end if;
  select * into a from public.ielts_exam_assignments where id=new.assignment_id;
  if a.student_id is distinct from new.student_id or a.form_id is distinct from new.form_id
    or a.exam_event_id is distinct from new.exam_event_id then raise exception 'diagnostic_assignment_mismatch'; end if;
  insert into private.ielts_diagnostic_attempt_evidence(attempt_id,version_id,student_id,school_id,class_id,form_snapshot,delivery_metadata)
  values(new.id,v.id,new.student_id,a.school_id,a.class_id,v.published_snapshot,
    jsonb_build_object('delivery','existing_exam_mode','ends_at',new.ends_at,'accommodations','not_recorded','content_hash',v.content_hash));
  return new;
end; $$;
revoke all on function private.capture_ielts_diagnostic_attempt() from public,anon,authenticated,service_role;
create trigger capture_ielts_diagnostic_attempt after insert or update on public.ielts_exam_attempts
for each row execute function private.capture_ielts_diagnostic_attempt();

create function private.score_ielts_diagnostic_submission() returns trigger
language plpgsql security definer set search_path='' as $$
declare e private.ielts_diagnostic_attempt_evidence%rowtype; item jsonb; answer jsonb; normalized text;
  state text; correct boolean; outcomes jsonb:='[]'; total int:=0; earned int:=0; answered int:=0;
  incident_count int; construct_count int; answered_constructs int; warnings jsonb;
begin
  select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=new.attempt_id or (tg_op='UPDATE' and attempt_id=old.attempt_id);
  if e.attempt_id is null then return new; end if;
  if new.student_id<>e.student_id then raise exception 'diagnostic_submission_owner_mismatch'; end if;
  if tg_op<>'INSERT' then raise exception 'diagnostic_submission_is_immutable'; end if;
  if jsonb_typeof(new.payload)<>'object' then raise exception 'diagnostic_response_payload_invalid'; end if;
  for item in select value from jsonb_array_elements(e.form_snapshot->'items') loop
    answer:=new.payload #> array[item->>'skill',item->>'item_key'];
    state:=case when answer is null or answer='null'::jsonb or answer='""'::jsonb then 'unanswered'
      when jsonb_typeof(answer)<>'string' or length(answer#>>'{}')>2000 then 'invalid' else 'answered' end;
    normalized:=lower(trim(regexp_replace(coalesce(answer#>>'{}',''),'\s+',' ','g')));
    if normalized='' and state='answered' then state:='unanswered'; end if;
    correct:=false;
    if state='answered' then
      answered:=answered+1;
      select exists(select 1 from jsonb_array_elements_text(item->'accepted_answers') a
        where lower(trim(regexp_replace(a,'\s+',' ','g')))=normalized) into correct;
      if item->>'response_type'='multiple_choice' and not (item->'options') @> jsonb_build_array(answer) then correct:=false; end if;
      if item->>'max_words' is not null and cardinality(regexp_split_to_array(normalized,'\s+'))>(item->>'max_words')::int then correct:=false; end if;
    end if;
    total:=total+1; earned:=earned+case when correct then 1 else 0 end;
    insert into private.ielts_diagnostic_responses(attempt_id,item_key,item_version,skill,task_key,taxonomy_snapshot,response_state,response,submitted_at)
    values(e.attempt_id,item->>'item_key',(item->>'item_version')::int,item->>'skill',item->>'task_key',item->'taxonomy',state,answer,new.submitted_at);
    outcomes:=outcomes||jsonb_build_array(jsonb_build_object('item_key',item->>'item_key','skill',item->>'skill',
      'construct',item#>>'{taxonomy,code}','response_state',state,'marks_awarded',case when correct then 1 else 0 end,'marks_possible',1));
  end loop;
  select count(*) into incident_count from public.ielts_exam_incidents where attempt_id=e.attempt_id;
  select count(distinct x->>'construct'),count(distinct x->>'construct') filter(where x->>'response_state'='answered')
    into construct_count,answered_constructs from jsonb_array_elements(outcomes) x;
  warnings:=jsonb_build_array('Short screener: this is not a complete IELTS skill assessment.',
    'No band estimate: this form has not been calibrated.','One sitting cannot establish a persistent weakness.');
  if incident_count>0 then warnings:=warnings||jsonb_build_array('Delivery interruptions need review.'); end if;
  if answered<total then warnings:=warnings||jsonb_build_array('Some items have no usable response; missing evidence is not a weakness.'); end if;
  insert into private.ielts_diagnostic_scoring_runs(attempt_id,submission_id,scoring_policy_version,run_version,outcomes,
    raw_score,marks_possible,confidence,warnings,integrity_state,reviewer_provenance)
  values(e.attempt_id,new.id,e.form_snapshot#>>'{version,scoring_policy_version}',1,outcomes,earned,total,
    jsonb_build_object('level','low','reason','Single short, uncalibrated screener','items_answered',answered,
      'items_possible',total,'constructs_sampled',construct_count,'constructs_with_responses',answered_constructs,
      'source_instances',1,'incident_count',incident_count),warnings,
    case when incident_count>0 then 'review_required' else 'unreviewed' end,
    jsonb_build_object('content_reviewer',e.form_snapshot#>>'{version,reviewed_by}',
      'content_reviewed_at',e.form_snapshot#>>'{version,reviewed_at}','scoring','server_objective'));
  return new;
end; $$;
revoke all on function private.score_ielts_diagnostic_submission() from public,anon,authenticated,service_role;
create trigger score_ielts_diagnostic_submission after insert or update on public.ielts_exam_submissions
for each row execute function private.score_ielts_diagnostic_submission();

-- Scoped read projection. Deliberately no answer keys, raw snapshots or band fields.
create function public.rpc_ielts_diagnostic_result(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e private.ielts_diagnostic_attempt_evidence%rowtype; a public.ielts_exam_attempts%rowtype; r private.ielts_diagnostic_scoring_runs%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='not_authenticated'; end if;
  select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=p_attempt_id;
  select * into a from public.ielts_exam_attempts where id=p_attempt_id;
  if e.attempt_id is null then return null; end if;
  if not private.actor_can_access_school_programme(e.school_id,'ielts',false) then raise exception using errcode='42501',message='not_authorized'; end if;
  if e.student_id<>auth.uid() and not public.can_manage_ielts_exam(a.exam_event_id) and not exists(
    select 1 from public.class_teacher_assignments cta where cta.class_id=e.class_id and cta.school_id=e.school_id
      and cta.teacher_user_id=auth.uid() and coalesce(cta.active,true)) then
    raise exception using errcode='42501',message='not_authorized';
  end if;
  select * into r from private.ielts_diagnostic_scoring_runs where attempt_id=p_attempt_id order by run_version desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object('label','Screener result','mode',e.form_snapshot#>>'{version,mode}',
    'raw_score',r.raw_score,'marks_possible',r.marks_possible,'confidence',r.confidence,'warnings',r.warnings,
    'integrity_state',case when a.status='void' or exists(select 1 from public.ielts_exam_incidents where attempt_id=p_attempt_id)
      then 'review_required' else r.integrity_state end,
    'outcomes',r.outcomes,'next_step','Review the sampled items with your teacher, then gather evidence in the remaining skills.',
    'readiness_available',false,'persistent_weakness_available',false);
end; $$;
revoke all on function public.rpc_ielts_diagnostic_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_diagnostic_result(uuid) to authenticated;
reset lock_timeout;
