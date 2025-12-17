-- ============================================
-- G-Brains Heist - School Onboarding & Anti-Abuse
-- ============================================
-- Run AFTER MULTI_TENANT_MIGRATION.sql and SCHOOL_ADMIN_FUNCTIONS.sql
-- 
-- Adds:
-- 1. Request School function (teacher/student can request new school)
-- 2. Teacher creates school flow
-- 3. School name normalization
-- 4. Duplicate detection
-- 5. Rate limiting
-- 6. Moderation tools (merge, ban schools)
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'SCHOOL_ONBOARDING_COMPLETE.sql is deprecated and intentionally a no-op. Use MULTI_TENANT_MIGRATION.sql + SCHOOL_ADMIN_FUNCTIONS.sql + MULTI_TENANT_HARDENING.sql (or MULTI_TENANT_FINAL.sql).';
END;
$$;

/*
DEPRECATED CONTENT BELOW (kept for reference only).


-- ============================================
-- HELPER: Normalize school name
-- ============================================
CREATE OR REPLACE FUNCTION normalize_school_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Trim, lowercase, remove extra spaces, remove special chars
    RETURN LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                TRIM(p_name),
                '\s+', ' ', 'g'  -- Multiple spaces to single
            ),
            '[^a-z0-9\s]', '', 'gi'  -- Remove special chars
        )
    );
END;
$$;

-- ============================================
-- 1. REQUEST NEW SCHOOL (for students/teachers)
-- ============================================
CREATE TABLE IF NOT EXISTS school_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requested_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_email TEXT,
    requester_role TEXT DEFAULT 'teacher' CHECK (requester_role IN ('student', 'teacher')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'duplicate')),
    admin_notes TEXT,
    approved_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_requests_status ON school_requests(status);
CREATE INDEX IF NOT EXISTS idx_school_requests_normalized ON school_requests(normalized_name);
CREATE INDEX IF NOT EXISTS idx_school_requests_user ON school_requests(requested_by);

-- RPC: Request a new school
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
BEGIN
    -- Get user info
    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
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
    
    -- Normalize name for comparison
    v_normalized := normalize_school_name(p_school_name);
    
    -- Check for existing school with similar name
    SELECT * INTO v_existing_school
    FROM schools
    WHERE normalize_school_name(name) = v_normalized
    OR slug = REPLACE(v_normalized, ' ', '-')
    LIMIT 1;
    
    IF v_existing_school IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'A school with a similar name already exists',
            'existing_school', jsonb_build_object(
                'id', v_existing_school.id,
                'name', v_existing_school.name,
                'invite_code', v_existing_school.invite_code
            ),
            'suggestion', 'Use the invite code to join this school instead'
        );
    END IF;
    
    -- Check for pending request with similar name
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
        'request_id', v_request_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION request_school(TEXT, TEXT) TO authenticated;

-- ============================================
-- 2. TEACHER CREATES SCHOOL (instant, self-service)
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
    v_recent_count INTEGER;
BEGIN
    -- Get user info
    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Only teachers can create schools
    IF v_user.role NOT IN ('teacher', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only teachers can create schools. Please request a school instead.');
    END IF;
    
    -- Validate input
    IF LENGTH(TRIM(p_school_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be at least 3 characters');
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
        LOWER(REGEXP_REPLACE(TRIM(p_school_slug), '[^a-z0-9-]', '', 'gi')),
        REPLACE(v_normalized, ' ', '-')
    );
    
    -- Check for duplicates
    SELECT * INTO v_existing
    FROM schools
    WHERE normalize_school_name(name) = v_normalized
    OR slug = v_slug
    LIMIT 1;
    
    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'A school with this name or URL already exists',
            'existing_school', v_existing.name
        );
    END IF;
    
    -- Generate invite code (8 chars, uppercase)
    v_invite_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 8));
    
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
        'active',  -- Teachers get instant activation
        v_user_id,
        jsonb_build_object(
            'allow_student_signup', true,
            'allow_teacher_signup', false,  -- Only admin can add more teachers
            'require_email_verification', false,
            'created_by_teacher', true
        )
    )
    RETURNING id INTO v_school_id;
    
    -- Add teacher as school_admin
    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (v_school_id, v_user_id, 'school_admin', 'active');
    
    -- Update user's primary school
    UPDATE users SET school_id = v_school_id WHERE id = v_user_id AND school_id IS NULL;
    
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

GRANT EXECUTE ON FUNCTION teacher_create_school(TEXT, TEXT) TO authenticated;

-- ============================================
-- 3. APPROVE/REJECT SCHOOL REQUEST (superadmin only)
-- ============================================
CREATE OR REPLACE FUNCTION admin_review_school_request(
    p_request_id UUID,
    p_action TEXT,  -- 'approve', 'reject', 'mark_duplicate'
    p_notes TEXT DEFAULT NULL,
    p_existing_school_id UUID DEFAULT NULL  -- For duplicates
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_admin BOOLEAN;
    v_request RECORD;
    v_school_id UUID;
    v_invite_code TEXT;
    v_slug TEXT;
BEGIN
    -- Check if superadmin
    SELECT EXISTS (
        SELECT 1 FROM users WHERE id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
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
        -- Generate invite code
        v_invite_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 8));
        v_slug := REPLACE(v_request.normalized_name, ' ', '-');
        
        -- Create the school
        INSERT INTO schools (name, slug, invite_code, status, created_by)
        VALUES (v_request.requested_name, v_slug, v_invite_code, 'active', v_request.requested_by)
        RETURNING id INTO v_school_id;
        
        -- Add requester as school_admin
        INSERT INTO school_members (school_id, user_id, role_in_school, status)
        VALUES (v_school_id, v_request.requested_by, 'school_admin', 'active');
        
        -- Update user's school
        UPDATE users SET school_id = v_school_id 
        WHERE id = v_request.requested_by AND school_id IS NULL;
        
        -- Update request
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
            RETURN jsonb_build_object('success', false, 'error', 'Must provide existing school ID for duplicates');
        END IF;
        
        UPDATE school_requests SET
            status = 'duplicate',
            approved_school_id = p_existing_school_id,
            admin_notes = p_notes,
            reviewed_by = v_user_id,
            reviewed_at = NOW()
        WHERE id = p_request_id;
        
        -- Add requester to existing school
        INSERT INTO school_members (school_id, user_id, role_in_school, status)
        VALUES (p_existing_school_id, v_request.requested_by, v_request.requester_role, 'active')
        ON CONFLICT (school_id, user_id) DO NOTHING;
        
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Marked as duplicate and added user to existing school'
        );
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_review_school_request(UUID, TEXT, TEXT, UUID) TO authenticated;

-- ============================================
-- 4. LIST PENDING SCHOOL REQUESTS (superadmin)
-- ============================================
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
    v_is_admin BOOLEAN;
    v_requests JSONB;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM users WHERE id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
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
            'created_at', sr.created_at,
            'similar_schools', (
                SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name))
                FROM schools s
                WHERE normalize_school_name(s.name) % sr.normalized_name  -- Fuzzy match
                LIMIT 3
            )
        ) AS req
        FROM school_requests sr
        WHERE (p_status IS NULL OR sr.status = p_status)
        LIMIT p_limit
    ) sub;
    
    RETURN jsonb_build_object(
        'success', true,
        'requests', COALESCE(v_requests, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_school_requests(TEXT, INTEGER) TO authenticated;

-- ============================================
-- 5. MODERATION: Merge Schools
-- ============================================
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
    v_is_admin BOOLEAN;
    v_moved_count INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM users WHERE id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
    
    IF p_source_school_id = p_target_school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot merge school into itself');
    END IF;
    
    -- Move all members to target school
    WITH moved AS (
        INSERT INTO school_members (school_id, user_id, role_in_school, status, joined_at)
        SELECT p_target_school_id, user_id, role_in_school, status, joined_at
        FROM school_members
        WHERE school_id = p_source_school_id
        ON CONFLICT (school_id, user_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_moved_count FROM moved;
    
    -- Update users' primary school
    UPDATE users SET school_id = p_target_school_id
    WHERE school_id = p_source_school_id;
    
    -- Mark source school as suspended (don't delete, keep for records)
    UPDATE schools SET status = 'suspended', 
        settings = settings || jsonb_build_object('merged_into', p_target_school_id)
    WHERE id = p_source_school_id;
    
    -- Clean up source school_members
    DELETE FROM school_members WHERE school_id = p_source_school_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Schools merged successfully',
        'members_moved', v_moved_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_merge_schools(UUID, UUID) TO authenticated;

-- ============================================
-- 6. MODERATION: Suspend/Reactivate School
-- ============================================
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
    v_is_admin BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM users WHERE id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
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
    
    RETURN jsonb_build_object('success', true, 'message', 'School status updated to ' || p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_school_status(UUID, TEXT, TEXT) TO authenticated;

-- ============================================
-- 7. Enable fuzzy search for school names
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm ON schools USING gin (name gin_trgm_ops);

-- ============================================
-- 8. Join school by invite code (cleaner version)
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
    v_school RECORD;
    v_existing RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Validate role
    IF p_role NOT IN ('student', 'teacher') THEN
        p_role := 'student';
    END IF;
    
    -- Find school by invite code
    SELECT * INTO v_school
    FROM schools
    WHERE invite_code = UPPER(TRIM(p_invite_code))
    AND status = 'active';
    
    IF v_school IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;
    
    -- Check if already a member
    SELECT * INTO v_existing
    FROM school_members
    WHERE school_id = v_school.id AND user_id = v_user_id;
    
    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'You are already a member of this school',
            'school_name', v_school.name
        );
    END IF;
    
    -- Check school settings for signup permissions
    IF p_role = 'teacher' AND NOT (v_school.settings->>'allow_teacher_signup')::boolean THEN
        RETURN jsonb_build_object('success', false, 'error', 'Teacher signup is disabled for this school');
    END IF;
    
    IF p_role = 'student' AND NOT (v_school.settings->>'allow_student_signup')::boolean THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student signup is disabled for this school');
    END IF;
    
    -- Add to school
    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (v_school.id, v_user_id, p_role, 'active');
    
    -- Update primary school if not set
    UPDATE users SET school_id = v_school.id
    WHERE id = v_user_id AND school_id IS NULL;
    
    -- Also update user's role if teacher
    IF p_role = 'teacher' THEN
        UPDATE users SET role = 'teacher' WHERE id = v_user_id AND role = 'student';
    END IF;
    
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

GRANT EXECUTE ON FUNCTION join_school_by_code(TEXT, TEXT) TO authenticated;

-- ============================================
-- DONE!
-- ============================================
-- New functions:
-- 1. normalize_school_name() - Clean school names for comparison
-- 2. request_school() - Students/teachers request new school
-- 3. teacher_create_school() - Teachers instantly create schools
-- 4. admin_review_school_request() - Approve/reject requests
-- 5. admin_list_school_requests() - View pending requests
-- 6. admin_merge_schools() - Merge duplicate schools
-- 7. admin_set_school_status() - Suspend/reactivate schools
-- 8. join_school_by_code() - Clean code-based joining
-- ============================================

*/
