create or replace function public.rpc_school_create_guardian_invitation(
  p_student_id uuid,
  p_invited_email text,
  p_relationship_label text default 'Parent / Guardian'::text,
  p_expires_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_email text := lower(trim(coalesce(p_invited_email,'')));
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  -- Keep validation deliberately shape-based here. The browser already uses
  -- type="email" and delivery is ultimately verified by the mail provider.
  -- Avoid fragile escaped character classes that can reject valid addresses.
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid guardian email';
  end if;

  if char_length(trim(coalesce(p_relationship_label,''))) < 2 then
    raise exception 'Relationship is required';
  end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id=v_caller
    and sm.status='active'
    and sm.role_in_school='school_admin'
  order by sm.is_owner desc, sm.joined_at
  limit 1;

  if v_school_id is null then raise exception 'School administration access required'; end if;

  if not exists(
    select 1
    from public.school_members sm
    where sm.school_id=v_school_id
      and sm.user_id=p_student_id
      and sm.status='active'
      and sm.role_in_school='student'
  ) then
    raise exception 'Student is not an active member of your school';
  end if;

  update public.guardian_invitation_email_notifications q
  set status='cancelled', raw_token=null, updated_at=now()
  where q.invitation_id in (
    select i.id
    from public.guardian_invitations i
    where i.school_id=v_school_id
      and i.student_id=p_student_id
      and i.invited_email=v_email
      and i.claimed_at is null
      and i.revoked_at is null
      and i.expires_at>now()
  ) and q.status not in ('sent','cancelled');

  update public.guardian_invitations
  set revoked_at=now()
  where school_id=v_school_id
    and student_id=p_student_id
    and invited_email=v_email
    and claimed_at is null
    and revoked_at is null
    and expires_at>now();

  v_token := encode(extensions.gen_random_bytes(24),'hex');
  v_expires_at := now()+make_interval(days=>greatest(1,least(coalesce(p_expires_days,7),30)));

  insert into public.guardian_invitations(
    school_id,student_id,invited_email,relationship_label,token_hash,expires_at,created_by
  ) values (
    v_school_id,p_student_id,v_email,trim(p_relationship_label),extensions.digest(v_token,'sha256'),v_expires_at,v_caller
  ) returning id into v_invitation_id;

  insert into public.guardian_invitation_email_notifications(
    invitation_id,school_id,student_id,invited_email,raw_token,available_at,next_attempt_at
  ) values (
    v_invitation_id,v_school_id,p_student_id,v_email,v_token,now(),now()
  );

  return jsonb_build_object(
    'success',true,
    'invitation_id',v_invitation_id,
    'token',v_token,
    'expires_at',v_expires_at,
    'invited_email',v_email,
    'email_status','pending'
  );
end;
$function$;

revoke all on function public.rpc_school_create_guardian_invitation(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.rpc_school_create_guardian_invitation(uuid,text,text,integer) to authenticated, service_role;
