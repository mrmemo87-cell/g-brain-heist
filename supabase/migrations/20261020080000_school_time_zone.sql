-- Emails show dates in the school's own local time (owner request 2026-10-20: a due date read "12:00 PM UTC" for
-- Bishkek students, whose deadline was 6:00 PM). Schools without a time zone keep the explicit UTC label.
alter table public.schools add column if not exists time_zone text;
comment on column public.schools.time_zone is 'IANA time zone used to show dates in school emails, e.g. Asia/Bishkek. Null shows UTC.';

create or replace function private.schools_check_time_zone() returns trigger
language plpgsql set search_path to '' as $$
begin
 if new.time_zone is not null and not exists(select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
  raise exception using errcode = '22023', message = 'unknown_time_zone';
 end if;
 return new;
end $$;
revoke all on function private.schools_check_time_zone() from public, anon, authenticated;
create or replace trigger schools_check_time_zone before insert or update of time_zone on public.schools
 for each row execute function private.schools_check_time_zone();

-- Silk Road International School is in Bishkek (owner, 2026-10-20).
update public.schools set time_zone = 'Asia/Bishkek' where id = '8eeecf5d-0496-4e0d-b5cd-538f91c9cfa0' and time_zone is null;
