-- Premium parent/guardian invitation preview.
-- The bearer invitation token may reveal only presentation context required to help the intended
-- recipient recognise the school and child before authentication. No academic data, raw email,
-- user UUID or school UUID is exposed by this function.

create or replace function public.rpc_guardian_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.guardian_invitations%rowtype;
  v_school record;
  v_student record;
  v_status text;
  v_email_hint text;
begin
  if nullif(trim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('valid', false, 'status', 'missing');
  end if;

  select * into v_inv
  from public.guardian_invitations i
  where i.token_hash = extensions.digest(trim(p_token), 'sha256')
  limit 1;

  if v_inv.id is null then
    return jsonb_build_object('valid', false, 'status', 'not_found');
  end if;

  v_status := case
    when v_inv.revoked_at is not null then 'revoked'
    when v_inv.claimed_at is not null then 'claimed'
    when v_inv.expires_at < now() then 'expired'
    else 'ready'
  end;

  select s.name, s.logo_url into v_school
  from public.schools s
  where s.id = v_inv.school_id;

  select
    coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'your child') as student_name,
    coalesce(nullif(trim(c.class_code), ''), nullif(trim(u.batch), ''), null) as class_name,
    coalesce(nullif(trim(c.grade_level::text), ''), nullif(trim(u.grade::text), ''), null) as grade
  into v_student
  from public.users u
  left join public.class_students cs on cs.student_id = u.id
  left join public.classes c on c.id = cs.class_id and c.school_id = v_inv.school_id and c.is_active is true
  where u.id = v_inv.student_id
  order by c.created_at desc nulls last
  limit 1;

  v_email_hint := case
    when position('@' in v_inv.invited_email) > 2 then
      left(v_inv.invited_email, 2) || '•••@' || split_part(v_inv.invited_email, '@', 2)
    else 'the invited email address'
  end;

  return jsonb_build_object(
    'valid', v_status = 'ready',
    'status', v_status,
    'school', jsonb_build_object(
      'name', coalesce(v_school.name, 'School'),
      'logo_url', v_school.logo_url
    ),
    'student', jsonb_build_object(
      'name', v_student.student_name,
      'class_name', v_student.class_name,
      'grade', v_student.grade
    ),
    'relationship_label', v_inv.relationship_label,
    'expires_at', v_inv.expires_at,
    'invited_email_hint', v_email_hint
  );
end;
$$;

revoke all on function public.rpc_guardian_invitation_preview(text) from public;
grant execute on function public.rpc_guardian_invitation_preview(text) to anon, authenticated, service_role;
