-- ============================================================
-- SCHOOL ADMIN MODERATION — Phase 1
-- Time-limited suspension, force profile change, audit log
-- ============================================================
-- Run in Supabase SQL Editor AFTER SCALE_HARDENING_MIGRATION.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. NEW COLUMNS ON users
-- ============================================================

-- Time-limited suspension: NULL = not suspended, future timestamp = suspended until then
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ DEFAULT NULL;

-- Required profile changes: NULL = nothing required, JSONB = what must change
-- Example: {"username": true, "avatar": true, "reason": "Inappropriate username"}
ALTER TABLE users ADD COLUMN IF NOT EXISTS required_changes JSONB DEFAULT NULL;

-- Profile locked: prevents student from changing profile while force-change is pending
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_locked BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN users.banned_until IS 'Time-limited suspension. NULL = not suspended. Future timestamp = suspended until that time.';
COMMENT ON COLUMN users.required_changes IS 'JSONB describing required profile changes. NULL = nothing pending.';
COMMENT ON COLUMN users.profile_locked IS 'When true, student profile is locked until required_changes are resolved.';

-- Index for efficient suspension checks
CREATE INDEX IF NOT EXISTS idx_users_banned_until ON users (banned_until) WHERE banned_until IS NOT NULL;

-- ============================================================
-- 2. HELPER: Check if user is a school admin for a given school
-- ============================================================
CREATE OR REPLACE FUNCTION is_school_admin_of(p_user_id UUID, p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_members
    WHERE user_id = p_user_id
      AND school_id = p_school_id
      AND role_in_school = 'school_admin'
      AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND role = 'school_admin'
  );
$$;

-- ============================================================
-- 3. HELPER: Check if target is in the same school
-- ============================================================
CREATE OR REPLACE FUNCTION is_same_school_member(p_target_id UUID, p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_members
    WHERE user_id = p_target_id
      AND school_id = p_school_id
  );
$$;

-- ============================================================
-- 4. SUSPEND STUDENT (time-limited)
-- ============================================================
-- Duration in hours. School admin can suspend students in their school.
-- Cannot suspend other school_admins or teachers.
-- Max 30 days (720 hours).
-- ============================================================
CREATE OR REPLACE FUNCTION school_admin_suspend_student(
  p_student_id UUID,
  p_duration_hours INT,
  p_reason TEXT DEFAULT 'Violation of school policy'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_school_id UUID;
  v_target_role TEXT;
  v_target_school_role TEXT;
  v_banned_until TIMESTAMPTZ;
BEGIN
  -- Auth check
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Cannot suspend yourself
  IF v_actor = p_student_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot suspend yourself');
  END IF;

  -- Validate duration: 1 hour to 720 hours (30 days)
  IF p_duration_hours < 1 OR p_duration_hours > 720 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duration must be between 1 and 720 hours');
  END IF;

  -- Find actor's school
  SELECT sm.school_id INTO v_school_id
  FROM school_members sm
  WHERE sm.user_id = v_actor AND sm.status = 'active'
  ORDER BY sm.joined_at ASC
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in a school');
  END IF;

  -- Check actor is school admin
  IF NOT is_school_admin_of(v_actor, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied — school admin required');
  END IF;

  -- Check target is in the same school
  IF NOT is_same_school_member(p_student_id, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not in your school');
  END IF;

  -- Check target is not a school_admin or teacher (safety rail)
  SELECT u.role INTO v_target_role FROM users u WHERE u.id = p_student_id;
  SELECT sm.role_in_school INTO v_target_school_role
  FROM school_members sm
  WHERE sm.user_id = p_student_id AND sm.school_id = v_school_id;

  IF v_target_role IN ('school_admin', 'teacher', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot suspend admins or teachers');
  END IF;

  IF v_target_school_role IN ('school_admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot suspend admins or teachers');
  END IF;

  -- Calculate banned_until
  v_banned_until := NOW() + (p_duration_hours || ' hours')::INTERVAL;

  -- Update user
  UPDATE users
  SET banned_until = v_banned_until,
      updated_at = NOW()
  WHERE id = p_student_id;

  -- Audit log
  INSERT INTO adm_audit_log (school_id, actor_id, action, target_type, target_id, details)
  VALUES (
    v_school_id,
    v_actor,
    'student_suspended',
    'user',
    p_student_id,
    jsonb_build_object(
      'duration_hours', p_duration_hours,
      'banned_until', v_banned_until,
      'reason', COALESCE(p_reason, 'No reason provided')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'banned_until', v_banned_until,
    'message', 'Student suspended until ' || v_banned_until::TEXT
  );
END;
$$;

GRANT EXECUTE ON FUNCTION school_admin_suspend_student(UUID, INT, TEXT) TO authenticated;

-- ============================================================
-- 5. UNSUSPEND STUDENT (clear time-limited suspension)
-- ============================================================
CREATE OR REPLACE FUNCTION school_admin_unsuspend_student(
  p_student_id UUID,
  p_reason TEXT DEFAULT 'Suspension lifted by school admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_school_id UUID;
  v_old_banned_until TIMESTAMPTZ;
BEGIN
  -- Auth check
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find actor's school
  SELECT sm.school_id INTO v_school_id
  FROM school_members sm
  WHERE sm.user_id = v_actor AND sm.status = 'active'
  ORDER BY sm.joined_at ASC
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in a school');
  END IF;

  -- Check actor is school admin
  IF NOT is_school_admin_of(v_actor, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied — school admin required');
  END IF;

  -- Check target is in the same school
  IF NOT is_same_school_member(p_student_id, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not in your school');
  END IF;

  -- Get current banned_until for audit
  SELECT u.banned_until INTO v_old_banned_until FROM users u WHERE u.id = p_student_id;

  -- Clear suspension
  UPDATE users
  SET banned_until = NULL,
      updated_at = NOW()
  WHERE id = p_student_id;

  -- Audit log
  INSERT INTO adm_audit_log (school_id, actor_id, action, target_type, target_id, details)
  VALUES (
    v_school_id,
    v_actor,
    'student_unsuspended',
    'user',
    p_student_id,
    jsonb_build_object(
      'previous_banned_until', v_old_banned_until,
      'reason', COALESCE(p_reason, 'No reason provided')
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Student suspension cleared');
END;
$$;

GRANT EXECUTE ON FUNCTION school_admin_unsuspend_student(UUID, TEXT) TO authenticated;

-- ============================================================
-- 6. FORCE PROFILE CHANGE
-- ============================================================
-- Sets required_changes JSONB on the student's account.
-- Student must resolve these before they can play.
-- Example changes: {"username": true, "avatar": true}
-- ============================================================
CREATE OR REPLACE FUNCTION school_admin_force_profile_change(
  p_student_id UUID,
  p_changes JSONB,         -- e.g. {"username": true, "avatar": true}
  p_reason TEXT DEFAULT 'Profile change required by school administrator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_school_id UUID;
  v_target_role TEXT;
  v_target_school_role TEXT;
BEGIN
  -- Auth check
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Cannot target yourself
  IF v_actor = p_student_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot force profile change on yourself');
  END IF;

  -- Validate changes JSONB is not empty
  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'Must specify at least one change');
  END IF;

  -- Find actor's school
  SELECT sm.school_id INTO v_school_id
  FROM school_members sm
  WHERE sm.user_id = v_actor AND sm.status = 'active'
  ORDER BY sm.joined_at ASC
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in a school');
  END IF;

  -- Check actor is school admin
  IF NOT is_school_admin_of(v_actor, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied — school admin required');
  END IF;

  -- Check target is in the same school
  IF NOT is_same_school_member(p_student_id, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not in your school');
  END IF;

  -- Check target is not admin/teacher
  SELECT u.role INTO v_target_role FROM users u WHERE u.id = p_student_id;
  SELECT sm.role_in_school INTO v_target_school_role
  FROM school_members sm
  WHERE sm.user_id = p_student_id AND sm.school_id = v_school_id;

  IF v_target_role IN ('school_admin', 'teacher', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot force profile change on admins or teachers');
  END IF;

  IF v_target_school_role IN ('school_admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot force profile change on admins or teachers');
  END IF;

  -- Set required_changes with reason embedded
  UPDATE users
  SET required_changes = p_changes || jsonb_build_object('reason', COALESCE(p_reason, 'Profile change required')),
      profile_locked = TRUE,
      updated_at = NOW()
  WHERE id = p_student_id;

  -- Audit log
  INSERT INTO adm_audit_log (school_id, actor_id, action, target_type, target_id, details)
  VALUES (
    v_school_id,
    v_actor,
    'force_profile_change',
    'user',
    p_student_id,
    jsonb_build_object(
      'changes', p_changes,
      'reason', COALESCE(p_reason, 'No reason provided')
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Profile change requirement set');
END;
$$;

GRANT EXECUTE ON FUNCTION school_admin_force_profile_change(UUID, JSONB, TEXT) TO authenticated;

-- ============================================================
-- 7. CLEAR PROFILE CHANGE REQUIREMENT
-- ============================================================
-- Called by the student after they've resolved the changes,
-- or by a school admin who decides to lift the requirement.
-- ============================================================
CREATE OR REPLACE FUNCTION school_admin_clear_profile_change(
  p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_school_id UUID;
  v_old_changes JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Allow the student themselves to clear (after making changes)
  -- OR a school admin of their school
  IF v_actor = p_student_id THEN
    -- Student clearing their own requirement — allowed
    SELECT u.required_changes INTO v_old_changes FROM users u WHERE u.id = p_student_id;

    UPDATE users
    SET required_changes = NULL,
        profile_locked = FALSE,
        updated_at = NOW()
    WHERE id = p_student_id;

    RETURN jsonb_build_object('success', true, 'message', 'Profile change requirement cleared');
  END IF;

  -- School admin path
  SELECT sm.school_id INTO v_school_id
  FROM school_members sm
  WHERE sm.user_id = v_actor AND sm.status = 'active'
  ORDER BY sm.joined_at ASC
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in a school');
  END IF;

  IF NOT is_school_admin_of(v_actor, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  IF NOT is_same_school_member(p_student_id, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not in your school');
  END IF;

  SELECT u.required_changes INTO v_old_changes FROM users u WHERE u.id = p_student_id;

  UPDATE users
  SET required_changes = NULL,
      profile_locked = FALSE,
      updated_at = NOW()
  WHERE id = p_student_id;

  -- Audit log
  INSERT INTO adm_audit_log (school_id, actor_id, action, target_type, target_id, details)
  VALUES (
    v_school_id,
    v_actor,
    'profile_change_cleared',
    'user',
    p_student_id,
    jsonb_build_object('previous_changes', v_old_changes)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Profile change requirement cleared');
END;
$$;

GRANT EXECUTE ON FUNCTION school_admin_clear_profile_change(UUID) TO authenticated;

-- ============================================================
-- 8. GET MODERATION AUDIT LOG
-- ============================================================
-- Returns recent moderation actions for the school admin's school.
-- ============================================================
CREATE OR REPLACE FUNCTION school_admin_get_moderation_log(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_school_id UUID;
  v_result JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sm.school_id INTO v_school_id
  FROM school_members sm
  WHERE sm.user_id = v_actor AND sm.status = 'active'
  ORDER BY sm.joined_at ASC
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in a school');
  END IF;

  IF NOT is_school_admin_of(v_actor, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Clamp limit
  IF p_limit < 1 THEN p_limit := 50; END IF;
  IF p_limit > 200 THEN p_limit := 200; END IF;
  IF p_offset < 0 THEN p_offset := 0; END IF;

  SELECT jsonb_build_object(
    'success', true,
    'entries', COALESCE(jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', al.id,
      'actor_id', al.actor_id,
      'actor_username', COALESCE(actor.username, 'Unknown'),
      'action', al.action,
      'target_type', al.target_type,
      'target_id', al.target_id,
      'target_username', COALESCE(target.username, 'Unknown'),
      'details', al.details,
      'created_at', al.created_at
    ) AS row_data
    FROM adm_audit_log al
    LEFT JOIN users actor ON actor.id = al.actor_id
    LEFT JOIN users target ON target.id = al.target_id
    WHERE al.school_id = v_school_id
      AND al.action IN (
        'student_suspended', 'student_unsuspended',
        'force_profile_change', 'profile_change_cleared'
      )
    ORDER BY al.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('success', true, 'entries', '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION school_admin_get_moderation_log(INT, INT) TO authenticated;

-- ============================================================
-- 9. GET STUDENT MODERATION STATUS
-- ============================================================
-- Quick check for a specific student's moderation state.
-- Used by the portal to show suspension/change status inline.
-- ============================================================
CREATE OR REPLACE FUNCTION school_admin_get_student_mod_status(
  p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_school_id UUID;
  v_row RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sm.school_id INTO v_school_id
  FROM school_members sm
  WHERE sm.user_id = v_actor AND sm.status = 'active'
  ORDER BY sm.joined_at ASC
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in a school');
  END IF;

  IF NOT is_school_admin_of(v_actor, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  IF NOT is_same_school_member(p_student_id, v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not in your school');
  END IF;

  SELECT
    u.id,
    u.username,
    u.is_banned,
    u.banned_until,
    u.required_changes,
    u.profile_locked,
    CASE
      WHEN COALESCE(u.is_banned, FALSE) THEN 'permanently_banned'
      WHEN u.banned_until IS NOT NULL AND u.banned_until > NOW() THEN 'suspended'
      WHEN u.required_changes IS NOT NULL THEN 'profile_change_required'
      ELSE 'clear'
    END AS mod_status
  INTO v_row
  FROM users u
  WHERE u.id = p_student_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_row.id,
    'username', v_row.username,
    'is_banned', COALESCE(v_row.is_banned, false),
    'banned_until', v_row.banned_until,
    'required_changes', v_row.required_changes,
    'profile_locked', COALESCE(v_row.profile_locked, false),
    'mod_status', v_row.mod_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION school_admin_get_student_mod_status(UUID) TO authenticated;

-- ============================================================
-- 10. UPDATE get_school_members TO INCLUDE NEW COLUMNS
-- ============================================================
-- Adds banned_until and required_changes to the member JSON.
-- Signature matches SCALE_HARDENING_MIGRATION.sql exactly.
-- ============================================================

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

-- ============================================================
-- 11. NOTIFY PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 12. VERIFICATION
-- ============================================================
DO $$
DECLARE
  v_col_count INT := 0;
  v_fn_count INT := 0;
BEGIN
  -- Check new columns exist
  SELECT COUNT(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_name = 'users'
    AND column_name IN ('banned_until', 'required_changes', 'profile_locked');

  IF v_col_count < 3 THEN
    RAISE WARNING '[MODERATION] Missing columns — expected 3, found %', v_col_count;
  ELSE
    RAISE NOTICE '[MODERATION] ✅ All 3 new columns exist on users';
  END IF;

  -- Check functions exist
  SELECT COUNT(*) INTO v_fn_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'school_admin_suspend_student',
      'school_admin_unsuspend_student',
      'school_admin_force_profile_change',
      'school_admin_clear_profile_change',
      'school_admin_get_moderation_log',
      'school_admin_get_student_mod_status',
      'is_school_admin_of',
      'is_same_school_member'
    );

  IF v_fn_count < 8 THEN
    RAISE WARNING '[MODERATION] Missing functions — expected 8, found %', v_fn_count;
  ELSE
    RAISE NOTICE '[MODERATION] ✅ All 8 functions created';
  END IF;
END;
$$;
