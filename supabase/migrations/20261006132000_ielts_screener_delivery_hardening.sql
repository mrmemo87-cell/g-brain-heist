begin;

create or replace function private.ielts_screener_integrity_incident(p_attempt_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.ielts_exam_incidents i
    where i.attempt_id=p_attempt_id
      and i.severity='warning'
      and i.incident_type in (
        'screener_audio_load_failure','screener_audio_interruption',
        'network_disconnect','tab_hidden','paste_attempt','copy_attempt','suspicious_jump'
      )
  );
$$;
revoke all on function private.ielts_screener_integrity_incident(uuid) from public,anon,authenticated,service_role;

create or replace function private.score_ielts_diagnostic_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  e private.ielts_diagnostic_attempt_evidence%rowtype; item jsonb; answer jsonb; normalized text;
  state text; correct boolean; outcomes jsonb:='[]'; total int:=0; earned int:=0; answered int:=0;
  incident_count int; construct_count int; answered_constructs int; warnings jsonb; run_id uuid;
begin
  select * into e from private.ielts_diagnostic_attempt_evidence
    where attempt_id=new.attempt_id or (tg_op='UPDATE' and attempt_id=old.attempt_id);
  if e.attempt_id is null then return new; end if;
  if new.student_id<>e.student_id then raise exception 'diagnostic_submission_owner_mismatch'; end if;

  if tg_op='UPDATE' then
    if new.attempt_id is distinct from old.attempt_id
      or new.student_id is distinct from old.student_id
      or new.payload is distinct from old.payload
      or new.idempotency_key is distinct from old.idempotency_key
      or new.submitted_at is distinct from old.submitted_at
      or new.grading_status is distinct from 'graded'
      or new.grading_result->>'source' is distinct from 'governed_screener'
      or not exists(
        select 1 from private.ielts_diagnostic_scoring_runs r
        where r.submission_id=new.id and r.server_verified=true
          and (new.grading_result->>'scoring_run_id')::uuid=r.id
      )
    then
      raise exception 'diagnostic_submission_is_immutable';
    end if;
    return new;
  end if;

  if jsonb_typeof(new.payload)<>'object' then raise exception 'diagnostic_response_payload_invalid'; end if;
  for item in select value from jsonb_array_elements(e.form_snapshot->'items') loop
    answer:=new.payload #> array[item->>'skill',item->>'item_key'];
    state:=case when answer is null or answer='null'::jsonb or answer='""'::jsonb then 'unanswered'
      when jsonb_typeof(answer)<>'string' or length(answer#>>'{}')>2000 then 'invalid' else 'answered' end;
    normalized:=lower(trim(regexp_replace(coalesce(answer#>>'{}',''),'\\s+',' ','g')));
    if normalized='' and state='answered' then state:='unanswered'; end if;
    correct:=false;
    if state='answered' then
      answered:=answered+1;
      select exists(select 1 from jsonb_array_elements_text(item->'accepted_answers') a
        where lower(trim(regexp_replace(a,'\\s+',' ','g')))=normalized) into correct;
      if item->>'response_type'='multiple_choice' and not (item->'options') @> jsonb_build_array(answer) then correct:=false; end if;
      if item->>'max_words' is not null and cardinality(regexp_split_to_array(normalized,'\\s+'))>(item->>'max_words')::int then correct:=false; end if;
    end if;
    total:=total+1; earned:=earned+case when correct then 1 else 0 end;
    insert into private.ielts_diagnostic_responses(attempt_id,item_key,item_version,skill,task_key,taxonomy_snapshot,response_state,response,submitted_at)
    values(e.attempt_id,item->>'item_key',(item->>'item_version')::int,item->>'skill',item->>'task_key',item->'taxonomy',state,answer,new.submitted_at);
    outcomes:=outcomes||jsonb_build_array(jsonb_build_object('item_key',item->>'item_key','skill',item->>'skill',
      'construct',item#>>'{taxonomy,code}','response_state',state,'marks_awarded',case when correct then 1 else 0 end,'marks_possible',1));
  end loop;

  select count(*) into incident_count from public.ielts_exam_incidents i
    where i.attempt_id=e.attempt_id and i.severity='warning'
      and i.incident_type in ('screener_audio_load_failure','screener_audio_interruption','network_disconnect','tab_hidden','paste_attempt','copy_attempt','suspicious_jump');
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
      'content_reviewed_at',e.form_snapshot#>>'{version,reviewed_at}','scoring','server_objective'))
  returning id into run_id;

  update public.ielts_exam_submissions
  set grading_status='graded',
      grading_result=jsonb_build_object(
        'source','governed_screener','scoring_run_id',run_id,
        'raw_score',earned,'marks_possible',total,'server_verified',true
      )
  where id=new.id;
  return new;
end;
$$;

create or replace function public.rpc_ielts_diagnostic_result(p_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e private.ielts_diagnostic_attempt_evidence%rowtype; a public.ielts_exam_attempts%rowtype; r private.ielts_diagnostic_scoring_runs%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='not_authenticated'; end if;
  select * into e from private.ielts_diagnostic_attempt_evidence where attempt_id=p_attempt_id;
  select * into a from public.ielts_exam_attempts where id=p_attempt_id;
  if e.attempt_id is null then return null; end if;
  if not private.ielts_self_screener_assignment(a.assignment_id) and not private.actor_can_access_school_programme(e.school_id,'ielts',false) then raise exception using errcode='42501',message='not_authorized'; end if;
  if e.school_id is null and e.student_id<>auth.uid() then raise exception using errcode='42501',message='not_authorized'; end if;
  if e.student_id<>auth.uid() and not public.can_manage_ielts_exam(a.exam_event_id) and not exists(
    select 1 from public.class_teacher_assignments cta where cta.class_id=e.class_id and cta.school_id=e.school_id
      and cta.teacher_user_id=auth.uid() and coalesce(cta.active,true)) then
    raise exception using errcode='42501',message='not_authorized';
  end if;
  select * into r from private.ielts_diagnostic_scoring_runs where attempt_id=p_attempt_id order by run_version desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object('label','Screener result','mode',e.form_snapshot#>>'{version,mode}',
    'raw_score',r.raw_score,'marks_possible',r.marks_possible,'confidence',r.confidence,'warnings',r.warnings,
    'integrity_state',case when a.status='void' or private.ielts_screener_integrity_incident(p_attempt_id)
      then 'review_required' else r.integrity_state end,
    'outcomes',r.outcomes,'next_step','Review the sampled items with your teacher, then gather evidence in the remaining skills.',
    'readiness_available',false,'persistent_weakness_available',false);
end;
$$;

-- Backfill only submissions that already have a server-verified governed scoring run.
update public.ielts_exam_submissions s
set grading_status='graded',
    grading_result=jsonb_build_object(
      'source','governed_screener','scoring_run_id',r.id,
      'raw_score',r.raw_score,'marks_possible',r.marks_possible,'server_verified',r.server_verified
    )
from private.ielts_diagnostic_scoring_runs r
where r.submission_id=s.id and r.server_verified=true
  and (s.grading_status is distinct from 'graded'
       or s.grading_result->>'source' is distinct from 'governed_screener');

commit;
