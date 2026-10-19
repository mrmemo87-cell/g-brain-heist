-- Pilot finding 2026-10-19: Course materials always snapshotted the whole batch into the draft, while the screen let
-- the teacher untick students. Allocation then refused the subset (original_recipients_required), so assigning a
-- bank set to one student could never succeed. The draft now snapshots the chosen students (each must be an active,
-- eligible batch member). Added as a new function so the existing whole-batch creator stays unchanged; passing
-- p_students = null behaves exactly like rpc_ielts_batch_create_assignment.

create or replace function public.rpc_ielts_batch_create_assignment_for(p_batch uuid,p_revision integer,p_request uuid,p_title text,p_description text default null,p_due_at timestamptz default null,p_items jsonb default '[]',p_students uuid[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; ids uuid[]; a jsonb; existing private.ielts_batch_assignment_links; payload jsonb;
begin
 b:=private.ielts_batch_assert(p_batch);
 select * into b from private.ielts_course_batches where id=b.id for update;
 if b.archived_at is not null or b.deleted_at is not null then raise exception 'batch_archived';end if;
 if p_request is null then raise exception 'request_required';end if;
 payload:=jsonb_build_object('title',p_title,'description',p_description,'due_at',p_due_at,'items',p_items)
   || case when p_students is null then '{}'::jsonb else jsonb_build_object('students',(select jsonb_agg(s order by s) from unnest(p_students) s)) end;
 -- Serialize only this cold creation request, never answer saves or the entire school.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from private.ielts_batch_assignment_links where request_id=p_request;
 if found then
  if existing.batch_id<>p_batch or existing.created_by<>auth.uid() then raise exception using errcode='42501',message='not_authorized';end if;
  if existing.request_payload<>payload then raise exception 'request_changed_check_saved_assignment';end if;
  return public.ielts_practice_assignment_payload(existing.assignment_id);
 end if;
 if b.revision is distinct from p_revision then raise exception 'batch_changed_refresh';end if;
 if p_students is null then
  select array_agg(student_id order by student_id) into ids from private.ielts_course_batch_members where batch_id=b.id and left_at is null;
 else
  if cardinality(p_students)=0 or cardinality(p_students)>500 or array_position(p_students,null) is not null then raise exception 'students_required';end if;
  select array_agg(distinct s order by s) into ids from unnest(p_students) s;
  if exists(select 1 from unnest(ids) s(id) where not exists(select 1 from private.ielts_course_batch_members m where m.batch_id=b.id and m.student_id=s.id and m.left_at is null))
  then raise exception 'batch_roster_needs_review';end if;
 end if;
 if coalesce(cardinality(ids),0)=0 or exists(select 1 from unnest(ids)s(id) where not exists(select 1 from public.users u where u.id=s.id and u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id))) then raise exception 'batch_roster_needs_review';end if;
 a:=public.rpc_ielts_practice_create_assignment(b.school_id,null,p_title,p_description,p_due_at,p_items);
 insert into private.ielts_batch_assignment_links(assignment_id,batch_id,revision,student_ids,request_id,request_payload,created_by) values((a->>'id')::uuid,b.id,b.revision,ids,p_request,payload,auth.uid());
 return public.ielts_practice_assignment_payload((a->>'id')::uuid);
end; $$;

revoke all on function public.rpc_ielts_batch_create_assignment_for(uuid,integer,uuid,text,text,timestamptz,jsonb,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_create_assignment_for(uuid,integer,uuid,text,text,timestamptz,jsonb,uuid[]) to authenticated;
