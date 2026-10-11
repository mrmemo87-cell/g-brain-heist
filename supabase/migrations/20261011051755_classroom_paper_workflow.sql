-- Additive paper workflow; existing online RPCs retain their contracts.
alter table public.assignments add column if not exists delivery_mode text not null default 'online'
  check (delivery_mode in ('online','paper','mixed'));
alter table public.student_assignment_results add column if not exists completion_source text not null default 'online'
  check (completion_source in ('online','paper'));
alter table public.student_assignment_results add column if not exists timing_available boolean not null default true;
create unique index if not exists student_assignments_assignment_student_unique
  on public.student_assignments(assignment_id,student_id);

-- Stable, unique, readable codes do not depend on a truncated UUID.
create sequence if not exists public.assignment_display_code_seq;
revoke all on sequence public.assignment_display_code_seq from public,anon,authenticated;
alter table public.assignments add column if not exists assignment_code text not null
  default ('BH-'||nextval('public.assignment_display_code_seq')::text);
create unique index if not exists assignments_display_code_unique on public.assignments(assignment_code);

-- Authoritative marks are writable only through governed RPCs / service workers.
revoke insert,update,delete on public.student_assignment_answers,public.student_assignment_results from anon,authenticated;

create table if not exists public.assignment_paper_drafts (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  recorded_by uuid not null references public.users(id),
  form_hash text not null,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers)='object'),
  assessed_at timestamptz not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(assignment_id,student_id)
);
alter table public.assignment_paper_drafts enable row level security;
revoke all on public.assignment_paper_drafts from public,anon,authenticated;

create table if not exists public.assignment_paper_submissions (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  recorded_by uuid not null references public.users(id),
  form_hash text not null,
  answers jsonb not null,
  assessed_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  replaced_partial_answers jsonb not null default '[]'::jsonb,
  primary key(assignment_id,student_id)
);
alter table public.assignment_paper_submissions enable row level security;
revoke all on public.assignment_paper_submissions from public,anon,authenticated;

create or replace function private.paper_assignment_id(p_assignment_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='NOT_AUTHENTICATED'; end if;
  v_id:=private.assignment_logical_canonical_id(p_assignment_id);
  if not exists(select 1 from public.assignments a join public.teachers t on t.id=a.teacher_id
    join public.school_members sm on sm.school_id=a.school_id and sm.user_id=t.user_id and sm.status='active'
    where a.id=v_id and t.user_id=auth.uid()) or not public.can_use_feature('assignments',false) then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;
  return v_id;
end $function$;
revoke all on function private.paper_assignment_id(uuid) from public,anon,authenticated,service_role;

create or replace function private.paper_form_hash(p_assignment_id uuid) returns text
language sql stable set search_path='' as $function$
  select md5(coalesce(string_agg(aq.question_id::text||':'||aq.order_index::text||':'||aq.question_snapshot::text,'|' order by aq.order_index,aq.question_id),''))
  from public.assignment_questions aq where aq.assignment_id=p_assignment_id
$function$;
revoke all on function private.paper_form_hash(uuid) from public,anon,authenticated,service_role;

create or replace function public.rpc_teacher_paper_workspace(p_assignment_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_id uuid;v_packet jsonb;
begin
  v_id:=private.paper_assignment_id(p_assignment_id);
  v_packet:=public.rpc_teacher_assignment_print_packet(v_id);
  return v_packet || jsonb_build_object(
    'formHash',private.paper_form_hash(v_id),
    'code',(select assignment_code from public.assignments where id=v_id),
    'answerKey',coalesce((select jsonb_object_agg(question_id::text,question_snapshot->>'correct_answer') from public.assignment_questions where assignment_id=v_id),'{}'::jsonb),
    'deliveryMode',(select delivery_mode from public.assignments where id=v_id),
    'students',coalesce((select jsonb_agg(jsonb_build_object(
      'id',sa.student_id,'name',coalesce(nullif(u.full_name,''),u.username,'Student'),
      'status',sa.status,'source',r.completion_source,'timingAvailable',r.timing_available,
      'existingAnswerCount',(select count(*) from public.student_assignment_answers x where x.assignment_id=v_id and x.student_id=sa.student_id),
      'draft',case when d.student_id is not null then jsonb_build_object('answers',d.answers,'assessedAt',d.assessed_at,'revision',d.revision,'formHash',d.form_hash) else null end,
      'accuracy',r.accuracy,'completedAt',r.completed_at
    ) order by coalesce(nullif(u.full_name,''),u.username),sa.student_id)
    from public.student_assignments sa join public.users u on u.id=sa.student_id
    left join public.student_assignment_results r on r.assignment_id=sa.assignment_id and r.student_id=sa.student_id
    left join public.assignment_paper_drafts d on d.assignment_id=sa.assignment_id and d.student_id=sa.student_id
    where sa.assignment_id=v_id),'[]'::jsonb));
end $function$;
revoke all on function public.rpc_teacher_paper_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_paper_workspace(uuid) to authenticated;

create or replace function private.validate_paper_answers(p_assignment_id uuid,p_answers jsonb,p_complete boolean)
returns void language plpgsql set search_path='' as $function$
declare v_q record;v_answer jsonb;v_type text;
begin
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'INVALID_PAPER_ANSWERS'; end if;
  if exists(select 1 from jsonb_object_keys(p_answers) k where not exists(
    select 1 from public.assignment_questions aq where aq.assignment_id=p_assignment_id and aq.question_id::text=k)) then raise exception 'QUESTION_NOT_IN_ASSIGNMENT'; end if;
  if not exists(select 1 from public.assignment_questions where assignment_id=p_assignment_id) then raise exception 'ASSIGNMENT_HAS_NO_QUESTIONS'; end if;
  for v_q in select question_id,question_snapshot s from public.assignment_questions where assignment_id=p_assignment_id loop
    if not p_answers ? v_q.question_id::text then
      if p_complete then raise exception 'PAPER_ANSWERS_INCOMPLETE'; end if;
      continue;
    end if;
    v_type:=coalesce(v_q.s->>'question_type','multiple_choice');
    if v_type not in ('multiple_choice','true_false') then raise exception 'PAPER_QUESTION_TYPE_UNSUPPORTED'; end if;
    if nullif(trim(v_q.s->>'correct_answer'),'') is null then raise exception 'ASSIGNMENT_ANSWER_KEY_MISSING'; end if;
    v_answer:=p_answers->v_q.question_id::text;
    if v_answer='null'::jsonb then continue; end if; -- deliberate unanswered item
    if jsonb_typeof(v_answer)<>'string' or not exists(select 1 from jsonb_array_elements(v_q.s->'options') o
      where (case when jsonb_typeof(o)='string' then o#>>'{}' else o->>'text' end)=(v_answer#>>'{}'))
      then raise exception 'INVALID_PAPER_OPTION'; end if;
  end loop;
end $function$;
revoke all on function private.validate_paper_answers(uuid,jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function public.rpc_teacher_save_paper_draft(p_assignment_id uuid,p_student_id uuid,p_form_hash text,
 p_answers jsonb,p_assessed_at timestamptz,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_id uuid;v_d public.assignment_paper_drafts%rowtype;
begin
  v_id:=private.paper_assignment_id(p_assignment_id);
  perform 1 from public.student_assignments where assignment_id=v_id and student_id=p_student_id for update;
  if not found then raise exception 'STUDENT_NOT_ASSIGNED'; end if;
  if exists(select 1 from public.student_assignment_results where assignment_id=v_id and student_id=p_student_id) then raise exception 'ALREADY_COMPLETED'; end if;
  if p_form_hash is distinct from private.paper_form_hash(v_id) then raise exception 'PAPER_VERSION_CHANGED'; end if;
  if p_assessed_at is null or p_assessed_at>now()+interval '5 minutes' then raise exception 'INVALID_ASSESSMENT_DATE'; end if;
  perform private.validate_paper_answers(v_id,p_answers,false);
  select * into v_d from public.assignment_paper_drafts where assignment_id=v_id and student_id=p_student_id;
  -- Acknowledgement lost after commit: a replay of the same payload is safe.
  if found and v_d.answers=p_answers and v_d.assessed_at=p_assessed_at and v_d.form_hash=p_form_hash then
    return jsonb_build_object('revision',v_d.revision);
  end if;
  if coalesce(v_d.revision,0) is distinct from p_revision then raise exception 'PAPER_DRAFT_CHANGED'; end if;
  insert into public.assignment_paper_drafts(assignment_id,student_id,recorded_by,form_hash,answers,assessed_at,revision)
  values(v_id,p_student_id,auth.uid(),p_form_hash,p_answers,p_assessed_at,coalesce(v_d.revision,0)+1)
  on conflict(assignment_id,student_id) do update set recorded_by=excluded.recorded_by,form_hash=excluded.form_hash,
    answers=excluded.answers,assessed_at=excluded.assessed_at,revision=excluded.revision,updated_at=now()
  returning * into v_d;
  return jsonb_build_object('revision',v_d.revision);
end $function$;
revoke all on function public.rpc_teacher_save_paper_draft(uuid,uuid,text,jsonb,timestamptz,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_save_paper_draft(uuid,uuid,text,jsonb,timestamptz,integer) to authenticated;

create or replace function public.rpc_teacher_confirm_paper(p_assignment_id uuid,p_student_id uuid,p_form_hash text,
 p_answers jsonb,p_assessed_at timestamptz,p_replace_partial boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_id uuid;v_a public.assignments%rowtype;v_prior public.assignment_paper_submissions%rowtype;
 v_replaced jsonb;v_correct integer;v_count integer;v_score integer;v_accuracy integer;
begin
  v_id:=private.paper_assignment_id(p_assignment_id);
  perform 1 from public.student_assignments where assignment_id=v_id and student_id=p_student_id for update;
  if not found then raise exception 'STUDENT_NOT_ASSIGNED'; end if;
  select * into v_prior from public.assignment_paper_submissions where assignment_id=v_id and student_id=p_student_id;
  if found then
    if v_prior.form_hash is distinct from p_form_hash or v_prior.answers is distinct from p_answers or v_prior.assessed_at is distinct from p_assessed_at then raise exception 'ALREADY_COMPLETED'; end if;
    return jsonb_build_object('success',true,'alreadySubmitted',true);
  end if;
  if exists(select 1 from public.student_assignment_results where assignment_id=v_id and student_id=p_student_id) then raise exception 'ALREADY_COMPLETED'; end if;
  select * into v_a from public.assignments where id=v_id;
  if v_a.publish_status<>'published' or v_a.assigned_at>now() then raise exception 'ASSIGNMENT_NOT_PUBLISHED'; end if;
  if p_assessed_at is null or p_assessed_at>now()+interval '5 minutes' or p_assessed_at<v_a.assigned_at then raise exception 'INVALID_ASSESSMENT_DATE'; end if;
  if v_a.close_submissions_after_due and v_a.due_at is not null and p_assessed_at>v_a.due_at then raise exception 'ASSIGNMENT_CLOSED'; end if;
  if p_form_hash is distinct from private.paper_form_hash(v_id) then raise exception 'PAPER_VERSION_CHANGED'; end if;
  perform private.validate_paper_answers(v_id,p_answers,true);
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_replaced from public.student_assignment_answers x where assignment_id=v_id and student_id=p_student_id;
  if jsonb_array_length(v_replaced)>0 and not coalesce(p_replace_partial,false) then raise exception 'ONLINE_PROGRESS_EXISTS'; end if;
  insert into public.assignment_paper_submissions(assignment_id,student_id,recorded_by,form_hash,answers,assessed_at,replaced_partial_answers)
    values(v_id,p_student_id,auth.uid(),p_form_hash,p_answers,p_assessed_at,v_replaced);
  delete from public.student_assignment_answers where assignment_id=v_id and student_id=p_student_id;
  insert into public.student_assignment_answers(assignment_id,student_id,question_id,question_text,correct_answer,student_answer,is_correct,
    time_taken_ms,answered_at,grading_status,grading_source,grading_confidence,reviewed_at)
  select v_id,p_student_id,aq.question_id,aq.question_snapshot->>'question_text',aq.question_snapshot->>'correct_answer',
    coalesce(p_answers->>aq.question_id::text,''),
    p_answers->aq.question_id::text<>'null'::jsonb and private.normalize_assignment_answer(p_answers->>aq.question_id::text)=private.normalize_assignment_answer(aq.question_snapshot->>'correct_answer'),
    0,p_assessed_at,'graded','deterministic',1,now()
  from public.assignment_questions aq where aq.assignment_id=v_id;
  select count(*)::integer,count(*) filter(where saa.is_correct)::integer,
    coalesce(sum(case when saa.is_correct then coalesce((aq.question_snapshot->>'points')::integer,0) else 0 end),0)::integer
  into v_count,v_correct,v_score from public.student_assignment_answers saa join public.assignment_questions aq
    on aq.assignment_id=saa.assignment_id and aq.question_id=saa.question_id where saa.assignment_id=v_id and saa.student_id=p_student_id;
  v_accuracy:=round(100.0*v_correct/v_count)::integer;
  update public.student_assignments set status='completed',completed_at=p_assessed_at where assignment_id=v_id and student_id=p_student_id;
  insert into public.student_assignment_results(assignment_id,student_id,correct,incorrect,accuracy,score,time_taken_seconds,completed_at,
    submitted_late,pending_review_count,grading_status,completion_source,timing_available)
    values(v_id,p_student_id,v_correct,v_count-v_correct,v_accuracy,v_score,0,p_assessed_at,
      v_a.due_at is not null and p_assessed_at>v_a.due_at,0,'final','paper',false);
  delete from public.assignment_paper_drafts where assignment_id=v_id and student_id=p_student_id;
  return jsonb_build_object('success',true,'accuracy',v_accuracy,'correct',v_correct,'total',v_count);
end $function$;
revoke all on function public.rpc_teacher_confirm_paper(uuid,uuid,text,jsonb,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_confirm_paper(uuid,uuid,text,jsonb,timestamptz,boolean) to authenticated;

create or replace function public.rpc_create_assignment_classroom(p_payload jsonb,p_delivery_mode text) returns public.assignments
language plpgsql security definer set search_path='' as $function$
declare v_a public.assignments;
begin
 if p_delivery_mode is null or p_delivery_mode not in ('online','paper','mixed') then raise exception 'INVALID_DELIVERY_MODE'; end if;
 select * into v_a from public.rpc_create_assignment(p_teacher_id => (p_payload->>'p_teacher_id')::uuid, p_subject_id => (p_payload->>'p_subject_id')::text, p_subject_name => (p_payload->>'p_subject_name')::text, p_topic_name => (p_payload->>'p_topic_name')::text, p_batch => (p_payload->>'p_batch')::text, p_question_ids => case when jsonb_typeof(p_payload->'p_question_ids')='array' then array(select jsonb_array_elements_text(p_payload->'p_question_ids'))::uuid[] else null end, p_assigned_at => (p_payload->>'p_assigned_at')::timestamptz, p_due_at => (p_payload->>'p_due_at')::timestamptz, p_title => (p_payload->>'p_title')::text, p_instructions => (p_payload->>'p_instructions')::text, p_difficulty => (p_payload->>'p_difficulty')::text, p_assignment_mode => (p_payload->>'p_assignment_mode')::text, p_student_ids => case when jsonb_typeof(p_payload->'p_student_ids')='array' then array(select jsonb_array_elements_text(p_payload->'p_student_ids'))::uuid[] else null end, p_description => (p_payload->>'p_description')::text, p_publish_status => (p_payload->>'p_publish_status')::text, p_close_submissions_after_due => (p_payload->>'p_close_submissions_after_due')::boolean, p_notify_students_by_email => (p_payload->>'p_notify_students_by_email')::boolean, p_assignment_category => (p_payload->>'p_assignment_category')::text, p_client_timezone => (p_payload->>'p_client_timezone')::text);
 perform private.paper_assignment_id(v_a.id);
 update public.assignments set delivery_mode=p_delivery_mode where id=v_a.id returning * into v_a;
 return v_a;
end $function$;
revoke all on function public.rpc_create_assignment_classroom(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_create_assignment_classroom(jsonb,text) to authenticated;

create or replace function public.rpc_update_assignment_classroom(p_payload jsonb,p_delivery_mode text) returns public.assignments
language plpgsql security definer set search_path='' as $function$
declare v_a public.assignments;
begin
 if p_delivery_mode is null or p_delivery_mode not in ('online','paper','mixed') then raise exception 'INVALID_DELIVERY_MODE'; end if;
 select * into v_a from public.rpc_update_teacher_assignment(p_assignment_id => (p_payload->>'p_assignment_id')::uuid, p_subject_id => (p_payload->>'p_subject_id')::text, p_subject_name => (p_payload->>'p_subject_name')::text, p_topic_name => (p_payload->>'p_topic_name')::text, p_batch => (p_payload->>'p_batch')::text, p_question_ids => case when jsonb_typeof(p_payload->'p_question_ids')='array' then array(select jsonb_array_elements_text(p_payload->'p_question_ids'))::uuid[] else null end, p_assigned_at => (p_payload->>'p_assigned_at')::timestamptz, p_due_at => (p_payload->>'p_due_at')::timestamptz, p_title => (p_payload->>'p_title')::text, p_instructions => (p_payload->>'p_instructions')::text, p_difficulty => (p_payload->>'p_difficulty')::text, p_assignment_mode => (p_payload->>'p_assignment_mode')::text, p_student_ids => case when jsonb_typeof(p_payload->'p_student_ids')='array' then array(select jsonb_array_elements_text(p_payload->'p_student_ids'))::uuid[] else null end, p_description => (p_payload->>'p_description')::text, p_publish_status => (p_payload->>'p_publish_status')::text, p_close_submissions_after_due => (p_payload->>'p_close_submissions_after_due')::boolean, p_notify_students_by_email => (p_payload->>'p_notify_students_by_email')::boolean, p_assignment_category => (p_payload->>'p_assignment_category')::text, p_client_timezone => (p_payload->>'p_client_timezone')::text);
 perform private.paper_assignment_id(v_a.id);
 update public.assignments set delivery_mode=p_delivery_mode where id=v_a.id returning * into v_a;
 return v_a;
end $function$;
revoke all on function public.rpc_update_assignment_classroom(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_update_assignment_classroom(jsonb,text) to authenticated;

create or replace function public.rpc_teacher_assignment_delivery_context(p_assignment_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'delivery_mode',a.delivery_mode,
   'completions',coalesce((select jsonb_agg(jsonb_build_object('student_id',r.student_id,'completion_source',r.completion_source,'timing_available',r.timing_available))
     from public.student_assignment_results r where r.assignment_id=a.id),'[]'::jsonb))),'[]'::jsonb)
 from public.assignments a join public.teachers t on t.id=a.teacher_id
 where auth.uid() is not null and t.user_id=auth.uid() and a.id=any(p_assignment_ids);
$function$;
revoke all on function public.rpc_teacher_assignment_delivery_context(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_assignment_delivery_context(uuid[]) to authenticated;

-- Legacy entry points delegate to the same locking and grading authority.
create or replace function public.rpc_submit_assignment_answer(p_assignment_id uuid,p_question_id uuid,p_question_text text,p_correct_answer text,p_student_answer text,p_is_correct boolean,p_time_taken_ms integer default 0)
returns void language plpgsql security definer set search_path='' as $function$
begin perform public.rpc_submit_assignment_answer_v2(p_assignment_id,p_question_id,p_question_text,p_correct_answer,p_student_answer,p_is_correct,p_time_taken_ms);end $function$;
revoke all on function public.rpc_submit_assignment_answer(uuid,uuid,text,text,text,boolean,integer) from public,anon;
grant execute on function public.rpc_submit_assignment_answer(uuid,uuid,text,text,text,boolean,integer) to authenticated,service_role;
create or replace function public.rpc_submit_assignment_result(p_assignment_id uuid,p_correct integer,p_incorrect integer,p_accuracy integer,p_score integer,p_time_taken integer)
returns void language plpgsql security definer set search_path='' as $function$
begin perform public.rpc_submit_assignment_result_v2(p_assignment_id,p_correct,p_incorrect,p_accuracy,p_score,p_time_taken);end $function$;
revoke all on function public.rpc_submit_assignment_result(uuid,integer,integer,integer,integer,integer) from public,anon;
grant execute on function public.rpc_submit_assignment_result(uuid,integer,integer,integer,integer,integer) to authenticated,service_role;

-- Delivery is enforced even if an older client still exposes Start Assignment.
create or replace function private.guard_paper_assignment_delivery() returns trigger
language plpgsql security definer set search_path='' as $function$
begin
 if auth.uid()=new.student_id and exists(select 1 from public.assignments where id=new.assignment_id and delivery_mode='paper') then
  raise exception 'PAPER_ASSIGNMENT_COMPLETE_IN_CLASS';
 end if;
 return new;
end $function$;
revoke all on function private.guard_paper_assignment_delivery() from public,anon,authenticated,service_role;
create trigger guard_paper_assignment_delivery before insert on public.student_assignment_answers
 for each row execute function private.guard_paper_assignment_delivery();

-- Expose mode in the existing compact student payload without another request.
create or replace function public.rpc_get_student_assignment_summaries() returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_student_id uuid:=auth.uid();
begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED';end if;
 return(select coalesce(jsonb_agg(payload order by status_priority,assigned_at),'[]'::jsonb) from(
 select jsonb_build_object(
 'assignment_id',a.id,'subject_id',a.subject_id,'subject_name',a.subject_name,'topic_name',a.topic_name,'batch',a.batch,'teacher_username',u.username,'assigned_at',a.assigned_at,'due_at',a.due_at,'title',a.title,'instructions',a.instructions,'publish_status',a.publish_status,'close_submissions_after_due',a.close_submissions_after_due,'is_late',(a.due_at is not null and a.due_at<now()),'is_closed',(a.close_submissions_after_due and a.due_at is not null and a.due_at<now()),'student_status',sa.status,
 'delivery_mode',a.delivery_mode,
 'question_count',(select count(*) from public.assignment_questions aq where aq.assignment_id=a.id),'questions','[]'::jsonb
 ) as payload,case when sa.status='in_progress' then 0 else 1 end as status_priority,sa.assigned_at
 from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id
 where sa.student_id=v_student_id and sa.status in('pending','in_progress') and a.publish_status in('published','scheduled') and a.assigned_at<=now() and exists(select 1 from public.assignment_questions aq where aq.assignment_id=a.id)
 ) active_assignments);
end $function$;
revoke all on function public.rpc_get_student_assignment_summaries() from public,anon;
grant execute on function public.rpc_get_student_assignment_summaries() to authenticated,service_role;
