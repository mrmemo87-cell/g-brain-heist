-- ============================================================
-- ADD PUBLIC PROFILE RPC FUNCTION
-- ============================================================
-- This creates an RPC function to fetch public profile data for any user
-- Bypasses RLS to allow viewing other players' profiles in leaderboards
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Create the RPC function to get public profile data
CREATE OR REPLACE FUNCTION get_public_profile(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', u.id,
        'username', u.username,
        'avatar_url', u.avatar_url,
        'level', u.level,
        'xp', u.xp,
        'coins', u.coins,
        'gemstones', u.gemstones,
        'streak', u.streak,
        'pvp_score', u.pvp_score,
        'attack_power', u.attack_power,
        'defense_power', u.defense_power,
        'bio', u.bio,
        'batch', u.batch,
        'grade', u.grade,
        'role', u.role,
        'last_seen', u.last_seen,
        'ap_now', u.ap_now,
        'ap_max', u.ap_max,
        'school', u.school
    )
    INTO result
    FROM users u
    WHERE u.id = target_user_id;
    
    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_public_profile(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_public_profile(UUID) IS 'Fetches public profile data for any user, bypassing RLS for leaderboard/profile viewing';
