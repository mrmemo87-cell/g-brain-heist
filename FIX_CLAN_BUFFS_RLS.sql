-- ============================================
-- FIX: Clan buff templates RLS and table setup
-- Run this in Supabase SQL Editor to fix 500 errors on clan buffs
-- ============================================

-- Ensure the clan_buff_templates table exists
CREATE TABLE IF NOT EXISTS clan_buff_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    cost INTEGER NOT NULL CHECK (cost > 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    effect JSONB NOT NULL
);

-- Ensure RLS is enabled but allows all authenticated users to read
ALTER TABLE clan_buff_templates ENABLE ROW LEVEL SECURITY;

-- Drop any existing restrictive policies
DROP POLICY IF EXISTS "clan_buff_templates_select" ON clan_buff_templates;
DROP POLICY IF EXISTS "clan_buff_templates_read" ON clan_buff_templates;

-- Allow all authenticated users to read buff templates (they need to see available buffs)
CREATE POLICY "clan_buff_templates_read" ON clan_buff_templates
    FOR SELECT
    TO authenticated
    USING (true);

-- Grant permissions
GRANT SELECT ON clan_buff_templates TO authenticated;

-- Seed default buff templates if empty
INSERT INTO clan_buff_templates (code, name, description, cost, duration_minutes, effect)
SELECT * FROM (VALUES
    ('xp_surge', 'XP Surge', '+10% XP for all members for 24h.', 5000, 1440, '{"xp_multiplier": 1.1}'::jsonb),
    ('attack_boost', 'Attack Boost', '+15% attack power for 12h.', 3000, 720, '{"attack_multiplier": 1.15}'::jsonb),
    ('defense_wall', 'Defense Wall', '+15% defense power for 12h.', 3000, 720, '{"defense_multiplier": 1.15}'::jsonb),
    ('shield_dome', 'Shield Dome', '+20% shield bonus for 8h.', 4000, 480, '{"shield_bonus_percent": 20}'::jsonb),
    ('energy_rush', 'Energy Rush', '+2 max AP for 6h.', 2500, 360, '{"ap_bonus": 2}'::jsonb)
) AS v(code, name, description, cost, duration_minutes, effect)
WHERE NOT EXISTS (SELECT 1 FROM clan_buff_templates LIMIT 1);

-- Ensure clan_buffs table exists for active buffs
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

-- Ensure RLS for clan_buffs
ALTER TABLE clan_buffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clan_buffs_select" ON clan_buffs;
DROP POLICY IF EXISTS "clan_buffs_read" ON clan_buffs;

-- Members can see their own clan's buffs
CREATE POLICY "clan_buffs_read" ON clan_buffs
    FOR SELECT
    TO authenticated
    USING (
        clan_id IN (
            SELECT cm.clan_id FROM clan_members cm WHERE cm.user_id = auth.uid()
        )
    );

GRANT SELECT ON clan_buffs TO authenticated;

-- Recreate the view for active buffs (filters expired entries)
DROP VIEW IF EXISTS clan_active_buffs;
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

-- Grant access to the view
GRANT SELECT ON clan_active_buffs TO authenticated;

SELECT 'Clan buff templates RLS fix complete!' as status;
SELECT COUNT(*) as template_count FROM clan_buff_templates;
