-- Bible 1.6.0. Read-only teacher history; no scoring, release or evidence changes.
create index if not exists ielts_learning_material_history on private.ielts_learning_allocations(school_id,student_id,task_code,created_at desc);
create index if not exists ielts_practice_material_history on public.ielts_practice_assignment_items(content_type,content_id,assignment_id);

-- Private projection deliberately contains no answers, keys, essays or recordings.
create function private.ielts_teacher_practice_rows(p_school uuid,p_student uuid default null,p_class uuid default null,p_items jsonb default null)
returns table(row_id text,kind text,assignment_id uuid,student_id uuid,student_name text,
 class_id uuid,class_name text,material_type text,material_id text,material_version text,
 title text,assignment_title text,skill text,status text,assignment_status text,
 feedback_status text,assigned_at timestamptz,submitted_at timestamptz,feedback_at timestamptz,due_at timestamptz)
language sql stable security definer set search_path='' as $$
 select a.id::text,'targeted',a.id,a.student_id,u.username,null::uuid,null::text,
 'targeted',t.code,t.version,t.title,t.title,t.skill,a.status,a.status,
 case when r.reviewed_at is not null then 'shared' when a.status='submitted' then 'pending' else 'not_ready' end,
 a.created_at,a.submitted_at,r.reviewed_at,a.due_at
 from private.ielts_learning_allocations a
 join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 left join lateral (select reviewed_at from private.ielts_learning_reviews where allocation_id=a.id order by reviewed_at desc,id desc limit 1) r on true
 where a.school_id=p_school and private.can_access_ielts_learning(a.id,true)
 and (p_student is null or a.student_id=p_student)
 and (p_class is null or exists(select 1 from public.class_students cs where cs.class_id=p_class and cs.student_id=a.student_id))
 and (p_items is null or exists(select 1 from jsonb_array_elements(p_items) q where q->>'type'='targeted' and q->>'id'=t.code))
 union all
 select i.id::text||':'||s.student_id::text,'school',a.id,s.student_id,u.username,a.class_id,c.class_name,
 i.content_type,i.content_id,null::text,coalesce(nullif(i.title,''),'Practice material'),a.title,i.skill,
 case when s.status='excused' then 'excused' when p.status in ('completed','skipped') then p.status
 when p.submitted_at is not null then 'submitted' else coalesce(p.status,'assigned') end,
 a.status,'not_tracked',s.created_at,p.submitted_at,null::timestamptz,a.due_at
 from public.ielts_practice_assignments a
 join public.ielts_practice_assignment_items i on i.assignment_id=a.id
 join public.ielts_practice_assignment_students s on s.assignment_id=a.id
 join public.users u on u.id=s.student_id left join public.classes c on c.id=a.class_id and c.school_id=a.school_id
 left join public.ielts_practice_assignment_item_students p on p.assignment_item_id=i.id and p.assignment_id=a.id and p.student_id=s.student_id
 where a.school_id=p_school and public.can_manage_ielts_practice_assignment(a.id)
 and (p_student is null or s.student_id=p_student)
 and (p_class is null or exists(select 1 from public.class_students cs where cs.class_id=p_class and cs.student_id=s.student_id))
 and (p_items is null or exists(select 1 from jsonb_array_elements(p_items) q where q->>'type'=i.content_type and q->>'id'=i.content_id));
$$;
revoke all on function private.ielts_teacher_practice_rows(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.rpc_ielts_teacher_practice_history(p_school uuid,p_search text default '',p_skill text default '',p_kind text default '',p_status text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.can_manage_ielts_practice_school(p_school) or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>120
 or coalesce(p_kind,'') not in ('','targeted','school') or coalesce(p_skill,'') not in ('','listening','reading','writing','speaking')
 or coalesce(p_status,'') not in ('','assigned','in_progress','submitted','completed','shared','overdue','closed','archived') then raise exception 'invalid_filter'; end if;
 with page as (
 select r.* from private.ielts_teacher_practice_rows(p_school) r
 where (coalesce(p_kind,'')='' or r.kind=p_kind) and (coalesce(p_skill,'')='' or r.skill=p_skill)
 and (coalesce(p_status,'')='' or case when p_status='shared' then r.feedback_status='shared'
 when p_status in ('closed','archived') then r.assignment_status=p_status
 when p_status='overdue' then r.assignment_status not in ('closed','archived') and r.status in ('assigned','in_progress') and r.due_at<now()
 else r.status=p_status end)
 and (coalesce(p_search,'')='' or strpos(lower(coalesce(r.student_name,'')||' '||r.title||' '||r.assignment_title||' '||coalesce(r.class_name,'')),lower(trim(p_search)))>0)
 order by r.assigned_at desc,r.row_id limit 51 offset p_offset
 ), numbered as (select *,row_number() over(order by assigned_at desc,row_id) n from page)
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by assigned_at desc,row_id) filter(where n<=50),'[]'),
 'has_more',coalesce(bool_or(n=51),false)) into result from numbered;
 return result;
end; $$;
revoke all on function public.rpc_ielts_teacher_practice_history(uuid,text,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_teacher_practice_history(uuid,text,text,text,text,integer) to authenticated;

-- Exact material identities, current recipient scope, full retained assignment history.
-- A zero count means no recorded assignment, never proof of no outside exposure.
create function public.rpc_ielts_teacher_material_usage(p_school uuid,p_items jsonb,p_student uuid default null,p_class uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.can_manage_ielts_practice_school(p_school) or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>50 or num_nonnulls(p_student,p_class)<>1 then raise exception 'recipient_scope_required'; end if;
 if p_student is not null and not exists(select 1 from public.school_members where school_id=p_school and user_id=p_student and status='active') then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_class is not null and (not exists(select 1 from public.classes where id=p_class and school_id=p_school) or not public.can_manage_ielts_practice_class(p_school,p_class)) then raise exception using errcode='42501',message='not_authorized'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'object' or coalesce(x->>'type','') not in ('targeted','ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') or length(coalesce(x->>'id','')) not between 1 and 200) then raise exception 'invalid_material'; end if;
 with requested as(select distinct x->>'type' type,x->>'id' id from jsonb_array_elements(p_items) x),
 matched as (
 select r.* from private.ielts_teacher_practice_rows(p_school,p_student,p_class,p_items) r
 join requested q on q.type=r.material_type and q.id=r.material_id
 where (p_student is not null and r.student_id=p_student) or (p_class is not null and exists(select 1 from public.class_students cs where cs.class_id=p_class and cs.student_id=r.student_id))
 ), usage as (
 select q.type,q.id,count(r.row_id) assigned_count,count(distinct r.student_id) students_count,
 count(r.row_id) filter(where r.assignment_status not in ('closed','archived') and r.status in ('assigned','in_progress')) active_count,
 count(r.row_id) filter(where r.status='submitted') submitted_count,
 count(r.row_id) filter(where r.status='completed' or r.feedback_status='shared') completed_count,
 count(r.row_id) filter(where r.feedback_status='shared') shared_count,max(r.assigned_at) last_assigned_at,
 (select m.assignment_id from matched m where m.material_type=q.type and m.material_id=q.id order by (m.assignment_status not in ('closed','archived') and m.status in ('assigned','in_progress')) desc,m.assigned_at desc,m.row_id limit 1) latest_assignment_id
 from requested q left join matched r on r.material_type=q.type and r.material_id=q.id group by q.type,q.id
 ) select coalesce(jsonb_agg(to_jsonb(usage) order by type,id),'[]') into result from usage;
 return result;
end; $$;
revoke all on function public.rpc_ielts_teacher_material_usage(uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_teacher_material_usage(uuid,jsonb,uuid,uuid) to authenticated;

-- Add stable identity to the existing authorized payload; preserve every gate.
create or replace function public.rpc_ielts_learning_workspace(p_school uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manager boolean; tasks jsonb; allocations jsonb;
begin
 manager:=p_school is not null and public.can_manage_ielts_practice_school(p_school);
 if auth.uid() is null or coalesce((select is_banned from public.users where id=auth.uid()),true) or (p_school is not null and not manager) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not manager and not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'pilot_student',t.pilot_student,'pilot_student_name',(select username from public.users where id=t.pilot_student),'version',t.version,'title',t.title,'skill',t.skill,'purpose',t.purpose,'success_description',t.success_description,'instructions',t.instructions,'content',t.content,'content_sha256',t.content_sha256,'requires_review',t.requires_review,
 'approved',not t.requires_review or exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=t.code and r.content_sha256=t.content_sha256),
 'questions',(select jsonb_agg(q||jsonb_build_object('primary_name',n.name,'supporting_name',s.name) order by q->>'id') from jsonb_array_elements(t.questions) q join public.academic_skill_registry_nodes n on n.id=(q->>'taxonomy_node_id')::uuid join public.academic_skill_registry_nodes s on s.id=(q->>'supporting_node_id')::uuid)) order by t.skill,t.code),'[]') into tasks
 from private.ielts_learning_tasks t where manager and exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active');
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'task_code',a.task_code,'student_id',a.student_id,'assigned_at',a.created_at,'title',t.title,'skill',t.skill,'purpose',t.purpose,'status',a.status,'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',true);
end; $$;
revoke all on function public.rpc_ielts_learning_workspace(uuid) from public,anon;

