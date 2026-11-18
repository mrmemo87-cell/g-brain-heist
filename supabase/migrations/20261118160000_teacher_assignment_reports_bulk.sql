-- Collective report: load every assignment's results in one request.
--
-- The collective report called rpc_teacher_assignment_report once per
-- assignment (32 round trips for one teacher). This returns the same rows for
-- many assignments at once, keyed by the requested assignment id. Rules match
-- the single-assignment RPC: the caller must be the teacher, only that
-- teacher's assignments are read, logical bundle members are included under
-- the requested id, and quarantined legacy rows are excluded. Assignments the
-- teacher does not own are silently skipped rather than failing the batch.
create or replace function public.rpc_teacher_assignment_reports_bulk(
  p_teacher_id uuid,
  p_assignment_ids uuid[]
)
returns table(
  assignment_id uuid,student_id uuid,student_name text,batch text,historical_batch text,
  current_batch text,current_class_id uuid,current_placement_ambiguous boolean,
  score integer,correct integer,incorrect integer,accuracy integer,completed_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_teacher_user uuid;
begin
  select t.user_id into v_teacher_user from public.teachers t where t.id=p_teacher_id;
  if v_actor is null or v_teacher_user is distinct from v_actor then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;
  if coalesce(cardinality(p_assignment_ids),0)>500 then
    raise exception 'Too many assignments requested';
  end if;

  return query
  select
    requested.id,
    r.student_id,
    coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student')::text,
    coalesce(sa.batch,a.class_code_snapshot,a.batch)::text,
    coalesce(sa.batch,a.class_code_snapshot,a.batch)::text,
    case when cp.placement_count=1 then cp.class_code end::text,
    case when cp.placement_count=1 then cp.class_id end,
    coalesce(cp.placement_count,0)>1,
    r.score,r.correct,r.incorrect,r.accuracy,r.completed_at
  from (
    select distinct owned.id
    from unnest(coalesce(p_assignment_ids,'{}'::uuid[])) as ids(id)
    join public.assignments owned on owned.id=ids.id and owned.teacher_id=p_teacher_id
  ) requested
  join public.student_assignment_results r
    on r.assignment_id=any(private.assignment_logical_member_ids(requested.id))
  join public.assignments a on a.id=r.assignment_id
  join public.users u on u.id=r.student_id
  left join public.student_assignments sa on sa.assignment_id=r.assignment_id and sa.student_id=r.student_id
  left join lateral(
    select count(*)::integer placement_count,
           (array_agg(c.id order by c.id))[1] class_id,
           (array_agg(c.class_code order by c.id))[1] class_code
    from public.class_students cs
    join public.classes c on c.id=cs.class_id
    where cs.student_id=r.student_id and c.school_id=a.school_id
  ) cp on true
  where not exists(
    select 1 from public.legacy_quarantined_assignment_students q
    where q.assignment_id=r.assignment_id and q.student_id=r.student_id
  )
  order by requested.id,r.completed_at desc;
end;
$function$;

revoke all on function public.rpc_teacher_assignment_reports_bulk(uuid,uuid[])
  from public,anon;
grant execute on function public.rpc_teacher_assignment_reports_bulk(uuid,uuid[])
  to authenticated,service_role;
