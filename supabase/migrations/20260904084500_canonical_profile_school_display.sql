-- Keep the deprecated users.school field as a compatibility mirror only and
-- make Superadmin profile display resolve from the canonical linked school.

create or replace function private.sync_legacy_user_school_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_name text;
begin
  if new.school_id is null then
    new.school := null;
    return new;
  end if;

  select s.name
    into v_school_name
  from public.schools s
  where s.id = new.school_id;

  new.school := v_school_name;
  return new;
end;
$$;

revoke all on function private.sync_legacy_user_school_name() from public, anon, authenticated, service_role;

drop trigger if exists trg_sync_legacy_user_school_name on public.users;
create trigger trg_sync_legacy_user_school_name
before insert or update of school_id, school on public.users
for each row execute function private.sync_legacy_user_school_name();

-- The frontend currently consumes claimed_school_name for its "Profile school"
-- row. Preserve that response key for compatibility, but source the value from
-- schools via users.school_id instead of the deprecated users.school text.
do $patch$
declare
  v_def text;
  v_old text := '''claimed_school_name'', v_user.school,';
  v_new text := '''claimed_school_name'', v_linked_school_name,';
begin
  select pg_get_functiondef('public.rpc_superadmin_user_intelligence(uuid)'::regprocedure)
    into v_def;

  if position(v_old in v_def) = 0 then
    raise exception 'superadmin_profile_school_patch_anchor_not_found';
  end if;

  execute replace(v_def, v_old, v_new);
end;
$patch$;

comment on function private.sync_legacy_user_school_name() is
  'Maintains public.users.school as a deprecated mirror of the canonical users.school_id -> schools.name relationship.';
