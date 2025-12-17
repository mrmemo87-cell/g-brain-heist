-- ============================================
-- G-Brains Heist - Multi-Tenant Migration
-- ============================================
-- This migration adds multi-school (multi-tenant) support
-- Run this in Supabase SQL Editor AFTER your base schema is set up
-- 
-- Changes:
-- 1. Creates schools table (tenants)
-- 2. Creates school_members table (user-school relationships)
-- 3. Adds school_id to users table
-- 4. Creates profile_bootstrap RPC for OAuth users
-- 5. Updates RLS policies for school isolation
-- 6. Migrates existing users to a default school
-- ============================================

-- ============================================
-- STEP 1: SCHOOLS TABLE
-- ============================================
-- Schools are the primary tenant entity
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier (e.g., "silk-road-international")
    logo_url TEXT,
    allowed_email_domains TEXT[] DEFAULT '{}',  -- Optional: restrict signups to specific domains
    invite_code TEXT UNIQUE,  -- Optional: for invite-only schools
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
    settings JSONB DEFAULT '{
        "allow_student_signup": true,
        "allow_teacher_signup": true,
        "require_email_verification": true,
        "max_students": null,
        "max_teachers": null
    }'::jsonb,
    created_by UUID,  -- Admin who created the school
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_schools_slug ON schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_invite_code ON schools(invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);

-- ============================================
-- STEP 2: SCHOOL MEMBERS TABLE
-- ============================================
-- Links users to schools with their role within that school
CREATE TABLE IF NOT EXISTS school_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_school TEXT NOT NULL DEFAULT 'student' CHECK (role_in_school IN ('student', 'teacher', 'school_admin')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, user_id)  -- User can only be in a school once
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_members_school ON school_members(school_id);
CREATE INDEX IF NOT EXISTS idx_school_members_user ON school_members(user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_role ON school_members(role_in_school);

-- ============================================
-- STEP 3: ADD SCHOOL_ID TO USERS TABLE
-- ============================================
-- Primary school association (user can belong to multiple schools via school_members,
-- but has one "primary" school for quick access)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'school_id') THEN
        ALTER TABLE users ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
    END IF;
    
    -- Also ensure role column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin'));
    END IF;
    
    -- Add needs_setup flag for OAuth users who haven't completed profile
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'needs_setup') THEN
        ALTER TABLE users ADD COLUMN needs_setup BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Index for school lookups
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_needs_setup ON users(needs_setup) WHERE needs_setup = true;

-- ============================================
-- STEP 4: CREATE DEFAULT SCHOOL & MIGRATE EXISTING USERS
-- ============================================
DO $$
DECLARE
    v_default_school_id UUID;
BEGIN
    -- Create or get the default school
    INSERT INTO schools (name, slug, status, settings)
    VALUES (
        'Silk Road International School',
        'silk-road-international',
        'active',
        '{
            "allow_student_signup": true,
            "allow_teacher_signup": true,
            "require_email_verification": true,
            "is_default": true
        }'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
    RETURNING id INTO v_default_school_id;
    
    -- Update all existing users to belong to default school
    UPDATE users 
    SET school_id = v_default_school_id,
        updated_at = NOW()
    WHERE school_id IS NULL;
    
    -- Create school_members entries for existing users
    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    SELECT 
        v_default_school_id,
        id,
        CASE 
            WHEN role = 'admin' THEN 'school_admin'
            WHEN role = 'teacher' THEN 'teacher'
            ELSE 'student'
        END,
        'active'
    FROM users
    WHERE school_id = v_default_school_id
    ON CONFLICT (school_id, user_id) DO NOTHING;
    
    RAISE NOTICE 'Migrated existing users to default school: %', v_default_school_id;
END $$;

-- ============================================
-- STEP 5: PROFILE BOOTSTRAP RPC
-- ============================================
-- This function is called after OAuth login to complete user setup
-- It handles the "Finish Setup" flow for OAuth users
CREATE OR REPLACE FUNCTION profile_bootstrap(
    p_school_id UUID,
    p_role TEXT,  -- 'student' or 'teacher'
    p_grade INTEGER DEFAULT NULL,
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
BEGIN
    -- Validate user is authenticated
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get user email from auth
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    
    -- Validate role
    IF p_role NOT IN ('student', 'teacher') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role. Must be student or teacher.');
    END IF;
    
    -- Validate school exists and is active
    SELECT * INTO v_school FROM schools WHERE id = p_school_id AND status = 'active';
    IF v_school IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'School not found or inactive');
    END IF;
    
    -- Check school settings allow this signup
    IF p_role = 'student' AND NOT COALESCE((v_school.settings->>'allow_student_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This school is not accepting student signups');
    END IF;
    
    IF p_role = 'teacher' AND NOT COALESCE((v_school.settings->>'allow_teacher_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This school is not accepting teacher signups');
    END IF;
    
    -- Check email domain restriction (if configured)
    IF array_length(v_school.allowed_email_domains, 1) > 0 THEN
        IF NOT EXISTS (
            SELECT 1 FROM unnest(v_school.allowed_email_domains) AS domain
            WHERE v_user_email LIKE '%@' || domain
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Your email domain is not allowed for this school');
        END IF;
    END IF;
    
    -- Validate student-specific fields
    IF p_role = 'student' THEN
        IF p_grade IS NULL OR p_grade < 6 OR p_grade > 12 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Students must select a valid grade (6-12)');
        END IF;
        IF p_batch IS NULL OR p_batch NOT IN ('6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','9C','10A','10B','10C','11A','11B','11C','12A','12B','12C','N/A') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Students must select a valid class/batch');
        END IF;
    END IF;
    
    -- Check if user profile already exists
    SELECT * INTO v_existing_user FROM users WHERE id = v_user_id;
    
    -- Generate username if not provided
    v_final_username := COALESCE(
        NULLIF(TRIM(p_username), ''),
        v_existing_user.username,
        split_part(v_user_email, '@', 1)
    );
    
    -- Ensure username is unique
    IF EXISTS (SELECT 1 FROM users WHERE username = v_final_username AND id != v_user_id) THEN
        v_final_username := v_final_username || '_' || substr(v_user_id::text, 1, 8);
    END IF;
    
    IF v_existing_user IS NULL THEN
        -- Create new user profile
        INSERT INTO users (
            id,
            email,
            username,
            role,
            school_id,
            grade,
            batch,
            needs_setup,
            avatar_url,
            created_at,
            updated_at
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
        -- Update existing user profile
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
    
    -- Create school membership
    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (
        p_school_id,
        v_user_id,
        CASE WHEN p_role = 'teacher' THEN 'teacher' ELSE 'student' END,
        'active'
    )
    ON CONFLICT (school_id, user_id) DO UPDATE SET
        role_in_school = EXCLUDED.role_in_school,
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION profile_bootstrap(UUID, TEXT, INTEGER, TEXT, TEXT) TO authenticated;

-- ============================================
-- STEP 6: GET SCHOOLS LIST RPC
-- ============================================
-- Public function to list available schools for signup
CREATE OR REPLACE FUNCTION get_available_schools()
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    logo_url TEXT,
    allow_student_signup BOOLEAN,
    allow_teacher_signup BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.slug,
        s.logo_url,
        COALESCE((s.settings->>'allow_student_signup')::boolean, true) AS allow_student_signup,
        COALESCE((s.settings->>'allow_teacher_signup')::boolean, true) AS allow_teacher_signup
    FROM schools s
    WHERE s.status = 'active'
    ORDER BY 
        CASE WHEN s.settings->>'is_default' = 'true' THEN 0 ELSE 1 END,
        s.name;
END;
$$;

-- Allow anonymous access (for signup page)
GRANT EXECUTE ON FUNCTION get_available_schools() TO anon;
GRANT EXECUTE ON FUNCTION get_available_schools() TO authenticated;

-- ============================================
-- STEP 7: CHECK USER SETUP STATUS RPC
-- ============================================
-- Returns whether the current user needs to complete setup
CREATE OR REPLACE FUNCTION check_user_setup_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('authenticated', false);
    END IF;
    
    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    
    IF v_user IS NULL THEN
        -- User authenticated but no profile exists
        RETURN jsonb_build_object(
            'authenticated', true,
            'needs_setup', true,
            'reason', 'no_profile'
        );
    END IF;
    
    IF v_user.needs_setup = true OR v_user.school_id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', true,
            'needs_setup', true,
            'reason', 'incomplete_profile',
            'has_username', v_user.username IS NOT NULL,
            'has_role', v_user.role IS NOT NULL
        );
    END IF;
    
    RETURN jsonb_build_object(
        'authenticated', true,
        'needs_setup', false,
        'user_id', v_user.id,
        'username', v_user.username,
        'role', v_user.role,
        'school_id', v_user.school_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION check_user_setup_status() TO authenticated;

-- ============================================
-- STEP 8: VALIDATE INVITE CODE RPC
-- ============================================
CREATE OR REPLACE FUNCTION validate_invite_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school RECORD;
BEGIN
    SELECT * INTO v_school 
    FROM schools 
    WHERE invite_code = UPPER(TRIM(p_code)) 
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

-- ============================================
-- STEP 9: ENABLE RLS ON NEW TABLES
-- ============================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 10: RLS POLICIES FOR SCHOOLS
-- ============================================
DROP POLICY IF EXISTS "Anyone can view active schools" ON schools;
DROP POLICY IF EXISTS "School admins can update their school" ON schools;
DROP POLICY IF EXISTS "Super admins can manage all schools" ON schools;

-- Anyone can see active schools (for signup dropdown)
CREATE POLICY "Anyone can view active schools"
    ON schools FOR SELECT
    USING (status = 'active');

-- School admins can update their own school
CREATE POLICY "School admins can update their school"
    ON schools FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = schools.id
            AND sm.user_id = auth.uid()
            AND sm.role_in_school = 'school_admin'
        )
    );

-- Super admins (platform admins) can manage all schools
CREATE POLICY "Super admins can manage all schools"
    ON schools FOR ALL
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- STEP 11: RLS POLICIES FOR SCHOOL MEMBERS
-- ============================================
DROP POLICY IF EXISTS "Users can view their school memberships" ON school_members;
DROP POLICY IF EXISTS "Users can view members of their schools" ON school_members;
DROP POLICY IF EXISTS "School admins can manage members" ON school_members;
DROP POLICY IF EXISTS "Users can insert their own membership" ON school_members;

-- Users can view their own memberships
CREATE POLICY "Users can view their school memberships"
    ON school_members FOR SELECT
    USING (user_id = auth.uid());

-- Users can view other members of schools they belong to
CREATE POLICY "Users can view members of their schools"
    ON school_members FOR SELECT
    USING (
        school_id IN (
            SELECT sm.school_id FROM school_members sm WHERE sm.user_id = auth.uid()
        )
    );

-- School admins can manage members
CREATE POLICY "School admins can manage members"
    ON school_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM school_members sm
            WHERE sm.school_id = school_members.school_id
            AND sm.user_id = auth.uid()
            AND sm.role_in_school = 'school_admin'
        )
    );

-- Allow profile_bootstrap to insert memberships (via SECURITY DEFINER)
-- Users can only insert their own membership through RPC
CREATE POLICY "Users can insert their own membership"
    ON school_members FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================
-- STEP 12: UPDATE EXISTING USER POLICIES FOR SCHOOL ISOLATION
-- ============================================
-- Note: This adds school-based filtering to user visibility

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view other users" ON users;

-- Users can view other users in their school(s)
CREATE POLICY "Users can view users in same school"
    ON users FOR SELECT
    USING (
        -- User can always see themselves
        auth.uid() = id
        OR
        -- User can see others in the same school
        school_id IN (
            SELECT sm.school_id FROM school_members sm WHERE sm.user_id = auth.uid()
        )
        OR
        -- Platform admins can see everyone
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ============================================
-- STEP 13: HELPER FUNCTION - GET USER'S SCHOOL
-- ============================================
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT school_id FROM users WHERE id = auth.uid();
$$;

-- ============================================
-- STEP 14: UPDATE MCQ QUESTIONS POLICY FOR SCHOOL ISOLATION
-- ============================================
-- Questions should be scoped to school (if school_id column exists on mcq_questions)
-- For now, we keep the grade-based policy but teachers can only add for their school

-- Add school_id to mcq_questions if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'mcq_questions' AND column_name = 'school_id') THEN
        ALTER TABLE mcq_questions ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
        
        -- Migrate existing questions to default school
        UPDATE mcq_questions SET school_id = (
            SELECT id FROM schools WHERE slug = 'silk-road-international' LIMIT 1
        ) WHERE school_id IS NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mcq_questions_school ON mcq_questions(school_id);

-- Update MCQ policies for school isolation
DROP POLICY IF EXISTS "Students view grade questions" ON mcq_questions;
DROP POLICY IF EXISTS "Teachers manage school questions" ON mcq_questions;

CREATE POLICY "Students view grade questions"
    ON mcq_questions FOR SELECT
    USING (
        active
        AND grade = (SELECT grade FROM users WHERE id = auth.uid())
        AND (
            school_id IS NULL  -- Legacy questions without school
            OR school_id = get_user_school_id()  -- Questions for user's school
        )
        AND NOT COALESCE((SELECT is_banned FROM users WHERE id = auth.uid()), false)
    );

-- Teachers can manage questions for their school
CREATE POLICY "Teachers manage school questions"
    ON mcq_questions FOR ALL
    USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('teacher', 'admin')
        AND (
            school_id IS NULL
            OR school_id = get_user_school_id()
        )
    )
    WITH CHECK (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('teacher', 'admin')
        AND school_id = get_user_school_id()
    );

-- ============================================
-- STEP 15: GENERATE INVITE CODE FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION generate_school_invite_code(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_attempts INTEGER := 0;
BEGIN
    -- Check if user is school admin
    IF NOT EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = p_school_id 
        AND user_id = auth.uid() 
        AND role_in_school = 'school_admin'
    ) AND NOT EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only school admins can generate invite codes';
    END IF;
    
    -- Generate unique 8-character code
    LOOP
        v_code := UPPER(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
        
        EXIT WHEN NOT EXISTS (SELECT 1 FROM schools WHERE invite_code = v_code);
        
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Failed to generate unique invite code';
        END IF;
    END LOOP;
    
    -- Update school with new code
    UPDATE schools SET invite_code = v_code, updated_at = NOW()
    WHERE id = p_school_id;
    
    RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_school_invite_code(UUID) TO authenticated;

-- ============================================
-- DONE! Summary of changes:
-- ============================================
-- 1. Created 'schools' table with settings, invite codes, domain restrictions
-- 2. Created 'school_members' table linking users to schools
-- 3. Added school_id, role, needs_setup columns to users
-- 4. Created profile_bootstrap() RPC for OAuth user setup
-- 5. Created get_available_schools() RPC for signup dropdown
-- 6. Created check_user_setup_status() RPC for detecting incomplete profiles
-- 7. Created validate_invite_code() RPC
-- 8. Updated RLS policies for school isolation
-- 9. Migrated existing users to default "Silk Road International School"
-- 10. Added school_id to mcq_questions for school-scoped content
--
-- Next steps:
-- - Run this migration in Supabase SQL Editor
-- - Update frontend to use get_available_schools() in LoginView
-- - Add FinishSetupModal for OAuth users
-- - Update authService.ts to call profile_bootstrap()
-- ============================================
