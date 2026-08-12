-- Complete school onboarding through the governed invite-code join path.
-- The browser must never manufacture users.school_id directly; school_members
-- remains authoritative and the existing sync trigger maintains the legacy mirror.

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
  v_join jsonb;
  v_profile jsonb;
  v_failure jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'success', false,
      'code', 'not_authenticated',
      'error', 'Not authenticated'
    );
  end if;

  -- Keep the membership write and profile completion in one subtransaction.
  -- If profile completion fails, rolling out of this block also rolls back the
  -- successful school join so the user is never stranded in a partial setup.
  begin
    v_join := public.join_school_by_code(p_invite_code, p_role);

    if coalesce((v_join->>'success')::boolean, false) is not true then
      return v_join;
    end if;

    -- Membership is now authoritative. Finish the profile without passing a
    -- school id into profile_bootstrap, so users.school_id is never set from a
    -- browser-controlled value.
    v_profile := public.profile_bootstrap(
      null,
      p_role,
      p_grade,
      p_batch,
      p_username
    );

    if coalesce((v_profile->>'success')::boolean, false) is not true then
      v_failure := jsonb_build_object(
        'success', false,
        'code', coalesce(v_profile->>'code', 'profile_setup_failed'),
        'error', coalesce(
          v_profile->>'error',
          'We could not finish setting up your school profile. Please try again.'
        )
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
