-- ============================================
-- G-Brains Heist - School Admin Portal Functions
-- ============================================
-- Run this AFTER MULTI_TENANT_FINAL.sql
-- Provides SECURITY DEFINER RPC functions for school administration.
-- These are required by the in-app School Admin Portal UI.
-- ============================================

-- ============================================
-- 1. GET SCHOOL DETAILS (for school admins)
-- ============================================
CREATE OR REPLACE FUNCTION get_school_details(p_school_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_school RECORD;
    v_is_admin BOOLEAN;
    v_member_stats RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Determine which school to fetch
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
    
    IF v_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No school found');
    END IF;
    
    -- Check if user is school admin or platform admin
    SELECT EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = v_school_id 
        AND user_id = v_user_id 
        AND role_in_school = 'school_admin'
        AND status = 'active'
    ) OR is_superadmin(v_user_id)
    INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied. School admin privileges required.');
    END IF;
    
    -- Get school details
    SELECT * INTO v_school FROM schools WHERE id = v_school_id;
    
    IF v_school IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'School not found');
    END IF;
    
    -- Get member statistics
    SELECT 
        COUNT(*) FILTER (WHERE role_in_school = 'student') AS student_count,
        COUNT(*) FILTER (WHERE role_in_school = 'teacher') AS teacher_count,
        COUNT(*) FILTER (WHERE role_in_school = 'school_admin') AS admin_count,
        COUNT(*) AS total_members
    INTO v_member_stats
    FROM school_members
    WHERE school_id = v_school_id AND status = 'active';
    
    RETURN jsonb_build_object(
        'success', true,
        'school', jsonb_build_object(
            'id', v_school.id,
            'name', v_school.name,
            'slug', v_school.slug,
            'logo_url', v_school.logo_url,
            'invite_code', v_school.invite_code,
            'status', v_school.status,
            'settings', v_school.settings,
            'allowed_email_domains', v_school.allowed_email_domains,
            'created_at', v_school.created_at
        ),
        'stats', jsonb_build_object(
            'students', v_member_stats.student_count,
            'teachers', v_member_stats.teacher_count,
            'admins', v_member_stats.admin_count,
            'total', v_member_stats.total_members
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_details(UUID) TO authenticated;

-- ============================================
-- 2. GET SCHOOL MEMBERS LIST
-- ============================================
CREATE OR REPLACE FUNCTION get_school_members(
    p_school_id UUID DEFAULT NULL,
    p_role_filter TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
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
    
    -- Get total count
    SELECT COUNT(*) INTO v_total
    FROM school_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.school_id = v_school_id
    AND (p_role_filter IS NULL OR sm.role_in_school = p_role_filter)
    AND (p_search IS NULL OR u.username ILIKE '%' || p_search || '%' OR u.email ILIKE '%' || p_search || '%');
    
    -- Get members
    SELECT jsonb_agg(member_row ORDER BY member_row->>'joined_at' DESC)
    INTO v_members
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
        WHERE sm.school_id = v_school_id
        AND (p_role_filter IS NULL OR sm.role_in_school = p_role_filter)
        AND (p_search IS NULL OR u.username ILIKE '%' || p_search || '%' OR u.email ILIKE '%' || p_search || '%')
        ORDER BY sm.joined_at DESC
        LIMIT p_limit
        OFFSET p_offset
    ) sub;
    
    RETURN jsonb_build_object(
        'success', true,
        'members', COALESCE(v_members, '[]'::jsonb),
        'total', v_total,
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_members(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================
-- 3. UPDATE MEMBER ROLE
-- ============================================
CREATE OR REPLACE FUNCTION update_member_role(
    p_member_user_id UUID,
    p_new_role TEXT,
    p_school_id UUID DEFAULT NULL
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
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Validate role
    IF p_new_role NOT IN ('student', 'teacher', 'school_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
    END IF;
    
    -- Determine school
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
    
    -- Prevent demoting yourself
    IF p_member_user_id = v_user_id AND p_new_role != 'school_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot demote yourself');
    END IF;
    
    -- Update role in school_members
    UPDATE school_members 
    SET role_in_school = p_new_role, updated_at = NOW()
    WHERE school_id = v_school_id AND user_id = p_member_user_id;
    
    -- Also update user's global role if promoting to teacher
    IF p_new_role = 'teacher' OR p_new_role = 'school_admin' THEN
        UPDATE users SET role = 'teacher', updated_at = NOW()
        WHERE id = p_member_user_id AND role = 'student';
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Role updated successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION update_member_role(UUID, TEXT, UUID) TO authenticated;

-- ============================================
-- 4. SUSPEND/UNSUSPEND MEMBER
-- ============================================
CREATE OR REPLACE FUNCTION update_member_status(
    p_member_user_id UUID,
    p_action TEXT,  -- 'suspend', 'activate', 'ban'
    p_school_id UUID DEFAULT NULL
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
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Validate action
    IF p_action NOT IN ('suspend', 'activate', 'ban', 'unban') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
    END IF;
    
    -- Determine school
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
    
    -- Prevent action on yourself
    IF p_member_user_id = v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot modify your own status');
    END IF;
    
    -- Perform action
    IF p_action = 'suspend' THEN
        UPDATE school_members 
        SET status = 'suspended', updated_at = NOW()
        WHERE school_id = v_school_id AND user_id = p_member_user_id;
    ELSIF p_action = 'activate' THEN
        UPDATE school_members 
        SET status = 'active', updated_at = NOW()
        WHERE school_id = v_school_id AND user_id = p_member_user_id;
    ELSIF p_action = 'ban' THEN
        UPDATE users SET is_banned = true, updated_at = NOW()
        WHERE id = p_member_user_id;
        UPDATE school_members 
        SET status = 'suspended', updated_at = NOW()
        WHERE school_id = v_school_id AND user_id = p_member_user_id;
    ELSIF p_action = 'unban' THEN
        UPDATE users SET is_banned = false, updated_at = NOW()
        WHERE id = p_member_user_id;
        UPDATE school_members 
        SET status = 'active', updated_at = NOW()
        WHERE school_id = v_school_id AND user_id = p_member_user_id;
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Member status updated');
END;
$$;

GRANT EXECUTE ON FUNCTION update_member_status(UUID, TEXT, UUID) TO authenticated;

-- ============================================
-- 5. UPDATE SCHOOL SETTINGS
-- ============================================
CREATE OR REPLACE FUNCTION update_school_settings(
    p_school_id UUID,
    p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_admin BOOLEAN;
    v_current_settings JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Check admin access
    SELECT EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = p_school_id 
        AND user_id = v_user_id 
        AND role_in_school = 'school_admin'
        AND status = 'active'
    ) OR is_superadmin(v_user_id)
    INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    -- Get current settings and merge
    SELECT settings INTO v_current_settings FROM schools WHERE id = p_school_id;
    
    -- Update settings (merge with existing)
    UPDATE schools 
    SET settings = v_current_settings || p_settings,
        updated_at = NOW()
    WHERE id = p_school_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Settings updated');
END;
$$;

GRANT EXECUTE ON FUNCTION update_school_settings(UUID, JSONB) TO authenticated;

-- ============================================
-- 6. UPDATE SCHOOL INFO (name, logo)
-- ============================================
CREATE OR REPLACE FUNCTION update_school_info(
    p_school_id UUID,
    p_name TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_allowed_domains TEXT[] DEFAULT NULL
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
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Check admin access
    SELECT EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = p_school_id 
        AND user_id = v_user_id 
        AND role_in_school = 'school_admin'
        AND status = 'active'
    ) OR is_superadmin(v_user_id)
    INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    -- Update school info
    UPDATE schools SET
        name = COALESCE(p_name, name),
        logo_url = COALESCE(p_logo_url, logo_url),
        allowed_email_domains = COALESCE(p_allowed_domains, allowed_email_domains),
        updated_at = NOW()
    WHERE id = p_school_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'School info updated');
END;
$$;

GRANT EXECUTE ON FUNCTION update_school_info(UUID, TEXT, TEXT, TEXT[]) TO authenticated;

-- ============================================
-- 7. GET SCHOOL ANALYTICS
-- ============================================
CREATE OR REPLACE FUNCTION get_school_analytics(
    p_school_id UUID DEFAULT NULL,
    p_days INTEGER DEFAULT 30
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
    v_analytics JSONB;
    v_active_users INTEGER;
    v_total_xp BIGINT;
    v_avg_level NUMERIC;
    v_new_members INTEGER;
    v_grade_distribution JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Determine school
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
    
    -- Active users (seen in last p_days)
    SELECT COUNT(*) INTO v_active_users
    FROM users u
    JOIN school_members sm ON sm.user_id = u.id
    WHERE sm.school_id = v_school_id
    AND sm.status = 'active'
    AND u.last_seen > NOW() - (p_days || ' days')::INTERVAL;
    
    -- Total XP and average level
    SELECT COALESCE(SUM(u.xp), 0), COALESCE(AVG(u.level), 0)
    INTO v_total_xp, v_avg_level
    FROM users u
    JOIN school_members sm ON sm.user_id = u.id
    WHERE sm.school_id = v_school_id AND sm.status = 'active';
    
    -- New members in period
    SELECT COUNT(*) INTO v_new_members
    FROM school_members
    WHERE school_id = v_school_id
    AND joined_at > NOW() - (p_days || ' days')::INTERVAL;
    
    -- Grade distribution
    SELECT jsonb_object_agg(
        COALESCE(grade::text, 'N/A'),
        count
    ) INTO v_grade_distribution
    FROM (
        SELECT u.grade, COUNT(*) as count
        FROM users u
        JOIN school_members sm ON sm.user_id = u.id
        WHERE sm.school_id = v_school_id 
        AND sm.status = 'active'
        AND sm.role_in_school = 'student'
        GROUP BY u.grade
    ) sub;
    
    RETURN jsonb_build_object(
        'success', true,
        'period_days', p_days,
        'analytics', jsonb_build_object(
            'active_users', v_active_users,
            'total_xp', v_total_xp,
            'average_level', ROUND(v_avg_level, 1),
            'new_members', v_new_members,
            'grade_distribution', COALESCE(v_grade_distribution, '{}'::jsonb)
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_analytics(UUID, INTEGER) TO authenticated;

-- ============================================
-- 8. REMOVE MEMBER FROM SCHOOL
-- ============================================
CREATE OR REPLACE FUNCTION remove_school_member(
    p_member_user_id UUID,
    p_school_id UUID DEFAULT NULL
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
BEGIN
    -- Determine school
    IF p_school_id IS NOT NULL THEN
        v_school_id := p_school_id;
    ELSE
        SELECT school_id INTO v_school_id FROM users WHERE id = v_user_id;
    END IF;
    
    -- Check admin access
    SELECT EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = v_school_id 
        AND user_id = v_user_id 
        AND role_in_school = 'school_admin'
    ) OR is_superadmin(v_user_id)
    INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    -- Prevent removing yourself
    IF p_member_user_id = v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot remove yourself');
    END IF;
    
    -- Remove from school_members
    DELETE FROM school_members 
    WHERE school_id = v_school_id AND user_id = p_member_user_id;
    
    -- Clear user's school_id if this was their primary school
    UPDATE users SET school_id = NULL
    WHERE id = p_member_user_id AND school_id = v_school_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Member removed from school');
END;
$$;

GRANT EXECUTE ON FUNCTION remove_school_member(UUID, UUID) TO authenticated;

-- ============================================
-- 9. GET TOP PERFORMERS
-- ============================================
CREATE OR REPLACE FUNCTION get_school_top_performers(
    p_school_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_metric TEXT DEFAULT 'xp'  -- 'xp', 'level', 'streak'
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
    v_performers JSONB;
BEGIN
    -- Determine school
    IF p_school_id IS NOT NULL THEN
        v_school_id := p_school_id;
    ELSE
        SELECT school_id INTO v_school_id FROM users WHERE id = v_user_id;
    END IF;
    
    -- Check admin access
    SELECT EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = v_school_id 
        AND user_id = v_user_id 
        AND role_in_school = 'school_admin'
    ) OR is_superadmin(v_user_id)
    INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    -- Get top performers
    SELECT jsonb_agg(performer)
    INTO v_performers
    FROM (
        SELECT jsonb_build_object(
            'user_id', u.id,
            'username', u.username,
            'avatar_url', u.avatar_url,
            'grade', u.grade,
            'batch', u.batch,
            'xp', u.xp,
            'level', u.level,
            'streak', u.streak
        ) AS performer
        FROM users u
        JOIN school_members sm ON sm.user_id = u.id
        WHERE sm.school_id = v_school_id
        AND sm.status = 'active'
        AND sm.role_in_school = 'student'
        ORDER BY 
            CASE p_metric 
                WHEN 'xp' THEN u.xp 
                WHEN 'level' THEN u.level 
                WHEN 'streak' THEN u.streak 
                ELSE u.xp 
            END DESC
        LIMIT p_limit
    ) sub;
    
    RETURN jsonb_build_object(
        'success', true,
        'metric', p_metric,
        'performers', COALESCE(v_performers, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_top_performers(UUID, INTEGER, TEXT) TO authenticated;

-- ============================================
-- 10. CHECK IF USER IS SCHOOL ADMIN
-- ============================================
CREATE OR REPLACE FUNCTION is_school_admin(p_school_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
BEGIN
    IF p_school_id IS NOT NULL THEN
        v_school_id := p_school_id;
    ELSE
        SELECT school_id INTO v_school_id FROM users WHERE id = v_user_id;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = v_school_id 
        AND user_id = v_user_id 
        AND role_in_school = 'school_admin'
    ) OR is_superadmin(v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION is_school_admin(UUID) TO authenticated;

-- ============================================
-- DONE!
-- ============================================
-- Functions created:
-- 1. get_school_details() - Get school info and stats
-- 2. get_school_members() - List members with filtering
-- 3. update_member_role() - Change member's school role
-- 4. update_member_status() - Suspend/activate/ban members
-- 5. update_school_settings() - Update school settings
-- 6. update_school_info() - Update name, logo, domains
-- 7. get_school_analytics() - Get usage analytics
-- 8. remove_school_member() - Remove member from school
-- 9. get_school_top_performers() - Leaderboard by metric
-- 10. is_school_admin() - Check admin status
-- ============================================
