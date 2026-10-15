-- Course batches are school/year scoped recipient groups, never registration classes or evidence.
create table private.ielts_course_batches (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 academic_year_id uuid not null, name text not null check(length(trim(name)) between 1 and 80),
 revision integer not null default 1, created_by uuid not null references public.users(id),
 created_at timestamptz not null default now(), unique(school_id,academic_year_id,name)
);
create table private.ielts_course_batch_members (
 batch_id uuid not null references private.ielts_course_batches(id), student_id uuid not null references public.users(id),
 joined_at timestamptz not null default now(), left_at timestamptz, primary key(batch_id,student_id)
);
create table private.ielts_course_batch_events (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references private.ielts_course_batches(id),
 actor_id uuid not null references public.users(id), action text not null, detail jsonb not null,
 created_at timestamptz not null default now()
);
create table private.ielts_batch_assignment_links (
 assignment_id uuid primary key references public.ielts_practice_assignments(id),
 batch_id uuid not null references private.ielts_course_batches(id), revision integer not null,
 student_ids uuid[] not null check(cardinality(student_ids) between 1 and 500),
 request_id uuid not null unique, request_payload jsonb not null, created_by uuid not null references public.users(id),
 created_at timestamptz not null default now()
);
create index ielts_batch_members_student on private.ielts_course_batch_members(student_id,batch_id) where left_at is null;
create index ielts_batch_assignment_batch on private.ielts_batch_assignment_links(batch_id,assignment_id);
alter table private.ielts_course_batches enable row level security;
alter table private.ielts_course_batch_members enable row level security;
alter table private.ielts_course_batch_events enable row level security;
alter table private.ielts_batch_assignment_links enable row level security;
revoke all on private.ielts_course_batches,private.ielts_course_batch_members,private.ielts_course_batch_events,private.ielts_batch_assignment_links from public,anon,authenticated;

create function private.ielts_batch_manager(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.users u where u.id=auth.uid() and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now()))
 and public.can_manage_ielts_practice_school(p_school);
$$;
create function private.ielts_batch_assert(p_batch uuid) returns private.ielts_course_batches language plpgsql stable security definer set search_path='' as $$
declare b private.ielts_course_batches;
begin
 select * into b from private.ielts_course_batches where id=p_batch;
 if b.id is null or not private.ielts_batch_manager(b.school_id) or b.academic_year_id<>public.academic_resolve_operational_year_id(b.school_id,now()) then raise exception using errcode='42501',message='batch_access_required'; end if;
 return b;
end; $$;
create function public.rpc_ielts_batches(p_school uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.ielts_batch_manager(p_school) then raise exception using errcode='42501',message='not_authorized';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from (
 select b.id,b.name,b.revision,b.created_at,count(m.student_id)::integer student_count,
 count(m.student_id) filter(where private.ielts_speaking_student_eligible(m.student_id) and u.school_id=b.school_id)::integer eligible_count
 from private.ielts_course_batches b left join private.ielts_course_batch_members m on m.batch_id=b.id and m.left_at is null
 left join public.users u on u.id=m.student_id
 where b.school_id=p_school and b.academic_year_id=public.academic_resolve_operational_year_id(p_school,now())
 group by b.id order by b.created_at desc,b.id limit 100) x),'[]'::jsonb);
end; $$;
create function public.rpc_ielts_batch_save(p_school uuid,p_name text,p_students uuid[],p_batch uuid default null,p_revision integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; v_id uuid;
begin
 if not private.ielts_batch_manager(p_school) then raise exception using errcode='42501',message='not_authorized';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 80 or p_students is null or cardinality(p_students)>500 or array_position(p_students,null) is not null then raise exception 'invalid_batch';end if;
 if p_batch is not null then
  select * into b from private.ielts_course_batches where id=p_batch for update;
  perform private.ielts_batch_assert(p_batch);
  if b.school_id<>p_school or b.revision is distinct from p_revision then raise exception 'batch_changed_refresh';end if;
 end if;
 -- Existing unavailable members can be retained or removed; every newly added student must be eligible.
 if exists(select 1 from unnest(p_students) s(id) where not exists(select 1 from public.users u where u.id=s.id and u.school_id=p_school and private.ielts_speaking_student_eligible(u.id)) and not exists(select 1 from private.ielts_course_batch_members m where m.batch_id=p_batch and m.student_id=s.id and m.left_at is null)) then raise exception 'student_not_eligible';end if;
 if p_batch is null then
  insert into private.ielts_course_batches(school_id,academic_year_id,name,created_by) values(p_school,public.academic_resolve_operational_year_id(p_school,now()),trim(p_name),auth.uid()) returning id into v_id;
 else
  v_id:=p_batch;update private.ielts_course_batches set name=trim(p_name),revision=revision+1 where id=v_id;
 end if;
 update private.ielts_course_batch_members set left_at=now() where batch_id=v_id and left_at is null and not(student_id=any(p_students));
 insert into private.ielts_course_batch_members(batch_id,student_id) select v_id,s.id from (select distinct unnest(p_students) id)s
 on conflict(batch_id,student_id) do update set left_at=null,joined_at=case when private.ielts_course_batch_members.left_at is not null then now() else private.ielts_course_batch_members.joined_at end;
 insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(v_id,auth.uid(),case when p_batch is null then 'created' else 'roster_updated' end,jsonb_build_object('name',trim(p_name),'student_ids',p_students,'previous_revision',p_revision));
 return v_id;
end; $$;
create function public.rpc_ielts_batch_roster(p_batch uuid,p_search text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b private.ielts_course_batches; members jsonb; candidates jsonb;
begin
 b:=private.ielts_batch_assert(p_batch);
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.full_name,''),u.username),'username',u.username,'class_name',u.batch,'eligible',u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id),'joined_at',m.joined_at) order by u.username,u.id),'[]') into members
 from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.left_at is null;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.username,x.id),'[]') into candidates from (
 select u.id,coalesce(nullif(u.full_name,''),u.username) name,u.username,u.batch class_name,true eligible
 from public.users u where u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id)
 and (coalesce(p_search,'')='' or position(lower(left(p_search,80)) in lower(concat_ws(' ',u.full_name,u.username,u.batch)))>0)
 order by u.username,u.id limit 51 offset greatest(0,least(coalesce(p_offset,0),100000)))x;
 return jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision,'members',members,'candidates',candidates,'has_more',jsonb_array_length(candidates)>50);
end; $$;
create function public.rpc_ielts_batch_create_assignment(p_batch uuid,p_revision integer,p_request uuid,p_title text,p_description text default null,p_due_at timestamptz default null,p_items jsonb default '[]') returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; ids uuid[]; a jsonb; existing private.ielts_batch_assignment_links;
begin
 b:=private.ielts_batch_assert(p_batch);
 if p_request is null then raise exception 'request_required';end if;
 -- Serialize only this cold creation request, never answer saves or the entire school.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from private.ielts_batch_assignment_links where request_id=p_request;
 if found then
  if existing.batch_id<>p_batch or existing.created_by<>auth.uid() then raise exception using errcode='42501',message='not_authorized';end if;
  if existing.request_payload<>jsonb_build_object('title',p_title,'description',p_description,'due_at',p_due_at,'items',p_items) then raise exception 'request_changed_check_saved_assignment';end if;
  return public.ielts_practice_assignment_payload(existing.assignment_id);
 end if;
 select * into b from private.ielts_course_batches where id=p_batch for update;
 if b.revision is distinct from p_revision then raise exception 'batch_changed_refresh';end if;
 select array_agg(student_id order by student_id) into ids from private.ielts_course_batch_members where batch_id=b.id and left_at is null;
 if coalesce(cardinality(ids),0)=0 or exists(select 1 from unnest(ids)s(id) where not exists(select 1 from public.users u where u.id=s.id and u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id))) then raise exception 'batch_roster_needs_review';end if;
 a:=public.rpc_ielts_practice_create_assignment(b.school_id,null,p_title,p_description,p_due_at,p_items);
 insert into private.ielts_batch_assignment_links(assignment_id,batch_id,revision,student_ids,request_id,request_payload,created_by) values((a->>'id')::uuid,b.id,b.revision,ids,p_request,jsonb_build_object('title',p_title,'description',p_description,'due_at',p_due_at,'items',p_items),auth.uid());
 return public.ielts_practice_assignment_payload((a->>'id')::uuid);
end; $$;
create function public.rpc_ielts_batch_allocate(p_assignment uuid,p_students uuid[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare link private.ielts_batch_assignment_links; b private.ielts_course_batches; ids uuid[]; a public.ielts_practice_assignments;
begin
 select * into link from private.ielts_batch_assignment_links where assignment_id=p_assignment;
 b:=private.ielts_batch_assert(link.batch_id);
 select * into a from public.ielts_practice_assignments where id=p_assignment for update;
 if a.school_id<>b.school_id or not public.can_manage_ielts_practice_assignment(a.id) or a.status not in ('draft','assigned') then raise exception 'open_batch_assignment_required';end if;
 ids:=coalesce(p_students,link.student_ids);
 if cardinality(ids)=0 or cardinality(ids)>500 or array_position(ids,null) is not null then raise exception 'students_required';end if;
 -- A draft retries exactly its original snapshot. Late joiners are explicit, only on open assignments.
 if a.status='draft' and p_students is not null and (not(ids @> link.student_ids) or not(link.student_ids @> ids)) then raise exception 'original_recipients_required';end if;
 if exists(select 1 from unnest(ids)s(id) where not exists(select 1 from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.student_id=s.id and m.left_at is null and u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id))) then raise exception 'batch_roster_needs_review';end if;
 -- Existing allocator retains publication/originality and per-item triggers; ON CONFLICT preserves saved work.
 perform public.rpc_ielts_practice_assign_to_students(a.id,ids);
 insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(b.id,auth.uid(),'assignment_allocated',jsonb_build_object('assignment_id',a.id,'student_ids',ids));
 return public.ielts_practice_assignment_payload(a.id);
end; $$;

create function public.rpc_ielts_batch_material_usage(p_batch uuid,p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; b private.ielts_course_batches; p_school uuid;
begin
 b:=private.ielts_batch_assert(p_batch); p_school:=b.school_id;
 if auth.uid() is null or not public.can_manage_ielts_practice_school(p_school) or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>50 then raise exception 'recipient_scope_required'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'object' or coalesce(x->>'type','') not in ('targeted','ielts_reading_set','ielts_listening_set','ielts_writing_task','ielts_speaking_task') or length(coalesce(x->>'id','')) not between 1 and 200) then raise exception 'invalid_material'; end if;
 with requested as(select distinct x->>'type' type,x->>'id' id from jsonb_array_elements(p_items) x),
 matched as (
 select r.* from private.ielts_teacher_practice_rows(p_school,null,null,p_items) r
 join requested q on q.type=r.material_type and q.id=r.material_id
 where exists(select 1 from private.ielts_course_batch_members m where m.batch_id=b.id and m.student_id=r.student_id and m.left_at is null)
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

CREATE OR REPLACE FUNCTION public.ielts_practice_assignment_payload(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
  v_is_manager boolean := false;
  v_is_assigned_student boolean := false;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;

  v_is_manager := public.can_manage_ielts_practice_assignment(p_assignment_id);
  select exists (
    select 1
    from public.ielts_practice_assignment_students s
    where s.assignment_id = p_assignment_id
      and s.student_id = auth.uid()
  ) into v_is_assigned_student;

  if not (v_is_manager or v_is_assigned_student) then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'id', a.id,
    'school_id', a.school_id,
    'academic_year_id', a.academic_year_id,
    'class_id', a.class_id,
    'batch_id', (select l.batch_id from private.ielts_batch_assignment_links l where l.assignment_id=a.id),
    'batch_name', (select b.name from private.ielts_batch_assignment_links l join private.ielts_course_batches b on b.id=l.batch_id where l.assignment_id=a.id),
    'class_name', c.class_name,
    'assigned_by', a.assigned_by,
    'title', a.title,
    'description', a.description,
    'status', a.status,
    'due_at', a.due_at,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'item_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = a.id), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'assignment_id', i.assignment_id,
        'skill', i.skill,
        'content_type', i.content_type,
        'content_id', i.content_id,
        'display_code', private.ielts_material_code(i.content_type,i.content_id),
        'originality_label', private.ielts_originality_label(i.content_type,i.content_id),
        'title', i.title,
        'required', i.required,
        'order_index', i.order_index,
        'created_at', i.created_at
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      where i.assignment_id = a.id
    ), '[]'::jsonb)
  ) into v_payload
  from public.ielts_practice_assignments a
  left join public.classes c on c.id = a.class_id
  where a.id = p_assignment_id;

  if v_is_manager then
    v_payload := v_payload || (
      select jsonb_build_object(
        'total_students', coalesce(count(s.id), 0),
        'assigned_count', coalesce(count(s.id) filter (where s.status = 'assigned'), 0),
        'in_progress_count', coalesce(count(s.id) filter (where s.status = 'in_progress'), 0),
        'completed_count', coalesce(count(s.id) filter (where s.status = 'completed'), 0),
        'overdue_count', coalesce(count(s.id) filter (where s.status = 'overdue' or (v_assignment.due_at is not null and v_assignment.due_at < now() and s.status not in ('completed', 'excused'))), 0),
        'excused_count', coalesce(count(s.id) filter (where s.status = 'excused'), 0),
        'completion_percent', case
          when count(s.id) = 0 then 0
          else round((count(s.id) filter (where s.status = 'completed'))::numeric * 100 / count(s.id), 1)
        end
      )
      from public.ielts_practice_assignment_students s
      where s.assignment_id = p_assignment_id
    );
  end if;

  return v_payload;
end;
$function$;
revoke all on function private.ielts_batch_manager(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ielts_batch_assert(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_batches(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batches(uuid) to authenticated;
revoke all on function public.rpc_ielts_batch_save(uuid,text,uuid[],uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_save(uuid,text,uuid[],uuid,integer) to authenticated;
revoke all on function public.rpc_ielts_batch_roster(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_roster(uuid,text,integer) to authenticated;
revoke all on function public.rpc_ielts_batch_create_assignment(uuid,integer,uuid,text,text,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_create_assignment(uuid,integer,uuid,text,text,timestamptz,jsonb) to authenticated;
revoke all on function public.rpc_ielts_batch_allocate(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_allocate(uuid,uuid[]) to authenticated;
revoke all on function public.rpc_ielts_batch_material_usage(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_material_usage(uuid,jsonb) to authenticated;
revoke all on function public.ielts_practice_assignment_payload(uuid) from public,anon;
grant execute on function public.ielts_practice_assignment_payload(uuid) to authenticated;
