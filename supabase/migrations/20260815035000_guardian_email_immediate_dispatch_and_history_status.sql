create or replace function public.trg_kick_school_email_dispatcher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select c.dispatch_key into v_key
  from public.school_email_dispatch_config c
  where c.singleton = true;

  if coalesce(v_key, '') <> '' then
    perform net.http_post(
      url := 'https://sozodkxwhubespiedgxm.supabase.co/functions/v1/school_email_dispatcher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-school-email-dispatch-key',v_key
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  end if;

  return null;
exception when others then
  -- Queue creation must never fail just because the immediate wake-up failed.
  -- The once-per-minute cron remains the delivery fallback.
  return null;
end;
$$;

revoke all on function public.trg_kick_school_email_dispatcher() from public, anon, authenticated;

drop trigger if exists guardian_invitation_email_kick_dispatcher on public.guardian_invitation_email_notifications;
create trigger guardian_invitation_email_kick_dispatcher
after insert on public.guardian_invitation_email_notifications
for each statement execute function public.trg_kick_school_email_dispatcher();

drop trigger if exists assignment_email_kick_dispatcher on public.assignment_email_notifications;
create trigger assignment_email_kick_dispatcher
after insert on public.assignment_email_notifications
for each statement execute function public.trg_kick_school_email_dispatcher();

create or replace function public.rpc_school_guardian_management_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id = v_caller and sm.status='active' and sm.role_in_school='school_admin'
  order by sm.is_owner desc, sm.joined_at
  limit 1;
  if v_school_id is null then raise exception 'School administration access required'; end if;

  select jsonb_build_object(
    'school_id', v_school_id,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', u.id,
        'student_name', coalesce(nullif(trim(u.full_name),''),u.username),
        'class_name', coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
        'grade', coalesce(c.grade_level::text, nullif(trim(u.grade::text), ''))
      ) order by coalesce(c.grade_level::text,u.grade::text), coalesce(c.class_code,u.batch), coalesce(u.full_name,u.username))
      from public.school_members sm
      join public.users u on u.id=sm.user_id and u.school_id=sm.school_id
      left join public.class_students cs on cs.student_id=u.id
      left join public.classes c on c.id=cs.class_id and c.school_id=v_school_id and c.is_active is true
      where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='student'
    ),'[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'student_id',r.student_id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'guardian_user_id',r.guardian_user_id,
        'guardian_email',ga.primary_email,
        'guardian_name',ga.display_name,
        'relationship_label',r.relationship_label,
        'status',r.status,'verified_at',r.verified_at,'revoked_at',r.revoked_at
      ) order by r.created_at desc)
      from public.student_guardian_relationships r
      join public.users u on u.id=r.student_id
      left join public.guardian_accounts ga on ga.user_id=r.guardian_user_id
      where r.school_id=v_school_id
    ),'[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'student_id',i.student_id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'invited_email',i.invited_email,'relationship_label',i.relationship_label,
        'expires_at',i.expires_at,'created_at',i.created_at,
        'claimed_at',i.claimed_at,'revoked_at',i.revoked_at,
        'status',case when i.revoked_at is not null then 'revoked' when i.claimed_at is not null then 'claimed' when i.expires_at < now() then 'expired' else 'pending' end,
        'email_status', coalesce(q.status, 'not_sent'),
        'email_sent_at', q.sent_at,
        'email_last_error', q.last_error,
        'email_attempts', coalesce(q.attempts,0)
      ) order by i.created_at desc)
      from public.guardian_invitations i
      join public.users u on u.id=i.student_id
      left join lateral (
        select n.status,n.sent_at,n.last_error,n.attempts
        from public.guardian_invitation_email_notifications n
        where n.invitation_id=i.id
        order by n.created_at desc
        limit 1
      ) q on true
      where i.school_id=v_school_id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.rpc_school_guardian_management_snapshot() from public, anon;
grant execute on function public.rpc_school_guardian_management_snapshot() to authenticated;
