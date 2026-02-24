-- ============================================================================
-- CONSOLIDATED BUG FIX MIGRATION — 2026-02-24
-- ============================================================================
-- Fixes 11 bugs discovered during audit of recent migrations.
-- Safe to re-run (all CREATE OR REPLACE + DROP IF EXISTS).
--
-- Bug #1:  school_admin_delete_quiz_submission — qs.user_id doesn't exist
-- Bug #2:  Billing RPCs/RLS use role='superadmin' (impossible CHECK value)
-- Bug #3:  release/hide_quiz_scores — no school_id filter (cross-tenant)
-- Bug #4:  get_school_cambridge_scores/stats — missing 'school_admin' role
-- Bug #5:  release_quiz_scores — missing 'admin' role
-- Bug #6:  Cambridge visibility toggle RPCs — missing 'school_admin' role
-- Bug #7:  bulk_release_quiz_scores — admin-only + no school_id filter
-- Bug #8:  AdminPortal direct .delete() — handled in AdminPortal.tsx
-- Bug #9:  get_school_members — missing banned_until, required_changes
-- Bug #10: FIX_QUIZ_SCORES_DELETE_POLICY — no school_id in USING clause
-- Bug #11: create_teacher_profile — missing 'school_admin' role
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #1: school_admin_delete_quiz_submission — qs.user_id → qs.school_id
-- ────────────────────────────────────────────────────────────────────────────

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

    -- FIX: quiz_scores has school_id, NOT user_id
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

    DELETE FROM quiz_scores WHERE id = p_score_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission not found or already deleted');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.school_admin_delete_quiz_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_admin_delete_quiz_submission(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #2: Billing RLS + RPCs use role='superadmin' — impossible CHECK value
--         Fix: use is_superadmin() which checks the superadmins table
-- ────────────────────────────────────────────────────────────────────────────

-- 2a. billing_subscriptions RLS
DROP POLICY IF EXISTS "Service role manages billing subscriptions" ON public.billing_subscriptions;
CREATE POLICY "Service role manages billing subscriptions"
  ON public.billing_subscriptions
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR is_superadmin(auth.uid())
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR is_superadmin(auth.uid())
  );

-- 2b. billing_events RLS (superadmin read)
DROP POLICY IF EXISTS "Superadmin can read billing events" ON public.billing_events;
CREATE POLICY "Superadmin can read billing events"
  ON public.billing_events
  FOR SELECT
  USING (is_superadmin(auth.uid()));

-- 2c. admin_grant_comp_access
CREATE OR REPLACE FUNCTION admin_grant_comp_access(
  p_school_id UUID,
  p_plan TEXT DEFAULT 'core',
  p_days INT DEFAULT 30,
  p_reason TEXT DEFAULT 'Admin comp'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_expires TIMESTAMPTZ;
BEGIN
  -- FIX: use is_superadmin() instead of role = 'superadmin'
  IF NOT is_superadmin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_days IS NOT NULL AND p_days > 0 THEN
    v_expires := now() + (p_days || ' days')::interval;
  END IF;

  INSERT INTO billing_subscriptions (
    school_id, provider, status, plan, billing_interval,
    is_comp, comp_expires_at, comp_granted_by, comp_reason,
    current_period_start, current_period_end
  ) VALUES (
    p_school_id, 'manual', 'active', p_plan, 'monthly',
    TRUE, v_expires, v_admin_id, p_reason,
    now(), COALESCE(v_expires, now() + interval '100 years')
  )
  ON CONFLICT (school_id, provider) WHERE status IN ('active', 'trialing', 'past_due', 'paused')
  DO UPDATE SET
    plan = EXCLUDED.plan,
    status = 'active',
    is_comp = TRUE,
    comp_expires_at = EXCLUDED.comp_expires_at,
    comp_granted_by = EXCLUDED.comp_granted_by,
    comp_reason = EXCLUDED.comp_reason,
    current_period_end = EXCLUDED.current_period_end;

  UPDATE schools SET school_plan = p_plan WHERE id = p_school_id;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'plan', p_plan,
    'expires_at', v_expires,
    'reason', p_reason
  );
END;
$$;

-- 2d. admin_revoke_comp_access
CREATE OR REPLACE FUNCTION admin_revoke_comp_access(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  -- FIX: use is_superadmin() instead of role = 'superadmin'
  IF NOT is_superadmin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE billing_subscriptions
  SET status = 'cancelled', canceled_at = now()
  WHERE school_id = p_school_id AND is_comp = TRUE
    AND status IN ('active', 'trialing', 'past_due');

  UPDATE schools SET school_plan = 'none' WHERE id = p_school_id;

  RETURN jsonb_build_object('success', true, 'school_id', p_school_id);
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #3 + #5: release_quiz_scores / hide_quiz_scores
--   - No school_id filter (cross-tenant write)
--   - release missing 'admin' role
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS release_quiz_scores(text, text);
CREATE OR REPLACE FUNCTION release_quiz_scores(p_quiz_name text, p_class text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
  v_user_role TEXT;
  v_school_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, school_id INTO v_user_role, v_school_id
  FROM users WHERE id = auth.uid();

  -- FIX #5: added 'admin' to match hide_quiz_scores
  IF v_user_role NOT IN ('teacher', 'school_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized - teacher/admin role required');
  END IF;

  -- FIX #3: scope UPDATE to caller's school
  UPDATE quiz_scores
  SET scores_released = true, released_at = now()
  WHERE quiz_name = p_quiz_name
    AND scores_released = false
    AND school_id = v_school_id
    AND (p_class IS NULL OR student_class = p_class);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'message', 'Scores released: ' || v_updated_count || ' records updated'
  );
END;
$$;

DROP FUNCTION IF EXISTS hide_quiz_scores(text, text);
CREATE OR REPLACE FUNCTION hide_quiz_scores(p_quiz_name text, p_class text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
  v_user_role TEXT;
  v_school_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, school_id INTO v_user_role, v_school_id
  FROM users WHERE id = auth.uid();

  IF v_user_role NOT IN ('teacher', 'school_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized - teacher/admin role required');
  END IF;

  -- FIX #3: scope UPDATE to caller's school
  UPDATE quiz_scores
  SET scores_released = false, released_at = null
  WHERE quiz_name = p_quiz_name
    AND scores_released = true
    AND school_id = v_school_id
    AND (p_class IS NULL OR student_class = p_class);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'message', 'Scores set to pending: ' || v_updated_count || ' records updated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION release_quiz_scores(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION hide_quiz_scores(text, text) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #4: get_school_cambridge_scores / get_school_cambridge_stats
--   Missing 'school_admin' in role gate
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_school_cambridge_scores(p_limit INT DEFAULT 100)
RETURNS TABLE (
  id UUID,
  student_name TEXT,
  student_class TEXT,
  quiz_name TEXT,
  score INT,
  total_questions INT,
  percentage INT,
  answers JSONB,
  time_taken_seconds INT,
  submitted_at TIMESTAMPTZ,
  school_id UUID
) AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
BEGIN
  SELECT u.school_id, u.role INTO v_school_id, v_role
  FROM users u WHERE u.id = auth.uid();

  -- FIX: added 'school_admin'
  IF v_role NOT IN ('teacher', 'admin', 'school_admin') THEN
    RAISE EXCEPTION 'Access denied: teachers/admins only';
  END IF;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'No school membership found';
  END IF;

  RETURN QUERY
  SELECT
    qs.id, qs.student_name, qs.student_class, qs.quiz_name,
    qs.score, qs.total_questions, qs.percentage, qs.answers,
    qs.time_taken_seconds, qs.submitted_at, qs.school_id
  FROM quiz_scores qs
  WHERE qs.school_id = v_school_id
  ORDER BY qs.submitted_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_school_cambridge_stats()
RETURNS JSONB AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
  v_result JSONB;
BEGIN
  SELECT u.school_id, u.role INTO v_school_id, v_role
  FROM users u WHERE u.id = auth.uid();

  -- FIX: added 'school_admin'
  IF v_role NOT IN ('teacher', 'admin', 'school_admin') THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No school membership');
  END IF;

  SELECT jsonb_build_object(
    'totalSubmissions', COUNT(*),
    'avgPercentage', COALESCE(ROUND(AVG(percentage)), 0),
    'highestScore', (
      SELECT jsonb_build_object('name', qs2.student_name, 'percentage', qs2.percentage)
      FROM quiz_scores qs2 WHERE qs2.school_id = v_school_id
      ORDER BY qs2.percentage DESC LIMIT 1
    ),
    'lowestScore', (
      SELECT jsonb_build_object('name', qs3.student_name, 'percentage', qs3.percentage)
      FROM quiz_scores qs3 WHERE qs3.school_id = v_school_id
      ORDER BY qs3.percentage ASC LIMIT 1
    ),
    'classStats', (
      SELECT COALESCE(jsonb_object_agg(
        COALESCE(class_data.student_class, 'Unknown'),
        jsonb_build_object('count', class_data.cnt, 'avg', class_data.avg_pct)
      ), '{}'::jsonb)
      FROM (
        SELECT qs4.student_class, COUNT(*) as cnt, ROUND(AVG(qs4.percentage)) as avg_pct
        FROM quiz_scores qs4 WHERE qs4.school_id = v_school_id
        GROUP BY qs4.student_class
      ) class_data
    )
  ) INTO v_result
  FROM quiz_scores qs
  WHERE qs.school_id = v_school_id;

  RETURN COALESCE(v_result, jsonb_build_object(
    'totalSubmissions', 0, 'avgPercentage', 0,
    'highestScore', null, 'lowestScore', null, 'classStats', '{}'::jsonb
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #6: Cambridge visibility toggle RPCs — missing 'school_admin'
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION toggle_cambridge_test_visibility(
  p_test_id TEXT,
  p_subject TEXT,
  p_grade_level INTEGER,
  p_is_visible BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_user_id UUID;
  v_school_id UUID;
  v_role TEXT;
  v_has_assignment BOOLEAN;
BEGIN
  v_teacher_user_id := auth.uid();

  IF v_teacher_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT u.school_id, u.role INTO v_school_id, v_role
  FROM users u WHERE u.id = v_teacher_user_id;

  -- FIX: added 'school_admin'
  IF v_role NOT IN ('teacher', 'admin', 'school_admin') THEN
    RETURN jsonb_build_object('error', 'Only teachers can manage test visibility');
  END IF;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No school membership');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.school_id = v_school_id
      AND cta.active = TRUE
      AND c.grade_level::INTEGER = p_grade_level
      AND (
        cta.subject ILIKE '%' || SPLIT_PART(p_subject, ' ', 1) || '%'
        OR p_subject ILIKE '%' || cta.subject || '%'
        OR v_role IN ('admin', 'school_admin')
      )
  ) INTO v_has_assignment;

  IF NOT v_has_assignment AND v_role NOT IN ('admin', 'school_admin') THEN
    RETURN jsonb_build_object('error', 'Not assigned to this grade/subject');
  END IF;

  INSERT INTO cambridge_test_visibility (
    school_id, teacher_user_id, test_id, subject, grade_level, is_visible, updated_at
  ) VALUES (
    v_school_id, v_teacher_user_id, p_test_id, p_subject, p_grade_level, p_is_visible, NOW()
  )
  ON CONFLICT (school_id, test_id, subject, grade_level)
  DO UPDATE SET
    is_visible = p_is_visible,
    teacher_user_id = v_teacher_user_id,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', TRUE,
    'test_id', p_test_id,
    'is_visible', p_is_visible,
    'message', CASE
      WHEN p_is_visible THEN 'Test is now visible to students'
      ELSE 'Test is now hidden from students'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION bulk_set_cambridge_test_visibility(
  p_test_ids TEXT[],
  p_subject TEXT,
  p_grade_level INTEGER,
  p_is_visible BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_user_id UUID;
  v_school_id UUID;
  v_role TEXT;
  v_has_assignment BOOLEAN;
  v_test_id TEXT;
  v_count INTEGER := 0;
BEGIN
  v_teacher_user_id := auth.uid();

  IF v_teacher_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT u.school_id, u.role INTO v_school_id, v_role
  FROM users u WHERE u.id = v_teacher_user_id;

  -- FIX: added 'school_admin'
  IF v_role NOT IN ('teacher', 'admin', 'school_admin') THEN
    RETURN jsonb_build_object('error', 'Only teachers can manage test visibility');
  END IF;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No school membership');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM class_teacher_assignments cta
    JOIN classes c ON c.id = cta.class_id
    WHERE cta.teacher_user_id = v_teacher_user_id
      AND cta.school_id = v_school_id
      AND cta.active = TRUE
      AND c.grade_level::INTEGER = p_grade_level
      AND (
        cta.subject ILIKE '%' || SPLIT_PART(p_subject, ' ', 1) || '%'
        OR p_subject ILIKE '%' || cta.subject || '%'
        OR v_role IN ('admin', 'school_admin')
      )
  ) INTO v_has_assignment;

  IF NOT v_has_assignment AND v_role NOT IN ('admin', 'school_admin') THEN
    RETURN jsonb_build_object('error', 'Not assigned to this grade/subject');
  END IF;

  FOREACH v_test_id IN ARRAY p_test_ids
  LOOP
    INSERT INTO cambridge_test_visibility (
      school_id, teacher_user_id, test_id, subject, grade_level, is_visible, updated_at
    ) VALUES (
      v_school_id, v_teacher_user_id, v_test_id, p_subject, p_grade_level, p_is_visible, NOW()
    )
    ON CONFLICT (school_id, test_id, subject, grade_level)
    DO UPDATE SET
      is_visible = p_is_visible,
      teacher_user_id = v_teacher_user_id,
      updated_at = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'updated_count', v_count,
    'is_visible', p_is_visible,
    'message', format('Updated %s tests', v_count)
  );
END;
$$;

-- Cambridge visibility RLS (also add school_admin)
DROP POLICY IF EXISTS "Teachers and admins can manage visibility" ON cambridge_test_visibility;
CREATE POLICY "Teachers and admins can manage visibility"
  ON cambridge_test_visibility
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('teacher', 'admin', 'school_admin')
        AND u.school_id = cambridge_test_visibility.school_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('teacher', 'admin', 'school_admin')
        AND u.school_id = cambridge_test_visibility.school_id
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #7: bulk_release_quiz_scores — admin-only + no school_id filter
-- ────────────────────────────────────────────────────────────────────────────

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
    v_user_role TEXT;
    v_school_id UUID;
    v_affected INTEGER;
BEGIN
    -- FIX: allow teacher + school_admin + admin
    SELECT role, school_id INTO v_user_role, v_school_id
    FROM users WHERE id = v_user_id;

    IF v_user_role NOT IN ('admin', 'teacher', 'school_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Teacher/admin access required');
    END IF;

    -- FIX: scope to caller's school
    WITH updated AS (
        UPDATE quiz_scores
        SET scores_released = true
        WHERE quiz_name = p_quiz_name
        AND school_id = v_school_id
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


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #9: get_school_members — missing banned_until, required_changes
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_school_members(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);

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

    IF p_school_id IS NOT NULL THEN
        v_school_id := p_school_id;
    ELSE
        SELECT sm.school_id INTO v_school_id
        FROM school_members sm
        WHERE sm.user_id = v_user_id AND sm.status = 'active'
        ORDER BY sm.joined_at ASC LIMIT 1;
    END IF;

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

    SELECT COUNT(*) INTO v_total
    FROM school_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.school_id = v_school_id
    AND (p_role_filter IS NULL OR sm.role_in_school = p_role_filter)
    AND (p_search IS NULL OR u.username ILIKE '%' || p_search || '%' OR u.email ILIKE '%' || p_search || '%');

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
                'banned_until', u.banned_until,
                'required_changes', u.required_changes,
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


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #10: quiz_scores DELETE policy — add school_id scoping
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "School admins and teachers can delete quiz scores" ON quiz_scores;
CREATE POLICY "School admins and teachers can delete quiz scores" ON quiz_scores
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM school_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.role_in_school IN ('teacher', 'school_admin')
        AND sm.status = 'active'
        AND sm.school_id = quiz_scores.school_id
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #11: create_teacher_profile — missing 'school_admin'
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_teacher_profile(
  p_school_name TEXT DEFAULT NULL,
  p_subject_specializations TEXT[] DEFAULT NULL,
  p_bio TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID;
  v_caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- FIX: added 'school_admin'
  IF v_caller_role NOT IN ('teacher', 'admin', 'school_admin') THEN
    RAISE EXCEPTION 'permission_denied: your account must be approved as a teacher by an admin first';
  END IF;

  IF EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already has a teacher profile';
  END IF;

  INSERT INTO teachers (user_id, school_name, subject_specializations, bio)
  VALUES (auth.uid(), p_school_name, p_subject_specializations, p_bio)
  RETURNING id INTO v_teacher_id;

  RETURN v_teacher_id;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- BUG #8 (partial): New RPC for admin bulk-delete quiz scores (school-scoped)
-- AdminPortal.tsx will be updated to call this instead of direct .delete()
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_bulk_delete_quiz_scores(p_school_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_deleted INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Superadmin can target any school; school_admin targets own school
    IF is_superadmin(v_user_id) THEN
        v_school_id := p_school_id;
        -- If no school_id passed, require it
        IF v_school_id IS NULL THEN
            -- Get their own school
            SELECT u.school_id INTO v_school_id FROM users u WHERE u.id = v_user_id;
        END IF;
    ELSE
        -- School admin: always scoped to own school
        SELECT sm.school_id INTO v_school_id
        FROM school_members sm
        WHERE sm.user_id = v_user_id
          AND sm.role_in_school = 'school_admin'
          AND sm.status = 'active'
        LIMIT 1;

        IF v_school_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
        END IF;
    END IF;

    DELETE FROM quiz_scores WHERE school_id = v_school_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION admin_bulk_delete_quiz_scores(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_bulk_delete_quiz_scores(UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '✅ Bug #1:  school_admin_delete_quiz_submission — qs.user_id → qs.school_id';
    RAISE NOTICE '✅ Bug #2:  Billing RLS/RPCs — role=superadmin → is_superadmin()';
    RAISE NOTICE '✅ Bug #3:  release/hide_quiz_scores — added school_id filter';
    RAISE NOTICE '✅ Bug #4:  get_school_cambridge_scores/stats — added school_admin';
    RAISE NOTICE '✅ Bug #5:  release_quiz_scores — added admin role';
    RAISE NOTICE '✅ Bug #6:  Cambridge visibility RPCs — added school_admin';
    RAISE NOTICE '✅ Bug #7:  bulk_release_quiz_scores — widened roles + school_id';
    RAISE NOTICE '✅ Bug #8:  admin_bulk_delete_quiz_scores RPC created';
    RAISE NOTICE '✅ Bug #9:  get_school_members — added banned_until, required_changes';
    RAISE NOTICE '✅ Bug #10: quiz_scores DELETE policy — added school_id scope';
    RAISE NOTICE '✅ Bug #11: create_teacher_profile — added school_admin';
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
