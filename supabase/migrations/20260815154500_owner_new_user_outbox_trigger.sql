-- Queue platform-owner signup alerts in the same database transaction as the
-- Auth user creation. The legacy Auth hook remains idempotently compatible.
create or replace function private.trg_email_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_username text;
begin
  v_username:=left(coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'),''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'new-user'
  ),100);
  perform private.enqueue_transactional_email(
    'new_user_created','platform_operations','platform_owner','owner_new_user',
    'owner-new-user-'||new.id::text,
    jsonb_build_object('user_id',new.id,'username',v_username,'created_at',new.created_at),
    null,null,null,'Brains Heist Operations',now()
  );
  return new;
end;
$$;
revoke all on function private.trg_email_new_auth_user() from public, anon, authenticated;

drop trigger if exists professional_email_new_auth_user on auth.users;
create trigger professional_email_new_auth_user
after insert on auth.users
for each row execute function private.trg_email_new_auth_user();
