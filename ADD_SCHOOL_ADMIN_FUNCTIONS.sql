-- ============================================
-- School Admin Management Functions
-- ============================================
-- These functions allow superadmins to:
-- 1. List all schools (admin_list_schools)
-- 2. Assign/remove school admin role (admin_set_school_admin)
-- ============================================

-- Drop ALL existing versions of admin_set_school_admin to avoid ambiguity
DROP FUNCTION IF EXISTS admin_list_schools();
DROP FUNCTION IF EXISTS admin_set_school_admin(UUID, UUID);
DROP FUNCTION IF EXISTS admin_set_school_admin(UUID, UUID, BOOLEAN);

-- NOTE: is_superadmin(UUID) already exists in your database with dependent policies.
-- We will use the existing function instead of recreating it.

-- ============================================
-- Function: admin_list_schools
-- Lists all schools for superadmin management      
-               - ============================================
CREATE OR REPLACE FUNCTION admin_list_schools()
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    status TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- Check if user is superadmin
    IF NOT is_superadmin(v_user_id) THEN
        RAISE EXCEPTION 'Superadmin access required';
    END IF;
    
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.slug,
        s.status,
        s.logo_url,
        s.created_at
    FROM schools s
    ORDER BY s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_schools() TO authenticated;

-- ============================================
-- Function: admin_set_school_admin
-- Assigns or removes school admin role for a user
-- Works with both school_members table and users.role field
-- ============================================
CREATE OR REPLACE FUNCTION admin_set_school_admin(
    p_school_id UUID,
    p_user_id UUID,
    p_is_admin BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_user_name TEXT;
    v_has_school_members BOOLEAN;
BEGIN
    -- Check if caller is superadmin
    IF NOT is_superadmin(v_caller_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Superadmin access required');
    END IF;
    
    -- Get target user's name
    SELECT username INTO v_user_name
    FROM users
    WHERE id = p_user_id;
    
    IF v_user_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Check if school_members table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'school_members'
    ) INTO v_has_school_members;
    
    IF v_has_school_members THEN
        -- Update role in school_members table
        IF p_is_admin THEN
            UPDATE school_members 
            SET role_in_school = 'school_admin'
            WHERE school_id = p_school_id 
            AND user_id = p_user_id;
        ELSE
            UPDATE school_members 
            SET role_in_school = 'student'
            WHERE school_id = p_school_id 
            AND user_id = p_user_id
            AND role_in_school = 'school_admin';
        END IF;
    ELSE
        -- Update role in users table directly
        IF p_is_admin THEN
            UPDATE users
            SET role = 'school_admin'
            WHERE id = p_user_id
            AND school_id = p_school_id
            AND role NOT IN ('admin');  -- Don't demote superadmins
        ELSE
            UPDATE users
            SET role = 'student'
            WHERE id = p_user_id
            AND school_id = p_school_id
            AND role = 'school_admin';
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', CASE WHEN p_is_admin 
            THEN format('%s is now a school admin', v_user_name)
            ELSE format('%s is no longer a school admin', v_user_name)
        END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_school_admin(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================
-- DONE!
-- ============================================
-- Functions created:
-- 1. is_superadmin(user_id) - Helper to check superadmin status
-- 2. admin_list_schools() - Lists all schools for superadmin
-- 3. admin_set_school_admin(school_id, user_id, is_admin) - Set/unset school admin
--
-- Run this SQL in your Supabase SQL Editor to enable school admin management.
-- ============================================
