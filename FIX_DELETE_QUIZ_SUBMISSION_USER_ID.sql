-- ============================================================================
-- FIX: school_admin_delete_quiz_submission — column qs.user_id does not exist
-- ============================================================================
-- Bug:  The RPC referenced qs.user_id on quiz_scores, but that column
--       doesn't exist. quiz_scores has school_id (not user_id).
-- Fix:  Verify the score belongs to the admin's school via qs.school_id
--       instead of a non-existent qs.user_id → school_members lookup.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.school_admin_delete_quiz_submission(p_score_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_score_school_id UUID;
BEGIN
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

    -- Get the school that owns this score (quiz_scores has school_id, NOT user_id)
    SELECT qs.school_id
    INTO v_score_school_id
    FROM quiz_scores qs
    WHERE qs.id = p_score_id;

    IF v_score_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
    END IF;

    -- Verify the score belongs to the admin's school (skip for superadmin)
    IF v_school_id IS NOT NULL AND v_score_school_id != v_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission does not belong to your school');
    END IF;

    -- Delete the submission
    DELETE FROM quiz_scores WHERE id = p_score_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission not found or already deleted');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Keep existing grants
REVOKE ALL ON FUNCTION public.school_admin_delete_quiz_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_delete_quiz_submission(UUID) TO authenticated;

-- Verify
DO $$
BEGIN
    RAISE NOTICE '✅ school_admin_delete_quiz_submission fixed — no longer references qs.user_id';
END;
$$;
