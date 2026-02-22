-- ============================================================
-- SCALE HARDENING MIGRATION
-- ============================================================
-- Date   : 2026-02-23
-- Scope  : Fixes for global-scale readiness
--
-- Changes:
--   1. Upgrade get_school_members() with server-side sort support
--      (p_sort_key, p_sort_direction) so the Members tab sorts
--      correctly across all pages, not just the current page.
--
--   2. New RPC: school_admin_delete_quiz_submission()
--      Replaces the direct .from('quiz_scores').delete() call
--      that was blocked by RLS policies.
-- ============================================================


-- ============================================================
-- 1. UPGRADE get_school_members — add server-side sorting
-- ============================================================
-- Drops and re-creates with 2 new params. The frontend already
-- passes p_sort_key and p_sort_direction via schoolAdminService.
-- Old callers that omit the new params get defaults (username ASC).
-- ============================================================

DROP FUNCTION IF EXISTS get_school_members(UUID, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_school_members(
    p_school_id UUID DEFAULT NULL,
    p_role_filter TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_sort_key TEXT DEFAULT 'username',
    p_sort_direction TEXT DEFAULT 'asc',
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_is_admin BOOLEAN;
    v_members JSONB;
    v_total INTEGER;
    v_safe_sort_key TEXT;
    v_safe_direction TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Determine which school
    IF p_school_id IS NOT NULL THEN
        v_school_id := p_school_id;
    ELSE
        SELECT sm.school_id
        INTO v_school_id
        FROM school_members sm
        WHERE sm.user_id = v_user_id AND sm.status = 'active'
        ORDER BY sm.joined_at ASC
        LIMIT 1;
    END IF;

    -- Check admin access
    SELECT EXISTS (
        SELECT 1 FROM school_members
        WHERE school_id = v_school_id
        AND user_id = v_user_id
        AND role_in_school = 'school_admin'
        AND status = 'active'
    ) OR is_superadmin(v_user_id)
    INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;

    -- Whitelist sort key to prevent injection
    v_safe_sort_key := CASE lower(COALESCE(p_sort_key, 'username'))
        WHEN 'username'  THEN 'u.username'
        WHEN 'role'      THEN 'sm.role_in_school'
        WHEN 'grade'     THEN 'u.grade'
        WHEN 'level'     THEN 'u.level'
        WHEN 'last_seen' THEN 'u.last_seen'
        WHEN 'status'    THEN 'u.is_banned'
        ELSE 'u.username'
    END;

    v_safe_direction := CASE WHEN lower(COALESCE(p_sort_direction, 'asc')) = 'desc' THEN 'DESC' ELSE 'ASC' END;

    -- Get total count
    SELECT COUNT(*) INTO v_total
    FROM school_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.school_id = v_school_id
    AND (p_role_filter IS NULL OR sm.role_in_school = p_role_filter)
    AND (p_search IS NULL OR u.username ILIKE '%' || p_search || '%' OR u.email ILIKE '%' || p_search || '%');

    -- Get members with dynamic sort via EXECUTE
    EXECUTE format(
        $q$
        SELECT jsonb_agg(member_row)
        FROM (
            SELECT jsonb_build_object(
                'id', sm.id,
                'user_id', u.id,
                'username', u.username,
                'email', u.email,
                'avatar_url', u.avatar_url,
                'role_in_school', sm.role_in_school,
                'grade', u.grade,
                'batch', u.batch,
                'level', u.level,
                'xp', u.xp,
                'status', sm.status,
                'is_banned', u.is_banned,
                'joined_at', sm.joined_at,
                'last_seen', u.last_seen
            ) AS member_row
            FROM school_members sm
            JOIN users u ON u.id = sm.user_id
            WHERE sm.school_id = $1
            AND ($2::TEXT IS NULL OR sm.role_in_school = $2)
            AND ($3::TEXT IS NULL OR u.username ILIKE '%%' || $3 || '%%' OR u.email ILIKE '%%' || $3 || '%%')
            ORDER BY %s %s NULLS LAST
            LIMIT $4
            OFFSET $5
        ) sub
        $q$,
        v_safe_sort_key,
        v_safe_direction
    )
    INTO v_members
    USING v_school_id, p_role_filter, p_search, p_limit, p_offset;

    RETURN jsonb_build_object(
        'success', true,
        'members', COALESCE(v_members, '[]'::jsonb),
        'total', v_total,
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;

REVOKE ALL ON FUNCTION get_school_members(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_school_members(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 2. NEW RPC: school_admin_delete_quiz_submission
-- ============================================================
-- Replaces direct .from('quiz_scores').delete() which was
-- blocked by RLS policies. School admin can only delete
-- submissions from students in their school.
-- ============================================================

CREATE OR REPLACE FUNCTION public.school_admin_delete_quiz_submission(p_score_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_score_student_id UUID;
BEGIN
    -- ================================================================
    -- RPC: school_admin_delete_quiz_submission
    -- Purpose : Delete a quiz/Cambridge test submission
    -- Auth    : auth.uid() IS NULL → reject
    -- Role    : school_admin (verified via school_members)
    -- Scope   : student must belong to the same school
    -- Returns : JSONB { success, error? }
    -- Added   : 2026-02-23
    -- ================================================================
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get caller's school where they are admin
    SELECT sm.school_id
    INTO v_school_id
    FROM school_members sm
    WHERE sm.user_id = v_user_id
      AND sm.role_in_school = 'school_admin'
      AND sm.status = 'active'
    ORDER BY sm.joined_at ASC
    LIMIT 1;

    IF v_school_id IS NULL AND NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
    END IF;

    -- Get the student who owns this score
    SELECT qs.user_id
    INTO v_score_student_id
    FROM quiz_scores qs
    WHERE qs.id = p_score_id;

    IF v_score_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
    END IF;

    -- Verify the student belongs to the admin's school (skip for superadmin)
    IF v_school_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM school_members
            WHERE school_id = v_school_id
              AND user_id = v_score_student_id
              AND status = 'active'
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Student is not in your school');
        END IF;
    END IF;

    -- Delete the submission
    DELETE FROM quiz_scores WHERE id = p_score_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission not found or already deleted');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_delete_quiz_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_delete_quiz_submission(UUID) TO authenticated;


-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$
BEGIN
    -- Check get_school_members has 7 params (with sort)
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'get_school_members'
          AND p.pronargs = 7
    ) THEN
        RAISE EXCEPTION 'MIGRATION FAILED — get_school_members(7 params) not found';
    END IF;

    -- Check school_admin_delete_quiz_submission exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'school_admin_delete_quiz_submission'
    ) THEN
        RAISE EXCEPTION 'MIGRATION FAILED — school_admin_delete_quiz_submission not found';
    END IF;

    RAISE NOTICE 'SCALE HARDENING MIGRATION PASSED — both functions verified';
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
