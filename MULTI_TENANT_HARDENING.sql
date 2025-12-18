-- ============================================
-- G-Brains Heist - Multi-Tenant Hardening
-- ============================================
-- Run AFTER all previous migration files
-- 
-- Fixes:
-- 1. Single source of truth (school_members is canonical)
-- 2. RLS hardening for all tables
-- 3. Invite code brute force protection
-- 4. Fuzzy matching = suggestion only
-- 5. School-scoped leaderboards
-- 6. Admin restriction to specific UIDs
-- ============================================

-- ============================================
-- 0. SUPERADMIN WHITELIST
-- ============================================
-- Only these UIDs can perform superadmin actions
-- Add your admin user IDs here
CREATE TABLE IF NOT EXISTS superadmins (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Helper function to check if user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
    RETURN EXISTS (SELECT 1 FROM superadmins WHERE user_id = v_uid);
END;
$$;

-- ============================================
-- 1. SINGLE SOURCE OF TRUTH: school_members
-- ============================================
-- users.school_id becomes a CACHED field derived from school_members
-- All logic should query school_members, users.school_id is for convenience only

-- Function to sync users.school_id from school_members (canonical)
CREATE OR REPLACE FUNCTION sync_user_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Set users.school_id to the first active school membership
        UPDATE users SET school_id = (
            SELECT school_id FROM school_members 
            WHERE user_id = NEW.user_id AND status = 'active'
            ORDER BY joined_at ASC
            LIMIT 1
        )
        WHERE id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Recalculate after deletion
        UPDATE users SET school_id = (
            SELECT school_id FROM school_members 
            WHERE user_id = OLD.user_id AND status = 'active'
            ORDER BY joined_at ASC
            LIMIT 1
        )
        WHERE id = OLD.user_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

ALTER FUNCTION sync_user_school_id() SET search_path = public;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trg_sync_user_school ON school_members;
CREATE TRIGGER trg_sync_user_school
AFTER INSERT OR UPDATE OR DELETE ON school_members
FOR EACH ROW
EXECUTE FUNCTION sync_user_school_id();

-- ============================================
-- 2. INVITE CODE BRUTE FORCE PROTECTION
-- ============================================
CREATE TABLE IF NOT EXISTS invite_code_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    attempted_code TEXT NOT NULL,
    success BOOLEAN DEFAULT false,
    ip_hint TEXT,  -- Optional: first 2 octets for rate limiting without storing full IP
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_attempts_user ON invite_code_attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invite_attempts_time ON invite_code_attempts(created_at);

-- Check rate limit helper
CREATE OR REPLACE FUNCTION check_invite_rate_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recent_attempts INTEGER;
    v_recent_failures INTEGER;
    v_last_attempt TIMESTAMPTZ;
BEGIN
    -- Count attempts in last hour
    SELECT COUNT(*), 
           COUNT(*) FILTER (WHERE NOT success),
           MAX(created_at)
    INTO v_recent_attempts, v_recent_failures, v_last_attempt
    FROM invite_code_attempts
    WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '1 hour';
    
    -- Block if too many failures
    IF v_recent_failures >= 5 THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'error', 'Too many failed attempts. Please wait 1 hour.',
            'retry_after', EXTRACT(EPOCH FROM (v_last_attempt + INTERVAL '1 hour' - NOW()))::INTEGER
        );
    END IF;
    
    -- Block if too many attempts overall
    IF v_recent_attempts >= 10 THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'error', 'Too many attempts. Please wait.',
            'retry_after', EXTRACT(EPOCH FROM (v_last_attempt + INTERVAL '30 minutes' - NOW()))::INTEGER
        );
    END IF;
    
    RETURN jsonb_build_object('allowed', true);
END;
$$;

-- ============================================
-- 3. HARDENED: join_school_by_code (with all checks)
-- ============================================
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
    -- Auth check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get user and check status
    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;
    
    IF v_user.is_banned THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended');
    END IF;
    
    -- Check if user already in a school (single school enforcement)
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
    
    -- Rate limit check
    v_rate_check := check_invite_rate_limit(v_user_id);
    IF NOT (v_rate_check->>'allowed')::boolean THEN
        RETURN v_rate_check;
    END IF;
    
    -- Clean and validate code
    v_cleaned_code := UPPER(TRIM(REGEXP_REPLACE(p_invite_code, '[^A-Za-z0-9]', '', 'g')));
    
    IF LENGTH(v_cleaned_code) < 6 THEN
        -- Log failed attempt
        INSERT INTO invite_code_attempts (user_id, attempted_code, success)
        VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', false);
        
        RETURN jsonb_build_object('success', false, 'error', 'Invalid invite code format');
    END IF;
    
    -- Find school by invite code
    SELECT * INTO v_school
    FROM schools
    WHERE invite_code = v_cleaned_code
    AND status = 'active';
    
    IF v_school IS NULL THEN
        -- Log failed attempt (don't reveal if code exists)
        INSERT INTO invite_code_attempts (user_id, attempted_code, success)
        VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', false);
        
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;
    
    -- Validate role
    IF p_role NOT IN ('student', 'teacher') THEN
        p_role := 'student';
    END IF;
    
    -- Check school settings for signup permissions
    IF p_role = 'teacher' AND NOT COALESCE((v_school.settings->>'allow_teacher_signup')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Teacher signup is disabled for this school. Contact the school admin.');
    END IF;
    
    IF p_role = 'student' AND NOT COALESCE((v_school.settings->>'allow_student_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student signup is disabled for this school');
    END IF;
    
    -- Success! Add to school
    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (v_school.id, v_user_id, p_role, 'active');
    -- Note: users.school_id is synced automatically via trigger
    
    -- Update user's role if teacher
    IF p_role = 'teacher' THEN
        UPDATE users SET role = 'teacher' WHERE id = v_user_id AND role = 'student';
    END IF;
    
    -- Log successful attempt
    INSERT INTO invite_code_attempts (user_id, attempted_code, success)
    VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', true);
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully joined ' || v_school.name,
        'school', jsonb_build_object(
            'id', v_school.id,
            'name', v_school.name,
            'slug', v_school.slug
        )
    );
END;
$$;

-- ============================================
-- 4. HARDENED: teacher_create_school
-- ============================================
CREATE OR REPLACE FUNCTION teacher_create_school(
    p_school_name TEXT,
    p_school_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user RECORD;
    v_normalized TEXT;
    v_slug TEXT;
    v_school_id UUID;
    v_invite_code TEXT;
    v_existing RECORD;
    v_current_school RECORD;
    v_recent_count INTEGER;
BEGIN
    -- Auth check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get user info
    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Check if banned
    IF v_user.is_banned THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended');
    END IF;
    
    -- Only teachers can create schools
    IF v_user.role NOT IN ('teacher', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only teachers can create schools');
    END IF;
    
    -- Check if already in a school
    SELECT * INTO v_current_school
    FROM school_members
    WHERE user_id = v_user_id AND status = 'active'
    LIMIT 1;
    
    IF v_current_school IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You are already a member of a school. Leave your current school first to create a new one.',
            'current_school_id', v_current_school.school_id
        );
    END IF;
    
    -- Validate input
    IF LENGTH(TRIM(p_school_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be at least 3 characters');
    END IF;
    
    IF LENGTH(TRIM(p_school_name)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be under 100 characters');
    END IF;
    
    -- Rate limit: max 2 schools created per teacher per week
    SELECT COUNT(*) INTO v_recent_count
    FROM schools
    WHERE created_by = v_user_id
    AND created_at > NOW() - INTERVAL '7 days';
    
    IF v_recent_count >= 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only create 2 schools per week');
    END IF;
    
    -- Normalize and create slug
    v_normalized := normalize_school_name(p_school_name);
    v_slug := COALESCE(
        NULLIF(LOWER(REGEXP_REPLACE(TRIM(p_school_slug), '[^a-z0-9-]', '', 'gi')), ''),
        REPLACE(v_normalized, ' ', '-')
    );
    
    -- Check for exact duplicates
    SELECT * INTO v_existing
    FROM schools
    WHERE normalize_school_name(name) = v_normalized
    OR slug = v_slug;
    
    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'A school with this name or URL already exists',
            'existing_school', v_existing.name,
            'suggestion', 'Use a more specific name or contact the existing school admin'
        );
    END IF;
    
    -- Generate secure invite code (10 chars, uppercase alphanumeric)
    v_invite_code := UPPER(SUBSTRING(
        REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '') 
        FROM 1 FOR 10
    ));
    
    -- Ensure code is unique
    WHILE EXISTS (SELECT 1 FROM schools WHERE invite_code = v_invite_code) LOOP
        v_invite_code := UPPER(SUBSTRING(
            REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '') 
            FROM 1 FOR 10
        ));
    END LOOP;
    
    -- Create the school
    INSERT INTO schools (
        name,
        slug,
        invite_code,
        status,
        created_by,
        settings
    ) VALUES (
        TRIM(p_school_name),
        v_slug,
        v_invite_code,
        'active',
        v_user_id,
        jsonb_build_object(
            'allow_student_signup', true,
            'allow_teacher_signup', false,
            'require_email_verification', false,
            'created_by_teacher', true
        )
    )
    RETURNING id INTO v_school_id;
    
    -- Add teacher as school_admin (canonical source)
    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (v_school_id, v_user_id, 'school_admin', 'active');
    -- users.school_id synced via trigger
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'School created successfully!',
        'school', jsonb_build_object(
            'id', v_school_id,
            'name', TRIM(p_school_name),
            'slug', v_slug,
            'invite_code', v_invite_code
        ),
        'next_steps', ARRAY[
            'Share invite code ' || v_invite_code || ' with your students',
            'Students use this code when signing up',
            'Manage your school from the School Admin portal'
        ]
    );
END;
$$;

-- ============================================
-- 5. HARDENED: request_school (with checks)
-- ============================================
CREATE OR REPLACE FUNCTION request_school(
    p_school_name TEXT,
    p_requester_role TEXT DEFAULT 'teacher'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user RECORD;
    v_normalized TEXT;
    v_existing_school RECORD;
    v_existing_request RECORD;
    v_request_id UUID;
    v_recent_count INTEGER;
    v_similar_schools JSONB;
BEGIN
    -- Auth check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get user info
    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;
    
    IF v_user.is_banned THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended');
    END IF;
    
    -- Validate input
    IF LENGTH(TRIM(p_school_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be at least 3 characters');
    END IF;
    
    IF LENGTH(TRIM(p_school_name)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be under 100 characters');
    END IF;
    
    -- Rate limit: max 3 requests per user per day
    SELECT COUNT(*) INTO v_recent_count
    FROM school_requests
    WHERE requested_by = v_user_id
    AND created_at > NOW() - INTERVAL '24 hours';
    
    IF v_recent_count >= 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Too many requests. Please wait 24 hours.');
    END IF;
    
    -- Normalize name
    v_normalized := normalize_school_name(p_school_name);
    
    -- Check for EXACT duplicate schools
    SELECT * INTO v_existing_school
    FROM schools
    WHERE normalize_school_name(name) = v_normalized
    LIMIT 1;
    
    IF v_existing_school IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'This school already exists',
            'existing_school', jsonb_build_object(
                'name', v_existing_school.name,
                'invite_code', v_existing_school.invite_code
            ),
            'suggestion', 'Use the invite code to join this school'
        );
    END IF;
    
    -- Find SIMILAR schools (suggestions only, not blocking)
    SELECT jsonb_agg(jsonb_build_object('name', name, 'invite_code', invite_code))
    INTO v_similar_schools
    FROM schools
    WHERE name % p_school_name  -- Trigram similarity
    AND status = 'active'
    LIMIT 3;
    
    -- Check for pending request with same normalized name
    SELECT * INTO v_existing_request
    FROM school_requests
    WHERE normalized_name = v_normalized
    AND status = 'pending'
    LIMIT 1;
    
    IF v_existing_request IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'A request for this school is already pending',
            'request_id', v_existing_request.id
        );
    END IF;
    
    -- Create the request
    INSERT INTO school_requests (
        requested_name,
        normalized_name,
        requested_by,
        requester_email,
        requester_role
    ) VALUES (
        TRIM(p_school_name),
        v_normalized,
        v_user_id,
        v_user.email,
        p_requester_role
    )
    RETURNING id INTO v_request_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'School request submitted! You will be notified when it''s approved.',
        'request_id', v_request_id,
        'similar_schools', COALESCE(v_similar_schools, '[]'::jsonb),
        'note', CASE WHEN v_similar_schools IS NOT NULL 
            THEN 'Similar schools exist. Consider joining one of them instead.'
            ELSE NULL
        END
    );
END;
$$;

-- ============================================
-- 6. HARDENED: Admin functions (superadmin only)
-- ============================================
CREATE OR REPLACE FUNCTION admin_review_school_request(
    p_request_id UUID,
    p_action TEXT,
    p_notes TEXT DEFAULT NULL,
    p_existing_school_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_request RECORD;
    v_school_id UUID;
    v_invite_code TEXT;
    v_slug TEXT;
BEGIN
    -- SUPERADMIN CHECK
    IF NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Superadmin access required');
    END IF;
    
    -- Get request
    SELECT * INTO v_request FROM school_requests WHERE id = p_request_id;
    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;
    
    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request already processed');
    END IF;
    
    IF p_action = 'approve' THEN
        v_invite_code := UPPER(SUBSTRING(
            REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '') 
            FROM 1 FOR 10
        ));
        v_slug := REPLACE(v_request.normalized_name, ' ', '-');
        
        INSERT INTO schools (name, slug, invite_code, status, created_by)
        VALUES (v_request.requested_name, v_slug, v_invite_code, 'active', v_request.requested_by)
        RETURNING id INTO v_school_id;
        
        INSERT INTO school_members (school_id, user_id, role_in_school, status)
        VALUES (v_school_id, v_request.requested_by, 'school_admin', 'active');
        
        UPDATE school_requests SET
            status = 'approved',
            approved_school_id = v_school_id,
            admin_notes = p_notes,
            reviewed_by = v_user_id,
            reviewed_at = NOW()
        WHERE id = p_request_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'School approved and created',
            'school_id', v_school_id,
            'invite_code', v_invite_code
        );
        
    ELSIF p_action = 'reject' THEN
        UPDATE school_requests SET
            status = 'rejected',
            admin_notes = p_notes,
            reviewed_by = v_user_id,
            reviewed_at = NOW()
        WHERE id = p_request_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Request rejected');
        
    ELSIF p_action = 'mark_duplicate' THEN
        IF p_existing_school_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Must provide existing school ID');
        END IF;
        
        UPDATE school_requests SET
            status = 'duplicate',
            approved_school_id = p_existing_school_id,
            admin_notes = p_notes,
            reviewed_by = v_user_id,
            reviewed_at = NOW()
        WHERE id = p_request_id;
        
        INSERT INTO school_members (school_id, user_id, role_in_school, status)
        VALUES (p_existing_school_id, v_request.requested_by, v_request.requester_role, 'active')
        ON CONFLICT (school_id, user_id) DO NOTHING;
        
        RETURN jsonb_build_object('success', true, 'message', 'Marked as duplicate, user added to existing school');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_merge_schools(
    p_source_school_id UUID,
    p_target_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_moved_count INTEGER;
BEGIN
    IF NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Superadmin access required');
    END IF;
    
    IF p_source_school_id = p_target_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot merge school into itself');
    END IF;
    
    WITH moved AS (
        INSERT INTO school_members (school_id, user_id, role_in_school, status, joined_at)
        SELECT p_target_school_id, user_id, role_in_school, status, joined_at
        FROM school_members
        WHERE school_id = p_source_school_id
        ON CONFLICT (school_id, user_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_moved_count FROM moved;
    
    UPDATE schools SET status = 'suspended', 
        settings = settings || jsonb_build_object('merged_into', p_target_school_id, 'merged_at', NOW())
    WHERE id = p_source_school_id;
    
    DELETE FROM school_members WHERE school_id = p_source_school_id;
    
    RETURN jsonb_build_object('success', true, 'members_moved', v_moved_count);
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_school_status(
    p_school_id UUID,
    p_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Superadmin access required');
    END IF;
    
    IF p_status NOT IN ('active', 'pending', 'suspended') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
    END IF;
    
    UPDATE schools SET 
        status = p_status,
        settings = settings || jsonb_build_object(
            'status_changed_at', NOW(),
            'status_changed_by', v_user_id,
            'status_reason', p_reason
        ),
        updated_at = NOW()
    WHERE id = p_school_id;
    
    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_school_requests(
    p_status TEXT DEFAULT 'pending',
    p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_requests JSONB;
BEGIN
    IF NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Superadmin access required');
    END IF;
    
    SELECT jsonb_agg(req ORDER BY req->>'created_at' DESC)
    INTO v_requests
    FROM (
        SELECT jsonb_build_object(
            'id', sr.id,
            'requested_name', sr.requested_name,
            'requester_email', sr.requester_email,
            'requester_role', sr.requester_role,
            'status', sr.status,
            'created_at', sr.created_at
        ) AS req
        FROM school_requests sr
        WHERE (p_status IS NULL OR sr.status = p_status)
        ORDER BY sr.created_at DESC
        LIMIT p_limit
    ) sub;
    
    RETURN jsonb_build_object('success', true, 'requests', COALESCE(v_requests, '[]'::jsonb));
END;
$$;

-- ============================================
-- 7. SCHOOL-SCOPED LEADERBOARD
-- ============================================
CREATE OR REPLACE FUNCTION get_school_leaderboard(
    p_scope TEXT DEFAULT 'school',  -- 'school', 'school_grade', 'school_grade_batch'
    p_school_id UUID DEFAULT NULL,
    p_grade INTEGER DEFAULT NULL,
    p_batch TEXT DEFAULT NULL,
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
    v_user_school RECORD;
    v_leaderboard JSONB;
    v_total INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get user's school membership
    SELECT sm.school_id, u.grade, u.batch 
    INTO v_user_school
    FROM school_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.user_id = v_user_id AND sm.status = 'active'
    LIMIT 1;
    
    IF v_user_school IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'You must be in a school to view leaderboards');
    END IF;
    
    -- Use provided school_id or user's school
    v_school_id := COALESCE(p_school_id, v_user_school.school_id);
    
    -- SECURITY: Users can only view their own school's leaderboard
    IF v_school_id != v_user_school.school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only view your own school leaderboard');
    END IF;
    
    -- Build query based on scope
    WITH ranked AS (
        SELECT 
            u.id,
            u.username,
            u.avatar_url,
            u.level,
            u.xp,
            u.grade,
            u.batch,
            u.streak,
            ROW_NUMBER() OVER (ORDER BY u.xp DESC) as rank
        FROM users u
        JOIN school_members sm ON sm.user_id = u.id
        WHERE sm.school_id = v_school_id
        AND sm.status = 'active'
        AND sm.role_in_school = 'student'
        AND NOT COALESCE(u.is_banned, false)
        AND (p_scope = 'school' OR (
            p_scope IN ('school_grade', 'school_grade_batch') 
            AND u.grade = COALESCE(p_grade, v_user_school.grade)
        ))
        AND (p_scope != 'school_grade_batch' OR (
            u.batch = COALESCE(p_batch, v_user_school.batch)
        ))
    )
    SELECT 
        jsonb_agg(jsonb_build_object(
            'rank', rank,
            'user_id', id,
            'username', username,
            'avatar_url', avatar_url,
            'level', level,
            'xp', xp,
            'grade', grade,
            'batch', batch,
            'streak', streak
        ) ORDER BY rank),
        (SELECT COUNT(*) FROM ranked)
    INTO v_leaderboard, v_total
    FROM ranked
    WHERE rank > p_offset AND rank <= p_offset + p_limit;
    
    RETURN jsonb_build_object(
        'success', true,
        'scope', p_scope,
        'school_id', v_school_id,
        'leaderboard', COALESCE(v_leaderboard, '[]'::jsonb),
        'total', COALESCE(v_total, 0),
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_leaderboard(TEXT, UUID, INTEGER, TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================
-- 8. ROTATE INVITE CODE (for school admins)
-- ============================================
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
    
    -- Get school from param or user's membership
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
    
    -- Check if user is school_admin of this school
    SELECT EXISTS (
        SELECT 1 FROM school_members 
        WHERE school_id = v_school_id 
        AND user_id = v_user_id 
        AND role_in_school = 'school_admin'
        AND status = 'active'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin AND NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only school admins can rotate invite codes');
    END IF;
    
    -- Generate new code
    v_new_code := UPPER(SUBSTRING(
        REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '') 
        FROM 1 FOR 10
    ));
    
    -- Ensure unique
    WHILE EXISTS (SELECT 1 FROM schools WHERE invite_code = v_new_code) LOOP
        v_new_code := UPPER(SUBSTRING(
            REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '') 
            FROM 1 FOR 10
        ));
    END LOOP;
    
    -- Update
    UPDATE schools SET 
        invite_code = v_new_code,
        settings = settings || jsonb_build_object(
            'last_code_rotation', NOW(),
            'code_rotated_by', v_user_id
        ),
        updated_at = NOW()
    WHERE id = v_school_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'new_code', v_new_code,
        'message', 'Invite code rotated. Old code is now invalid.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rotate_school_invite_code(UUID) TO authenticated;

-- ============================================
-- 9. LEAVE SCHOOL
-- ============================================
CREATE OR REPLACE FUNCTION leave_school(p_school_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_school_id UUID;
    v_membership RECORD;
    v_admin_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get membership
    IF p_school_id IS NOT NULL THEN
        SELECT * INTO v_membership
        FROM school_members
        WHERE school_id = p_school_id AND user_id = v_user_id;
    ELSE
        SELECT * INTO v_membership
        FROM school_members
        WHERE user_id = v_user_id AND status = 'active'
        LIMIT 1;
    END IF;
    
    IF v_membership IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not a member of this school');
    END IF;
    
    v_school_id := v_membership.school_id;
    
    -- If user is school_admin, check if they're the last one
    IF v_membership.role_in_school = 'school_admin' THEN
        SELECT COUNT(*) INTO v_admin_count
        FROM school_members
        WHERE school_id = v_school_id 
        AND role_in_school = 'school_admin'
        AND status = 'active';
        
        IF v_admin_count <= 1 THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'You are the last admin. Transfer admin role to someone else first, or delete the school.'
            );
        END IF;
    END IF;
    
    -- Remove membership
    DELETE FROM school_members 
    WHERE school_id = v_school_id AND user_id = v_user_id;
    -- users.school_id synced via trigger
    
    RETURN jsonb_build_object('success', true, 'message', 'You have left the school');
END;
$$;

GRANT EXECUTE ON FUNCTION leave_school(UUID) TO authenticated;

-- ============================================
-- 10. RLS POLICIES FOR TABLES
-- ============================================

-- Schools: Anyone can read active schools, only RPCs can write
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schools_select ON schools;
CREATE POLICY schools_select ON schools FOR SELECT
USING (
    status = 'active'
    OR EXISTS (
        SELECT 1
        FROM school_members sm
        WHERE sm.school_id = schools.id
          AND sm.user_id = auth.uid()
          AND sm.status = 'active'
    )
);

DROP POLICY IF EXISTS schools_insert ON schools;
CREATE POLICY schools_insert ON schools FOR INSERT
WITH CHECK (false);  -- Only via RPCs

DROP POLICY IF EXISTS schools_update ON schools;
CREATE POLICY schools_update ON schools FOR UPDATE
USING (false);  -- Only via RPCs

DROP POLICY IF EXISTS schools_delete ON schools;
CREATE POLICY schools_delete ON schools FOR DELETE
USING (false);  -- Only via RPCs

-- School Members: Users can see their own school's members
ALTER TABLE school_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_members NO FORCE ROW LEVEL SECURITY;

-- Avoid infinite recursion in RLS policies by looking up the caller's active school
-- via a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION get_my_active_school_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
    SELECT sm.school_id
    FROM public.school_members sm
    WHERE sm.user_id = auth.uid()
        AND sm.status = 'active'
    ORDER BY sm.joined_at ASC
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_my_active_school_id() TO authenticated;

DROP POLICY IF EXISTS school_members_select ON school_members;
CREATE POLICY school_members_select ON school_members FOR SELECT
USING (
        user_id = auth.uid()
        OR school_id = public.get_my_active_school_id()
);

DROP POLICY IF EXISTS school_members_insert ON school_members;
CREATE POLICY school_members_insert ON school_members FOR INSERT
WITH CHECK (false);  -- Only via RPCs

DROP POLICY IF EXISTS school_members_update ON school_members;
CREATE POLICY school_members_update ON school_members FOR UPDATE
USING (false);  -- Only via RPCs

DROP POLICY IF EXISTS school_members_delete ON school_members;
CREATE POLICY school_members_delete ON school_members FOR DELETE
USING (false);  -- Only via RPCs

-- School Requests: Users can see their own requests
ALTER TABLE school_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_requests_select ON school_requests;
CREATE POLICY school_requests_select ON school_requests FOR SELECT
USING (requested_by = auth.uid() OR is_superadmin(auth.uid()));

DROP POLICY IF EXISTS school_requests_insert ON school_requests;
CREATE POLICY school_requests_insert ON school_requests FOR INSERT
WITH CHECK (false);  -- Only via RPCs

DROP POLICY IF EXISTS school_requests_update ON school_requests;
CREATE POLICY school_requests_update ON school_requests FOR UPDATE
USING (false);

DROP POLICY IF EXISTS school_requests_delete ON school_requests;
CREATE POLICY school_requests_delete ON school_requests FOR DELETE
USING (false);

-- Invite Code Attempts: Users can only see their own
ALTER TABLE invite_code_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invite_attempts_select ON invite_code_attempts;
CREATE POLICY invite_attempts_select ON invite_code_attempts FOR SELECT
USING (user_id = auth.uid() OR is_superadmin(auth.uid()));

DROP POLICY IF EXISTS invite_attempts_insert ON invite_code_attempts;
CREATE POLICY invite_attempts_insert ON invite_code_attempts FOR INSERT
WITH CHECK (false);  -- Only via RPCs

DROP POLICY IF EXISTS invite_attempts_update ON invite_code_attempts;
CREATE POLICY invite_attempts_update ON invite_code_attempts FOR UPDATE
USING (false);

DROP POLICY IF EXISTS invite_attempts_delete ON invite_code_attempts;
CREATE POLICY invite_attempts_delete ON invite_code_attempts FOR DELETE
USING (false);

-- ============================================
-- SETUP: Add yourself as superadmin
-- ============================================
-- Run this ONCE with your actual user ID:
-- INSERT INTO superadmins (user_id) 
-- SELECT id FROM users WHERE email = 'your-email@example.com';

-- ============================================
-- DONE!
-- ============================================
