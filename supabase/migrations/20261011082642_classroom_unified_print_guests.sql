-- Unnamed sheets are issued booklets, never synthetic user accounts.
create table public.assignment_scan_guests (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.assignment_scan_sessions(id) on delete cascade,
 guest_number integer not null check(guest_number between 1 and 200), claimed_name text not null default '' check(length(claimed_name)<=120),
 local_reference text not null default '' check(length(local_reference)<=80), held_at timestamptz,
 linked_student_id uuid references public.users(id), linked_by uuid references public.users(id), linked_at timestamptz,
 unique(session_id,guest_number), unique(id,session_id),
 check((linked_student_id is null and linked_by is null and linked_at is null) or (linked_student_id is not null and linked_by is not null and linked_at is not null))
);
alter table public.assignment_scan_guests enable row level security;
revoke all on public.assignment_scan_guests from public,anon,authenticated;
alter table public.assignment_scan_sheets alter column student_id drop not null;
alter table public.assignment_scan_sheets add column guest_id uuid;
alter table public.assignment_scan_sheets add constraint scan_guest_session_fk foreign key(guest_id,session_id) references public.assignment_scan_guests(id,session_id) on delete cascade;
alter table public.assignment_scan_sheets add constraint scan_sheet_identity check(student_id is not null or guest_id is not null);
create unique index assignment_scan_guest_page_idx on public.assignment_scan_sheets(session_id,guest_id,page_number) where guest_id is not null;
create index assignment_scan_sheets_guest_idx on public.assignment_scan_sheets(guest_id) where guest_id is not null;
create index assignment_scan_guests_pending_idx on public.assignment_scan_guests(session_id) where linked_student_id is null;
create index assignment_scan_guests_linked_student_idx on public.assignment_scan_guests(linked_student_id) where linked_student_id is not null;
create index assignment_scan_guests_linked_by_idx on public.assignment_scan_guests(linked_by) where linked_by is not null;
alter table public.assignment_scan_sessions add column guest_count integer not null default 0 check(guest_count between 0 and 200);
-- Full snapshots retained server-side for provenance; never included in QR/session responses.
alter table public.assignment_scan_sessions add column question_snapshots jsonb;
update public.assignment_scan_sessions s set question_snapshots=(select jsonb_agg(to_jsonb(q) order by q.order_index,q.question_id) from public.assignment_questions q where q.assignment_id=s.assignment_id);
create or replace function public.rpc_teacher_scan_session(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_s public.assignment_scan_sessions;
begin
 select * into v_s from private.scan_session(p_session_id);
 return jsonb_build_object('id',v_s.id,'assignmentId',v_s.assignment_id,'assessedAt',v_s.assessed_at,'formHash',v_s.form_hash,'guestCount',v_s.guest_count,
 'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'studentId',s.student_id,'studentName',coalesce(nullif(u.full_name,''),u.username,nullif(g.claimed_name,''),'Unnamed · G'||lpad(g.guest_number::text,3,'0')),
 'guestId',g.id,'guestNumber',g.guest_number,'claimedName',g.claimed_name,'localReference',g.local_reference,'heldAt',g.held_at,
 'pageNumber',s.page_number,'pageCount',s.page_count,'layoutVersion',s.layout_version,'questions',s.questions,
 'scanId',a.id,'imageHash',a.image_hash,'detected',a.detected,'reviewedAnswers',a.reviewed_answers,'confirmedAt',a.confirmed_at)
 order by coalesce(nullif(u.full_name,''),u.username,lpad(g.guest_number::text,3,'0')),s.page_number)
 from public.assignment_scan_sheets s left join public.users u on u.id=s.student_id
 left join public.assignment_scan_guests g on g.id=s.guest_id
 left join public.assignment_scan_attempts a on a.id=s.latest_scan_id where s.session_id=v_s.id),'[]'::jsonb));
end $function$;
revoke all on function public.rpc_teacher_scan_session(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_scan_session(uuid) to authenticated;
create or replace function public.rpc_teacher_issue_unnamed_sheets(p_assignment_id uuid,p_session_id uuid,p_count integer,p_assessed_at timestamptz,p_option_order jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_id uuid;v_s public.assignment_scan_sessions;v_a public.assignments;v_q record;v_options jsonb;v_rows jsonb;v_guest uuid;v_pages integer;
begin
 v_id:=private.paper_assignment_id(p_assignment_id);
 select * into v_a from public.assignments where id=v_id;
 if v_a.publish_status<>'published' or v_a.assigned_at>now() then raise exception 'ASSIGNMENT_NOT_PUBLISHED';end if;
 if p_session_id is null or p_count is null or p_count not between 1 and 200 then raise exception 'INVALID_GUEST_COUNT';end if;
 if p_assessed_at is null or p_assessed_at<v_a.assigned_at or p_assessed_at>now()+interval '5 minutes' then raise exception 'INVALID_ASSESSMENT_DATE';end if;
 if jsonb_typeof(p_option_order) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_option_order))<>(select count(*) from public.assignment_questions where assignment_id=v_id) then raise exception 'INVALID_OPTION_ORDER';end if;
 v_rows:='[]'::jsonb;
 for v_q in select * from public.assignment_questions where assignment_id=v_id order by order_index,question_id loop
 v_options:=p_option_order->v_q.question_id::text;
 if coalesce(v_q.question_snapshot->>'question_type','multiple_choice') not in ('multiple_choice','true_false') then raise exception 'PAPER_QUESTION_TYPE_UNSUPPORTED';end if;
 if jsonb_typeof(v_options) is distinct from 'array' then raise exception 'INVALID_OPTION_ORDER';end if;
 if jsonb_array_length(v_options) not between 2 and 4 or jsonb_array_length(v_options)<>jsonb_array_length(v_q.question_snapshot->'options')
 or exists(select 1 from jsonb_array_elements(v_options) o where jsonb_typeof(o)<>'string' or nullif(trim(o#>>'{}'),'') is null)
 or (select count(distinct o) from jsonb_array_elements(v_options) o)<>jsonb_array_length(v_options)
 or exists(select 1 from jsonb_array_elements(v_options) o where not exists(select 1 from jsonb_array_elements(v_q.question_snapshot->'options') x where (case when jsonb_typeof(x)='string' then x#>>'{}' else x->>'text' end)=(o#>>'{}'))) then raise exception 'INVALID_OPTION_ORDER';end if;
 v_rows:=v_rows||jsonb_build_array(jsonb_build_object('questionId',v_q.question_id,'orderIndex',v_q.order_index,'options',v_options));
 end loop;
 if jsonb_array_length(v_rows)=0 or jsonb_array_length(v_rows)>200 then raise exception 'SCAN_QUESTION_LIMIT';end if;

 insert into public.assignment_scan_sessions(id,assignment_id,issued_by,assessed_at,form_hash,option_order,student_ids,guest_count,question_snapshots)
 values(p_session_id,v_id,auth.uid(),p_assessed_at,private.paper_form_hash(v_id),p_option_order,'{}'::uuid[],p_count,
 (select jsonb_agg(to_jsonb(q) order by q.order_index,q.question_id) from public.assignment_questions q where q.assignment_id=v_id)) on conflict(id) do nothing;
 select * into v_s from private.scan_session(p_session_id);
 if v_s.assignment_id<>v_id or v_s.assessed_at<>p_assessed_at or v_s.option_order<>p_option_order or v_s.guest_count<>p_count or cardinality(v_s.student_ids)<>0 then raise exception 'SCAN_SESSION_CONFLICT';end if;
 v_pages:=ceil(jsonb_array_length(v_rows)/40.0)::integer;
 for v_number in 1..p_count loop
 insert into public.assignment_scan_guests(session_id,guest_number) values(p_session_id,v_number) on conflict(session_id,guest_number) do nothing;
 select id into v_guest from public.assignment_scan_guests where session_id=p_session_id and guest_number=v_number;
 for v_page in 1..v_pages loop
 insert into public.assignment_scan_sheets(session_id,guest_id,page_number,page_count,questions)
 values(p_session_id,v_guest,v_page,v_pages,(select jsonb_agg(value order by ordinality) from jsonb_array_elements(v_rows) with ordinality where ordinality between (v_page-1)*40+1 and v_page*40))
 on conflict(session_id,guest_id,page_number) where guest_id is not null do nothing;
 end loop;end loop;
 return public.rpc_teacher_scan_session(p_session_id);
end $function$;
revoke all on function public.rpc_teacher_issue_unnamed_sheets(uuid,uuid,integer,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_issue_unnamed_sheets(uuid,uuid,integer,timestamptz,jsonb) to authenticated;
create or replace function public.rpc_teacher_save_scan(p_scan_id uuid,p_sheet_id uuid,p_image_hash text,p_detected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_sheet public.assignment_scan_sheets;v_s public.assignment_scan_sessions;v_prior public.assignment_scan_attempts;v_q jsonb;v_d jsonb;v_inserted integer;
begin
 select * into v_sheet from public.assignment_scan_sheets where id=p_sheet_id;
 if not found then raise exception 'SHEET_NOT_FOUND';end if;
 select * into v_s from private.scan_session(v_sheet.session_id);
 if v_sheet.guest_id is not null then
 perform 1 from public.assignment_scan_guests where id=v_sheet.guest_id for update;
 if exists(select 1 from public.assignment_scan_guests where id=v_sheet.guest_id and (held_at is not null or linked_at is not null)) then raise exception 'GUEST_RESULT_LOCKED';end if;
 end if;
 perform 1 from public.student_assignments where assignment_id=v_s.assignment_id and student_id=v_sheet.student_id for update;
 select * into v_sheet from public.assignment_scan_sheets where id=p_sheet_id for update;
 if exists(select 1 from public.student_assignment_results where assignment_id=v_s.assignment_id and student_id=v_sheet.student_id) then raise exception 'ALREADY_COMPLETED';end if;
 if p_scan_id is null or jsonb_typeof(p_detected) is distinct from 'object' or pg_column_size(p_detected)>30000
 or (select count(*) from jsonb_object_keys(p_detected))<>jsonb_array_length(v_sheet.questions) then raise exception 'INVALID_SCAN';end if;
 for v_q in select value from jsonb_array_elements(v_sheet.questions) loop
 v_d:=p_detected->(v_q->>'questionId');
 if v_d is null or jsonb_typeof(v_d)<>'object' or coalesce(v_d->>'state','') not in('clear','blank','uncertain','multiple') then raise exception 'INVALID_SCAN';end if;
 if v_d->'choice' is distinct from 'null'::jsonb and (coalesce(v_d->>'choice','')!~'^[0-3]$' or (v_d->>'choice')::integer>=jsonb_array_length(v_q->'options')) then raise exception 'INVALID_SCAN';end if;
 end loop;
 insert into public.assignment_scan_attempts(id,sheet_id,recorded_by,image_hash,scanner_version,detected)
 values(p_scan_id,p_sheet_id,auth.uid(),p_image_hash,'bh-omr-v1',p_detected) on conflict(id) do nothing;
 get diagnostics v_inserted = row_count;
 select * into v_prior from public.assignment_scan_attempts where id=p_scan_id;
 if v_prior.sheet_id<>p_sheet_id or v_prior.image_hash<>p_image_hash or v_prior.detected<>p_detected then raise exception 'SCAN_CONFLICT';end if;
 -- A delayed replay must never select an older scan over a newer review.
 if v_inserted>0 then
 update public.assignment_scan_sheets set latest_scan_id=p_scan_id where id=p_sheet_id;
 end if;
 return public.rpc_teacher_scan_session(v_s.id);
end $function$;
revoke all on function public.rpc_teacher_save_scan(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_save_scan(uuid,uuid,text,jsonb) to authenticated;
create or replace function public.rpc_teacher_review_scan(p_scan_id uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_scan public.assignment_scan_attempts;v_sheet public.assignment_scan_sheets;v_s public.assignment_scan_sessions;v_q jsonb;v_answer jsonb;
begin
 select * into v_scan from public.assignment_scan_attempts where id=p_scan_id;
 if not found then raise exception 'SHEET_NOT_FOUND';end if;
 select * into v_sheet from public.assignment_scan_sheets where id=v_scan.sheet_id;
 select * into v_s from private.scan_session(v_sheet.session_id);
 if v_sheet.guest_id is not null then
 perform 1 from public.assignment_scan_guests where id=v_sheet.guest_id for update;
 if exists(select 1 from public.assignment_scan_guests where id=v_sheet.guest_id and (held_at is not null or linked_at is not null)) then raise exception 'GUEST_RESULT_LOCKED';end if;
 end if;
 perform 1 from public.student_assignments where assignment_id=v_s.assignment_id and student_id=v_sheet.student_id for update;
 select * into v_sheet from public.assignment_scan_sheets where id=v_scan.sheet_id for update;
 select * into v_scan from public.assignment_scan_attempts where id=p_scan_id for update;
 if exists(select 1 from public.student_assignment_results where assignment_id=v_s.assignment_id and student_id=v_sheet.student_id) then raise exception 'ALREADY_COMPLETED';end if;
 if v_sheet.latest_scan_id is distinct from p_scan_id then raise exception 'SCAN_CHANGED';end if;
 if jsonb_typeof(p_answers) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_answers))<>jsonb_array_length(v_sheet.questions) then raise exception 'PAPER_ANSWERS_INCOMPLETE';end if;
 for v_q in select value from jsonb_array_elements(v_sheet.questions) loop
 v_answer:=p_answers->(v_q->>'questionId');
 if v_answer is null or (v_answer<>'null'::jsonb and not (v_q->'options' @> jsonb_build_array(v_answer))) then raise exception 'INVALID_PAPER_OPTION';end if;
 end loop;
 if v_scan.reviewed_answers is not null and v_scan.reviewed_answers<>p_answers then raise exception 'SCAN_REVIEW_LOCKED';end if;
 update public.assignment_scan_attempts set reviewed_answers=p_answers,reviewed_by=auth.uid(),reviewed_at=coalesce(reviewed_at,now()) where id=p_scan_id;
 return public.rpc_teacher_scan_session(v_s.id);
end $function$;
revoke all on function public.rpc_teacher_review_scan(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_review_scan(uuid,jsonb) to authenticated;

-- Holding seals reviewed pages without creating results or profile evidence.
create or replace function public.rpc_teacher_hold_guest(p_guest_id uuid,p_name text,p_reference text default '') returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_g public.assignment_scan_guests;v_s public.assignment_scan_sessions;v_count integer;
begin
 select * into v_g from public.assignment_scan_guests where id=p_guest_id;
 if not found then raise exception 'SHEET_NOT_FOUND';end if;
 select * into v_s from private.scan_session(v_g.session_id);
 select * into v_g from public.assignment_scan_guests where id=p_guest_id for update;
 if v_g.linked_at is not null then raise exception 'GUEST_ALREADY_LINKED';end if;
 if nullif(trim(p_name),'') is null or length(p_name)>120 or p_reference is null or length(p_reference)>80 then raise exception 'GUEST_NAME_REQUIRED';end if;
 if v_g.held_at is not null then
 if v_g.claimed_name<>trim(p_name) or v_g.local_reference<>trim(p_reference) then raise exception 'GUEST_RESULT_LOCKED';end if;
 return public.rpc_teacher_scan_session(v_s.id);end if;
 perform 1 from public.assignment_scan_sheets where guest_id=p_guest_id order by page_number for update;
 select count(*) into v_count from public.assignment_scan_sheets where guest_id=p_guest_id;
 if v_count=0 or exists(select 1 from public.assignment_scan_sheets s left join public.assignment_scan_attempts a on a.id=s.latest_scan_id where s.guest_id=p_guest_id and (a.reviewed_answers is null or s.page_count<>v_count)) then raise exception 'SCAN_PAGES_INCOMPLETE';end if;
 update public.assignment_scan_guests set claimed_name=trim(p_name),local_reference=trim(p_reference),held_at=now() where id=p_guest_id;
 return public.rpc_teacher_scan_session(v_s.id);
end $function$;
revoke all on function public.rpc_teacher_hold_guest(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_hold_guest(uuid,text,text) to authenticated;

create or replace function public.rpc_teacher_guest_results(p_assignment_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_id uuid;
begin
 v_id:=private.paper_assignment_id(p_assignment_id);
 return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.claimed_name,'reference',g.local_reference,'number',g.guest_number,
 'sessionId',s.id,'assessedAt',s.assessed_at,'heldAt',g.held_at,'linkedAt',g.linked_at,'studentId',g.linked_student_id,
 'versionMatches',s.form_hash=private.paper_form_hash(v_id),
 'firstSheetId',(select sh.id from public.assignment_scan_sheets sh where sh.guest_id=g.id order by sh.page_number limit 1)) order by s.created_at desc,g.guest_number)
 from public.assignment_scan_guests g join public.assignment_scan_sessions s on s.id=g.session_id where s.assignment_id=v_id),'[]'::jsonb);
end $function$;
revoke all on function public.rpc_teacher_guest_results(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_guest_results(uuid) to authenticated;

-- Existing governed roster controls discovery; there is no name-based automatic matching.
create or replace function private.scan_link_candidates(p_assignment_id uuid) returns table(student_id uuid,name text,username text,class_code text,completed boolean,answer_count bigint)
language sql stable security definer set search_path='' as $function$
 select distinct u.id,coalesce(nullif(u.full_name,''),u.username),u.username,coalesce(r.class_code,u.batch),
 exists(select 1 from public.student_assignment_results sr where sr.assignment_id=a.id and sr.student_id=u.id),
 (select count(*) from public.student_assignment_answers sa where sa.assignment_id=a.id and sa.student_id=u.id)
 from public.assignments a
 cross join lateral private.teacher_assignment_authorized_students(auth.uid(),a.school_id,a.subject_name,a.class_id,null) r
 join public.users u on u.id=r.student_id and u.school_id=a.school_id and u.role='student'
 join public.school_members sm on sm.user_id=u.id and sm.school_id=a.school_id and sm.status='active'
 where a.id=p_assignment_id and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now())
$function$;
revoke all on function private.scan_link_candidates(uuid) from public,anon,authenticated,service_role;
create or replace function public.rpc_teacher_guest_link_candidates(p_assignment_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_id uuid;
begin
 v_id:=private.paper_assignment_id(p_assignment_id);
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.student_id,'name',r.name,'username',r.username,'className',r.class_code,'completed',r.completed,'existingAnswerCount',r.answer_count) order by r.name,r.student_id) from private.scan_link_candidates(v_id) r),'[]'::jsonb);
end $function$;
revoke all on function public.rpc_teacher_guest_link_candidates(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_guest_link_candidates(uuid) to authenticated;

create or replace function public.rpc_teacher_link_guest(p_guest_id uuid,p_student_id uuid,p_identity_confirmed boolean,p_replace_partial boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_g public.assignment_scan_guests;v_s public.assignment_scan_sessions;v_a public.assignments;v_result jsonb;
begin
 select * into v_g from public.assignment_scan_guests where id=p_guest_id;
 if not found then raise exception 'SHEET_NOT_FOUND';end if;
 select * into v_s from private.scan_session(v_g.session_id);
 select * into v_g from public.assignment_scan_guests where id=p_guest_id for update;
 if p_identity_confirmed is distinct from true then raise exception 'IDENTITY_CONFIRMATION_REQUIRED';end if;
 if v_g.linked_student_id is not null then
 if v_g.linked_student_id<>p_student_id then raise exception 'GUEST_ALREADY_LINKED';end if;
 return jsonb_build_object('success',true,'alreadySubmitted',true);end if;
 if v_g.held_at is null then raise exception 'GUEST_NOT_REVIEWED';end if;
 if not exists(select 1 from private.scan_link_candidates(v_s.assignment_id) r where r.student_id=p_student_id) then raise exception 'STUDENT_NOT_ELIGIBLE';end if;
 select * into v_a from public.assignments where id=v_s.assignment_id;
 -- Enrol only in this assignment; group membership is not modified.
 insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)
 select v_a.id,u.id,u.batch,'pending',v_a.assigned_at,v_a.due_at from public.users u where u.id=p_student_id on conflict(assignment_id,student_id) do nothing;
 perform 1 from public.student_assignments where assignment_id=v_a.id and student_id=p_student_id for update;
 if exists(select 1 from public.student_assignment_results where assignment_id=v_a.id and student_id=p_student_id) then raise exception 'ALREADY_COMPLETED';end if;
 insert into public.assignment_students(assignment_id,student_id) values(v_a.id,p_student_id) on conflict do nothing;
 perform 1 from public.assignment_scan_sheets where guest_id=p_guest_id order by page_number for update;
 update public.assignment_scan_sheets set student_id=p_student_id where guest_id=p_guest_id;
 v_result:=public.rpc_teacher_confirm_scan(v_s.id,p_student_id,p_replace_partial);
 update public.assignment_scan_guests set linked_student_id=p_student_id,linked_by=auth.uid(),linked_at=now() where id=p_guest_id;
 return v_result;
end $function$;
revoke all on function public.rpc_teacher_link_guest(uuid,uuid,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_link_guest(uuid,uuid,boolean,boolean) to authenticated;
