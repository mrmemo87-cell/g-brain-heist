-- ============================================
-- Create Profiles View for Competition
-- ============================================
-- This view exposes public user information for leaderboards and queries
-- Run this in Supabase SQL Editor to create the view

CREATE OR REPLACE VIEW profiles AS
SELECT
        id,
        username,
        grade,
        batch,
        xp,
        coins,
        streak,
        avatar_url,
        last_seen,
        level,
        updated_at,
        is_admin,
        is_banned
FROM users
WHERE COALESCE(is_admin, false) = false
    AND COALESCE(is_banned, false) = false
    AND COALESCE(admin_visible, true) = true;

-- Grant permissions for authenticated users to read the view
ALTER VIEW profiles OWNER TO postgres;

-- Optional: Add RLS policy if you want to restrict access
-- Note: Views inherit RLS from their base tables
