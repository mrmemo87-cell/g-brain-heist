create or replace function public.rpc_get_my_teacher_class_roster()
returns table (
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
security invoker
set search_path = ''
as $function$
  with my_classes as (
    select
      c.school_id,
      c.id as class_id,
      c.class_code::text,
      c.class_name::text,
      c.grade_level::text,
      coalesce(
        array_agg(distinct cta.subject order by cta.subject)
          filter (where nullif(trim(cta.subject), '') is not null),
        array[]::text[]
      ) as subject_names
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id = cta.class_id
     and c.school_id = cta.school_id
    where cta.teacher_user_id = auth.uid()
      and cta.active = true
      and coalesce(c.is_active, true)
    group by c.school_id, c.id, c.class_code, c.class_name, c.grade_level
  )
  select
    mc.school_id,
    mc.class_id,
    mc.class_code,
    mc.class_name,
    mc.grade_level,
    mc.subject_names,
    u.id as student_id,
    u.username::text as student_username,
    coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Student')::text as student_display_name,
    coalesce(nullif(trim(u.grade), ''), mc.grade_level, '')::text as student_grade,
    u.avatar_url::text as student_avatar_url,
    case
      when u.id is null then null
      else not coalesce(u.is_banned, false)
        and not (u.banned_until is not null and u.banned_until > now())
    end as assignment_eligible,
    case
      when u.id is null then null
      when coalesce(u.is_banned, false) then 'banned'
      when u.banned_until is not null and u.banned_until > now() then 'suspended'
      else 'active'
    end::text as access_status,
    u.banned_until
  from my_classes mc
  left join public.class_students cs
    on cs.class_id = mc.class_id
  left join public.users u
    on u.id = cs.student_id
   and u.school_id = mc.school_id
   and coalesce(u.role, 'student') = 'student'
  order by mc.class_code, student_display_name nulls last, u.id;
$function$;

revoke all on function public.rpc_get_my_teacher_class_roster() from public;
revoke all on function public.rpc_get_my_teacher_class_roster() from anon;
grant execute on function public.rpc_get_my_teacher_class_roster() to authenticated;

comment on function public.rpc_get_my_teacher_class_roster() is
  'Canonical teacher workspace roster. Returns allocated classes, subjects, and enrolled students together from class_teacher_assignments + class_students, scoped by auth.uid() and RLS. Independent of billing and plan entitlements.';
