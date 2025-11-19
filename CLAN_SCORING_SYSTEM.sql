-- ============================================================
-- CLAN SCORING SYSTEM MIGRATION
-- ============================================================
-- Implements PvP score tracking and clan-based competitions
-- Features:
-- - pvp_score per player (updated on PvP wins/losses)
-- - total_score = xp + (pvp_score * 10)
-- - Clan system with membership (max 5 players per clan)
-- - Clan score = sum of member total_scores
-- ============================================================

-- STEP 1: Add pvp_score column to users/profiles table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'pvp_score'
    ) THEN
        ALTER TABLE users ADD COLUMN pvp_score INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- STEP 1B: Extend user profiles and clan membership metadata (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'bio'
    ) THEN
        ALTER TABLE users ADD COLUMN bio TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clan_members' AND column_name = 'custom_title'
    ) THEN
        ALTER TABLE clan_members ADD COLUMN custom_title TEXT;
    END IF;
END $$;

-- STEP 2: clans table already exists with schema:
-- id, name, notice, vault_coins, leader_id, member_count, created_at, updated_at
-- No need to create it

-- STEP 3: clan_members table already exists with user_id column
-- The table uses user_id instead of player_id as the foreign key to users

-- STEP 4: Create index for faster queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_clan_members_clan_id ON clan_members(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_user_id ON clan_members(user_id);
CREATE INDEX IF NOT EXISTS idx_users_pvp_score ON users(pvp_score DESC);

-- STEP 4B: Clan buff templates and purchases
CREATE TABLE IF NOT EXISTS clan_buff_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cost INTEGER NOT NULL CHECK (cost > 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    effect JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS clan_buffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES clan_buff_templates(id) ON DELETE CASCADE,
    activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_consumed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_clan_buffs_clan_id ON clan_buffs(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_buffs_expires_at ON clan_buffs(expires_at);

-- Seed default buff templates
INSERT INTO clan_buff_templates (code, name, description, cost, duration_minutes, effect)
VALUES
    ('xp_surge', 'XP Surge', 'All clan members earn +10% XP for 24h.', 5000, 1440, jsonb_build_object('xp_multiplier', 1.1)),
    ('shield_wall', 'Reinforced Shields', 'Shields +20% stronger, +10% defense for 24h.', 7500, 1440, jsonb_build_object('defense_multiplier', 1.1, 'shield_bonus_percent', 20)),
    ('attack_protocol', 'Attack Protocol', '+5% attack power bonus for 24h.', 10000, 1440, jsonb_build_object('attack_multiplier', 1.05))
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    cost = EXCLUDED.cost,
    duration_minutes = EXCLUDED.duration_minutes,
    effect = EXCLUDED.effect;

-- STEP 5: Create view for player total scores
CREATE OR REPLACE VIEW player_total_scores AS
SELECT 
    id,
    username,
    xp,
    pvp_score,
    (xp + (pvp_score * 10)) as total_score,
    level,
    coins,
    gemstones,
    avatar_url,
    grade,
    batch,
    role,
    updated_at
FROM users
WHERE is_banned = FALSE
ORDER BY total_score DESC;

-- STEP 5B: Member score helper view
CREATE OR REPLACE VIEW clan_member_scores AS
SELECT
    cm.clan_id,
    cm.user_id,
    cm.role,
    cm.custom_title,
    cm.joined_at,
    u.username,
    u.avatar_url,
    u.bio,
    u.level,
    u.xp,
    u.pvp_score,
    (u.xp + (u.pvp_score * 10))::INTEGER AS total_score
FROM clan_members cm
JOIN users u ON u.id = cm.user_id
WHERE u.is_banned = FALSE;

-- STEP 6: Create view for clan scores (max 5 members)
CREATE OR REPLACE VIEW clan_scores AS
SELECT 
    c.id,
    c.name,
    c.leader_id,
    c.created_at,
    c.updated_at,
    COUNT(cm.id) as member_count,
    SUM(u.xp + (u.pvp_score * 10)) as clan_total_score,
    AVG((u.xp + (u.pvp_score * 10))::numeric) as avg_member_score,
    MAX((u.xp + (u.pvp_score * 10))) as highest_member_score,
    MAX(u.pvp_score) as highest_pvp_score
FROM clans c
LEFT JOIN clan_members cm ON cm.clan_id = c.id
LEFT JOIN users u ON u.id = cm.user_id AND u.is_banned = FALSE
GROUP BY c.id, c.name, c.leader_id, c.created_at, c.updated_at
HAVING COUNT(cm.id) > 0
ORDER BY clan_total_score DESC;

-- STEP 6B: Active clan buffs view (filters expired entries)
CREATE OR REPLACE VIEW clan_active_buffs AS
SELECT 
        cb.id,
        cb.clan_id,
        cb.template_id,
        t.code,
        t.name,
        t.description,
        t.effect,
        t.duration_minutes,
        cb.activated_by,
        u.username AS activated_by_name,
        cb.purchased_at,
        cb.expires_at
FROM clan_buffs cb
JOIN clan_buff_templates t ON t.id = cb.template_id
LEFT JOIN users u ON u.id = cb.activated_by
WHERE (cb.expires_at IS NULL OR cb.expires_at > NOW())
    AND cb.is_consumed = FALSE;

-- STEP 7: RPC function to create a clan
CREATE OR REPLACE FUNCTION rpc_create_clan(
    p_clan_name TEXT,
    p_notice TEXT DEFAULT NULL
)
RETURNS TABLE (
    clan_id UUID,
    clan_name TEXT,
    leader_username TEXT,
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_user_id UUID;
    v_clan_id UUID;
    v_username TEXT;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, FALSE, 'Not authenticated'::TEXT;
        RETURN;
    END IF;

    -- Get username
    SELECT username INTO v_username FROM users WHERE id = v_user_id;

    -- Check if user already in a clan
    IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_user_id) THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, v_username, FALSE, 'User already in a clan'::TEXT;
        RETURN;
    END IF;

    -- Create clan
    INSERT INTO clans (name, notice, leader_id)
    VALUES (p_clan_name, p_notice, v_user_id)
    RETURNING clans.id INTO v_clan_id;

    -- Add creator as leader
    INSERT INTO clan_members (clan_id, user_id, role)
    VALUES (v_clan_id, v_user_id, 'leader');

    RETURN QUERY SELECT v_clan_id, p_clan_name, v_username, TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 8: RPC function to join a clan
CREATE OR REPLACE FUNCTION rpc_join_clan(p_clan_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT,
    member_count INTEGER
) AS $$
DECLARE
    v_user_id UUID;
    v_member_count INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT, 0;
        RETURN;
    END IF;

    -- Check if clan exists
    IF NOT EXISTS (SELECT 1 FROM clans WHERE id = p_clan_id) THEN
        RETURN QUERY SELECT FALSE, 'Clan not found'::TEXT, 0;
        RETURN;
    END IF;

    -- Check if user already in a clan
    IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = v_user_id) THEN
        RETURN QUERY SELECT FALSE, 'User already in a clan'::TEXT, 0;
        RETURN;
    END IF;

    -- Check clan member count (max 5)
    SELECT COUNT(*) INTO v_member_count FROM clan_members WHERE clan_id = p_clan_id;
    IF v_member_count >= 5 THEN
        RETURN QUERY SELECT FALSE, 'Clan is full (max 5 members)'::TEXT, v_member_count;
        RETURN;
    END IF;

    -- Add user to clan
    INSERT INTO clan_members (clan_id, user_id, role)
    VALUES (p_clan_id, v_user_id, 'member');

    v_member_count := v_member_count + 1;
    RETURN QUERY SELECT TRUE, NULL::TEXT, v_member_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 9: RPC function to leave clan
CREATE OR REPLACE FUNCTION rpc_leave_clan()
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_user_id UUID;
    v_clan_id UUID;
    v_leader_count INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT;
        RETURN;
    END IF;

    -- Get user's clan
    SELECT clan_id INTO v_clan_id FROM clan_members WHERE user_id = v_user_id;
    IF v_clan_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'User not in a clan'::TEXT;
        RETURN;
    END IF;

    -- If leader, check if they're the only leader
    SELECT COUNT(*) INTO v_leader_count 
    FROM clan_members 
    WHERE clan_id = v_clan_id AND role = 'leader';

    IF v_leader_count = 1 AND (SELECT role FROM clan_members WHERE user_id = v_user_id AND clan_id = v_clan_id) = 'leader' THEN
        -- Delete clan if user was only leader
        DELETE FROM clans WHERE id = v_clan_id;
        -- CASCADE will delete clan_members
        RETURN QUERY SELECT TRUE, NULL::TEXT;
        RETURN;
    END IF;

    -- Remove user from clan
    DELETE FROM clan_members WHERE user_id = v_user_id;
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 10: RPC function to update PvP score after battle
CREATE OR REPLACE FUNCTION rpc_update_pvp_score(
    p_user_id UUID,
    p_is_win BOOLEAN
)
RETURNS TABLE (
    new_pvp_score INTEGER,
    new_total_score INTEGER,
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_current_xp INTEGER;
    v_current_pvp_score INTEGER;
    v_new_pvp_score INTEGER;
    v_new_total_score INTEGER;
BEGIN
    -- Fetch current scores
    SELECT xp, pvp_score INTO v_current_xp, v_current_pvp_score
    FROM users
    WHERE id = p_user_id;

    IF v_current_xp IS NULL THEN
        RETURN QUERY SELECT 0, 0, FALSE, 'User not found'::TEXT;
        RETURN;
    END IF;

    -- Calculate new pvp_score
    v_new_pvp_score := v_current_pvp_score + (CASE WHEN p_is_win THEN 3 ELSE 1 END);
    v_new_total_score := v_current_xp + (v_new_pvp_score * 10);

    -- Update user's pvp_score
    UPDATE users
    SET pvp_score = v_new_pvp_score,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN QUERY SELECT v_new_pvp_score, v_new_total_score, TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 10B: Purchase clan buffs with vault coins
CREATE OR REPLACE FUNCTION rpc_purchase_clan_buff(p_buff_code TEXT)
RETURNS TABLE (
    success BOOLEAN,
    clan_id UUID,
    buff_code TEXT,
    buff_name TEXT,
    effect JSONB,
    active_until TIMESTAMPTZ,
    error_message TEXT
) AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clan_id UUID;
    v_role TEXT;
    v_template clan_buff_templates%ROWTYPE;
    v_vault_coins INTEGER;
    v_expires TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TIMESTAMPTZ, 'Not authenticated'::TEXT;
        RETURN;
    END IF;

    SELECT cm.clan_id, cm.role
    INTO v_clan_id, v_role
    FROM clan_members cm
    WHERE cm.user_id = v_user_id;

    IF v_clan_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TIMESTAMPTZ, 'Not in a clan'::TEXT;
        RETURN;
    END IF;

    IF v_role NOT IN ('leader', 'officer', 'moderator') THEN
        RETURN QUERY SELECT FALSE, v_clan_id, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TIMESTAMPTZ, 'Insufficient permissions'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_template FROM clan_buff_templates WHERE code = p_buff_code;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, v_clan_id, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TIMESTAMPTZ, 'Buff not found'::TEXT;
        RETURN;
    END IF;

    SELECT vault_coins INTO v_vault_coins FROM clans WHERE id = v_clan_id FOR UPDATE;
    IF v_vault_coins IS NULL THEN
        RETURN QUERY SELECT FALSE, v_clan_id, NULL::TEXT, NULL::TEXT, NULL::JSONB, NULL::TIMESTAMPTZ, 'Clan not found'::TEXT;
        RETURN;
    END IF;

    IF v_vault_coins < v_template.cost THEN
        RETURN QUERY SELECT FALSE, v_clan_id, v_template.code, v_template.name, v_template.effect, NULL::TIMESTAMPTZ, 'Not enough coins in clan vault'::TEXT;
        RETURN;
    END IF;

    v_expires := NOW() + make_interval(mins => v_template.duration_minutes);

    UPDATE clans
    SET vault_coins = v_vault_coins - v_template.cost
    WHERE id = v_clan_id;

    INSERT INTO clan_buffs (clan_id, template_id, activated_by, expires_at)
    VALUES (v_clan_id, v_template.id, v_user_id, v_expires)
    RETURNING expires_at INTO v_expires;

    RETURN QUERY SELECT TRUE, v_clan_id, v_template.code, v_template.name, v_template.effect, v_expires, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 10C: Transfer clan leadership
CREATE OR REPLACE FUNCTION rpc_transfer_clan_leadership(p_target_user_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clan_id UUID;
    v_role TEXT;
    v_target_clan UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT;
        RETURN;
    END IF;

    SELECT clan_id, role INTO v_clan_id, v_role FROM clan_members WHERE user_id = v_user_id;
    IF v_role IS DISTINCT FROM 'leader' THEN
        RETURN QUERY SELECT FALSE, 'Only the current leader can transfer leadership.'::TEXT;
        RETURN;
    END IF;

    IF p_target_user_id = v_user_id THEN
        RETURN QUERY SELECT FALSE, 'Cannot transfer leadership to yourself.'::TEXT;
        RETURN;
    END IF;

    SELECT clan_id INTO v_target_clan FROM clan_members WHERE user_id = p_target_user_id;
    IF v_target_clan IS NULL OR v_target_clan <> v_clan_id THEN
        RETURN QUERY SELECT FALSE, 'Target user is not part of your clan.'::TEXT;
        RETURN;
    END IF;

    UPDATE clan_members SET role = 'officer' WHERE user_id = v_user_id AND clan_id = v_clan_id;
    UPDATE clan_members SET role = 'leader' WHERE user_id = p_target_user_id AND clan_id = v_clan_id;
    UPDATE clans SET leader_id = p_target_user_id WHERE id = v_clan_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 10D: Update clan member role/title
CREATE OR REPLACE FUNCTION rpc_update_clan_member_role(
    p_member_id UUID,
    p_new_role TEXT DEFAULT NULL,
    p_custom_title TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clan_id UUID;
    v_role TEXT;
    v_target_clan UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT;
        RETURN;
    END IF;

    SELECT clan_id, role INTO v_clan_id, v_role FROM clan_members WHERE user_id = v_user_id;
    IF v_clan_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'You are not in a clan.'::TEXT;
        RETURN;
    END IF;

    SELECT clan_id INTO v_target_clan FROM clan_members WHERE user_id = p_member_id;
    IF v_target_clan IS NULL OR v_target_clan <> v_clan_id THEN
        RETURN QUERY SELECT FALSE, 'Target user is not in your clan.'::TEXT;
        RETURN;
    END IF;

    IF p_new_role IS NOT NULL THEN
        IF v_role <> 'leader' THEN
            RETURN QUERY SELECT FALSE, 'Only leaders can change member roles.'::TEXT;
            RETURN;
        END IF;

        IF p_new_role NOT IN ('officer', 'moderator', 'member') THEN
            RETURN QUERY SELECT FALSE, 'Invalid role specified.'::TEXT;
            RETURN;
        END IF;

        IF p_member_id = v_user_id THEN
            RETURN QUERY SELECT FALSE, 'Use the transfer function to change leadership.'::TEXT;
            RETURN;
        END IF;
    END IF;

    UPDATE clan_members
    SET 
        role = COALESCE(p_new_role, role),
        custom_title = p_custom_title
    WHERE user_id = p_member_id AND clan_id = v_clan_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Failed to update clan member.'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 11: Get clan leaderboard with member details
DROP FUNCTION IF EXISTS rpc_get_clan_leaderboard(INT);
CREATE OR REPLACE FUNCTION rpc_get_clan_leaderboard(p_limit INT DEFAULT 20)
RETURNS TABLE (
    rank BIGINT,
    clan_id UUID,
    clan_name TEXT,
    clan_total_score BIGINT,
    member_count BIGINT,
    avg_member_score NUMERIC,
    highest_member_score BIGINT,
    leader_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY cs.clan_total_score DESC),
        cs.id,
        cs.name,
        cs.clan_total_score,
        cs.member_count,
        cs.avg_member_score,
        cs.highest_member_score,
        u.username,
        cs.created_at
    FROM clan_scores cs
    JOIN users u ON u.id = cs.leader_id
    ORDER BY cs.clan_total_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- STEP 12: Get detailed clan members with their scores
DROP FUNCTION IF EXISTS rpc_get_clan_members(UUID);
CREATE OR REPLACE FUNCTION rpc_get_clan_members(p_clan_id UUID)
RETURNS TABLE (
    player_id UUID,
    username TEXT,
    total_score INTEGER,
    xp INTEGER,
    pvp_score INTEGER,
    level INTEGER,
    avatar_url TEXT,
    role_name TEXT,
    joined_at TIMESTAMP WITH TIME ZONE,
    bio TEXT,
    custom_title TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cms.user_id,
        cms.username,
        cms.total_score,
        cms.xp,
        cms.pvp_score,
        cms.level,
        cms.avatar_url,
        cms.role::TEXT,
        COALESCE(cms.joined_at, NOW()),
        cms.bio,
        cms.custom_title
    FROM clan_member_scores cms
    WHERE cms.clan_id = p_clan_id
    ORDER BY cms.total_score DESC;
END;
$$ LANGUAGE plpgsql;

-- STEP 13: Create trigger function and trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_clan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_clan_timestamp ON clans;
CREATE TRIGGER update_clan_timestamp
BEFORE UPDATE ON clans
FOR EACH ROW
EXECUTE FUNCTION update_clan_updated_at();

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- View all clans with scores
-- SELECT * FROM clan_scores ORDER BY clan_total_score DESC;

-- View a specific clan's members
-- SELECT * FROM rpc_get_clan_members('clan-id-uuid');

-- View clan leaderboard
-- SELECT * FROM rpc_get_clan_leaderboard(20);

-- View player total scores
-- SELECT username, xp, pvp_score, total_score FROM player_total_scores LIMIT 10;
