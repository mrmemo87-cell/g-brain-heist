-- ============================================================================
-- FIX: rotate_school_invite_code — gen_random_bytes not found (42883)
-- ============================================================================
-- The function uses SET search_path = public, but gen_random_bytes() lives
-- in the `extensions` schema (pgcrypto). Fix: qualify calls explicitly.
-- ============================================================================

-- Ensure pgcrypto is enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION rotate_school_invite_code(p_school_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_new_code TEXT;
    v_is_admin BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF p_school_id IS NOT NULL THEN
        v_school_id := p_school_id;
    ELSE
        SELECT school_id INTO v_school_id
        FROM school_members
        WHERE user_id = v_user_id AND role_in_school = 'school_admin' AND status = 'active'
        LIMIT 1;
    END IF;

    IF v_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'School not found');
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM school_members
        WHERE school_id = v_school_id
          AND user_id = v_user_id
          AND role_in_school = 'school_admin'
          AND status = 'active'
    ) INTO v_is_admin;

    IF NOT v_is_admin AND NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only school admins can rotate invite codes');
    END IF;

    -- Use extensions.gen_random_bytes instead of unqualified gen_random_bytes
    v_new_code := UPPER(SUBSTRING(
        REPLACE(REPLACE(ENCODE(extensions.gen_random_bytes(8), 'base64'), '+', ''), '/', '')
        FROM 1 FOR 10
    ));

    WHILE EXISTS (SELECT 1 FROM schools WHERE invite_code = v_new_code) LOOP
        v_new_code := UPPER(SUBSTRING(
            REPLACE(REPLACE(ENCODE(extensions.gen_random_bytes(8), 'base64'), '+', ''), '/', '')
            FROM 1 FOR 10
        ));
    END LOOP;

    UPDATE schools SET
        invite_code = v_new_code,
        settings = settings || jsonb_build_object(
            'last_code_rotation', NOW(),
            'code_rotated_by', v_user_id
        ),
        updated_at = NOW()
    WHERE id = v_school_id;

    RETURN jsonb_build_object('success', true, 'new_code', v_new_code);
END;
$$;

GRANT EXECUTE ON FUNCTION rotate_school_invite_code(UUID) TO authenticated;

-- Verify
DO $$ BEGIN RAISE NOTICE '✅ rotate_school_invite_code fixed — uses extensions.gen_random_bytes'; END; $$;

NOTIFY pgrst, 'reload schema';
