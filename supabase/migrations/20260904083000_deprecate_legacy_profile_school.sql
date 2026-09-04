-- Retire the legacy public.users.school text field as a source of school truth.
--
-- The column predates the multi-tenant school model and historically defaulted
-- every new profile to "Silk Road International School". Canonical school
-- authority is now users.school_id + school_members -> schools.

-- Fail closed if any canonical school_id currently points at a missing school.
do $$
begin
  if exists (
    select 1
    from public.users u
    left join public.schools s on s.id = u.school_id
    where u.school_id is not null
      and s.id is null
  ) then
    raise exception 'legacy_school_cleanup_broken_school_id';
  end if;
end
$$;

-- New profiles must never inherit a school name implicitly.
alter table public.users
  alter column school drop default;

-- This legacy cleanup is unrelated to forced profile-change moderation. Disable
-- that one broad UPDATE trigger briefly so school normalization cannot clear an
-- existing required_changes/profile_locked state as a side effect.
alter table public.users disable trigger trg_auto_clear_required_changes;

-- Individuals/unassigned users must not carry a fake school label.
update public.users u
set school = null
where u.school_id is null
  and nullif(trim(coalesce(u.school, '')), '') is not null;

-- For linked users, keep the deprecated field as a compatibility mirror only.
update public.users u
set school = s.name
from public.schools s
where u.school_id = s.id
  and u.school is distinct from s.name;

alter table public.users enable trigger trg_auto_clear_required_changes;

comment on column public.users.school is
  'Deprecated compatibility mirror only. Canonical school authority is public.users.school_id plus public.school_members joined to public.schools.';

-- Verify the cleanup completed without changing canonical membership.
do $$
begin
  if exists (
    select 1
    from public.users u
    left join public.schools s on s.id = u.school_id
    where (u.school_id is null and nullif(trim(coalesce(u.school, '')), '') is not null)
       or (u.school_id is not null and u.school is distinct from s.name)
  ) then
    raise exception 'legacy_school_cleanup_verification_failed';
  end if;
end
$$;
