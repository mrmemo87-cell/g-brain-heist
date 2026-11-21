-- Teacher Today showed "Some submitted work could not be checked just now" because rpc_ielts_learning_workspace
-- took about 16 s and hit the 8 s statement timeout (57014). Each task's originality payload, label and release
-- check ran up to five times. They now run once per task; the result is byte-identical (checked on production
-- data inside a rolled-back transaction) and takes about 3 s. No access rule changes.
create or replace function public.rpc_ielts_learning_workspace(p_school uuid default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- Same result as before; each task's originality payload, label and release check are worked out once
-- (they were recomputed up to five times per task, which made teacher Today time out after 8 s). Allocations reuse them.
declare manager boolean; tasks jsonb; allocations jsonb; pilot_only boolean; labels jsonb:='{}';
begin
 manager:=p_school is not null and public.can_manage_ielts_practice_school(p_school);
 if auth.uid() is null or coalesce((select is_banned from public.users where id=auth.uid()),true) or (p_school is not null and not manager) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not manager and not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 if manager then
   with base as materialized (
     select t.*, private.ielts_originality_payload('targeted',t.code) payload from private.ielts_learning_tasks t
   ), labelled as materialized (
     select b.*, private.ielts_originality_label('targeted',b.code,b.payload) label from base b
   ), info as materialized (
     select l.*, (l.label is not null and exists(select 1 from private.ielts_learning_releases r where r.task_code=l.code and r.version=l.version
       and l.audio_sha256 is not distinct from r.audio_sha256 and r.exact_content_hash=l.payload->>'content_hash')) released from labelled l
   )
   select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'released',t.released,'pilot_student',t.pilot_student,'pilot_student_name',(select username from public.users where id=t.pilot_student),'version',t.version,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'originality_label',t.label,'skill',t.skill,'purpose',t.purpose,'success_description',t.success_description,'instructions',t.instructions,'content',t.content,'content_sha256',t.content_sha256,'requires_review',t.requires_review,
     'approved',(not t.requires_review or t.released or exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=t.code and r.content_sha256=t.content_sha256)) and t.label is not null,
     'questions',(select jsonb_agg(q||jsonb_build_object('primary_name',n.name,'supporting_name',s.name) order by q->>'id') from jsonb_array_elements(t.questions) q join public.academic_skill_registry_nodes n on n.id=(q->>'taxonomy_node_id')::uuid join public.academic_skill_registry_nodes s on s.id=(q->>'supporting_node_id')::uuid)) order by t.skill,t.code) filter (where private.ielts_practice_material_allowed('targeted',t.code) and (t.released or exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active')))
     ,'[]'), not bool_or(t.released), jsonb_object_agg(t.code,t.label) into tasks, pilot_only, labels
   from info t;
 else
   tasks:='[]';
   pilot_only:=not exists(select 1 from private.ielts_learning_tasks t where private.ielts_learning_publicly_released(t.code));
 end if;
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'task_code',a.task_code,'student_id',a.student_id,'assigned_at',a.created_at,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'originality_label',case when labels ? t.code then labels->>t.code else private.ielts_originality_label('targeted',t.code) end,'skill',t.skill,'purpose',t.purpose,'status',a.status,'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',coalesce(pilot_only,true));
end; $function$;
revoke all on function public.rpc_ielts_learning_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_workspace(uuid) to authenticated;
