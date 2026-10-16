-- Requires classroom_paper_workflow. QR tokens identify sheets, never authorize access.
create table public.assignment_scan_sessions (
 id uuid primary key, assignment_id uuid not null references public.assignments(id) on delete cascade,
 issued_by uuid not null references public.users(id), assessed_at timestamptz not null,
 form_hash text not null, option_order jsonb not null, student_ids uuid[] not null,
 created_at timestamptz not null default now()
);
create table public.assignment_scan_sheets (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.assignment_scan_sessions(id) on delete cascade,
 student_id uuid not null references public.users(id), page_number integer not null, page_count integer not null,
 layout_version text not null default 'bh-bubbles-v1' check(layout_version='bh-bubbles-v1'),
 questions jsonb not null, latest_scan_id uuid, unique(session_id,student_id,page_number)
);
create table public.assignment_scan_attempts (
 id uuid primary key, sheet_id uuid not null references public.assignment_scan_sheets(id) on delete cascade,
 recorded_by uuid not null references public.users(id), image_hash text not null check(image_hash ~ '^[a-f0-9]{64}$'),
 scanner_version text not null check(scanner_version='bh-omr-v1'), detected jsonb not null,
 reviewed_answers jsonb, reviewed_by uuid references public.users(id), reviewed_at timestamptz,
 confirmed_at timestamptz, created_at timestamptz not null default now()
);
create index assignment_scan_sessions_assignment_idx on public.assignment_scan_sessions(assignment_id);
create index assignment_scan_attempts_sheet_idx on public.assignment_scan_attempts(sheet_id);
alter table public.assignment_scan_sessions enable row level security;
alter table public.assignment_scan_sheets enable row level security;
alter table public.assignment_scan_attempts enable row level security;
revoke all on public.assignment_scan_sessions,public.assignment_scan_sheets,public.assignment_scan_attempts from public,anon,authenticated;

create or replace function private.scan_session(p_session_id uuid) returns public.assignment_scan_sessions
language plpgsql security definer set search_path='' as $function$
declare v_s public.assignment_scan_sessions;
begin
 select * into v_s from public.assignment_scan_sessions where id=p_session_id;
 if not found then raise exception 'SHEET_NOT_FOUND';end if;
 perform private.paper_assignment_id(v_s.assignment_id);
 if v_s.form_hash is distinct from private.paper_form_hash(v_s.assignment_id) then raise exception 'PAPER_VERSION_CHANGED';end if;
 return v_s;
end $function$;
revoke all on function private.scan_session(uuid) from public,anon,authenticated,service_role;

create or replace function public.rpc_teacher_scan_session(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_s public.assignment_scan_sessions;
begin
 select * into v_s from private.scan_session(p_session_id);
 return jsonb_build_object('id',v_s.id,'assignmentId',v_s.assignment_id,'assessedAt',v_s.assessed_at,'formHash',v_s.form_hash,
 'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'studentId',s.student_id,'studentName',coalesce(nullif(u.full_name,''),u.username),
 'pageNumber',s.page_number,'pageCount',s.page_count,'layoutVersion',s.layout_version,'questions',s.questions,
 'scanId',a.id,'imageHash',a.image_hash,'detected',a.detected,'reviewedAnswers',a.reviewed_answers,'confirmedAt',a.confirmed_at)
 order by coalesce(nullif(u.full_name,''),u.username),s.page_number)
 from public.assignment_scan_sheets s join public.users u on u.id=s.student_id
 left join public.assignment_scan_attempts a on a.id=s.latest_scan_id where s.session_id=v_s.id),'[]'::jsonb));
end $function$;
revoke all on function public.rpc_teacher_scan_session(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_scan_session(uuid) to authenticated;

create or replace function public.rpc_teacher_issue_scan_sheets(p_assignment_id uuid,p_session_id uuid,
 p_student_ids uuid[],p_assessed_at timestamptz,p_option_order jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_id uuid;v_s public.assignment_scan_sessions;v_a public.assignments;v_q record;v_options jsonb;v_rows jsonb;v_student uuid;v_pages integer;
begin
 v_id:=private.paper_assignment_id(p_assignment_id);
 select * into v_a from public.assignments where id=v_id;
 if p_session_id is null or p_assessed_at is null or p_assessed_at<v_a.assigned_at or p_assessed_at>now()+interval '5 minutes' then raise exception 'INVALID_ASSESSMENT_DATE';end if;
 if p_student_ids is null or cardinality(p_student_ids)<1 or cardinality(p_student_ids)>200
 or cardinality(p_student_ids)<>(select count(distinct x) from unnest(p_student_ids) x)
 or exists(select 1 from unnest(p_student_ids) x where x is null or not exists(select 1 from public.student_assignments where assignment_id=v_id and student_id=x)) then raise exception 'STUDENT_NOT_ASSIGNED';end if;
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
 insert into public.assignment_scan_sessions(id,assignment_id,issued_by,assessed_at,form_hash,option_order,student_ids)
 values(p_session_id,v_id,auth.uid(),p_assessed_at,private.paper_form_hash(v_id),p_option_order,p_student_ids) on conflict(id) do nothing;
 select * into v_s from private.scan_session(p_session_id);
 if v_s.assignment_id<>v_id or v_s.assessed_at<>p_assessed_at or v_s.option_order<>p_option_order or v_s.student_ids<>p_student_ids then raise exception 'SCAN_SESSION_CONFLICT';end if;
 v_pages:=ceil(jsonb_array_length(v_rows)/40.0)::integer;
 foreach v_student in array p_student_ids loop
 for v_page in 1..v_pages loop
 insert into public.assignment_scan_sheets(session_id,student_id,page_number,page_count,questions)
 values(p_session_id,v_student,v_page,v_pages,(select jsonb_agg(value order by ordinality) from jsonb_array_elements(v_rows) with ordinality where ordinality between (v_page-1)*40+1 and v_page*40))
 on conflict(session_id,student_id,page_number) do nothing;
 end loop;
 end loop;
 return public.rpc_teacher_scan_session(p_session_id);
end $function$;
revoke all on function public.rpc_teacher_issue_scan_sheets(uuid,uuid,uuid[],timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_issue_scan_sheets(uuid,uuid,uuid[],timestamptz,jsonb) to authenticated;

create or replace function public.rpc_teacher_resolve_scan_sheet(p_sheet_id uuid,p_assignment_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_sheet public.assignment_scan_sheets;v_s public.assignment_scan_sessions;
begin
 select * into v_sheet from public.assignment_scan_sheets where id=p_sheet_id;
 if not found then raise exception 'SHEET_NOT_FOUND';end if;
 select * into v_s from private.scan_session(v_sheet.session_id);
 if v_s.assignment_id<>private.paper_assignment_id(p_assignment_id) then raise exception 'WRONG_ASSIGNMENT';end if;
 return public.rpc_teacher_scan_session(v_s.id);
end $function$;
revoke all on function public.rpc_teacher_resolve_scan_sheet(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_resolve_scan_sheet(uuid,uuid) to authenticated;

create or replace function public.rpc_teacher_save_scan(p_scan_id uuid,p_sheet_id uuid,p_image_hash text,p_detected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_sheet public.assignment_scan_sheets;v_s public.assignment_scan_sessions;v_prior public.assignment_scan_attempts;v_q jsonb;v_d jsonb;v_inserted integer;
begin
 select * into v_sheet from public.assignment_scan_sheets where id=p_sheet_id;
 if not found then raise exception 'SHEET_NOT_FOUND';end if;
 select * into v_s from private.scan_session(v_sheet.session_id);
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

create or replace function public.rpc_teacher_confirm_scan(p_session_id uuid,p_student_id uuid,p_replace_partial boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare v_s public.assignment_scan_sessions;v_answers jsonb;v_result jsonb;v_count integer;
begin
 select * into v_s from private.scan_session(p_session_id);
 perform 1 from public.student_assignments where assignment_id=v_s.assignment_id and student_id=p_student_id for update;
 if not found then raise exception 'STUDENT_NOT_ASSIGNED';end if;
 perform 1 from public.assignment_scan_sheets where session_id=p_session_id and student_id=p_student_id order by page_number for update;
 select count(*) into v_count from public.assignment_scan_sheets where session_id=p_session_id and student_id=p_student_id;
 if v_count=0 or exists(select 1 from public.assignment_scan_sheets s left join public.assignment_scan_attempts a on a.id=s.latest_scan_id
 where s.session_id=p_session_id and s.student_id=p_student_id and (a.reviewed_answers is null or s.page_count<>v_count)) then raise exception 'SCAN_PAGES_INCOMPLETE';end if;
 select jsonb_object_agg(e.key,e.value) into v_answers from public.assignment_scan_sheets s join public.assignment_scan_attempts a on a.id=s.latest_scan_id
 cross join lateral jsonb_each(a.reviewed_answers) e where s.session_id=p_session_id and s.student_id=p_student_id;
 v_result:=public.rpc_teacher_confirm_paper(v_s.assignment_id,p_student_id,v_s.form_hash,v_answers,v_s.assessed_at,p_replace_partial);
 update public.assignment_scan_attempts a set confirmed_at=coalesce(a.confirmed_at,now()) from public.assignment_scan_sheets s
 where s.latest_scan_id=a.id and s.session_id=p_session_id and s.student_id=p_student_id;
 return v_result;
end $function$;
revoke all on function public.rpc_teacher_confirm_scan(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_confirm_scan(uuid,uuid,boolean) to authenticated;
