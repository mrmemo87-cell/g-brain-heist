-- Teacher "previous assignments" check: raise the item limit from 50 to 200.
-- The targeted-practice screen checks the history of every set a student can receive in one call. Silk Road's pilot
-- student now has 57 such sets, so the 50-item limit made the check fail and kept "Confirm and assign" disabled for any
-- set. Only the limit changes; authorization, recipient scope, validation and results are unchanged.
CREATE OR REPLACE FUNCTION public.rpc_ielts_teacher_material_usage(p_school uuid, p_items jsonb, p_student uuid DEFAULT NULL::uuid, p_class uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.can_manage_ielts_practice_school(p_school) or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>200 or num_nonnulls(p_student,p_class)<>1 then raise exception 'recipient_scope_required'; end if;
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
end; $function$;
revoke all on function public.rpc_ielts_teacher_material_usage(uuid,jsonb,uuid,uuid) from public, anon;
grant execute on function public.rpc_ielts_teacher_material_usage(uuid,jsonb,uuid,uuid) to authenticated;
