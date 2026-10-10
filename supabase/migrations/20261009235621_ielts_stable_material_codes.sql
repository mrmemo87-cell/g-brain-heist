-- Bible 1.8.0: human-readable identity only; no scoring, content or completion changes.
-- Codes identify materials, never assignments or attempts. Retired codes stay reserved.
create table private.ielts_material_code_counters (
  prefix text primary key check(prefix in ('L','R','W','S')),
  last_number bigint not null check(last_number > 0)
);
create table private.ielts_material_codes (
  material_type text not null check(material_type in ('targeted','ielts_listening_set','ielts_reading_set','ielts_writing_task','ielts_speaking_task')),
  material_id text not null,
  skill text not null check(skill in ('listening','reading','writing','speaking')),
  display_code text not null unique check(display_code ~ '^[LRWS]-[0-9]{3,}$'),
  created_at timestamptz not null default now(),
  primary key(material_type,material_id)
);
alter table private.ielts_material_code_counters enable row level security;
alter table private.ielts_material_codes enable row level security;
revoke all on private.ielts_material_code_counters,private.ielts_material_codes from public,anon,authenticated,service_role;

create function private.ielts_material_code(p_type text,p_id text) returns text
language sql stable security definer set search_path='' as $$
 select display_code from private.ielts_material_codes where material_type=p_type and material_id=p_id;
$$;
revoke all on function private.ielts_material_code(text,text) from public,anon,authenticated,service_role;

create function private.register_ielts_material_code(p_type text,p_id text,p_skill text) returns text
language plpgsql security definer set search_path='' as $$
declare prefix text; number bigint; result text; existing_skill text;
begin
 prefix:=case p_skill when 'listening' then 'L' when 'reading' then 'R' when 'writing' then 'W' when 'speaking' then 'S' end;
 if prefix is null or p_type not in ('targeted','ielts_listening_set','ielts_reading_set','ielts_writing_task','ielts_speaking_task') or p_id is null or length(p_id)=0 then raise exception 'invalid_material_identity'; end if;
 -- Atomic counter row lock serializes new identifiers for each skill, including parallel inserts.
 -- Fast path for all ordinary source updates: do not lock or advance the counter.
 select display_code,skill into result,existing_skill from private.ielts_material_codes where material_type=p_type and material_id=p_id;
 if result is not null then
  if existing_skill<>p_skill then raise exception 'material_skill_is_immutable'; end if;
  return result;
 end if;
 insert into private.ielts_material_code_counters as c(prefix,last_number) values(prefix,1)
 on conflict on constraint ielts_material_code_counters_pkey do update set last_number=c.last_number+1 returning last_number into number;
 -- Recheck after the counter lock in case the same identity was concurrently registered.
 select display_code,skill into result,existing_skill from private.ielts_material_codes where material_type=p_type and material_id=p_id;
 if result is not null then
  if existing_skill<>p_skill then raise exception 'material_skill_is_immutable'; end if;
  return result;
 end if;
 result:=prefix||'-'||lpad(number::text,greatest(3,length(number::text)),'0');
 insert into private.ielts_material_codes(material_type,material_id,skill,display_code) values(p_type,p_id,p_skill,result);
 return result;
end; $$;
revoke all on function private.register_ielts_material_code(text,text,text) from public,anon,authenticated,service_role;

create function private.keep_ielts_material_code() returns trigger
language plpgsql security definer set search_path='' as $$
declare material_id text; skill text; registered text;
begin
 material_id:=to_jsonb(new)->>case when tg_argv[0]='targeted' then 'code' else 'id' end;
 skill:=case when tg_argv[0]='targeted' then to_jsonb(new)->>'skill' else tg_argv[1] end;
 if tg_op='UPDATE' and old.display_code is not null then
  if new.display_code is distinct from old.display_code or
   (to_jsonb(new)->>case when tg_argv[0]='targeted' then 'code' else 'id' end) is distinct from (to_jsonb(old)->>case when tg_argv[0]='targeted' then 'code' else 'id' end) or
   (tg_argv[0]='targeted' and to_jsonb(new)->>'skill' is distinct from to_jsonb(old)->>'skill') then raise exception 'material_code_is_immutable'; end if;
 end if;
 registered:=private.register_ielts_material_code(tg_argv[0],material_id,skill);
 if new.display_code is not null and new.display_code<>registered then raise exception 'material_code_is_server_assigned'; end if;
 new.display_code:=registered;
 return new;
end; $$;
revoke all on function private.keep_ielts_material_code() from public,anon,authenticated,service_role;

create function private.prevent_ielts_code_reuse() returns trigger
language plpgsql security definer set search_path='' as $$
begin raise exception 'material_code_registry_is_immutable'; end; $$;
revoke all on function private.prevent_ielts_code_reuse() from public,anon,authenticated,service_role;
create trigger preserve_ielts_material_codes before update or delete on private.ielts_material_codes for each row execute function private.prevent_ielts_code_reuse();

-- Targeted source rows are immutable. Register externally without updating them.
create function private.register_targeted_ielts_material_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.register_ielts_material_code('targeted',new.code,new.skill); return new; end; $$;
revoke all on function private.register_targeted_ielts_material_code() from public,anon,authenticated,service_role;
create trigger register_targeted_ielts_material_code after insert on private.ielts_learning_tasks for each row execute function private.register_targeted_ielts_material_code();
alter table public.ielts_listening_sets add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_listening_sets for each row execute function private.keep_ielts_material_code('ielts_listening_set','listening');
alter table public.ielts_reading_sets add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_reading_sets for each row execute function private.keep_ielts_material_code('ielts_reading_set','reading');
alter table public.ielts_writing_tasks add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_writing_tasks for each row execute function private.keep_ielts_material_code('ielts_writing_task','writing');
alter table public.ielts_speaking_tasks add column display_code text;
create trigger keep_ielts_material_code before insert or update on public.ielts_speaking_tasks for each row execute function private.keep_ielts_material_code('ielts_speaking_task','speaking');

do $$ declare r record; begin
 for r in select code,skill from private.ielts_learning_tasks order by skill,coalesce(substring(code from '-[lrws]([0-9]+)-')::integer,2147483647),code loop
 perform private.register_ielts_material_code('targeted',r.code,r.skill);
 end loop;
 for r in select id from public.ielts_listening_sets order by id loop
 update public.ielts_listening_sets set display_code=null where id=r.id;
 end loop;
 for r in select id from public.ielts_reading_sets order by id loop
 update public.ielts_reading_sets set display_code=null where id=r.id;
 end loop;
 for r in select id from public.ielts_writing_tasks order by id loop
 update public.ielts_writing_tasks set display_code=null where id=r.id;
 end loop;
 for r in select id from public.ielts_speaking_tasks order by id loop
 update public.ielts_speaking_tasks set display_code=null where id=r.id;
 end loop;
end; $$;
alter table public.ielts_listening_sets alter column display_code set not null;
alter table public.ielts_reading_sets alter column display_code set not null;
alter table public.ielts_writing_tasks alter column display_code set not null;
alter table public.ielts_speaking_tasks alter column display_code set not null;

-- Existing scoped reads carry codes in the same payload; no per-card network requests.
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

CREATE OR REPLACE FUNCTION public.ielts_practice_assignment_progress_payload(p_assignment_id uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_manager boolean;
  v_target_student uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  v_is_manager := public.can_manage_ielts_practice_assignment(p_assignment_id);
  v_target_student := coalesce(p_student_id, auth.uid());

  if not v_is_manager and v_target_student <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if not v_is_manager and not exists (
    select 1 from public.ielts_practice_assignment_students s
    where s.assignment_id = p_assignment_id and s.student_id = auth.uid()
  ) then
    raise exception 'assignment_not_found';
  end if;

  if v_is_manager and p_student_id is null then
    return jsonb_build_object(
      'assignment_id', p_assignment_id,
      'required_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id and i.required = true), 0),
      'item_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id), 0),
      'students', coalesce((
        select jsonb_agg(jsonb_build_object(
          'student_id', s.student_id,
          'student_status', s.status,
          'completed_at', s.completed_at,
          'required_count', coalesce(required_counts.required_count, 0),
          'completed_required_count', coalesce(required_counts.completed_required_count, 0),
          'item_count', coalesce(required_counts.item_count, 0),
          'completed_item_count', coalesce(required_counts.completed_item_count, 0),
          'all_required_completed', coalesce(required_counts.required_count, 0) > 0 and coalesce(required_counts.required_count, 0) = coalesce(required_counts.completed_required_count, 0)
        ) order by s.updated_at desc)
        from public.ielts_practice_assignment_students s
        left join lateral (
          select
            count(*) filter (where i.required = true) as required_count,
            count(*) filter (where i.required = true and item_s.status = 'completed') as completed_required_count,
            count(*) as item_count,
            count(*) filter (where item_s.status = 'completed') as completed_item_count
          from public.ielts_practice_assignment_items i
          left join public.ielts_practice_assignment_item_students item_s
            on item_s.assignment_item_id = i.id
            and item_s.student_id = s.student_id
          where i.assignment_id = p_assignment_id
        ) required_counts on true
        where s.assignment_id = p_assignment_id
      ), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'assignment_id', p_assignment_id,
    'student_id', v_target_student,
    'student_status', (select s.status from public.ielts_practice_assignment_students s where s.assignment_id = p_assignment_id and s.student_id = v_target_student),
    'assignment_completed_at', (select s.completed_at from public.ielts_practice_assignment_students s where s.assignment_id = p_assignment_id and s.student_id = v_target_student),
    'required_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id and i.required = true), 0),
    'completed_required_count', coalesce((
      select count(*)
      from public.ielts_practice_assignment_items i
      join public.ielts_practice_assignment_item_students item_s on item_s.assignment_item_id = i.id
      where i.assignment_id = p_assignment_id
        and i.required = true
        and item_s.student_id = v_target_student
        and item_s.status = 'completed'
    ), 0),
    'item_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = p_assignment_id), 0),
    'completed_item_count', coalesce((
      select count(*)
      from public.ielts_practice_assignment_items i
      join public.ielts_practice_assignment_item_students item_s on item_s.assignment_item_id = i.id
      where i.assignment_id = p_assignment_id
        and item_s.student_id = v_target_student
        and item_s.status = 'completed'
    ), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_item_id', i.id,
        'skill', i.skill,
        'content_type', i.content_type,
        'content_id', i.content_id,
        'display_code', private.ielts_material_code(i.content_type,i.content_id),
        'title', i.title,
        'required', i.required,
        'order_index', i.order_index,
        'status', coalesce(item_s.status, 'assigned'),
        'practice_attempt_type', item_s.practice_attempt_type,
        'practice_attempt_id', item_s.practice_attempt_id,
        'started_at', item_s.started_at,
        'completed_at', item_s.completed_at,
        'updated_at', item_s.updated_at
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      left join public.ielts_practice_assignment_item_students item_s
        on item_s.assignment_item_id = i.id
        and item_s.student_id = v_target_student
      where i.assignment_id = p_assignment_id
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_ielts_learning_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.ielts_learning_allocations%rowtype; t private.ielts_learning_tasks%rowtype; s private.ielts_learning_submissions%rowtype; review jsonb; content jsonb;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id; select * into t from private.ielts_learning_tasks where code=a.task_code; select * into s from private.ielts_learning_submissions where allocation_id=p_id;
 select jsonb_build_object('fields',r.feedback,'reviewer',u.username,'reviewed_at',r.reviewed_at) into review from private.ielts_learning_reviews r join public.users u on u.id=r.reviewer_id where r.allocation_id=p_id order by r.reviewed_at desc,r.id desc limit 1;
 content:=t.content-'teacher_notes'-'mapping_scope'-'focus_code';
 if s.allocation_id is not null or public.can_manage_ielts_practice_school(a.school_id) then content:=content||jsonb_build_object('teacher_notes',t.content->>'teacher_notes'); end if;
 return jsonb_build_object('id',a.id,'student_id',a.student_id,'manager',public.can_manage_ielts_practice_school(a.school_id),'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'content',content,'instructions',t.instructions,'success_description',t.success_description,'reason',a.reason,'due_at',a.due_at,
 'questions',(select jsonb_agg(q-'accepted_answers'-'taxonomy_node_id'-'supporting_node_id' order by q->>'id') from jsonb_array_elements(t.questions) q), 'audio_bucket','ielts-targeted-listening','audio_path',t.audio_path,'audio_sha256',t.audio_sha256,
 'status',a.status,'answers',case when s.allocation_id is null then a.answers else s.response end,'revision',a.revision,'source_attempt_id',coalesce(a.source_attempt_id,a.source_speaking_session_id),
 'source_route',case when t.skill='speaking' then '/ielts/speaking-pilot/'||a.source_speaking_session_id::text when t.skill='writing' then '/ielts/writing-screener' else '/ielts/screener-result/'||a.source_attempt_id::text end,
 'play_count',(select count(*) from private.ielts_learning_incidents where allocation_id=p_id and kind='play'),
 'pending_recordings',coalesce((select jsonb_agg(r.id) from private.ielts_learning_recordings r where r.allocation_id=p_id and r.state='capturing'),'[]'),
 'recordings',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'path',r.path,'duration_seconds',r.duration_seconds,'interrupted',r.interrupted,'sha256',r.sha256) order by r.created_at,r.id) from private.ielts_learning_recordings r where r.allocation_id=p_id and r.state='verified'),'[]'),
 'conditions_need_review',length(trim(coalesce(a.answers->>'assistance','')))>0 or exists(select 1 from private.ielts_learning_incidents where allocation_id=p_id and kind in ('interruption','replay','audio_failure','assistance')) or (select count(*) from private.ielts_learning_incidents where allocation_id=p_id and kind='play')>1 or exists(select 1 from private.ielts_learning_recordings where allocation_id=p_id and interrupted),
 'result',case when s.allocation_id is null then null else jsonb_build_object('score',s.score,'total',case when t.skill in ('listening','reading') then 6 else null end,'outcomes',s.outcomes,'submitted_at',s.submitted_at,'word_count',case when t.skill='writing' then cardinality(regexp_split_to_array(trim(coalesce(s.response->>'response','')),'\s+')) end) end,'review',review);
end; $function$;

CREATE OR REPLACE FUNCTION public.rpc_ielts_learning_workspace(p_school uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare manager boolean; tasks jsonb; allocations jsonb;
begin
 manager:=p_school is not null and public.can_manage_ielts_practice_school(p_school);
 if auth.uid() is null or coalesce((select is_banned from public.users where id=auth.uid()),true) or (p_school is not null and not manager) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not manager and not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'pilot_student',t.pilot_student,'pilot_student_name',(select username from public.users where id=t.pilot_student),'version',t.version,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'success_description',t.success_description,'instructions',t.instructions,'content',t.content,'content_sha256',t.content_sha256,'requires_review',t.requires_review,
 'approved',not t.requires_review or exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=t.code and r.content_sha256=t.content_sha256),
 'questions',(select jsonb_agg(q||jsonb_build_object('primary_name',n.name,'supporting_name',s.name) order by q->>'id') from jsonb_array_elements(t.questions) q join public.academic_skill_registry_nodes n on n.id=(q->>'taxonomy_node_id')::uuid join public.academic_skill_registry_nodes s on s.id=(q->>'supporting_node_id')::uuid)) order by t.skill,t.code),'[]') into tasks
 from private.ielts_learning_tasks t where manager and exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active');
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'task_code',a.task_code,'student_id',a.student_id,'assigned_at',a.created_at,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'status',a.status,'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.rpc_ielts_practice_assignment_detail(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;

  return jsonb_build_object(
    'assignment', public.ielts_practice_assignment_payload(p_assignment_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'assignment_id', i.assignment_id,
        'skill', i.skill,
        'content_type', i.content_type,
        'content_id', i.content_id,
        'display_code', private.ielts_material_code(i.content_type,i.content_id),
        'title', i.title,
        'required', i.required,
        'order_index', i.order_index,
        'created_at', i.created_at,
        'assigned_count', coalesce(item_counts.assigned_count, 0),
        'in_progress_count', coalesce(item_counts.in_progress_count, 0),
        'completed_count', coalesce(item_counts.completed_count, 0),
        'skipped_count', coalesce(item_counts.skipped_count, 0)
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      left join lateral (
        select
          count(*) filter (where coalesce(item_s.status, 'assigned') = 'assigned') as assigned_count,
          count(*) filter (where item_s.status = 'in_progress') as in_progress_count,
          count(*) filter (where item_s.status = 'completed') as completed_count,
          count(*) filter (where item_s.status = 'skipped') as skipped_count
        from public.ielts_practice_assignment_students s
        left join public.ielts_practice_assignment_item_students item_s
          on item_s.assignment_item_id = i.id
          and item_s.student_id = s.student_id
        where s.assignment_id = p_assignment_id
      ) item_counts on true
      where i.assignment_id = p_assignment_id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', roster.student_id,
        'username', roster.username,
        'email', roster.email,
        'class_id', roster.class_id,
        'class_name', roster.class_name,
        'status', roster.status,
        'completed_at', roster.completed_at,
        'updated_at', roster.updated_at,
        'required_count', roster.required_count,
        'completed_required_count', roster.completed_required_count,
        'item_count', roster.item_count,
        'completed_item_count', roster.completed_item_count
      ) order by roster.class_name nulls last, roster.username nulls last, roster.email nulls last)
      from (
        select distinct on (s.student_id)
          s.student_id,
          u.username,
          u.email,
          coalesce(cs.class_id, a.class_id) as class_id,
          c.class_name,
          case
            when s.status not in ('completed', 'excused') and a.due_at is not null and a.due_at < now() then 'overdue'
            else s.status
          end as status,
          s.completed_at,
          s.updated_at,
          coalesce(progress_counts.required_count, 0) as required_count,
          coalesce(progress_counts.completed_required_count, 0) as completed_required_count,
          coalesce(progress_counts.item_count, 0) as item_count,
          coalesce(progress_counts.completed_item_count, 0) as completed_item_count
        from public.ielts_practice_assignment_students s
        join public.users u on u.id = s.student_id
        join public.ielts_practice_assignments a on a.id = s.assignment_id
        left join public.class_students cs
          on cs.student_id = s.student_id
         and (a.class_id is null or cs.class_id = a.class_id)
        left join public.classes c
          on c.id = coalesce(cs.class_id, a.class_id)
         and c.school_id = a.school_id
        left join lateral (
          select
            count(*) filter (where i.required = true) as required_count,
            count(*) filter (where i.required = true and item_s.status = 'completed') as completed_required_count,
            count(*) as item_count,
            count(*) filter (where item_s.status = 'completed') as completed_item_count
          from public.ielts_practice_assignment_items i
          left join public.ielts_practice_assignment_item_students item_s
            on item_s.assignment_item_id = i.id
            and item_s.student_id = s.student_id
          where i.assignment_id = p_assignment_id
        ) progress_counts on true
        where s.assignment_id = p_assignment_id
          and a.school_id = v_assignment.school_id
          and u.school_id = v_assignment.school_id
        order by s.student_id, (coalesce(cs.class_id, a.class_id) = a.class_id) desc, c.class_name nulls last
      ) roster
    ), '[]'::jsonb),
    'item_progress', public.ielts_practice_assignment_progress_payload(p_assignment_id, null)
  );
end;
$function$;

drop function if exists public.rpc_ielts_practice_content_catalog(text,text,integer);
CREATE OR REPLACE FUNCTION public.rpc_ielts_practice_content_catalog(p_skill text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(content_type text, content_id text, title text, skill text, description text, difficulty text, band text, display_code text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with normalized as (
    select
      lower(nullif(trim(p_skill), '')) as requested_skill,
      nullif(trim(p_search), '') as requested_search,
      greatest(1, least(coalesce(p_limit, 50), 100)) as requested_limit
  ), catalog as (
    select
      'ielts_reading_set'::text as content_type,
      r.id::text as content_id,
      coalesce(nullif(r.title, ''), r.slug, 'Reading set ' || r.id::text)::text as title,
      'reading'::text as skill,
      nullif(left(coalesce(r.description, ''), 240), '')::text as description,
      nullif(r.level, '')::text as difficulty,
      case
        when r.est_band_min is not null and r.est_band_max is not null then r.est_band_min::text || '-' || r.est_band_max::text
        when r.est_band_min is not null then r.est_band_min::text || '+'
        when r.est_band_max is not null then 'Up to ' || r.est_band_max::text
        else null
      end::text as band,
      r.created_at,
      r.display_code
    from public.ielts_reading_sets r
    where r.is_active is true

    union all

    select
      'ielts_listening_set'::text,
      l.id::text,
      coalesce(nullif(l.title, ''), l.slug, 'Listening set ' || l.id::text)::text,
      'listening'::text,
      nullif(left(coalesce(l.description, ''), 240), '')::text,
      nullif(l.level, '')::text,
      case
        when l.est_band_min is not null and l.est_band_max is not null then l.est_band_min::text || '-' || l.est_band_max::text
        when l.est_band_min is not null then l.est_band_min::text || '+'
        when l.est_band_max is not null then 'Up to ' || l.est_band_max::text
        else null
      end::text,
      l.created_at,
      l.display_code
    from public.ielts_listening_sets l
    where l.is_active is true
      and nullif(trim(coalesce(l.audio_url, '')), '') is not null
      and exists (
        select 1
        from public.ielts_listening_questions q
        where q.set_id = l.id
      )

    union all

    select
      'ielts_writing_task'::text,
      w.id::text,
      coalesce(nullif(w.title, ''), w.slug, 'Writing ' || coalesce(w.task_type, 'task') || ' ' || w.id::text)::text,
      'writing'::text,
      nullif(left(coalesce(w.prompt, ''), 240), '')::text,
      nullif(w.task_type, '')::text,
      nullif(w.bands_target, '')::text,
      w.created_at,
      w.display_code
    from public.ielts_writing_tasks w
    where w.is_active is true

    union all

    select
      'ielts_speaking_task'::text,
      s.id::text,
      coalesce(s.slug, 'Speaking part ' || s.part::text || ' task ' || s.id::text)::text,
      'speaking'::text,
      nullif(left(coalesce(s.prompt, ''), 240), '')::text,
      ('part ' || s.part::text)::text,
      null::text,
      s.created_at,
      s.display_code
    from public.ielts_speaking_tasks s
    where s.is_active is true
  )
  select
    c.content_type,
    c.content_id,
    c.title,
    c.skill,
    c.description,
    c.difficulty,
    c.band,
    c.display_code
  from catalog c
  cross join normalized n
  where (n.requested_skill is null or c.skill = n.requested_skill)
    and (n.requested_search is null or (c.title ilike '%' || n.requested_search || '%' or c.display_code ilike '%' || n.requested_search || '%'))
  order by c.created_at desc nulls last, c.title asc
  limit (select requested_limit from normalized);
$function$;

revoke all on function public.rpc_ielts_practice_content_catalog(text,text,integer) from public,anon;
grant execute on function public.rpc_ielts_practice_content_catalog(text,text,integer) to authenticated;

CREATE OR REPLACE FUNCTION public.rpc_ielts_teacher_practice_history(p_school uuid, p_search text DEFAULT ''::text, p_skill text DEFAULT ''::text, p_kind text DEFAULT ''::text, p_status text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.can_manage_ielts_practice_school(p_school) or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>120
 or coalesce(p_kind,'') not in ('','targeted','school') or coalesce(p_skill,'') not in ('','listening','reading','writing','speaking')
 or coalesce(p_status,'') not in ('','assigned','in_progress','submitted','completed','shared','overdue','closed','archived') then raise exception 'invalid_filter'; end if;
 with page as (
 select r.*,private.ielts_material_code(r.material_type,r.material_id) display_code from private.ielts_teacher_practice_rows(p_school) r
 where (coalesce(p_kind,'')='' or r.kind=p_kind) and (coalesce(p_skill,'')='' or r.skill=p_skill)
 and (coalesce(p_status,'')='' or case when p_status='shared' then r.feedback_status='shared'
 when p_status in ('closed','archived') then r.assignment_status=p_status
 when p_status='overdue' then r.assignment_status not in ('closed','archived') and r.status in ('assigned','in_progress') and r.due_at<now()
 else r.status=p_status end)
 and (coalesce(p_search,'')='' or strpos(lower(coalesce(r.student_name,'')||' '||r.title||' '||coalesce(private.ielts_material_code(r.material_type,r.material_id),'')||' '||r.assignment_title||' '||coalesce(r.class_name,'')),lower(trim(p_search)))>0)
 order by r.assigned_at desc,r.row_id limit 51 offset p_offset
 ), numbered as (select *,row_number() over(order by assigned_at desc,row_id) n from page)
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by assigned_at desc,row_id) filter(where n<=50),'[]'),
 'has_more',coalesce(bool_or(n=51),false)) into result from numbered;
 return result;
end; $function$;


-- Retain the current execution boundary for every replaced function.
revoke all on function public.ielts_practice_assignment_payload(uuid) from public,anon,authenticated;
grant execute on function public.ielts_practice_assignment_payload(uuid) to service_role;
revoke all on function public.ielts_practice_assignment_progress_payload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ielts_practice_assignment_progress_payload(uuid,uuid) to service_role;
revoke all on function public.rpc_ielts_learning_detail(uuid) from public,anon,service_role;
grant execute on function public.rpc_ielts_learning_detail(uuid) to authenticated;
revoke all on function public.rpc_ielts_learning_workspace(uuid) from public,anon,service_role;
grant execute on function public.rpc_ielts_learning_workspace(uuid) to authenticated;
revoke all on function public.rpc_ielts_practice_assignment_detail(uuid) from public,anon;
grant execute on function public.rpc_ielts_practice_assignment_detail(uuid) to authenticated,service_role;
revoke all on function public.rpc_ielts_teacher_practice_history(uuid,text,text,text,text,integer) from public,anon,service_role;
grant execute on function public.rpc_ielts_teacher_practice_history(uuid,text,text,text,text,integer) to authenticated;
