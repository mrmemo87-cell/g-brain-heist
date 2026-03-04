-- ============================================================
-- FIX: join_school_by_code returns "User not found" for new signups
-- Root cause: the DB trigger that creates public.users is sometimes
-- not yet committed when a freshly-confirmed student enters their
-- invite code in the SetupWizard.
-- Fix: auto-create a minimal profile row from auth.users data
-- before proceeding, instead of returning an error.
-- ============================================================

CREATE OR REPLACE FUNCTION join_school_by_code(
    p_invite_code TEXT,
    p_role TEXT DEFAULT 'student'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user RECORD;
    v_school RECORD;
    v_existing RECORD;
    v_rate_check JSONB;
    v_cleaned_code TEXT;
    v_auth_email TEXT;
    v_auth_meta JSONB;
    v_fallback_username TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_user FROM users WHERE id = v_user_id;

    -- New-signup race condition: trigger may not have created the row yet.
    -- Auto-create a minimal profile so the rest of the flow can proceed.
    IF v_user IS NULL THEN
        SELECT email, raw_user_meta_data
          INTO v_auth_email, v_auth_meta
          FROM auth.users
         WHERE id = v_user_id;

        IF v_auth_email IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
        END IF;

        v_fallback_username := COALESCE(
            NULLIF(TRIM(v_auth_meta->>'username'), ''),
            split_part(v_auth_email, '@', 1)
        );

        INSERT INTO users (id, email, username, role, needs_setup, created_at, updated_at)
        VALUES (
            v_user_id,
            v_auth_email,
            v_fallback_username,
            'student',
            true,
            NOW(),
            NOW()
        )
        ON CONFLICT (id) DO NOTHING;

        SELECT * INTO v_user FROM users WHERE id = v_user_id;
    END IF;

    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_user.is_banned THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended');
    END IF;

    SELECT * INTO v_existing
    FROM school_members
    WHERE user_id = v_user_id AND status = 'active'
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'You are already a member of a school. Leave your current school first.',
            'current_school_id', v_existing.school_id
        );
    END IF;

    v_rate_check := check_invite_rate_limit(v_user_id);
    IF NOT (v_rate_check->>'allowed')::boolean THEN
        RETURN v_rate_check;
    END IF;

    v_cleaned_code := normalize_invite_code(p_invite_code);
    IF v_cleaned_code IS NULL OR LENGTH(v_cleaned_code) < 6 THEN
        INSERT INTO invite_code_attempts (user_id, attempted_code, success)
        VALUES (v_user_id, COALESCE(LEFT(v_cleaned_code, 3), '???') || '***', false);
        RETURN jsonb_build_object('success', false, 'error', 'Invalid invite code format');
    END IF;

    SELECT * INTO v_school
    FROM schools
    WHERE invite_code = v_cleaned_code
      AND status = 'active';

    IF v_school IS NULL THEN
        INSERT INTO invite_code_attempts (user_id, attempted_code, success)
        VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', false);
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;

    IF p_role NOT IN ('student', 'teacher') THEN
        p_role := 'student';
    END IF;

    IF p_role = 'teacher' AND NOT COALESCE((v_school.settings->>'allow_teacher_signup')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Teacher signup is disabled for this school. Contact the school admin.');
    END IF;

    IF p_role = 'student' AND NOT COALESCE((v_school.settings->>'allow_student_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student signup is disabled for this school');
    END IF;

    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (v_school.id, v_user_id, p_role, 'active');

    IF p_role = 'teacher' THEN
        UPDATE users SET role = 'teacher' WHERE id = v_user_id AND role = 'student';
    END IF;

    INSERT INTO invite_code_attempts (user_id, attempted_code, success)
    VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', true);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully joined ' || v_school.name,
        'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'slug', v_school.slug)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION join_school_by_code(TEXT, TEXT) TO authenticated;
