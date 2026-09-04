create or replace function public.rpc_ielts_school_results_entitlement_internal(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_student_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_actor_id uuid := auth.uid();
  v_school_id uuid;
  v_actor_school_id uuid;
  v_is_manager boolean := false;
  v_is_teacher boolean := false;
  v_limit int := least(greatest(coalesce(p_limit,100),1),500);
  v_year_id uuid;
  v_year_start date;
  v_year_end date;
  v_summary jsonb;
  v_students jsonb;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;

  select u.school_id into v_actor_school_id from public.users u where u.id=v_actor_id;
  v_school_id := coalesce(p_school_id,v_actor_school_id);
  if v_school_id is null and p_student_id is not null then
    select u.school_id into v_school_id from public.users u where u.id=p_student_id;
  end if;
  if v_school_id is null then raise exception 'school_required'; end if;

  v_year_id := public.academic_resolve_operational_year_id(v_school_id,now());
  if v_year_id is null then
    return jsonb_build_object(
      'school_id',v_school_id,
      'filters_applied',jsonb_build_object('class_id',p_class_id,'student_id',p_student_id,'limit',v_limit),
      'summary',jsonb_build_object('total_students',0,'assigned_practice_count',0,'completed_practice_count',0,'exam_submission_count',0,'average_estimated_overall',null),
      'students','[]'::jsonb
    );
  end if;
  select ay.starts_on,ay.ends_on into v_year_start,v_year_end
  from public.school_academic_years ay where ay.id=v_year_id;

  select exists(
    select 1 from public.users u
    where u.id=v_actor_id and (
      coalesce(u.is_admin,false)=true
      or coalesce(u.role,'') in ('admin','superadmin')
      or (coalesce(u.role,'')='school_admin' and u.school_id=v_school_id)
    )
  ) or exists(
    select 1 from public.school_members sm
    where sm.school_id=v_school_id and sm.user_id=v_actor_id and sm.status='active'
      and sm.role_in_school in ('school_admin','admin','superadmin')
  ) into v_is_manager;

  if not v_is_manager then
    select exists(
      select 1 from public.classes c
      join public.class_teacher_assignments cta on cta.class_id=c.id
      where c.school_id=v_school_id and coalesce(c.is_active,true)=true
        and cta.teacher_user_id=v_actor_id and coalesce(cta.active,true)=true
        and (p_class_id is null or c.id=p_class_id)
    ) into v_is_teacher;
  end if;
  if not (v_is_manager or v_is_teacher) then raise exception 'forbidden'; end if;

  create temporary table if not exists tmp_ielts_school_results_students(
    student_id uuid primary key,
    username text,
    email text,
    class_id uuid,
    class_name text,
    assigned_practice_total int default 0,
    completed_practice_total int default 0,
    latest_reading_estimate numeric,
    latest_listening_estimate numeric,
    latest_writing_estimate numeric,
    latest_speaking_estimate numeric,
    latest_overall_estimate numeric,
    last_activity_at timestamptz
  ) on commit drop;
  truncate tmp_ielts_school_results_students;

  if v_is_manager then
    insert into tmp_ielts_school_results_students(student_id,username,email,class_id,class_name)
    select distinct on (u.id) u.id,u.username,u.email,c.id,c.class_name
    from public.users u
    left join public.class_students cs on cs.student_id=u.id
    left join public.classes c on c.id=cs.class_id and c.school_id=v_school_id and coalesce(c.is_active,true)
    where u.school_id=v_school_id and coalesce(u.role,'student')='student'
      and (p_class_id is null or c.id=p_class_id)
      and (p_student_id is null or u.id=p_student_id)
    order by u.id,c.class_name nulls last
    limit v_limit;
  else
    insert into tmp_ielts_school_results_students(student_id,username,email,class_id,class_name)
    select distinct on (u.id) u.id,u.username,u.email,c.id,c.class_name
    from public.classes c
    join public.class_teacher_assignments cta on cta.class_id=c.id
    join public.class_students cs on cs.class_id=c.id
    join public.users u on u.id=cs.student_id and u.school_id=v_school_id
    where c.school_id=v_school_id and coalesce(c.is_active,true)=true
      and cta.teacher_user_id=v_actor_id and coalesce(cta.active,true)=true
      and coalesce(u.role,'student')='student'
      and (p_class_id is null or c.id=p_class_id)
      and (p_student_id is null or u.id=p_student_id)
    order by u.id,c.class_name nulls last
    limit v_limit;
  end if;

  update tmp_ielts_school_results_students t
  set assigned_practice_total=coalesce(p.assigned_total,0),
      completed_practice_total=coalesce(p.completed_total,0),
      last_activity_at=p.last_activity_at
  from (
    select s.student_id,
      count(s.id)::int assigned_total,
      count(s.id) filter(where s.status='completed')::int completed_total,
      max(s.updated_at) last_activity_at
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id=s.assignment_id
      and a.school_id=v_school_id and a.academic_year_id=v_year_id
    join tmp_ielts_school_results_students target on target.student_id=s.student_id
    group by s.student_id
  ) p where p.student_id=t.student_id;

  update tmp_ielts_school_results_students t
  set last_activity_at=case
    when t.last_activity_at is null then e.last_activity_at
    when e.last_activity_at is null then t.last_activity_at
    else greatest(t.last_activity_at,e.last_activity_at)
  end
  from (
    select s.student_id,max(s.submitted_at) last_activity_at
    from public.ielts_exam_submissions s
    join public.ielts_exam_attempts ea on ea.id=s.attempt_id
    join public.ielts_exam_events ee on ee.id=ea.exam_event_id
      and ee.school_id=v_school_id
      and ee.starts_at::date between v_year_start and v_year_end
    join tmp_ielts_school_results_students target on target.student_id=s.student_id
    group by s.student_id
  ) e where e.student_id=t.student_id;

  update tmp_ielts_school_results_students t
  set latest_reading_estimate=r.reading,
      latest_listening_estimate=r.listening,
      latest_writing_estimate=r.writing,
      latest_speaking_estimate=r.speaking,
      last_activity_at=case
        when t.last_activity_at is null then r.last_activity_at
        when r.last_activity_at is null then t.last_activity_at
        else greatest(t.last_activity_at,r.last_activity_at)
      end
  from (
    select target.student_id,
      max(readiness.estimated_band) filter(where readiness.skill='reading') reading,
      max(readiness.estimated_band) filter(where readiness.skill='listening') listening,
      max(readiness.estimated_band) filter(where readiness.skill='writing') writing,
      max(readiness.estimated_band) filter(where readiness.skill='speaking') speaking,
      max(readiness.last_activity_at) last_activity_at
    from tmp_ielts_school_results_students target
    left join lateral public.ielts_latest_skill_readiness(target.student_id) readiness
      on readiness.last_activity_at::date between v_year_start and v_year_end
    group by target.student_id
  ) r where r.student_id=t.student_id;

  update tmp_ielts_school_results_students t
  set latest_overall_estimate=estimates.overall
  from (
    select student_id,round(avg(value)::numeric,1) overall
    from tmp_ielts_school_results_students base
    cross join lateral(values(base.latest_reading_estimate),(base.latest_listening_estimate),(base.latest_writing_estimate),(base.latest_speaking_estimate)) v(value)
    where value is not null
    group by student_id
  ) estimates where estimates.student_id=t.student_id;

  select jsonb_build_object(
    'total_students',coalesce(count(distinct t.student_id),0),
    'assigned_practice_count',coalesce(sum(t.assigned_practice_total),0),
    'completed_practice_count',coalesce(sum(t.completed_practice_total),0),
    'exam_submission_count',coalesce((
      select count(*) from public.ielts_exam_submissions s
      join public.ielts_exam_attempts ea on ea.id=s.attempt_id
      join public.ielts_exam_events ee on ee.id=ea.exam_event_id
        and ee.school_id=v_school_id
        and ee.starts_at::date between v_year_start and v_year_end
      join tmp_ielts_school_results_students target on target.student_id=s.student_id
    ),0),
    'average_estimated_overall',round(avg(t.latest_overall_estimate)::numeric,1)
  ) into v_summary from tmp_ielts_school_results_students t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id',student_id,'username',username,'email',email,'class_id',class_id,'class_name',class_name,
    'assigned_practice_total',assigned_practice_total,'completed_practice_total',completed_practice_total,
    'latest_reading_estimate',latest_reading_estimate,'latest_listening_estimate',latest_listening_estimate,
    'latest_writing_estimate',latest_writing_estimate,'latest_speaking_estimate',latest_speaking_estimate,
    'latest_overall_estimate',latest_overall_estimate,'last_activity_at',last_activity_at
  ) order by last_activity_at desc nulls last,username nulls last,email nulls last),'[]'::jsonb)
  into v_students from tmp_ielts_school_results_students;

  return jsonb_build_object(
    'school_id',v_school_id,
    'academic_year_id',v_year_id,
    'filters_applied',jsonb_build_object('class_id',p_class_id,'student_id',p_student_id,'limit',v_limit),
    'summary',coalesce(v_summary,jsonb_build_object('total_students',0,'assigned_practice_count',0,'completed_practice_count',0,'exam_submission_count',0,'average_estimated_overall',null)),
    'students',coalesce(v_students,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_ielts_school_results_entitlement_internal(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.rpc_ielts_school_results_entitlement_internal(uuid,uuid,uuid,integer) to service_role;
