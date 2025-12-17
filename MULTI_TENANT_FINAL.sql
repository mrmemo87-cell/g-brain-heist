-- ============================================
-- G-Brains Heist - Multi-Tenant FINAL (Consolidated)
-- ============================================
-- Date: 2025-12-17
--
-- Purpose:
-- - Single, deployment-safe SQL migration for multi-school support.
-- - Enforces RPC-only writes for tenant tables via RLS.
-- - Uses a superadmin UID whitelist (superadmins table), NOT users.role='admin'.
-- - Uses school_members as canonical membership; users.school_id is cached.
--
-- Run in Supabase SQL Editor as the database owner.
-- Recommended: run this file instead of the older split files.
-- ============================================

-- Extensions used by these migrations
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 0) Superadmin whitelist
-- ============================================
CREATE TABLE IF NOT EXISTS superadmins (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL
);

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
-- 1) Helpers
-- ============================================
CREATE OR REPLACE FUNCTION normalize_school_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                TRIM(p_name),
                '\\s+', ' ', 'g'
            ),
            '[^a-z0-9\\s]', '', 'gi'
        )
    );
END;
$$;

-- ============================================
-- 2) Core tenant tables
-- ============================================
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    allowed_email_domains TEXT[] DEFAULT '{}',
    invite_code TEXT UNIQUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
    settings JSONB DEFAULT '{
        "allow_student_signup": true,
        "allow_teacher_signup": true,
        "require_email_verification": true,
        "max_students": null,
        "max_teachers": null
    }'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_slug ON schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_invite_code ON schools(invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm ON schools USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS school_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_school TEXT NOT NULL DEFAULT 'student' CHECK (role_in_school IN ('student', 'teacher', 'school_admin')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_school_members_school ON school_members(school_id);
CREATE INDEX IF NOT EXISTS idx_school_members_user ON school_members(user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_role ON school_members(role_in_school);

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

-- ============================================
-- 3) Users table additions
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'school_id'
    ) THEN
        ALTER TABLE users ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'needs_setup'
    ) THEN
        ALTER TABLE users ADD COLUMN needs_setup BOOLEAN DEFAULT false;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_needs_setup ON users(needs_setup) WHERE needs_setup = true;

-- ============================================
-- 4) Default school + migrate existing users
-- ============================================
DO $$
DECLARE
    v_default_school_id UUID;
BEGIN
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

    UPDATE users
    SET school_id = v_default_school_id,
        updated_at = NOW()
    WHERE school_id IS NULL;

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
END $$;

-- ============================================
-- 5) Canonical membership sync (school_members -> users.school_id)
-- ============================================
CREATE OR REPLACE FUNCTION sync_user_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE users SET school_id = (
            SELECT school_id
            FROM school_members
            WHERE user_id = NEW.user_id AND status = 'active'
            ORDER BY joined_at ASC
            LIMIT 1
        )
        WHERE id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET school_id = (
            SELECT school_id
            FROM school_members
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

DROP TRIGGER IF EXISTS trg_sync_user_school ON school_members;
CREATE TRIGGER trg_sync_user_school
AFTER INSERT OR UPDATE OR DELETE ON school_members
FOR EACH ROW
EXECUTE FUNCTION sync_user_school_id();

-- ============================================
-- 6) Brute-force protection for invite codes
-- ============================================
CREATE TABLE IF NOT EXISTS invite_code_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    attempted_code TEXT NOT NULL,
    success BOOLEAN DEFAULT false,
    ip_hint TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_attempts_user ON invite_code_attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invite_attempts_time ON invite_code_attempts(created_at);

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
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE NOT success),
           MAX(created_at)
    INTO v_recent_attempts, v_recent_failures, v_last_attempt
    FROM invite_code_attempts
    WHERE user_id = p_user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_recent_failures >= 5 THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'error', 'Too many failed attempts. Please wait 1 hour.',
            'retry_after', EXTRACT(EPOCH FROM (v_last_attempt + INTERVAL '1 hour' - NOW()))::INTEGER
        );
    END IF;

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
-- 7) Public signup helpers
-- ============================================
DROP FUNCTION IF EXISTS profile_bootstrap(UUID, TEXT, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION profile_bootstrap(
    p_school_id UUID,
    p_role TEXT,
    p_grade SMALLINT DEFAULT NULL,
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
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    IF p_role NOT IN ('student', 'teacher') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role. Must be student or teacher.');
    END IF;

    SELECT * INTO v_school FROM schools WHERE id = p_school_id AND status = 'active';
    IF v_school IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'School not found or inactive');
    END IF;

    IF p_role = 'student' AND NOT COALESCE((v_school.settings->>'allow_student_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This school is not accepting student signups');
    END IF;

    IF p_role = 'teacher' AND NOT COALESCE((v_school.settings->>'allow_teacher_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This school is not accepting teacher signups');
    END IF;

    IF array_length(v_school.allowed_email_domains, 1) > 0 THEN
        IF NOT EXISTS (
            SELECT 1
            FROM unnest(v_school.allowed_email_domains) AS domain
            WHERE v_user_email LIKE '%@' || domain
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Your email domain is not allowed for this school');
        END IF;
    END IF;

    IF p_role = 'student' THEN
        IF p_grade IS NULL OR p_grade < 6 OR p_grade > 12 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Students must select a valid grade (6-12)');
        END IF;
        IF p_batch IS NULL OR p_batch NOT IN ('6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','9C','10A','10B','10C','11A','11B','11C','12A','12B','12C','N/A') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Students must select a valid class/batch');
        END IF;
    END IF;

    SELECT * INTO v_existing_user FROM users WHERE id = v_user_id;

    v_final_username := COALESCE(
        NULLIF(TRIM(p_username), ''),
        v_existing_user.username,
        split_part(v_user_email, '@', 1)
    );

    IF EXISTS (SELECT 1 FROM users WHERE username = v_final_username AND id != v_user_id) THEN
        v_final_username := v_final_username || '_' || substr(v_user_id::text, 1, 8);
    END IF;

    IF v_existing_user IS NULL THEN
        INSERT INTO users (
            id, email, username, role, school_id, grade, batch, needs_setup, avatar_url, created_at, updated_at
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

GRANT EXECUTE ON FUNCTION profile_bootstrap(UUID, TEXT, SMALLINT, TEXT, TEXT) TO authenticated;

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

GRANT EXECUTE ON FUNCTION get_available_schools() TO anon;
GRANT EXECUTE ON FUNCTION get_available_schools() TO authenticated;

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
-- 8) Hardened onboarding + admin RPCs
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
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_user.is_banned THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended');
    END IF;

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

    v_rate_check := check_invite_rate_limit(v_user_id);
    IF NOT (v_rate_check->>'allowed')::boolean THEN
        RETURN v_rate_check;
    END IF;

    v_cleaned_code := UPPER(TRIM(REGEXP_REPLACE(p_invite_code, '[^A-Za-z0-9]', '', 'g')));
    IF LENGTH(v_cleaned_code) < 6 THEN
        INSERT INTO invite_code_attempts (user_id, attempted_code, success)
        VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', false);
        RETURN jsonb_build_object('success', false, 'error', 'Invalid invite code format');
    END IF;

    SELECT * INTO v_school
    FROM schools
    WHERE invite_code = v_cleaned_code
      AND status = 'active';

    IF v_school IS NULL THEN
        INSERT INTO invite_code_attempts (user_id, attempted_code, success)
        VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', false);
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;

    IF p_role NOT IN ('student', 'teacher') THEN
        p_role := 'student';
    END IF;

    IF p_role = 'teacher' AND NOT COALESCE((v_school.settings->>'allow_teacher_signup')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Teacher signup is disabled for this school. Contact the school admin.');
    END IF;

    IF p_role = 'student' AND NOT COALESCE((v_school.settings->>'allow_student_signup')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student signup is disabled for this school');
    END IF;

    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (v_school.id, v_user_id, p_role, 'active');

    IF p_role = 'teacher' THEN
        UPDATE users SET role = 'teacher' WHERE id = v_user_id AND role = 'student';
    END IF;

    INSERT INTO invite_code_attempts (user_id, attempted_code, success)
    VALUES (v_user_id, LEFT(v_cleaned_code, 3) || '***', true);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully joined ' || v_school.name,
        'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'slug', v_school.slug)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION join_school_by_code(TEXT, TEXT) TO authenticated;

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
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_user.is_banned THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended');
    END IF;

    IF v_user.role NOT IN ('teacher', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only teachers can create schools');
    END IF;

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

    IF LENGTH(TRIM(p_school_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be at least 3 characters');
    END IF;

    IF LENGTH(TRIM(p_school_name)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be under 100 characters');
    END IF;

    SELECT COUNT(*) INTO v_recent_count
    FROM schools
    WHERE created_by = v_user_id
      AND created_at > NOW() - INTERVAL '7 days';

    IF v_recent_count >= 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only create 2 schools per week');
    END IF;

    v_normalized := normalize_school_name(p_school_name);
    v_slug := COALESCE(
        NULLIF(LOWER(REGEXP_REPLACE(TRIM(p_school_slug), '[^a-z0-9-]', '', 'gi')), ''),
        REPLACE(v_normalized, ' ', '-')
    );

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

    v_invite_code := UPPER(SUBSTRING(
        REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '')
        FROM 1 FOR 10
    ));

    WHILE EXISTS (SELECT 1 FROM schools WHERE invite_code = v_invite_code) LOOP
        v_invite_code := UPPER(SUBSTRING(
            REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '')
            FROM 1 FOR 10
        ));
    END LOOP;

    INSERT INTO schools (
        name, slug, invite_code, status, created_by, settings
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

    INSERT INTO school_members (school_id, user_id, role_in_school, status)
    VALUES (v_school_id, v_user_id, 'school_admin', 'active');

    RETURN jsonb_build_object(
        'success', true,
        'message', 'School created successfully!',
        'school', jsonb_build_object(
            'id', v_school_id,
            'name', TRIM(p_school_name),
            'slug', v_slug,
            'invite_code', v_invite_code
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION teacher_create_school(TEXT, TEXT) TO authenticated;

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
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT * INTO v_user FROM users WHERE id = v_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_user.is_banned THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account is suspended');
    END IF;

    IF LENGTH(TRIM(p_school_name)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be at least 3 characters');
    END IF;

    IF LENGTH(TRIM(p_school_name)) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'School name must be under 100 characters');
    END IF;

    SELECT COUNT(*) INTO v_recent_count
    FROM school_requests
    WHERE requested_by = v_user_id
      AND created_at > NOW() - INTERVAL '24 hours';

    IF v_recent_count >= 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Too many requests. Please wait 24 hours.');
    END IF;

    v_normalized := normalize_school_name(p_school_name);

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

    SELECT jsonb_agg(jsonb_build_object('name', name, 'invite_code', invite_code))
    INTO v_similar_schools
    FROM schools
    WHERE name % p_school_name
      AND status = 'active'
    LIMIT 3;

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

    INSERT INTO school_requests (
        requested_name, normalized_name, requested_by, requester_email, requester_role
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
        'message', 'School request submitted!',
        'request_id', v_request_id,
        'similar_schools', COALESCE(v_similar_schools, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION request_school(TEXT, TEXT) TO authenticated;

-- Superadmin-only moderation RPCs
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
    IF NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Superadmin access required');
    END IF;

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

        WHILE EXISTS (SELECT 1 FROM schools WHERE invite_code = v_invite_code) LOOP
            v_invite_code := UPPER(SUBSTRING(
                REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '')
                FROM 1 FOR 10
            ));
        END LOOP;

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

        RETURN jsonb_build_object('success', true, 'school_id', v_school_id, 'invite_code', v_invite_code);

    ELSIF p_action = 'reject' THEN
        UPDATE school_requests SET
            status = 'rejected',
            admin_notes = p_notes,
            reviewed_by = v_user_id,
            reviewed_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', true);

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

        RETURN jsonb_build_object('success', true);

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_review_school_request(UUID, TEXT, TEXT, UUID) TO authenticated;

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

GRANT EXECUTE ON FUNCTION admin_list_school_requests(TEXT, INTEGER) TO authenticated;

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

GRANT EXECUTE ON FUNCTION admin_merge_schools(UUID, UUID) TO authenticated;

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

GRANT EXECUTE ON FUNCTION admin_set_school_status(UUID, TEXT, TEXT) TO authenticated;

-- ============================================
-- 9) School-scoped leaderboard
-- ============================================
CREATE OR REPLACE FUNCTION get_school_leaderboard(
    p_scope TEXT DEFAULT 'school',
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

    SELECT sm.school_id, u.grade, u.batch
    INTO v_user_school
    FROM school_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.user_id = v_user_id AND sm.status = 'active'
    LIMIT 1;

    IF v_user_school IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'You must be in a school to view leaderboards');
    END IF;

    v_school_id := COALESCE(p_school_id, v_user_school.school_id);

    IF v_school_id != v_user_school.school_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only view your own school leaderboard');
    END IF;

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
          AND (
                p_scope = 'school'
                OR (
                    p_scope IN ('school_grade', 'school_grade_batch')
                    AND u.grade = COALESCE(p_grade, v_user_school.grade)
                )
          )
          AND (
                p_scope != 'school_grade_batch'
                OR (u.batch = COALESCE(p_batch, v_user_school.batch))
          )
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
-- 10) Invite code rotation + leaving
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

    SELECT EXISTS (
        SELECT 1
        FROM school_members
        WHERE school_id = v_school_id
          AND user_id = v_user_id
          AND role_in_school = 'school_admin'
          AND status = 'active'
    ) INTO v_is_admin;

    IF NOT v_is_admin AND NOT is_superadmin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only school admins can rotate invite codes');
    END IF;

    v_new_code := UPPER(SUBSTRING(
        REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '')
        FROM 1 FOR 10
    ));

    WHILE EXISTS (SELECT 1 FROM schools WHERE invite_code = v_new_code) LOOP
        v_new_code := UPPER(SUBSTRING(
            REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '')
            FROM 1 FOR 10
        ));
    END LOOP;

    UPDATE schools SET
        invite_code = v_new_code,
        settings = settings || jsonb_build_object(
            'last_code_rotation', NOW(),
            'code_rotated_by', v_user_id
        ),
        updated_at = NOW()
    WHERE id = v_school_id;

    RETURN jsonb_build_object('success', true, 'new_code', v_new_code);
END;
$$;

GRANT EXECUTE ON FUNCTION rotate_school_invite_code(UUID) TO authenticated;

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

    IF v_membership.role_in_school = 'school_admin' THEN
        SELECT COUNT(*) INTO v_admin_count
        FROM school_members
        WHERE school_id = v_school_id
          AND role_in_school = 'school_admin'
          AND status = 'active';

        IF v_admin_count <= 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'You are the last admin. Transfer admin role first.');
        END IF;
    END IF;

    DELETE FROM school_members
    WHERE school_id = v_school_id AND user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'You have left the school');
END;
$$;

GRANT EXECUTE ON FUNCTION leave_school(UUID) TO authenticated;

-- Backwards-compatible invite code generator (TEXT)
CREATE OR REPLACE FUNCTION generate_school_invite_code(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_new_code TEXT;
    v_is_admin BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM school_members
        WHERE school_id = p_school_id
          AND user_id = v_user_id
          AND role_in_school = 'school_admin'
          AND status = 'active'
    ) INTO v_is_admin;

    IF NOT v_is_admin AND NOT is_superadmin(v_user_id) THEN
        RAISE EXCEPTION 'Only school admins can generate invite codes';
    END IF;

    v_new_code := UPPER(SUBSTRING(
        REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '')
        FROM 1 FOR 10
    ));

    WHILE EXISTS (SELECT 1 FROM schools WHERE invite_code = v_new_code) LOOP
        v_new_code := UPPER(SUBSTRING(
            REPLACE(REPLACE(ENCODE(gen_random_bytes(8), 'base64'), '+', ''), '/', '')
            FROM 1 FOR 10
        ));
    END LOOP;

    UPDATE schools SET invite_code = v_new_code, updated_at = NOW()
    WHERE id = p_school_id;

    RETURN v_new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_school_invite_code(UUID) TO authenticated;

-- ============================================
-- 11) RLS policies: tenant tables (RPC-only writes)
-- ============================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_code_attempts ENABLE ROW LEVEL SECURITY;

-- Schools
DROP POLICY IF EXISTS schools_select ON schools;
DROP POLICY IF EXISTS schools_insert ON schools;
DROP POLICY IF EXISTS schools_update ON schools;
DROP POLICY IF EXISTS schools_delete ON schools;

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

CREATE POLICY schools_insert ON schools FOR INSERT
WITH CHECK (false);

CREATE POLICY schools_update ON schools FOR UPDATE
USING (false);

CREATE POLICY schools_delete ON schools FOR DELETE
USING (false);

-- School members
DROP POLICY IF EXISTS school_members_select ON school_members;
DROP POLICY IF EXISTS school_members_insert ON school_members;
DROP POLICY IF EXISTS school_members_update ON school_members;
DROP POLICY IF EXISTS school_members_delete ON school_members;

CREATE POLICY school_members_select ON school_members FOR SELECT
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM school_members my_membership
        WHERE my_membership.user_id = auth.uid()
          AND my_membership.school_id = school_members.school_id
          AND my_membership.status = 'active'
    )
);

CREATE POLICY school_members_insert ON school_members FOR INSERT
WITH CHECK (false);

CREATE POLICY school_members_update ON school_members FOR UPDATE
USING (false);

CREATE POLICY school_members_delete ON school_members FOR DELETE
USING (false);

-- School requests
DROP POLICY IF EXISTS school_requests_select ON school_requests;
DROP POLICY IF EXISTS school_requests_insert ON school_requests;
DROP POLICY IF EXISTS school_requests_update ON school_requests;
DROP POLICY IF EXISTS school_requests_delete ON school_requests;

CREATE POLICY school_requests_select ON school_requests FOR SELECT
USING (requested_by = auth.uid() OR is_superadmin(auth.uid()));

CREATE POLICY school_requests_insert ON school_requests FOR INSERT
WITH CHECK (false);

CREATE POLICY school_requests_update ON school_requests FOR UPDATE
USING (false);

CREATE POLICY school_requests_delete ON school_requests FOR DELETE
USING (false);

-- Invite attempt logging
DROP POLICY IF EXISTS invite_attempts_select ON invite_code_attempts;
DROP POLICY IF EXISTS invite_attempts_insert ON invite_code_attempts;
DROP POLICY IF EXISTS invite_attempts_update ON invite_code_attempts;
DROP POLICY IF EXISTS invite_attempts_delete ON invite_code_attempts;

CREATE POLICY invite_attempts_select ON invite_code_attempts FOR SELECT
USING (user_id = auth.uid() OR is_superadmin(auth.uid()));

CREATE POLICY invite_attempts_insert ON invite_code_attempts FOR INSERT
WITH CHECK (false);

CREATE POLICY invite_attempts_update ON invite_code_attempts FOR UPDATE
USING (false);

CREATE POLICY invite_attempts_delete ON invite_code_attempts FOR DELETE
USING (false);

-- ============================================
-- Superadmin bootstrap (run once, manually)
-- ============================================
-- INSERT INTO superadmins (user_id)
-- SELECT id FROM users WHERE email = 'your-email@example.com';
