-- ============================================
-- FIX_MULTI_TENANT_ISOLATION.sql
-- Fixes cross-school data leakage bugs
-- Run this in Supabase SQL Editor
-- ============================================
-- 
-- BUGS FIXED:
-- 1. Leaderboard shows users from all schools (should be school-scoped)
-- 2. Attack targets include users from other schools  
-- 3. Activity feed shows events from all schools
-- 4. check_user_setup_status times out for some users
-- 5. Leaderboard errors for non-Silk Road users
--
-- CHANGES:
-- - Add school_id column to activities table
-- - Create school-scoped RPCs for leaderboard, targets, feed
-- - Fix check_user_setup_status to be fast and robust
-- - Replace views with secure RPC functions
-- ============================================

-- ============================================
-- STEP 1: ADD school_id TO activities TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activities' AND column_name = 'school_id'
    ) THEN
        ALTER TABLE activities ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_activities_school_id ON activities(school_id);
        RAISE NOTICE 'Added school_id column to activities table';
    END IF;
END $$;

-- Backfill school_id for existing activities based on actor's school
UPDATE activities a
SET school_id = u.school_id
FROM users u
WHERE a.actor_id = u.id
  AND a.school_id IS NULL
  AND u.school_id IS NOT NULL;

-- ============================================
-- STEP 2: CREATE HELPER FUNCTION TO GET USER SCHOOL
-- ============================================
CREATE OR REPLACE FUNCTION get_caller_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT school_id FROM users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_caller_school_id() TO authenticated;

-- ============================================
-- STEP 3: SCHOOL-SCOPED LEADERBOARD RPC
-- ============================================
-- Returns player leaderboard for caller's school only
CREATE OR REPLACE FUNCTION get_school_leaderboard(
    p_sort_by TEXT DEFAULT 'total_score',
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    avatar_url TEXT,
    batch TEXT,
    total_score BIGINT,
    xp INTEGER,
    pvp_score INTEGER,
    level INTEGER,
    updated_at TIMESTAMPTZ,
    school_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
BEGIN
    -- Get caller's school (ALWAYS use caller's school, ignore any passed param)
    v_school_id := get_caller_school_id();
    
    IF v_school_id IS NULL THEN
        -- Return empty if user has no school
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.avatar_url,
        u.batch,
        (COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))::BIGINT AS total_score,
        COALESCE(u.xp, 0)::INTEGER,
        COALESCE(u.pvp_score, 0)::INTEGER,
        COALESCE(u.level, 1)::INTEGER,
        u.updated_at,
        u.school_id
    FROM users u
    WHERE u.school_id = v_school_id
      AND u.is_banned = FALSE
      AND COALESCE(u.is_admin, FALSE) = FALSE
      AND COALESCE(u.role, 'student') != 'teacher'
    ORDER BY 
        CASE 
            WHEN p_sort_by = 'xp' THEN COALESCE(u.xp, 0)
            WHEN p_sort_by = 'pvp_score' THEN COALESCE(u.pvp_score, 0)
            ELSE (COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))
        END DESC
    LIMIT LEAST(p_limit, 100);
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_leaderboard(TEXT, INTEGER) TO authenticated;

-- ============================================
-- STEP 4: SCHOOL-SCOPED CLAN LEADERBOARD RPC
-- ============================================
CREATE OR REPLACE FUNCTION get_school_clan_leaderboard(
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    member_count BIGINT,
    clan_total_score BIGINT,
    avg_member_score NUMERIC,
    highest_member_score BIGINT,
    school_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
BEGIN
    v_school_id := get_caller_school_id();
    
    IF v_school_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Return clans where ALL members are from the same school as caller
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        COUNT(cm.id)::BIGINT AS member_count,
        COALESCE(SUM(COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10)), 0)::BIGINT AS clan_total_score,
        COALESCE(AVG((COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))::numeric), 0) AS avg_member_score,
        COALESCE(MAX(COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10)), 0)::BIGINT AS highest_member_score,
        v_school_id AS school_id
    FROM clans c
    JOIN clan_members cm ON cm.clan_id = c.id
    JOIN users u ON u.id = cm.user_id
    WHERE u.school_id = v_school_id
      AND u.is_banned = FALSE
      AND COALESCE(u.is_admin, FALSE) = FALSE
    GROUP BY c.id, c.name
    HAVING COUNT(cm.id) > 0
    ORDER BY clan_total_score DESC
    LIMIT LEAST(p_limit, 50);
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_clan_leaderboard(INTEGER) TO authenticated;

-- ============================================
-- STEP 5: SCHOOL-SCOPED ATTACK TARGETS RPC
-- ============================================
CREATE OR REPLACE FUNCTION get_attack_targets(
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    level INTEGER,
    coins INTEGER,
    batch TEXT,
    avatar_url TEXT,
    last_seen TIMESTAMPTZ,
    attack_power INTEGER,
    defense_power INTEGER,
    last_attacked_at TIMESTAMPTZ,
    xp INTEGER,
    has_shield BOOLEAN,
    clan_id UUID,
    clan_name TEXT,
    school_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_school_id UUID;
BEGIN
    v_user_id := auth.uid();
    v_school_id := get_caller_school_id();
    
    IF v_user_id IS NULL OR v_school_id IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        COALESCE(u.level, 1)::INTEGER,
        COALESCE(u.coins, 0)::INTEGER,
        u.batch,
        u.avatar_url,
        u.last_seen,
        COALESCE(u.attack_power, 10)::INTEGER,
        COALESCE(u.defense_power, 10)::INTEGER,
        u.last_attacked_at,
        COALESCE(u.xp, 0)::INTEGER,
        EXISTS (
            SELECT 1 FROM inventory i 
            WHERE i.user_id = u.id 
            AND i.kind = 'shield' 
            AND i.state = 'unused'
        ) AS has_shield,
        cm.clan_id,
        cl.name AS clan_name,
        u.school_id
    FROM users u
    LEFT JOIN clan_members cm ON cm.user_id = u.id
    LEFT JOIN clans cl ON cl.id = cm.clan_id
    WHERE u.school_id = v_school_id  -- CRITICAL: same school only
      AND u.id != v_user_id          -- Not self
      AND COALESCE(u.role, 'student') NOT IN ('teacher', 'admin')
      AND COALESCE(u.is_admin, FALSE) = FALSE
      AND u.is_banned = FALSE
    ORDER BY u.last_seen DESC NULLS LAST
    LIMIT LEAST(p_limit, 100);
END;
$$;

GRANT EXECUTE ON FUNCTION get_attack_targets(INTEGER) TO authenticated;

-- ============================================
-- STEP 6: SCHOOL-SCOPED ACTIVITY FEED RPC
-- ============================================
CREATE OR REPLACE FUNCTION get_school_activity_feed(
    p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (
    id UUID,
    kind TEXT,
    actor_id UUID,
    actor_username TEXT,
    target_id UUID,
    target_username TEXT,
    data JSONB,
    reactions JSONB,
    created_at TIMESTAMPTZ,
    school_id UUID,
    actor_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
BEGIN
    v_school_id := get_caller_school_id();
    
    IF v_school_id IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        a.id,
        a.kind,
        a.actor_id,
        a.actor_username,
        a.target_id,
        a.target_username,
        a.data,
        a.reactions,
        a.created_at,
        a.school_id,
        u.role AS actor_role
    FROM activities a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE (
        a.school_id = v_school_id 
        OR (a.school_id IS NULL AND EXISTS (
            SELECT 1 FROM users actor WHERE actor.id = a.actor_id AND actor.school_id = v_school_id
        ))
    )
    AND COALESCE(u.role, 'student') != 'teacher'
    ORDER BY a.created_at DESC
    LIMIT LEAST(p_limit, 50);
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_activity_feed(INTEGER) TO authenticated;

-- ============================================
-- STEP 7: FIX check_user_setup_status (FAST, ROBUST)
-- ============================================
CREATE OR REPLACE FUNCTION check_user_setup_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user RECORD;
BEGIN
    v_user_id := auth.uid();
    
    -- Fast path: not authenticated
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'needs_setup', false
        );
    END IF;
    
    -- Single query to get all needed info
    SELECT 
        id,
        username,
        role,
        school_id,
        needs_setup,
        email
    INTO v_user 
    FROM users 
    WHERE id = v_user_id;
    
    -- No profile row: needs setup
    IF v_user IS NULL OR v_user.id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', true,
            'needs_setup', true,
            'reason', 'no_profile',
            'user_id', v_user_id
        );
    END IF;
    
    -- Has profile but flagged as needs_setup or missing school
    IF v_user.needs_setup = true OR v_user.school_id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', true,
            'needs_setup', true,
            'reason', 'incomplete_profile',
            'has_username', v_user.username IS NOT NULL AND v_user.username != '',
            'has_role', v_user.role IS NOT NULL,
            'username', v_user.username,
            'user_id', v_user.id
        );
    END IF;
    
    -- Fully set up
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
-- STEP 8: TRIGGER TO AUTO-SET school_id ON activities INSERT
-- ============================================
CREATE OR REPLACE FUNCTION set_activity_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If school_id not provided, derive from actor's school
    IF NEW.school_id IS NULL AND NEW.actor_id IS NOT NULL THEN
        SELECT school_id INTO NEW.school_id 
        FROM users 
        WHERE id = NEW.actor_id;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_activity_school_id ON activities;

CREATE TRIGGER trg_set_activity_school_id
    BEFORE INSERT ON activities
    FOR EACH ROW
    EXECUTE FUNCTION set_activity_school_id();

-- ============================================
-- STEP 9: RLS POLICY FOR ACTIVITIES (DEFENSE IN DEPTH)
-- ============================================
-- Even if frontend bypasses RPC, RLS blocks cross-school reads
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activities_select ON activities;
DROP POLICY IF EXISTS activities_insert ON activities;
DROP POLICY IF EXISTS activities_update ON activities;
DROP POLICY IF EXISTS activities_delete ON activities;

-- Users can only see activities from their school
CREATE POLICY activities_select ON activities FOR SELECT
USING (
    school_id = get_caller_school_id()
    OR (school_id IS NULL AND EXISTS (
        SELECT 1 FROM users u WHERE u.id = activities.actor_id AND u.school_id = get_caller_school_id()
    ))
);

-- Users can insert activities (school_id auto-set by trigger)
CREATE POLICY activities_insert ON activities FOR INSERT
WITH CHECK (
    actor_id = auth.uid()
);

-- Users can update reactions on any visible activity
CREATE POLICY activities_update ON activities FOR UPDATE
USING (
    school_id = get_caller_school_id()
    OR (school_id IS NULL AND EXISTS (
        SELECT 1 FROM users u WHERE u.id = activities.actor_id AND u.school_id = get_caller_school_id()
    ))
);

-- Only actor can delete their activities
CREATE POLICY activities_delete ON activities FOR DELETE
USING (actor_id = auth.uid());

-- ============================================
-- STEP 10: FIX CLAN MEMBERS RPC (SCHOOL SCOPED)
-- ============================================
-- Drop existing function first to allow signature change
DROP FUNCTION IF EXISTS rpc_get_clan_members(UUID);

CREATE OR REPLACE FUNCTION rpc_get_clan_members(p_clan_id UUID)
RETURNS TABLE (
    player_id UUID,
    username TEXT,
    role_name TEXT,
    avatar_url TEXT,
    total_score BIGINT,
    xp INTEGER,
    pvp_score INTEGER,
    bio TEXT,
    custom_title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
BEGIN
    v_school_id := get_caller_school_id();
    
    -- Only return members if the clan has members in caller's school
    RETURN QUERY
    SELECT 
        cm.user_id AS player_id,
        u.username,
        cm.role AS role_name,
        u.avatar_url,
        (COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))::BIGINT AS total_score,
        COALESCE(u.xp, 0)::INTEGER,
        COALESCE(u.pvp_score, 0)::INTEGER,
        u.bio,
        cm.custom_title
    FROM clan_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.clan_id = p_clan_id
      AND (v_school_id IS NULL OR u.school_id = v_school_id)
      AND u.is_banned = FALSE
      AND COALESCE(u.is_admin, FALSE) = FALSE
    ORDER BY 
        CASE cm.role 
            WHEN 'leader' THEN 1 
            WHEN 'co-leader' THEN 2 
            WHEN 'elder' THEN 3 
            ELSE 4 
        END,
        total_score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_clan_members(UUID) TO authenticated;

-- ============================================
-- STEP 11: SCHOOL-SCOPED COMPETITION LEADERBOARDS
-- ============================================

-- Grade leaderboard - school scoped
DROP FUNCTION IF EXISTS rpc_leaderboard_grade(int, int) CASCADE;

CREATE OR REPLACE FUNCTION rpc_leaderboard_grade(p_grade INT, p_limit INT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  xp INT,
  coins INT,
  streak INT,
  batch TEXT,
  grade INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  v_school_id := get_caller_school_id();
  
  -- Accept grades 6-12
  IF p_grade IS NULL OR p_grade < 6 OR p_grade > 12 THEN
    RAISE EXCEPTION 'invalid_grade';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    COALESCE(u.xp, 0)::INT,
    COALESCE(u.coins, 0)::INT,
    COALESCE(u.streak, 0)::INT,
    u.batch,
    COALESCE(u.grade::INT, p_grade::INT)
  FROM users u
  WHERE u.grade::TEXT = p_grade::TEXT
    AND (v_school_id IS NULL OR u.school_id = v_school_id)  -- SCHOOL FILTER
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, 'student') = 'student'
    AND COALESCE(u.admin_visible, TRUE) = TRUE
  ORDER BY u.xp DESC, u.coins DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_leaderboard_grade(INT, INT) TO authenticated;

-- Batch leaderboard - school scoped
DROP FUNCTION IF EXISTS rpc_leaderboard_batch(text, int) CASCADE;

CREATE OR REPLACE FUNCTION rpc_leaderboard_batch(p_batch TEXT, p_limit INT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  xp INT,
  coins INT,
  streak INT,
  batch TEXT,
  grade INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  v_school_id := get_caller_school_id();
  
  -- Accept all batches 6A-12C plus N/A
  IF p_batch IS NULL OR p_batch NOT IN (
    '6A', '6B', '6C',
    '7A', '7B', '7C',
    '8A', '8B', '8C',
    '9A', '9B', '9C',
    '10A', '10B', '10C',
    '11A', '11B', '11C',
    '12A', '12B', '12C',
    'N/A'
  ) THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    COALESCE(u.xp, 0)::INT,
    COALESCE(u.coins, 0)::INT,
    COALESCE(u.streak, 0)::INT,
    u.batch,
    COALESCE(u.grade::INT, 8)
  FROM users u
  WHERE u.batch = p_batch
    AND (v_school_id IS NULL OR u.school_id = v_school_id)  -- SCHOOL FILTER
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, 'student') = 'student'
    AND COALESCE(u.admin_visible, TRUE) = TRUE
  ORDER BY u.xp DESC, u.coins DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_leaderboard_batch(TEXT, INT) TO authenticated;

-- Batch summaries - school scoped
CREATE OR REPLACE FUNCTION get_school_batch_summaries()
RETURNS TABLE (
  batch TEXT,
  total_xp BIGINT,
  player_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  v_school_id := get_caller_school_id();
  
  RETURN QUERY
  SELECT 
    u.batch,
    COALESCE(SUM(u.xp), 0)::BIGINT AS total_xp,
    COUNT(*)::BIGINT AS player_count
  FROM users u
  WHERE u.batch IS NOT NULL
    AND (v_school_id IS NULL OR u.school_id = v_school_id)
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, 'student') = 'student'
  GROUP BY u.batch
  ORDER BY u.batch;
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_batch_summaries() TO authenticated;

-- ============================================
-- STEP 12: GET AVAILABLE GRADES/BATCHES FOR SCHOOL
-- ============================================

-- Get all grades that have students in the caller's school
CREATE OR REPLACE FUNCTION get_school_grades()
RETURNS TABLE (
  grade INT,
  player_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  v_school_id := get_caller_school_id();
  
  RETURN QUERY
  SELECT 
    u.grade::INT,
    COUNT(*)::BIGINT AS player_count
  FROM users u
  WHERE u.grade IS NOT NULL
    AND (v_school_id IS NULL OR u.school_id = v_school_id)
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, 'student') = 'student'
  GROUP BY u.grade
  ORDER BY u.grade;
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_grades() TO authenticated;

-- Get all batches that have students in the caller's school
CREATE OR REPLACE FUNCTION get_school_batches()
RETURNS TABLE (
  batch TEXT,
  grade INT,
  player_count BIGINT,
  total_xp BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  v_school_id := get_caller_school_id();
  
  RETURN QUERY
  SELECT 
    u.batch,
    u.grade::INT,
    COUNT(*)::BIGINT AS player_count,
    COALESCE(SUM(u.xp), 0)::BIGINT AS total_xp
  FROM users u
  WHERE u.batch IS NOT NULL
    AND (v_school_id IS NULL OR u.school_id = v_school_id)
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, 'student') = 'student'
  GROUP BY u.batch, u.grade
  ORDER BY u.grade, u.batch;
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_batches() TO authenticated;

-- ============================================
-- VERIFICATION QUERIES (RUN AFTER MIGRATION)
-- ============================================
-- Test: Check that leaderboard RPC exists
-- SELECT proname FROM pg_proc WHERE proname = 'get_school_leaderboard';

-- Test: Check activities has school_id
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'school_id';

-- Test: Check RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'activities';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT 'Multi-tenant isolation fix applied successfully' AS status;
