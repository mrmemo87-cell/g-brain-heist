-- Repair canonical school membership for unambiguous operational-year students.
-- The existing school_members sync trigger remains the authority for users.school_id.
-- Suppress the activation email only for this historical integrity repair.

alter table public.school_members
  disable trigger professional_email_school_member_joined;

with operational_enrolments as (
  select distinct e.student_id, e.school_id
  from public.student_academic_enrolments e
  join public.users u on u.id = e.student_id
  where u.role = 'student'
    and e.academic_year_id = public.academic_resolve_operational_year_id(e.school_id, now())
), eligible as (
  select
    oe.student_id,
    min(oe.school_id::text)::uuid as school_id
  from operational_enrolments oe
  group by oe.student_id
  having count(distinct oe.school_id) = 1
), safe_membership as (
  select e.student_id, e.school_id
  from eligible e
  join public.users u on u.id = e.student_id
  where (u.school_id is null or u.school_id = e.school_id)
    and not exists (
      select 1
      from public.school_members sm
      where sm.user_id = e.student_id
        and sm.status = 'active'
        and sm.school_id <> e.school_id
    )
)
insert into public.school_members (
  school_id,
  user_id,
  role_in_school,
  status,
  is_owner,
  can_teach
)
select
  s.school_id,
  s.student_id,
  'student',
  'active',
  false,
  false
from safe_membership s
where not exists (
  select 1
  from public.school_members existing
  where existing.school_id = s.school_id
    and existing.user_id = s.student_id
)
on conflict (school_id, user_id) do nothing;

alter table public.school_members
  enable trigger professional_email_school_member_joined;
