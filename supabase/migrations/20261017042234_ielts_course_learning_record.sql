-- Academic teaching records. These never fabricate attempts or publish content.
create table private.ielts_course_lessons(code text not null,version integer not null,week integer not null,title text not null,minutes integer not null default 60,test_type text not null default 'academic' check(test_type='academic'),primary key(code,version));
alter table private.ielts_course_lessons enable row level security;
revoke all on private.ielts_course_lessons from public,anon,authenticated,service_role;
create table private.ielts_course_records(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),batch_id uuid not null references private.ielts_course_batches(id),student_id uuid not null references public.users(id),
 lesson_code text not null,lesson_version integer not null,kind text not null check(kind in ('coverage','paper')),allocation_id uuid references private.ielts_learning_allocations(id),supersedes uuid references private.ielts_course_records(id),
 payload jsonb not null,request_id uuid not null unique,request_payload jsonb not null,author_id uuid not null references public.users(id),occurred_on date not null,created_at timestamptz not null default now(),
 foreign key(lesson_code,lesson_version) references private.ielts_course_lessons(code,version),check((kind='paper')=(allocation_id is not null)));
create index ielts_course_records_scope on private.ielts_course_records(batch_id,lesson_code,student_id,kind,created_at desc,id);
create index ielts_course_records_student on private.ielts_course_records(school_id,student_id,created_at desc,id);
create unique index ielts_course_records_replacement on private.ielts_course_records(supersedes) where supersedes is not null;
alter table private.ielts_course_records enable row level security;
revoke all on private.ielts_course_records from public,anon,authenticated,service_role;
create trigger ielts_course_records_append_only before update or delete on private.ielts_course_records for each row execute function private.academic_report_records_are_append_only();

create function public.rpc_ielts_course_board(p_batch uuid,p_lesson text default 'IELTS-01') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b private.ielts_course_batches;
begin
 b:=private.ielts_batch_assert(p_batch);
 return jsonb_build_object('batch',jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision,'archived',b.archived_at is not null),
 'lessons',(select jsonb_agg(to_jsonb(l) order by l.code) from private.ielts_course_lessons l),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.full_name,''),u.username),'joined_at',m.joined_at) order by u.username,u.id),'[]') from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.left_at is null and u.school_id=b.school_id),
 'records',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from(select r.id,r.student_id,r.lesson_code,r.kind,r.allocation_id,r.payload,r.occurred_on,r.created_at,u.username author
 from private.ielts_course_records r join public.users u on u.id=r.author_id where r.batch_id=b.id and r.lesson_code=p_lesson and not exists(select 1 from private.ielts_course_records n where n.supersedes=r.id) order by r.created_at desc,r.id limit 1001)x));
end; $$;

create function public.rpc_ielts_course_record(p_batch uuid,p_student uuid,p_lesson text,p_kind text,p_fields jsonb,p_on date,p_request uuid,p_expected uuid default null,p_allocation uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; prev uuid; existing private.ielts_course_records; a private.ielts_learning_allocations; t private.ielts_learning_tasks; q jsonb; answer text; correct boolean; data jsonb; req jsonb; outcomes jsonb:='[]'; marks int:=0; result uuid;
begin
 b:=private.ielts_batch_assert(p_batch);
 if b.archived_at is not null or b.deleted_at is not null then raise exception 'batch_archived';end if;
 if p_student is null or not exists(select 1 from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.student_id=p_student and m.left_at is null and u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id)) then raise exception 'student_not_eligible';end if;
 if not exists(select 1 from private.ielts_course_lessons where code=p_lesson and version=1) or p_request is null or p_on is null or p_on>(now() at time zone 'Asia/Bishkek')::date or p_kind is null or p_kind not in ('coverage','paper') or jsonb_typeof(p_fields) is distinct from 'object' or length(p_fields::text)>20000 then raise exception 'invalid_record';end if;
 req:=jsonb_build_object('batch',p_batch,'student',p_student,'lesson',p_lesson,'kind',p_kind,'fields',p_fields,'on',p_on,'allocation',p_allocation,'expected',p_expected);
 perform pg_advisory_xact_lock(hashtextextended('ielts-course-request:'||p_request::text,0));select * into existing from private.ielts_course_records where request_id=p_request;
 if found then if existing.author_id<>auth.uid() or existing.request_payload<>req then raise exception 'request_conflict';end if;return existing.id;end if;
 perform pg_advisory_xact_lock(hashtextextended('ielts-course:'||p_batch::text||p_student::text||p_lesson||p_kind||coalesce(p_allocation::text,''),0));
 select id into prev from private.ielts_course_records where batch_id=p_batch and student_id=p_student and lesson_code=p_lesson and kind=p_kind and allocation_id is not distinct from p_allocation order by created_at desc,id desc limit 1;
 if prev is distinct from p_expected then raise exception 'record_changed_refresh';end if;
 if p_kind='coverage' then
 if p_allocation is not null or coalesce(p_fields->>'status','') not in ('covered','missed','catch_up_needed','caught_up') or exists(select 1 from jsonb_object_keys(p_fields) k where k not in ('status','note')) or length(coalesce(p_fields->>'note',''))>800 then raise exception 'invalid_coverage';end if;
 data:=jsonb_build_object('status',p_fields->>'status','note',coalesce(p_fields->>'note',''),'meaning','teaching_coverage_not_attainment');
 else
 select * into a from private.ielts_learning_allocations where id=p_allocation and school_id=b.school_id and student_id=p_student;
 if a.id is null or not private.can_access_ielts_learning(a.id) then raise exception 'allocated_task_required';end if;
 select * into t from private.ielts_learning_tasks where code=a.task_code;if t.code is null or t.skill not in ('reading','listening') then raise exception 'objective_paper_task_required';end if;
 if coalesce(p_fields->>'support','') not in ('independent','teacher_supported','replayed','unknown') or jsonb_typeof(p_fields->'answers') is distinct from 'object' or length(trim(coalesce(p_fields->>'note',''))) not between 5 and 800 or exists(select 1 from jsonb_object_keys(p_fields) k where k not in ('support','answers','note')) then raise exception 'invalid_paper_record';end if;
 if exists(select 1 from jsonb_object_keys(p_fields->'answers') k where not exists(select 1 from jsonb_array_elements(t.questions) x where x->>'id'=k)) then raise exception 'invalid_item';end if;
 for q in select value from jsonb_array_elements(t.questions) loop
 if jsonb_typeof(p_fields->'answers'->(q->>'id')) not in ('string','null') then raise exception 'invalid_answer';end if;
 answer:=lower(trim(regexp_replace(coalesce(p_fields->'answers'->>(q->>'id'),''),'\s+',' ','g')));
 correct:=answer<>'' and exists(select 1 from jsonb_array_elements_text(q->'accepted_answers') v where lower(trim(v))=answer) and (t.skill='reading' or cardinality(regexp_split_to_array(answer,'\s+'))<=2);
 marks:=marks+case when correct then 1 else 0 end;
 outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',q->>'id','prompt',q->>'prompt','response',p_fields->'answers'->>(q->>'id'),'state',case when answer='' then 'unanswered' else 'answered' end,'correct',correct,'taxonomy_node_id',q->'taxonomy_node_id'));
 end loop;
 data:=jsonb_build_object('title',t.title,'skill',t.skill,'task_code',t.code,'version',t.version,'content_hash',t.content_sha256,'purpose',t.purpose,'support',p_fields->>'support','note',p_fields->>'note','outcomes',outcomes,'marks',marks,'total',jsonb_array_length(t.questions),'scoring_policy','ielts-paper-observation-v1','meaning','teacher_recorded_paper_not_qualified_reassessment');
 end if;
 insert into private.ielts_course_records(school_id,batch_id,student_id,lesson_code,lesson_version,kind,allocation_id,supersedes,payload,request_id,request_payload,author_id,occurred_on) values(b.school_id,p_batch,p_student,p_lesson,1,p_kind,p_allocation,prev,data,p_request,req,auth.uid(),p_on) returning id into result;return result;
end; $$;

create function public.rpc_ielts_course_journey(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare school uuid; rows jsonb;
begin
 select school_id into school from public.users where id=auth.uid();
 if auth.uid() is null or school is null or not private.ielts_speaking_student_eligible(auth.uid()) or not exists(select 1 from public.school_members where school_id=school and user_id=auth.uid() and status='active') then raise exception using errcode='42501',message='not_authorized';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') into rows from(select r.id,r.lesson_code,l.title lesson_title,r.kind,r.payload,r.occurred_on,r.created_at,u.username author,b.name batch_name
 from private.ielts_course_records r join private.ielts_course_lessons l on l.code=r.lesson_code and l.version=r.lesson_version join public.users u on u.id=r.author_id join private.ielts_course_batches b on b.id=r.batch_id
 where r.student_id=auth.uid() and r.school_id=school and (p_before is null or (r.created_at,r.id)<(p_before,coalesce(p_before_id,'00000000-0000-0000-0000-000000000000'::uuid))) and not exists(select 1 from private.ielts_course_records n where n.supersedes=r.id) order by r.created_at desc,r.id limit 51)x;
 return jsonb_build_object('records',rows,'has_more',jsonb_array_length(rows)>50);
end; $$;
revoke all on function public.rpc_ielts_course_board(uuid,text) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_course_board(uuid,text) to authenticated;
revoke all on function public.rpc_ielts_course_record(uuid,uuid,text,text,jsonb,date,uuid,uuid,uuid) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_course_record(uuid,uuid,text,text,jsonb,date,uuid,uuid,uuid) to authenticated;
revoke all on function public.rpc_ielts_course_journey(timestamptz,uuid) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_course_journey(timestamptz,uuid) to authenticated;

insert into private.ielts_course_lessons(code,version,week,title) values
('IELTS-01',1,1,'Listening corrections and Reading starting point'),
('IELTS-02',1,1,'Reading evidence and developed answers'),
('IELTS-03',1,2,'Listening details, spelling and word limits'),
('IELTS-04',1,2,'Clear paragraphs and Speaking Part 1'),
('IELTS-05',1,3,'Listening distractors and paraphrases'),
('IELTS-06',1,3,'Reading specific information'),
('IELTS-07',1,4,'Task 2 ideas and supporting examples'),
('IELTS-08',1,4,'Speaking development and first progress review'),
('IELTS-09',1,5,'Reading headings and paragraph purpose'),
('IELTS-10',1,5,'Listening notes and summaries'),
('IELTS-11',1,6,'Academic Task 1 overview and comparisons'),
('IELTS-12',1,6,'Speaking Part 2 organization'),
('IELTS-13',1,7,'Reading TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN'),
('IELTS-14',1,7,'Longer listening and reference tracking'),
('IELTS-15',1,8,'Task 2 planning and full responses'),
('IELTS-16',1,8,'Speaking Part 3 and second progress review'),
('IELTS-17',1,9,'Timed Listening sections and error review'),
('IELTS-18',1,9,'Timed Reading and question selection'),
('IELTS-19',1,10,'Task 1 and Task 2 revision workshop'),
('IELTS-20',1,10,'Speaking interview and targeted repair'),
('IELTS-21',1,11,'Fresh receptive-skill assessment and review'),
('IELTS-22',1,11,'Fresh productive-skill evidence and review'),
('IELTS-23',1,12,'Individual priorities from mock/check evidence'),
('IELTS-24',1,12,'Final course review and next learning plan');

-- Narrow suggestions from reviewed mapped outcomes; canonical allocation gates still apply.
create function public.rpc_ielts_course_suggestions(p_school uuid,p_student uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized';end if;
 with recent as(select e.* from private.ielts_diagnostic_attempt_evidence e join public.ielts_exam_attempts a on a.id=e.attempt_id where e.school_id=p_school and e.student_id=p_student and a.status='submitted' order by e.started_at desc,e.attempt_id limit 20),
 observed as(select e.attempt_id,e.started_at,i->>'skill' skill,i->>'taxonomy_node_id' node,i#>>'{taxonomy,name}' construct from recent e
 join lateral(select r.* from private.ielts_diagnostic_scoring_runs r where r.attempt_id=e.attempt_id and r.server_verified order by r.run_version desc,r.id limit 1) r on true
 cross join lateral jsonb_array_elements(r.outcomes) o join lateral jsonb_array_elements(e.form_snapshot->'items') i on i->>'item_key'=o->>'item_key' and i->>'skill'=o->>'skill'
 where r.integrity_state<>'review_required' and o->>'response_state'='answered' and (o->>'marks_awarded')::numeric<(o->>'marks_possible')::numeric),
 suggestions as(select distinct on(t.code) t.code,t.title,t.skill,t.purpose,private.ielts_material_code('targeted',t.code) display_code,o.attempt_id source_id,o.construct,o.started_at,
 'An answered item needs another look: '||o.construct||'. Review the original response before assigning support.' reason
 from observed o join private.ielts_learning_tasks t on t.skill=o.skill where t.purpose='guided_practice' and private.ielts_learning_publicly_released(t.code)
 and exists(select 1 from jsonb_array_elements(t.questions) q where q->>'taxonomy_node_id'=o.node)
 and not exists(select 1 from private.ielts_learning_allocations a where a.student_id=p_student and a.task_code=t.code) order by t.code,o.started_at desc,o.attempt_id)
 select coalesce(jsonb_agg(to_jsonb(s) order by s.started_at desc,s.code),'[]') into result from(select * from suggestions order by started_at desc,code limit 6)s;
 return result;
end; $$;
revoke all on function public.rpc_ielts_course_suggestions(uuid,uuid) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_course_suggestions(uuid,uuid) to authenticated;
