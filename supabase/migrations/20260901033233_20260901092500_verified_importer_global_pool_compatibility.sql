-- Keep the canonical Brains Heist verified-package importer compatible with the
-- question authority model introduced after the importer was created.
--
-- Teacher-authored questions intentionally default to pool_scope = 'teacher'.
-- Older service-role verified importers already provide the protected
-- Brains Heist authority fields but do not explicitly provide pool_scope. For
-- that narrow trusted insert shape, normalize the default to the only valid
-- Brains Heist scope: global. The existing authority trigger and table CHECK
-- remain authoritative and still reject every invalid combination.

create or replace function private.normalize_brain_heist_verified_insert_authority()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if v_service
     and new.content_origin = 'brain_heist'
     and new.verification_status in ('verified', 'retired')
     and new.pool_scope = 'teacher'
     and new.owner_school_id is null then
    new.pool_scope := 'global';
  end if;

  return new;
end;
$function$;

revoke all on function private.normalize_brain_heist_verified_insert_authority()
  from public, anon, authenticated;

drop trigger if exists trg_00_normalize_brain_heist_verified_insert_authority
  on public.questions;
create trigger trg_00_normalize_brain_heist_verified_insert_authority
before insert on public.questions
for each row
execute function private.normalize_brain_heist_verified_insert_authority();
