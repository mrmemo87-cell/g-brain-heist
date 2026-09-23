
create or replace function private.teacher_current_teaching_roster(
  p_teacher_user_id uuid,
  p_school_id uuid default null
)
returns table(
  school_id uuid,
  group_id uuid,
  group_name text,
  group_type text,
  registration_class_id uuid,
  school_subject_id uuid,
  school_subject_name text,
  academic_subject_id uuid,
  academic_subject_name text,
  academic_subject_code text,
  academic_year_id uuid,
  grade_level text,
  student_id uuid,
  class_id uuid,
  class_code text,
  class_name text,
  assignment_eligible boolean,
  access_status text,
  banned_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct
    scope.school_id,
    scope.group_id,
    scope.group_name,
    scope.group_type,
    scope.registration_class_id,
    scope.school_subject_id,
    scope.school_subject_name,
    scope.academic_subject_id,
    scope.academic_subject_name,
    scope.academic_subject_code,
    scope.academic_year_id,
    scope.grade_level,
    u.id,
    c.id,
    c.class_code::text,
    coalesce(nullif(trim(c.class_name),''),c.class_code)::text,
    (
      sm.status='active'
      and not coalesce(u.is_banned,false)
      and not (u.banned_until is not null and u.banned_until>now())
    ) as assignment_eligible,
    case
      when coalesce(u.is_banned,false) then 'banned'
      when sm.status='suspended' or (u.banned_until is not null and u.banned_until>now()) then 'suspended'
      else 'active'
    end::text,
    u.banned_until
  from private.teacher_current_teaching_groups(p_teacher_user_id,p_school_id) scope
  join public.school_subject_groups g
    on g.id=scope.group_id
   and g.school_id=scope.school_id
   and g.status='active'
  join public.school_subject_offerings o
    on o.id=g.school_subject_offering_id
   and o.school_id=g.school_id
   and o.status='active'
  join public.student_academic_enrolments ae
    on ae.school_id=scope.school_id
   and ae.academic_year_id=scope.academic_year_id
   and ae.grade_level=scope.grade_level
   and ae.starts_on<=current_date
   and (ae.ends_on is null or ae.ends_on>=current_date)
  join public.school_members sm
    on sm.school_id=scope.school_id
   and sm.user_id=ae.student_id
   and sm.status in ('active','suspended')
   and sm.role_in_school='student'
  join public.users u
    on u.id=sm.user_id
   and u.school_id=sm.school_id
  join public.class_students cs
    on cs.student_id=u.id
   and cs.class_id=ae.class_id
  join public.classes c
    on c.id=cs.class_id
   and c.school_id=scope.school_id
   and c.grade_level=scope.grade_level
   and coalesce(c.is_active,true)
  where (
      o.access_mode='all_grade'
      or exists(
        select 1
        from public.school_subject_enrolments e
        where e.school_id=scope.school_id
          and e.school_subject_id=scope.school_subject_id
          and e.academic_year_id=scope.academic_year_id
          and e.student_id=u.id
          and e.status='active'
          and e.starts_on<=current_date
          and (e.ends_on is null or e.ends_on>=current_date)
      )
    )
    and (
      (scope.group_type='class' and c.id=scope.registration_class_id)
      or scope.group_type='whole_grade'
      or (
        scope.group_type='custom'
        and exists(
          select 1
          from public.school_subject_group_students m
          where m.group_id=scope.group_id
            and m.school_id=scope.school_id
            and m.student_id=u.id
            and m.status='active'
            and m.starts_on<=current_date
            and (m.ends_on is null or m.ends_on>=current_date)
        )
      )
    );
$function$;

revoke all on function private.teacher_current_teaching_roster(uuid,uuid)
from public,anon,authenticated,service_role;


create or replace function public.rpc_get_my_teacher_class_roster()
returns table(
  school_id uuid,
  class_id uuid,
  class_code text,
  class_name text,
  grade_level text,
  subject_names text[],
  student_id uuid,
  student_username text,
  student_display_name text,
  student_grade text,
  student_avatar_url text,
  assignment_eligible boolean,
  access_status text,
  banned_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  with actor as (
    select auth.uid() as user_id
  ),
  group_rows as (
    select
      r.school_id,
      r.class_id,
      r.class_code,
      r.class_name,
      r.grade_level,
      r.school_subject_name as subject_name,
      r.student_id,
      r.assignment_eligible,
      r.access_status,
      r.banned_until
    from actor a
    cross join lateral private.teacher_current_teaching_roster(a.user_id,null::uuid) r
  ),
  legacy_rows as (
    select
      c.school_id,
      c.id as class_id,
      c.class_code::text,
      c.class_name::text,
      c.grade_level::text,
      coalesce(ss.name,cta.subject)::text as subject_name,
      u.id as student_id,
      (
        not coalesce(u.is_banned,false)
        and not (u.banned_until is not null and u.banned_until>now())
      ) as assignment_eligible,
      case
        when coalesce(u.is_banned,false) then 'banned'
        when u.banned_until is not null and u.banned_until>now() then 'suspended'
        else 'active'
      end::text as access_status,
      u.banned_until
    from actor a
    join public.class_teacher_assignments cta
      on cta.teacher_user_id=a.user_id and cta.active
    join public.classes c
      on c.id=cta.class_id
     and c.school_id=cta.school_id
     and coalesce(c.is_active,true)
    left join public.school_subjects ss
      on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
    join public.class_students cs on cs.class_id=c.id
    join public.users u
      on u.id=cs.student_id
     and u.school_id=c.school_id
     and coalesce(u.role,'student')='student'
    where not exists(
      select 1
      from private.teacher_current_teaching_groups(a.user_id,c.school_id) current_group
      where current_group.registration_class_id=c.id
        and current_group.group_type='class'
        and (
          current_group.school_subject_id=cta.school_subject_id
          or (
            cta.school_subject_id is null
            and private.teacher_assignment_subject_key(current_group.school_subject_name)
              = private.teacher_assignment_subject_key(cta.subject)
          )
        )
    )
  ),
  combined as (
    select * from group_rows
    union all
    select * from legacy_rows
  ),
  aggregated as (
    select
      row.school_id,
      row.class_id,
      row.class_code,
      row.class_name,
      row.grade_level,
      array_agg(distinct row.subject_name order by row.subject_name)
        filter(where nullif(trim(row.subject_name),'') is not null) as subject_names,
      row.student_id,
      bool_or(row.assignment_eligible) as assignment_eligible,
      case
        when bool_or(row.access_status='banned') then 'banned'
        when bool_or(row.access_status='suspended') then 'suspended'
        else 'active'
      end::text as access_status,
      max(row.banned_until) as banned_until
    from combined row
    group by
      row.school_id,row.class_id,row.class_code,row.class_name,row.grade_level,row.student_id
  )
  select
    agg.school_id,
    agg.class_id,
    agg.class_code,
    agg.class_name,
    agg.grade_level,
    coalesce(agg.subject_names,array[]::text[]),
    u.id,
    u.username::text,
    coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student')::text,
    coalesce(nullif(trim(u.grade::text),''),agg.grade_level,'')::text,
    u.avatar_url::text,
    agg.assignment_eligible,
    agg.access_status,
    agg.banned_until
  from aggregated agg
  join public.users u on u.id=agg.student_id
  order by
    agg.grade_level,
    agg.class_code,
    coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student'),
    u.id;
$function$;

revoke all on function public.rpc_get_my_teacher_class_roster()
from public,anon,authenticated,service_role;
grant execute on function public.rpc_get_my_teacher_class_roster()
to authenticated,service_role;


create or replace function public.rpc_get_students_for_assignment(p_teacher_id uuid default null)
returns table(
  id uuid,
  username text,
  display_name text,
  grade text,
  batch text,
  avatar_url text,
  school_id uuid,
  class_id uuid,
  class_code text,
  assignment_eligible boolean,
  access_status text,
  banned_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid:=auth.uid();
  v_teacher_user_id uuid;
  v_teacher_school_id uuid;
begin
  if v_actor_user_id is null then
    raise exception using errcode='42501',message='Authentication required';
  end if;

  if p_teacher_id is not null then
    select t.user_id into v_teacher_user_id
    from public.teachers t where t.id=p_teacher_id;
    if v_teacher_user_id is null then
      raise exception using errcode='P0002',message='Teacher not found';
    end if;
  else
    v_teacher_user_id:=v_actor_user_id;
  end if;

  if not exists(select 1 from public.teachers t where t.user_id=v_teacher_user_id) then
    raise exception using errcode='42501',message='Teacher profile required';
  end if;

  select sm.school_id into v_teacher_school_id
  from public.school_members sm
  where sm.user_id=v_teacher_user_id and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id
  limit 1;

  if v_teacher_school_id is null then return; end if;

  if v_actor_user_id<>v_teacher_user_id
     and not public.is_school_admin_of(v_actor_user_id,v_teacher_school_id) then
    raise exception using errcode='42501',message='Teacher roster access denied';
  end if;

  if exists(
    select 1
    from private.teacher_current_teaching_groups(v_teacher_user_id,v_teacher_school_id)
  ) then
    return query
    select distinct on (r.student_id)
      r.student_id,
      u.username::text,
      coalesce(nullif(trim(u.full_name),''),nullif(trim(u.username),''),'Student')::text,
      coalesce(nullif(trim(u.grade::text),''),r.grade_level,'')::text,
      coalesce(nullif(trim(r.class_code),''),nullif(trim(u.batch),''),'')::text,
      u.avatar_url::text,
      r.school_id,
      r.class_id,
      coalesce(r.class_code,'')::text,
      r.assignment_eligible,
      r.access_status,
      r.banned_until
    from private.teacher_current_teaching_roster(v_teacher_user_id,v_teacher_school_id) r
    join public.users u on u.id=r.student_id
    order by r.student_id,r.assignment_eligible desc,r.class_code;
    return;
  end if;

  return query
  with assigned_classes as (
    select distinct c.id class_id,c.class_code,c.grade_level,c.school_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id and c.school_id=cta.school_id
    where cta.teacher_user_id=v_teacher_user_id
      and cta.school_id=v_teacher_school_id
      and cta.active and coalesce(c.is_active,true)
  ),
  roster as (
    select distinct on (u.id)
      u.id,u.username,u.full_name,
      coalesce(nullif(trim(u.grade),''),ac.grade_level) grade,
      u.batch,u.avatar_url,u.school_id,ac.class_id,ac.class_code,
      coalesce(u.is_banned,false) is_banned,u.banned_until
    from assigned_classes ac
    join public.class_students cs on cs.class_id=ac.class_id
    join public.users u
      on u.id=cs.student_id
     and u.school_id=ac.school_id
     and coalesce(u.role,'student')='student'
    order by u.id,cs.joined_at desc nulls last,ac.class_code
  )
  select
    r.id,
    r.username::text,
    coalesce(nullif(trim(r.full_name),''),nullif(trim(r.username),''),'Student')::text,
    coalesce(r.grade,'')::text,
    coalesce(nullif(trim(r.class_code),''),nullif(trim(r.batch),''),'')::text,
    r.avatar_url::text,
    r.school_id,
    r.class_id,
    coalesce(r.class_code,'')::text,
    (not r.is_banned and not(r.banned_until is not null and r.banned_until>now())),
    case
      when r.is_banned then 'banned'
      when r.banned_until is not null and r.banned_until>now() then 'suspended'
      else 'active'
    end::text,
    r.banned_until
  from roster r
  order by r.grade nulls last,r.class_code nulls last,
    coalesce(nullif(trim(r.full_name),''),nullif(trim(r.username),''),'Student');
end;
$function$;

revoke all on function public.rpc_get_students_for_assignment(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_get_students_for_assignment(uuid)
to authenticated,service_role;


create or replace function public.rpc_teacher_academic_profile_students()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller uuid:=auth.uid();
  v_admin_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select sm.school_id into v_admin_school_id
  from public.school_members sm
  where sm.user_id=v_caller
    and sm.status='active'
    and sm.role_in_school='school_admin'
  order by sm.joined_at desc nulls last
  limit 1;

  if v_admin_school_id is not null then
    select coalesce(jsonb_agg(row_data order by row_data->>'grade',row_data->>'class_name',row_data->>'student_name'),'[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'student_id',u.id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'username',u.username,
        'class_name',coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
        'grade',coalesce(c.grade_level::text,nullif(trim(u.grade::text),'')),
        'school_id',u.school_id,
        'subjects',coalesce((
          select jsonb_agg(subject_name order by subject_name)
          from (
            select distinct ss.name subject_name
            from public.school_subject_offerings o
            join public.school_subjects ss
              on ss.id=o.school_subject_id
             and ss.school_id=o.school_id
             and ss.is_active
            where o.school_id=v_admin_school_id
              and o.academic_year_id=public.academic_resolve_operational_year_id(v_admin_school_id,now())
              and o.grade_level=c.grade_level
              and o.status='active'
              and (
                o.access_mode='all_grade'
                or exists(
                  select 1 from public.school_subject_enrolments e
                  where e.student_id=u.id
                    and e.school_subject_id=ss.id
                    and e.academic_year_id=o.academic_year_id
                    and e.status='active'
                    and e.starts_on<=current_date
                    and (e.ends_on is null or e.ends_on>=current_date)
                )
              )
          ) subjects
        ),'[]'::jsonb)
      ) row_data
      from public.school_members sm
      join public.users u on u.id=sm.user_id and u.school_id=sm.school_id
      left join public.class_students cs on cs.student_id=u.id
      left join public.classes c
        on c.id=cs.class_id and c.school_id=sm.school_id and coalesce(c.is_active,true)
      where sm.school_id=v_admin_school_id
        and sm.status in ('active','suspended')
        and sm.role_in_school='student'
    ) rows;
    return v_result;
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'grade',row_data->>'class_name',row_data->>'student_name'),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'student_id',u.id,
      'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
      'username',u.username,
      'class_name',coalesce(nullif(trim(r.class_code),''),nullif(trim(u.batch),''),'—'),
      'grade',coalesce(r.grade_level,nullif(trim(u.grade::text),'')),
      'school_id',r.school_id,
      'subjects',to_jsonb(array_agg(distinct r.school_subject_name order by r.school_subject_name))
    ) row_data
    from private.teacher_current_teaching_roster(v_caller,null::uuid) r
    join public.users u on u.id=r.student_id
    group by
      u.id,u.full_name,u.username,u.batch,u.grade,u.school_id,
      r.school_id,r.class_id,r.class_code,r.grade_level
  ) rows;

  if coalesce(jsonb_array_length(v_result),0)=0 then
    select coalesce(jsonb_agg(row_data order by row_data->>'grade',row_data->>'class_name',row_data->>'student_name'),'[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'student_id',u.id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'username',u.username,
        'class_name',coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
        'grade',coalesce(c.grade_level::text,nullif(trim(u.grade::text),'')),
        'school_id',u.school_id,
        'subjects',to_jsonb(array_agg(distinct cta.subject order by cta.subject))
      ) row_data
      from public.class_students cs
      join public.classes c on c.id=cs.class_id
      join public.class_teacher_assignments cta
        on cta.class_id=cs.class_id
       and cta.school_id=c.school_id
       and cta.teacher_user_id=v_caller
       and cta.active
      join public.users u on u.id=cs.student_id and u.school_id=c.school_id
      group by u.id,u.full_name,u.username,u.batch,u.grade,u.school_id,c.class_code,c.grade_level
    ) rows;
  end if;

  return coalesce(v_result,'[]'::jsonb);
end;
$function$;

revoke all on function public.rpc_teacher_academic_profile_students()
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_academic_profile_students()
to authenticated,service_role;


create or replace function public.student_learning_can_manage_intervention(
  p_student_id uuid,
  p_subject text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.users u
    where u.id=p_student_id
      and (
        public.is_school_owner(u.school_id)
        or exists(
          select 1
          from public.school_members sm
          where sm.school_id=u.school_id
            and sm.user_id=auth.uid()
            and sm.status='active'
            and sm.role_in_school='school_admin'
        )
        or exists(
          select 1
          from private.teacher_current_teaching_roster(auth.uid(),u.school_id) r
          where r.student_id=p_student_id
            and (
              private.teacher_assignment_subject_key(r.school_subject_name)
                =private.teacher_assignment_subject_key(p_subject)
              or (
                r.academic_subject_id is not null
                and r.academic_subject_id=public.academic_resolve_subject_id(p_subject,u.school_id)
              )
              or (
                r.academic_subject_code is not null
                and r.academic_subject_code=public.academic_normalize_subject_key(p_subject)
              )
            )
        )
        or (
          not exists(
            select 1 from private.teacher_current_teaching_groups(auth.uid(),u.school_id)
          )
          and exists(
            select 1
            from public.class_students cs
            join public.classes c on c.id=cs.class_id and c.school_id=u.school_id
            join public.class_teacher_assignments cta
              on cta.class_id=cs.class_id
             and cta.school_id=c.school_id
             and cta.teacher_user_id=auth.uid()
             and cta.active
            left join public.academic_subjects a
              on a.id=public.academic_resolve_subject_id(p_subject,u.school_id)
            where cs.student_id=p_student_id
              and (
                public.academic_normalize_subject_key(cta.subject)
                  =public.academic_normalize_subject_key(p_subject)
                or public.academic_normalize_subject_key(cta.subject)=a.code
                or public.academic_normalize_subject_key(cta.subject)
                  =public.academic_normalize_subject_key(a.name)
              )
          )
        )
      )
  );
$function$;

revoke all on function public.student_learning_can_manage_intervention(uuid,text)
from public,anon,authenticated,service_role;
grant execute on function public.student_learning_can_manage_intervention(uuid,text)
to authenticated,service_role;


create or replace function public.bh_writing_allowed_students()
returns table(student_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  with me as (
    select u.id,u.role,coalesce(u.is_admin,false) is_admin,u.school_id
    from public.users u where u.id=auth.uid()
  )
  select distinct u.id
  from public.users u join me on true
  where private.actor_has_programme_access('writing',true)
    and (me.is_admin or me.role='admin')
    and u.role='student'

  union

  select distinct u.id
  from public.users u join me on u.school_id=me.school_id
  where me.role='school_admin'
    and u.role='student'
    and private.actor_has_programme_access('writing',true)

  union

  select distinct r.student_id
  from me
  cross join lateral private.teacher_current_teaching_roster(me.id,me.school_id) r
  where me.role='teacher'
    and private.actor_has_programme_access('writing',true)
    and (
      lower(coalesce(r.academic_subject_code,''))='english'
      or lower(coalesce(r.academic_subject_name,''))='english'
      or lower(trim(r.school_subject_name)) like 'english%'
      or lower(trim(r.school_subject_name))='esl'
    )

  union

  select distinct cs.student_id
  from me
  join public.class_teacher_assignments cta
    on cta.teacher_user_id=me.id and cta.active
  join public.classes c
    on c.id=cta.class_id and c.school_id=me.school_id
  join public.class_students cs on cs.class_id=cta.class_id
  where me.role='teacher'
    and private.actor_has_programme_access('writing',true)
    and not exists(
      select 1 from private.teacher_current_teaching_groups(me.id,me.school_id)
    );
$function$;

revoke all on function public.bh_writing_allowed_students()
from public,anon,authenticated,service_role;
grant execute on function public.bh_writing_allowed_students()
to authenticated,service_role;


create or replace function public.can_access_bh_writing_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.actor_has_programme_access('writing',true)
    and (
      public.is_superadmin(auth.uid())
      or exists(
        select 1 from public.users me
        where me.id=auth.uid() and (coalesce(me.is_admin,false) or me.role='admin')
      )
      or exists(
        select 1
        from public.users me
        join public.users target
          on target.id=p_student_id and target.school_id=me.school_id
        where me.id=auth.uid() and me.role='school_admin'
      )
      or exists(
        select 1
        from public.users me
        cross join lateral private.teacher_current_teaching_roster(me.id,me.school_id) r
        where me.id=auth.uid()
          and me.role='teacher'
          and r.student_id=p_student_id
          and (
            lower(coalesce(r.academic_subject_code,''))='english'
            or lower(coalesce(r.academic_subject_name,''))='english'
            or lower(trim(r.school_subject_name)) like 'english%'
            or lower(trim(r.school_subject_name))='esl'
          )
      )
      or exists(
        select 1
        from public.users me
        join public.users target
          on target.id=p_student_id and target.school_id=me.school_id
        join public.class_teacher_assignments cta
          on cta.teacher_user_id=me.id and cta.active
        join public.class_students cs
          on cs.class_id=cta.class_id and cs.student_id=target.id
        where me.id=auth.uid()
          and me.role='teacher'
          and not exists(
            select 1 from private.teacher_current_teaching_groups(me.id,me.school_id)
          )
      )
    );
$function$;

revoke all on function public.can_access_bh_writing_student(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.can_access_bh_writing_student(uuid)
to authenticated,service_role;


create or replace function public.academic_reporting_can_generate(
  p_school_id uuid,
  p_report_type text,
  p_student_id uuid,
  p_class_id uuid,
  p_academic_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and (
      public.is_school_owner(p_school_id)
      or exists(
        select 1 from public.school_members sm
        where sm.school_id=p_school_id
          and sm.user_id=auth.uid()
          and sm.status='active'
          and sm.role_in_school='school_admin'
      )
      or (
        p_report_type='student'
        and p_student_id is not null
        and exists(
          select 1
          from private.teacher_current_teaching_roster(auth.uid(),p_school_id) r
          where r.student_id=p_student_id
            and (
              p_academic_subject_id is null
              or r.academic_subject_id=p_academic_subject_id
            )
        )
      )
      or (
        p_report_type='class'
        and p_class_id is not null
        and p_academic_subject_id is not null
        and exists(
          select 1
          from private.teacher_current_teaching_groups(auth.uid(),p_school_id) scope
          where scope.group_type='class'
            and scope.registration_class_id=p_class_id
            and scope.academic_subject_id=p_academic_subject_id
        )
      )
      or (
        not exists(
          select 1 from private.teacher_current_teaching_groups(auth.uid(),p_school_id)
        )
        and (
          (
            p_report_type='student'
            and p_student_id is not null
            and exists(
              select 1
              from public.class_students cs
              join public.classes c on c.id=cs.class_id and c.school_id=p_school_id
              join public.class_teacher_assignments cta
                on cta.class_id=c.id
               and cta.school_id=c.school_id
               and cta.teacher_user_id=auth.uid()
               and cta.active
              left join public.academic_subjects s on s.id=p_academic_subject_id
              where cs.student_id=p_student_id
                and (
                  p_academic_subject_id is null
                  or public.academic_normalize_subject_key(cta.subject)=s.code
                  or public.academic_resolve_subject_id(cta.subject,p_school_id)=p_academic_subject_id
                )
            )
          )
          or (
            p_report_type='class'
            and p_class_id is not null
            and p_academic_subject_id is not null
            and exists(
              select 1
              from public.class_teacher_assignments cta
              join public.academic_subjects s on s.id=p_academic_subject_id
              where cta.school_id=p_school_id
                and cta.class_id=p_class_id
                and cta.teacher_user_id=auth.uid()
                and cta.active
                and (
                  public.academic_normalize_subject_key(cta.subject)=s.code
                  or public.academic_resolve_subject_id(cta.subject,p_school_id)=p_academic_subject_id
                )
            )
          )
        )
      )
    );
$function$;

revoke all on function public.academic_reporting_can_generate(uuid,text,uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.academic_reporting_can_generate(uuid,text,uuid,uuid,uuid)
to authenticated,service_role;


create or replace function public.rpc_teacher_assignment_success_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with current_teacher as (
    select t.id teacher_id,t.user_id teacher_user_id
    from public.teachers t
    where t.user_id=auth.uid()
    limit 1
  ),
  current_scope_assignments as (
    select a.id
    from public.assignments a
    join current_teacher t on t.teacher_id=a.teacher_id
    join public.school_academic_years y
      on y.id=a.academic_year_id
     and y.school_id=a.school_id
     and y.status='current'
    where (
      a.subject_group_id is not null
      and exists(
        select 1
        from public.school_subject_group_teachers gt
        join public.school_subject_groups g
          on g.id=gt.group_id
         and g.school_id=gt.school_id
         and g.status='active'
        join public.school_subject_offerings o
          on o.id=g.school_subject_offering_id
         and o.school_id=g.school_id
         and o.status='active'
        where gt.group_id=a.subject_group_id
          and gt.teacher_user_id=t.teacher_user_id
          and gt.school_id=a.school_id
          and gt.active
          and o.academic_year_id=a.academic_year_id
      )
    )
    or (
      a.subject_group_id is null
      and (
        (
          coalesce(a.assignment_mode,'batch')='batch'
          and a.class_id is not null
          and exists(
            select 1
            from public.class_teacher_assignments cta
            join public.classes c
              on c.id=cta.class_id
             and c.school_id=cta.school_id
             and coalesce(c.is_active,true)
            where cta.teacher_user_id=t.teacher_user_id
              and cta.school_id=a.school_id
              and cta.class_id=a.class_id
              and cta.active
              and private.teacher_assignment_subject_key(cta.subject)
                =private.teacher_assignment_subject_key(a.subject_name)
          )
        )
        or (
          (
            coalesce(a.assignment_mode,'batch')='custom'
            or a.class_id is null
            or upper(trim(coalesce(a.batch,'')))='ALL'
          )
          and exists(
            select 1
            from public.student_assignments sa
            join public.class_students cs on cs.student_id=sa.student_id
            join public.class_teacher_assignments cta
              on cta.class_id=cs.class_id
             and cta.teacher_user_id=t.teacher_user_id
             and cta.school_id=a.school_id
             and cta.active
            join public.classes c
              on c.id=cta.class_id
             and c.school_id=cta.school_id
             and coalesce(c.is_active,true)
            where sa.assignment_id=a.id
              and private.teacher_assignment_subject_key(cta.subject)
                =private.teacher_assignment_subject_key(a.subject_name)
          )
        )
      )
    )
  ),
  assignment_progress as (
    select
      csa.id,
      count(sa.student_id)::int student_count,
      count(sa.student_id) filter(where sa.status='completed')::int completed_count
    from current_scope_assignments csa
    left join public.student_assignments sa on sa.assignment_id=csa.id
    group by csa.id
  ),
  assignment_totals as (
    select
      count(*)::int assignment_count,
      count(*) filter(where completed_count<student_count)::int active_assignment_count
    from assignment_progress
  ),
  valid_results as (
    select coalesce(r.correct,0) correct,coalesce(r.incorrect,0) incorrect
    from public.student_assignment_results r
    join current_scope_assignments csa on csa.id=r.assignment_id
    where not exists(
      select 1
      from public.legacy_quarantined_assignment_students q
      where q.assignment_id=r.assignment_id and q.student_id=r.student_id
    )
  ),
  result_totals as (
    select
      count(*)::int submission_count,
      coalesce(sum(correct+incorrect),0)::int answered_question_count,
      coalesce(sum(correct),0)::int correct_answer_count
    from valid_results
  )
  select jsonb_build_object(
    'assignment_count',a.assignment_count,
    'active_assignment_count',a.active_assignment_count,
    'submission_count',r.submission_count,
    'answered_question_count',r.answered_question_count,
    'correct_answer_count',r.correct_answer_count,
    'success_rate',case
      when r.answered_question_count>0
      then round(r.correct_answer_count::numeric*100/r.answered_question_count)::int
      else 0
    end
  )
  from assignment_totals a
  cross join result_totals r;
$function$;

revoke all on function public.rpc_teacher_assignment_success_summary()
from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_assignment_success_summary()
to authenticated,service_role;
