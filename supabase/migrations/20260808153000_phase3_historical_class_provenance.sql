-- Phase 3 provenance: reports must never replace the class captured when work
-- was assigned/submitted with the student's current placement.

drop function if exists public.rpc_teacher_assignment_report(uuid,uuid);
create function public.rpc_teacher_assignment_report(p_assignment_id uuid,p_teacher_id uuid)
returns table(
  student_id uuid,
  student_name text,
  batch text,
  historical_batch text,
  current_batch text,
  current_class_id uuid,
  current_placement_ambiguous boolean,
  score integer,
  correct integer,
  incorrect integer,
  accuracy integer,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_teacher_user uuid;
begin
  select t.user_id into v_teacher_user from public.teachers t where t.id=p_teacher_id;
  if v_actor is null or v_teacher_user is distinct from v_actor then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;
  if not exists(select 1 from public.assignments a where a.id=p_assignment_id and a.teacher_id=p_teacher_id) then
    raise exception using errcode='42501',message='NOT_AUTHORIZED';
  end if;

  return query
  select r.student_id,
    coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student'),
    sa.batch,
    sa.batch,
    case when cp.placement_count=1 then cp.class_code end,
    case when cp.placement_count=1 then cp.class_id end,
    coalesce(cp.placement_count,0)>1,
    r.score,r.correct,r.incorrect,r.accuracy,r.completed_at
  from public.student_assignment_results r
  join public.student_assignments sa on sa.assignment_id=r.assignment_id and sa.student_id=r.student_id
  join public.users u on u.id=r.student_id
  left join lateral (
    select count(*)::integer placement_count,
      (array_agg(c.id order by c.id))[1] class_id,
      (array_agg(c.class_code order by c.id))[1] class_code
    from public.class_students cs join public.classes c on c.id=cs.class_id
    where cs.student_id=r.student_id
  ) cp on true
  where r.assignment_id=p_assignment_id
  order by r.completed_at desc;
end;
$$;
revoke all on function public.rpc_teacher_assignment_report(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_assignment_report(uuid,uuid) to authenticated;

drop function if exists public.get_school_cambridge_scores(integer);
create function public.get_school_cambridge_scores(p_limit integer default 100)
returns table(
  id uuid, student_id uuid, student_name text, student_class text,
  historical_class_snapshot text, current_class_id uuid, current_class text,
  current_placement_ambiguous boolean,
  quiz_name text, test_id text, quiz_version text, attempt_number integer,
  attempt_status text, score integer, total_questions integer,
  percentage integer, answers jsonb, time_taken_seconds integer,
  submitted_at timestamptz, scores_released boolean, released_at timestamptz,
  school_id uuid, test_subject text
)
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_school_id uuid; v_role text;
begin
  select sm.school_id,sm.role_in_school into v_school_id,v_role
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
    and (sm.role_in_school in ('teacher','school_admin') or sm.can_teach)
  order by sm.school_id limit 1;
  if v_actor is null or v_school_id is null then raise exception using errcode='42501',message='Access denied'; end if;

  return query
  select qs.id,qs.student_id,
    coalesce(nullif(trim(current_student.full_name),''),nullif(trim(current_student.username),''),qs.student_name),
    qs.student_class,
    qs.student_class,
    case when cp.placement_count=1 and cp.class_school_id=qs.school_id then cp.class_id end,
    case when cp.placement_count=1 and cp.class_school_id=qs.school_id then cp.class_code end,
    coalesce(cp.placement_count,0)>1 or (cp.placement_count=1 and cp.class_school_id is distinct from qs.school_id),
    qs.quiz_name,qs.test_id,qs.quiz_version,qs.attempt_number,qs.attempt_status,
    qs.score,qs.total_questions,qs.percentage,qs.answers,qs.time_taken_seconds,
    qs.submitted_at,coalesce(qs.scores_released,false),qs.released_at,qs.school_id,
    coalesce(ct.curriculum_subject,ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct on ct.id=qs.test_id or lower(trim(ct.name))=lower(trim(qs.quiz_name))
  left join public.users current_student on current_student.id=qs.student_id
  left join lateral (
    select count(*)::integer placement_count,
      (array_agg(c.id order by c.id))[1] class_id,
      (array_agg(c.class_code order by c.id))[1] class_code,
      (array_agg(c.school_id order by c.id))[1] class_school_id
    from public.class_students cs join public.classes c on c.id=cs.class_id
    where cs.student_id=qs.student_id
  ) cp on true
  where qs.school_id=v_school_id and qs.attempt_status in ('submitted','released')
    and (
      v_role='school_admin'
      or exists (
        select 1 from public.class_teacher_assignments cta
        join public.classes assigned_class on assigned_class.id=cta.class_id and assigned_class.school_id=qs.school_id
        where cta.teacher_user_id=v_actor and cta.school_id=qs.school_id
          and coalesce(cta.active,true) and coalesce(cta.can_grade,true)
          and public.cambridge_assignment_matches_test(cta.subject,qs.test_id,qs.quiz_name)
          and (
            exists(select 1 from public.class_students assigned_student where assigned_student.class_id=cta.class_id and assigned_student.student_id=qs.student_id)
            or (qs.student_id is null and (assigned_class.class_code=qs.student_class or assigned_class.class_name=qs.student_class))
          )
      )
    )
  order by qs.submitted_at desc
  limit greatest(1,least(coalesce(p_limit,100),1000));
end;
$$;
revoke all on function public.get_school_cambridge_scores(integer) from public,anon,authenticated,service_role;
grant execute on function public.get_school_cambridge_scores(integer) to authenticated;

notify pgrst,'reload schema';
