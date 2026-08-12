-- Make invite-code setup retry-safe without allowing a user to change their
-- school or membership role through profile completion.

create or replace function public.complete_school_setup_by_code(
  p_invite_code text,
  p_role text default 'student',
  p_grade smallint default null,
  p_batch text default null,
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_role, 'student')));
  v_validation jsonb;
  v_target_school_id uuid;
  v_existing_member public.school_members%rowtype;
  v_join jsonb;
  v_profile jsonb;
  v_failure jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'error', 'Not authenticated');
  end if;

  if v_role not in ('student', 'teacher') then
    return jsonb_build_object('success', false, 'code', 'invalid_role', 'error', 'Please choose either student or teacher.');
  end if;

  v_validation := public.validate_invite_code(p_invite_code);
  if coalesce((v_validation->>'valid')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'code', 'invalid_invite_code', 'error', 'Invalid or expired invite code.');
  end if;

  v_target_school_id := (v_validation->>'school_id')::uuid;

  select sm.* into v_existing_member
  from public.school_members sm
  where sm.user_id = v_uid
    and sm.status = 'active'
  order by sm.joined_at asc nulls last, sm.id
  limit 1;

  if v_existing_member.id is not null then
    if v_existing_member.school_id <> v_target_school_id then
      return jsonb_build_object(
        'success', false,
        'code', 'active_school_conflict',
        'error', 'You are already a member of another school. Leave your current school first.'
      );
    end if;

    if v_existing_member.role_in_school <> v_role then
      return jsonb_build_object(
        'success', false,
        'code', 'membership_role_conflict',
        'error', 'You already joined this school with a different role. Contact your school administrator if it needs to change.'
      );
    end if;
  end if;

  begin
    if v_existing_member.id is null then
      v_join := public.join_school_by_code(p_invite_code, v_role);
      if coalesce((v_join->>'success')::boolean, false) is not true then
        return v_join;
      end if;
    else
      v_join := jsonb_build_object(
        'success', true,
        'message', 'School membership already active',
        'school', jsonb_build_object(
          'id', v_target_school_id,
          'name', v_validation->>'school_name',
          'slug', v_validation->>'school_slug'
        )
      );
    end if;

    v_profile := public.profile_bootstrap(
      null,
      v_role,
      p_grade,
      p_batch,
      p_username
    );

    if coalesce((v_profile->>'success')::boolean, false) is not true then
      v_failure := jsonb_build_object(
        'success', false,
        'code', coalesce(v_profile->>'code', 'profile_setup_failed'),
        'error', coalesce(v_profile->>'error', 'We could not finish setting up your school profile. Please try again.')
      );
      raise exception using errcode = 'P0001', message = 'complete_school_setup_rollback';
    end if;

    return v_profile || jsonb_build_object(
      'school', v_join->'school',
      'message', coalesce(v_join->>'message', 'School joined successfully')
    );
  exception
    when others then
      if v_failure is not null then
        return v_failure;
      end if;

      return jsonb_build_object(
        'success', false,
        'code', 'school_setup_failed',
        'error', 'We could not finish joining this school. Please check the invite code and try again.'
      );
  end;
end;
$$;

revoke all on function public.complete_school_setup_by_code(text, text, smallint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_school_setup_by_code(text, text, smallint, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
