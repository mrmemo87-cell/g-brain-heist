-- ============================================
-- ENABLE INDIVIDUALS FEATURES
-- Allows users without a school to:
-- 1. View global leaderboards (other individuals)
-- 2. See other individuals as PvP attack targets
-- 3. Participate in rivalry (already works if in a clan)
-- 4. Compete in lockdown (frontend change only)
-- ============================================

-- ============================================
-- STEP 1: Update get_school_leaderboard to handle individuals
-- When caller has no school_id, return all individual players (school_id IS NULL)
-- ============================================
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
    v_school_id := get_caller_school_id();
    
    IF v_school_id IS NULL THEN
        -- Individual user: show all other individuals (no school)
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
        WHERE u.school_id IS NULL
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
        RETURN;
    END IF;
    
    -- School user: same behavior as before
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
-- STEP 2: Update get_school_clan_leaderboard to handle individuals
-- When caller has no school_id, return clans that have individual members
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
        -- Individual user: show clans that have at least one individual member
        RETURN QUERY
        SELECT 
            c.id,
            c.name,
            COUNT(cm.id)::BIGINT AS member_count,
            COALESCE(SUM(COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10)), 0)::BIGINT AS clan_total_score,
            COALESCE(AVG((COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10))::numeric), 0) AS avg_member_score,
            COALESCE(MAX(COALESCE(u.xp, 0) + (COALESCE(u.pvp_score, 0) * 10)), 0)::BIGINT AS highest_member_score,
            NULL::UUID AS school_id
        FROM clans c
        JOIN clan_members cm ON cm.clan_id = c.id
        JOIN users u ON u.id = cm.user_id
        WHERE u.is_banned = FALSE
          AND COALESCE(u.is_admin, FALSE) = FALSE
          AND EXISTS (
              SELECT 1 FROM clan_members cm2
              JOIN users u2 ON u2.id = cm2.user_id
              WHERE cm2.clan_id = c.id AND u2.school_id IS NULL
          )
        GROUP BY c.id, c.name
        HAVING COUNT(cm.id) > 0
        ORDER BY clan_total_score DESC
        LIMIT LEAST(p_limit, 50);
        RETURN;
    END IF;
    
    -- School user: same behavior as before
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
-- STEP 3: Update get_attack_targets to handle individuals
-- When caller has no school_id, return other individual players
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
    
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;
    
    IF v_school_id IS NULL THEN
        -- Individual user: show other individual players (no school)
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
        WHERE u.school_id IS NULL
          AND u.id != v_user_id
          AND COALESCE(u.role, 'student') NOT IN ('teacher', 'admin')
          AND COALESCE(u.is_admin, FALSE) = FALSE
          AND u.is_banned = FALSE
        ORDER BY u.last_seen DESC NULLS LAST
        LIMIT LEAST(p_limit, 100);
        RETURN;
    END IF;
    
    -- School user: same behavior as before
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
    WHERE u.school_id = v_school_id
      AND u.id != v_user_id
      AND COALESCE(u.role, 'student') NOT IN ('teacher', 'admin')
      AND COALESCE(u.is_admin, FALSE) = FALSE
      AND u.is_banned = FALSE
    ORDER BY u.last_seen DESC NULLS LAST
    LIMIT LEAST(p_limit, 100);
END;
$$;

GRANT EXECUTE ON FUNCTION get_attack_targets(INTEGER) TO authenticated;
