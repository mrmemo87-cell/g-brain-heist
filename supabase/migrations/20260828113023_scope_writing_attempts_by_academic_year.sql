-- Writing Hub academic-year archive boundary.
-- Historical attempts are preserved and backfilled by their original timestamps.
-- New attempts follow the school's explicit current academic year, including
-- pre-term preparation windows where the current year starts in the future.

alter table public.bh_writing_attempts
  add column if not exists academic_year_id uuid;

alter table public.bh_writing_attempts
  drop constraint if exists bh_writing_attempts_academic_year_id_fkey;
alter table public.bh_writing_attempts
  add constraint bh_writing_attempts_academic_year_id_fkey
  foreign key (academic_year_id)
  references public.school_academic_years(id)
  on delete restrict;

update public.bh_writing_attempts a
set academic_year_id = public.academic_resolve_year_id(
  u.school_id,
  coalesce(
    case
      when coalesce(a.payload->>'created_at','') ~ '^\d{4}-\d{2}-\d{2}'
        then (a.payload->>'created_at')::timestamptz
      else null
    end,
    a.created_at
  )
)
from public.users u
where a.academic_year_id is null
  and u.id::text = a.payload->>'student_id'
  and u.school_id is not null;

create index if not exists bh_writing_attempts_academic_year_created_idx
  on public.bh_writing_attempts(academic_year_id, created_at desc);

create or replace function private.bh_writing_attempt_assign_academic_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_current_year_id uuid;
  v_attempt_at timestamptz;
begin
  if nullif(new.payload->>'student_id','') is null then return new; end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id::text = new.payload->>'student_id';
  if v_school_id is null then return new; end if;

  if new.academic_year_id is not null then
    if not exists (
      select 1 from public.school_academic_years y
      where y.id = new.academic_year_id and y.school_id = v_school_id
    ) then
      raise exception using errcode = '23514', message = 'writing_attempt_academic_year_school_mismatch';
    end if;
    return new;
  end if;

  select y.id into v_current_year_id
  from public.school_academic_years y
  where y.school_id = v_school_id and y.status = 'current'
  order by y.starts_on desc, y.id
  limit 1;
  if v_current_year_id is not null then
    new.academic_year_id := v_current_year_id;
    return new;
  end if;

  v_attempt_at := coalesce(
    case
      when coalesce(new.payload->>'created_at','') ~ '^\d{4}-\d{2}-\d{2}'
        then (new.payload->>'created_at')::timestamptz
      else null
    end,
    new.created_at,
    now()
  );
  new.academic_year_id := public.academic_resolve_year_id(v_school_id, v_attempt_at);
  return new;
end;
$$;

revoke all on function private.bh_writing_attempt_assign_academic_year()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_bh_writing_attempt_assign_academic_year on public.bh_writing_attempts;
create trigger trg_bh_writing_attempt_assign_academic_year
before insert or update of payload, academic_year_id
on public.bh_writing_attempts
for each row execute function private.bh_writing_attempt_assign_academic_year();
