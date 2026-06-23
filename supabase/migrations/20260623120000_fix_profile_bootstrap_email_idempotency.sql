-- Make normal Brain Heist profile bootstrap idempotent under repeated OAuth/setup calls
-- and avoid raw users_email_key 409s when an email already exists in public.users.

CREATE OR REPLACE FUNCTION public.profile_bootstrap(
  p_school_id uuid DEFAULT NULL,
  p_role text DEFAULT 'student',
  p_grade smallint DEFAULT NULL,
  p_batch text DEFAULT NULL,
  p_username text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_username text;
  v_role text := lower(trim(coalesce(p_role, 'student')));
  v_grade smallint;
  v_batch text;
  v_profile public.users%ROWTYPE;
  v_email_profile public.users%ROWTYPE;
  v_can_attach boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated', 'code', 'not_authenticated');
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_uid;
  IF coalesce(v_email, '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your account is missing an email address.', 'code', 'missing_email');
  END IF;

  IF v_role NOT IN ('student', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please choose either student or teacher.', 'code', 'invalid_role');
  END IF;

  v_grade := CASE WHEN v_role = 'student' THEN p_grade ELSE NULL END;
  v_batch := CASE WHEN v_role = 'student' THEN NULLIF(upper(trim(coalesce(p_batch, ''))), '') ELSE NULL END;
  v_username := coalesce(NULLIF(trim(p_username), ''), split_part(v_email, '@', 1), 'user');

  -- Serialize all bootstrap attempts for the same normalized email so repeated
  -- client calls cannot race each other into duplicate inserts/unique errors.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  SELECT * INTO v_profile FROM public.users WHERE id = v_uid FOR UPDATE;
  IF FOUND THEN
    UPDATE public.users
    SET email = v_email,
        username = coalesce(NULLIF(public.users.username, ''), v_username),
        school_id = coalesce(p_school_id, public.users.school_id),
        role = v_role,
        grade = v_grade,
        batch = v_batch,
        needs_setup = false,
        avatar_url = coalesce(public.users.avatar_url, 'https://picsum.photos/seed/' || v_username || '/100/100'),
        updated_at = now()
    WHERE id = v_uid
    RETURNING * INTO v_profile;

    RETURN jsonb_build_object('success', true, 'user_id', v_profile.id, 'school_id', v_profile.school_id, 'role', v_profile.role, 'username', v_profile.username);
  END IF;

  SELECT * INTO v_email_profile
  FROM public.users
  WHERE lower(email) = v_email
  FOR UPDATE;

  IF FOUND THEN
    -- Only reclaim an email row when its old auth user no longer exists. If an
    -- active auth user still owns that profile, do not merge identities in this
    -- client-facing RPC; return a handled message instead of leaking a 409.
    SELECT NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_email_profile.id)
    INTO v_can_attach;

    IF v_can_attach THEN
      UPDATE public.users
      SET id = v_uid,
          email = v_email,
          username = coalesce(NULLIF(public.users.username, ''), v_username),
          school_id = coalesce(p_school_id, public.users.school_id),
          role = v_role,
          grade = v_grade,
          batch = v_batch,
          needs_setup = false,
          avatar_url = coalesce(public.users.avatar_url, 'https://picsum.photos/seed/' || v_username || '/100/100'),
          updated_at = now()
      WHERE id = v_email_profile.id
        AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_email_profile.id)
      RETURNING * INTO v_profile;

      IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'user_id', v_profile.id, 'school_id', v_profile.school_id, 'role', v_profile.role, 'username', v_profile.username, 'repaired_email_profile', true);
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'A Brain Heist profile already exists for this email. Please sign in with the original login method or contact support to link the account.',
      'code', 'email_profile_conflict'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE username = v_username) THEN
    v_username := v_username || '_' || substr(v_uid::text, 1, 8);
  END IF;

  INSERT INTO public.users (id, email, username, school_id, role, grade, batch, avatar_url, needs_setup, created_at, updated_at)
  VALUES (v_uid, v_email, v_username, p_school_id, v_role, v_grade, v_batch, 'https://picsum.photos/seed/' || v_username || '/100/100', false, now(), now())
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object('success', true, 'user_id', v_profile.id, 'school_id', v_profile.school_id, 'role', v_profile.role, 'username', v_profile.username);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'A Brain Heist profile already exists for this email. Please sign in with the original login method or contact support to link the account.',
    'code', 'email_profile_conflict'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.profile_bootstrap(uuid, text, smallint, text, text) TO authenticated;
