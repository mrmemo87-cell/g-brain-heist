-- ============================================
-- Chemistry Test Score Release System
-- ============================================
-- This allows admins to release scores for Chemistry tests
-- so students can see their results and detailed reports.
-- ============================================

-- Add scores_released column to quiz_scores table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quiz_scores' 
        AND column_name = 'scores_released'
    ) THEN
        ALTER TABLE quiz_scores 
        ADD COLUMN scores_released BOOLEAN DEFAULT false;
        
        -- Set existing non-Chemistry tests as released by default
        UPDATE quiz_scores 
        SET scores_released = true 
        WHERE quiz_name NOT LIKE '%Chemistry%';
        
        RAISE NOTICE 'Added scores_released column to quiz_scores table';
    ELSE
        RAISE NOTICE 'scores_released column already exists';
    END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_quiz_scores_released ON quiz_scores(scores_released);

-- ============================================
-- RPC: Release score for a specific submission
-- ============================================
CREATE OR REPLACE FUNCTION release_quiz_score(
    p_quiz_score_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT role = 'admin' INTO v_is_admin
    FROM users
    WHERE id = v_user_id;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
    
    -- Update the score to released
    UPDATE quiz_scores
    SET scores_released = true
    WHERE id = p_quiz_score_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quiz score not found');
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Score released successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION release_quiz_score(UUID) TO authenticated;

-- ============================================
-- RPC: Bulk release scores for a quiz
-- ============================================
CREATE OR REPLACE FUNCTION bulk_release_quiz_scores(
    p_quiz_name TEXT,
    p_student_class TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_admin BOOLEAN;
    v_affected INTEGER;
BEGIN
    -- Check if user is admin
    SELECT role = 'admin' INTO v_is_admin
    FROM users
    WHERE id = v_user_id;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
    
    -- Update scores
    WITH updated AS (
        UPDATE quiz_scores
        SET scores_released = true
        WHERE quiz_name = p_quiz_name
        AND (p_student_class IS NULL OR student_class = p_student_class)
        AND scores_released = false
        RETURNING id
    )
    SELECT COUNT(*) INTO v_affected FROM updated;
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', format('Released %s scores', v_affected),
        'affected', v_affected
    );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_release_quiz_scores(TEXT, TEXT) TO authenticated;

-- ============================================
-- RPC: Get unreleased quiz scores (for admin view)
-- ============================================
CREATE OR REPLACE FUNCTION get_unreleased_quiz_scores(
    p_quiz_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    student_name TEXT,
    student_class TEXT,
    quiz_name TEXT,
    score INTEGER,
    total_questions INTEGER,
    percentage INTEGER,
    submitted_at TIMESTAMPTZ,
    scores_released BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT role = 'admin' INTO v_is_admin
    FROM users
    WHERE id = v_user_id;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    
    RETURN QUERY
    SELECT 
        qs.id,
        qs.student_name,
        qs.student_class,
        qs.quiz_name,
        qs.score,
        qs.total_questions,
        qs.percentage,
        qs.submitted_at,
        qs.scores_released
    FROM quiz_scores qs
    WHERE (p_quiz_name IS NULL OR qs.quiz_name = p_quiz_name)
    AND qs.scores_released = false
    ORDER BY qs.submitted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unreleased_quiz_scores(TEXT) TO authenticated;

-- ============================================
-- Update RLS policies to respect score_released
-- ============================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Students can view their own released scores" ON quiz_scores;

-- Create policy: Students can only view their own submissions if score is released
-- (This assumes you have a way to identify the student - adjust as needed)
-- For now, we'll just ensure the frontend checks scores_released before showing data
CREATE POLICY "Students can view their own released scores" ON quiz_scores
FOR SELECT
USING (
    scores_released = true 
    OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Admin can see all scores
-- This is already handled by the existing "Admins can view all quiz scores" policy if it exists

COMMENT ON COLUMN quiz_scores.score_released IS 'Whether the score has been released to students (for Chemistry tests)';

-- ============================================
-- DONE! 
-- ============================================
-- Functions created:
-- 1. release_quiz_score(quiz_score_id) - Release a single score
-- 2. bulk_release_quiz_scores(quiz_name, student_class) - Release multiple scores at once
-- 3. get_unreleased_quiz_scores(quiz_name) - View unreleased scores (admin only)
--
-- Column added:
-- - quiz_scores.scores_released (BOOLEAN, default false)
--
-- Usage:
-- - Call release_quiz_score() for individual submissions
-- - Call bulk_release_quiz_scores('AS Chemistry — Atomic Structure (Part 1)', '11A') to release for a class
-- - Call bulk_release_quiz_scores('AS Chemistry — Atomic Structure (Part 1)') to release all
-- ============================================
