-- ============================================
-- G-Brains Heist - Tenant Isolation Hardening Patch
-- ============================================
-- Date: 2025-12-17
--
-- Purpose (idempotent, safe to re-run):
-- - Enforce one ACTIVE school membership per user (without deleting data).
-- - Normalize invite code comparisons (uppercase + strip non-alphanumeric).
-- - Prevent profile setup from creating conflicting memberships.
-- - Keep onboarding blocked for suspended schools and disallowed roles.
--
-- Run AFTER MULTI_TENANT_FINAL.sql.
-- ============================================

-- ============================================
-- 1) Helpers
-- ============================================
CREATE OR REPLACE FUNCTION normalize_invite_code(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_code IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN NULLIF(
        UPPER(TRIM(REGEXP_REPLACE(p_code, '[^A-Za-z0-9]', '', 'g'))),
        ''
    );
END;
$$;

-- ============================================
-- 2) Data hygiene: invite_code uppercase
-- ============================================
UPDATE schools
SET invite_code = UPPER(invite_code),
    updated_at = NOW()
WHERE invite_code IS NOT NULL
  AND invite_code <> UPPER(invite_code);

-- Optional (lightweight) constraint: stored invite codes must be uppercase.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'schools_invite_code_uppercase'
          AND conrelid = 'public.schools'::regclass
    ) THEN
        ALTER TABLE public.schools
        ADD CONSTRAINT schools_invite_code_uppercase
        CHECK (invite_code IS NULL OR invite_code = UPPER(invite_code));
    END IF;
END $$;

-- ============================================
-- 3) Enforce one ACTIVE membership per user
-- ============================================
-- If any user currently has multiple active memberships, keep the earliest joined_at
-- and set the others to suspended. This preserves history and avoids deletes.
WITH ranked AS (
    SELECT
        id,
        user_id,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY joined_at ASC, id ASC) AS rn
    FROM public.school_members
    WHERE status = 'active'
)
UPDATE public.school_members sm
SET status = 'suspended',
    updated_at = NOW()
FROM ranked r
WHERE sm.id = r.id
  AND r.rn > 1;

-- Database-level enforcement going forward
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_members_one_active_per_user
ON public.school_members(user_id)
WHERE status = 'active';

-- ============================================
-- 4) Harden onboarding RPCs
-- ============================================

-- Prevent setup from creating membership if user already has an active school.
-- Also keep existing checks: school must be active and role must be allowed by settings.
CREATE OR REPLACE FUNCTION profile_bootstrap(
    p_school_id UUID,
    p_role TEXT,
    p_grade SMALLINT DEFAULT NULL,
    p_batch TEXT DEFAULT NULL,
    p_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_email TEXT;
    v_school RECORD;
    v_existing_user RECORD;
    v_final_username TEXT;
    v_existing_membership RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    IF p_role NOT IN ('student', 'teacher') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role. Must be student or teacher.');
    END IF;

    -- Single active school enforcement
    SELECT * INTO v_existing_membership
    FROM school_members
    WHERE user_id = v_user_id AND status = 'active'
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_existing_membership IS NOT NULL AND v_existing_membership.school_id <> p_school_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'You are already a member of a school. Leave your current school first.',
            'current_school_id', v_existing_membership.school_id
        );
    END IF;

    -- School must be active
    SELECT * INTO v_school FROM schools WHERE id = p_school_id AND status = 'active';
    IF v_school IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'School not found or inactive');
    END IF;

    -- Role-specific signup toggles
    IF p_role = 'student' AND NOT COALESCE((v_school.settings->>'allow_student_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This school is not accepting student signups');
    END IF;

    IF p_role = 'teacher' AND NOT COALESCE((v_school.settings->>'allow_teacher_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This school is not accepting teacher signups');
    END IF;

    -- Optional domain gate
    IF array_length(v_school.allowed_email_domains, 1) > 0 THEN
        IF NOT EXISTS (
            SELECT 1
            FROM unnest(v_school.allowed_email_domains) AS domain
            WHERE v_user_email LIKE '%@' || domain
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Your email domain is not allowed for this school');
        END IF;
    END IF;

    -- Student-required fields
    IF p_role = 'student' THEN
        IF p_grade IS NULL OR p_grade < 6 OR p_grade > 12 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Students must select a valid grade (6-12)');
        END IF;
        IF p_batch IS NULL OR p_batch NOT IN ('6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','9C','10A','10B','10C','11A','11B','11C','12A','12B','12C','N/A') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Students must select a valid class/batch');
        END IF;
    END IF;

    SELECT * INTO v_existing_user FROM users WHERE id = v_user_id;

    v_final_username := COALESCE(
        NULLIF(TRIM(p_username), ''),
        v_existing_user.username,
        split_part(v_user_email, '@', 1)
    );

    IF EXISTS (SELECT 1 FROM users WHERE username = v_final_username AND id != v_user_id) THEN
        v_final_username := v_final_username || '_' || substr(v_user_id::text, 1, 8);
    END IF;

    IF v_existing_user IS NULL THEN
        INSERT INTO users (
            id, email, username, role, school_id, grade, batch, needs_setup, avatar_url, created_at, updated_at
        ) VALUES (
            v_user_id,
            v_user_email,
            v_final_username,
            p_role,
            p_school_id,
            CASE WHEN p_role = 'student' THEN p_grade ELSE NULL END,
            CASE WHEN p_role = 'student' THEN p_batch ELSE NULL END,
            false,
            'https://picsum.photos/seed/' || v_final_username || '/100/100',
            NOW(),
            NOW()
        );
    ELSE
        UPDATE users SET
            role = p_role,
            school_id = p_school_id,
            grade = CASE WHEN p_role = 'student' THEN p_grade ELSE NULL END,
            batch = CASE WHEN p_role = 'student' THEN p_batch ELSE NULL END,
            needs_setup = false,
            username = COALESCE(NULLIF(v_final_username, ''), username),
            updated_at = NOW()
        WHERE id = v_user_id;
    END IF;

    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (
        p_school_id,
        v_user_id,
        CASE WHEN p_role = 'teacher' THEN 'teacher' ELSE 'student' END,
        'active'
    )
    ON CONFLICT (school_id, user_id) DO UPDATE SET
        role_in_school = EXCLUDED.role_in_school,
        status = 'active',
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'school_id', p_school_id,
        'role', p_role,
        'username', v_final_username
    );
END;
$$;

GRANT EXECUTE ON FUNCTION profile_bootstrap(UUID, TEXT, SMALLINT, TEXT, TEXT) TO authenticated;

-- Normalize invite code comparisons (uppercase + strip non-alphanumeric)
CREATE OR REPLACE FUNCTION validate_invite_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school RECORD;
    v_code TEXT;
BEGIN
    v_code := normalize_invite_code(p_code);

    IF v_code IS NULL OR LENGTH(v_code) < 6 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired invite code');
    END IF;

    SELECT * INTO v_school
    FROM schools
    WHERE invite_code = v_code
      AND status = 'active';

    IF v_school IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired invite code');
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'school_id', v_school.id,
        'school_name', v_school.name,
        'school_slug', v_school.slug
    );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO authenticated;

-- Join by code now shares the same normalization as validate_invite_code.
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
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_user FROM users WHERE id = v_user_id;
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
