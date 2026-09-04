create or replace function private.trg_email_school_member_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='UPDATE'
     and old.status='active'
     and new.status is distinct from 'active'
     and exists (select 1 from auth.users au where au.id = new.user_id) then
    perform private.enqueue_transactional_email(
      'school_membership_changed','school_operations',
      case when new.role_in_school in ('school_head','school_admin','teacher','student','parent') then new.role_in_school else 'student' end,
      'school_membership_changed','school-membership-change-'||new.id::text||'-'||coalesce(new.status,'inactive'),
      jsonb_build_object('membership_id',new.id,'role',new.role_in_school,'status',coalesce(new.status,'inactive')),
      new.user_id,null,new.school_id,null,now()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.trg_email_school_member_changed() from public;
