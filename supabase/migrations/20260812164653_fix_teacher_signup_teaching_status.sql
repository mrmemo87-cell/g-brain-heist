-- Teacher is a primary teaching role. `can_teach` remains an explicit dual-role
-- capability for school administrators, but an active teacher membership must
-- always be recognized as teaching staff.

comment on column public.school_members.can_teach is
  'Teaching capability. Active teacher-role memberships are always true; school administrators require explicit School Head registration.';

create or replace function public.ensure_teacher_membership_can_teach()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role_in_school = 'teacher' and new.status = 'active' then
    new.can_teach := true;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_teacher_membership_can_teach on public.school_members;
create trigger ensure_teacher_membership_can_teach
before insert or update of role_in_school, status, can_teach on public.school_members
for each row execute function public.ensure_teacher_membership_can_teach();

revoke all on function public.ensure_teacher_membership_can_teach()
  from public, anon, authenticated, service_role;

-- Repair memberships created by the invite-code flow before this invariant was
-- enforced. This intentionally does not change administrator teaching status.
update public.school_members
set can_teach = true,
    updated_at = now()
where status = 'active'
  and role_in_school = 'teacher'
  and can_teach is distinct from true;

notify pgrst, 'reload schema';
