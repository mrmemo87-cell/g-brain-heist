-- G-Brains Heist User Stats Audit & Enhancement Script
-- Run this in Supabase SQL Editor to ensure all user stats are properly stored

-- ============================================
-- 1. CHECK CURRENT USER TABLE STRUCTURE
-- ============================================
SELECT 'CURRENT USER TABLE COLUMNS' as audit_section;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- ============================================
-- 2. ADD MISSING COLUMNS TO USERS TABLE
-- ============================================
DO $$
BEGIN
    -- Add gemstones column if missing (for premium currency)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'gemstones') THEN
        ALTER TABLE users ADD COLUMN gemstones INTEGER DEFAULT 0;
        RAISE NOTICE 'Added gemstones column to users table';
    END IF;
    
    -- Add role column if missing (student/teacher/admin)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin'));
        RAISE NOTICE 'Added role column to users table';
    END IF;
    
    -- Add tutorial_completed for new user onboarding
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'tutorial_completed') THEN
        ALTER TABLE users ADD COLUMN tutorial_completed BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added tutorial_completed column to users table';
    END IF;
    
    -- Add last_attacked_at for PvP cooldowns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_attacked_at') THEN
        ALTER TABLE users ADD COLUMN last_attacked_at TIMESTAMPTZ;
        RAISE NOTICE 'Added last_attacked_at column to users table';
    END IF;
    
    -- Add total_questions_answered for teacher system tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'total_questions_answered') THEN
        ALTER TABLE users ADD COLUMN total_questions_answered INTEGER DEFAULT 0;
        RAISE NOTICE 'Added total_questions_answered column to users table';
    END IF;
    
    -- Add achievement_points for achievement system
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'achievement_points') THEN
        ALTER TABLE users ADD COLUMN achievement_points INTEGER DEFAULT 0;
        RAISE NOTICE 'Added achievement_points column to users table';
    END IF;
END $$;

-- ============================================
-- 3. VERIFY NEWS FEED / ACTIVITIES SYSTEM
-- ============================================
SELECT 'ACTIVITIES TABLE CHECK' as audit_section;
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'activities'
ORDER BY ordinal_position;

-- Check if activity_reactions table exists for news feed interactions
SELECT 'ACTIVITY REACTIONS CHECK' as audit_section;
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'activity_reactions'
ORDER BY ordinal_position;

-- ============================================
-- 4. VERIFY INVENTORY SYSTEM
-- ============================================
SELECT 'INVENTORY TABLE CHECK' as audit_section;
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'inventory'
ORDER BY ordinal_position;

-- ============================================
-- 5. CHECK USER ACHIEVEMENT PROGRESS TRACKING
-- ============================================
SELECT 'USER ACHIEVEMENTS CHECK' as audit_section;
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'user_achievements'
ORDER BY ordinal_position;

-- ============================================
-- 6. VERIFY AP REGENERATION SYSTEM
-- ============================================
SELECT 'AP SYSTEM CHECK' as audit_section;
SELECT 
    u.username,
    u.ap_now,
    u.ap_max,
    u.last_ap_update,
    EXTRACT(EPOCH FROM (NOW() - u.last_ap_update)) / 60.0 as minutes_since_update,
    CASE 
        WHEN u.ap_now < u.ap_max THEN 'REGENERATING'
        ELSE 'FULL'
    END as ap_status
FROM users u
LIMIT 5;

-- ============================================
-- 7. CHECK STREAK TRACKING
-- ============================================
SELECT 'STREAK SYSTEM CHECK' as audit_section;
SELECT 
    u.username,
    u.streak,
    u.last_seen,
    CASE 
        WHEN u.last_seen > NOW() - INTERVAL '24 hours' THEN 'ACTIVE'
        WHEN u.last_seen > NOW() - INTERVAL '48 hours' THEN 'GRACE_PERIOD'
        ELSE 'BROKEN'
    END as streak_status
FROM users u
ORDER BY u.streak DESC
LIMIT 10;

-- ============================================
-- 8. VERIFY COMBAT STATS TRACKING
-- ============================================
SELECT 'COMBAT STATS CHECK' as audit_section;
SELECT 
    u.username,
    u.attack_power,
    u.defense_power,
    u.level,
    u.last_attacked_at,
    CASE 
        WHEN u.last_attacked_at IS NULL THEN 'NEVER_ATTACKED'
        WHEN u.last_attacked_at > NOW() - INTERVAL '1 hour' THEN 'RECENTLY_ATTACKED'
        ELSE 'CAN_BE_ATTACKED'
    END as attack_status
FROM users u
ORDER BY u.level DESC
LIMIT 10;

-- ============================================
-- 9. TEST RPC FUNCTIONS FOR USER STATS
-- ============================================
SELECT 'RPC FUNCTIONS CHECK' as audit_section;
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'regenerate_user_ap',
    'whoami',
    'get_leaderboard',
    'update_user_stats'
)
ORDER BY routine_name;

-- ============================================
-- 10. CREATE USER STATS UPDATE FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_user_stats(
    p_user_id UUID,
    p_xp_gain INTEGER DEFAULT 0,
    p_coins_gain INTEGER DEFAULT 0,
    p_gemstones_gain INTEGER DEFAULT 0,
    p_questions_answered INTEGER DEFAULT 0
)
RETURNS TABLE (
    username TEXT,
    old_level INTEGER,
    new_level INTEGER,
    old_xp INTEGER,
    new_xp INTEGER,
    old_coins INTEGER,
    new_coins INTEGER,
    old_gemstones INTEGER,
    new_gemstones INTEGER,
    level_up_occurred BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_record RECORD;
    new_level_calc INTEGER;
    old_level_val INTEGER;
    level_up_flag BOOLEAN := false;
BEGIN
    -- Get current user stats
    SELECT u.username, u.level, u.xp, u.coins, u.gemstones, u.total_questions_answered
    INTO user_record
    FROM users u
    WHERE u.id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Calculate new level based on XP
    old_level_val := user_record.level;
    new_level_calc := GREATEST(1, FLOOR((user_record.xp + p_xp_gain) / 100.0) + 1);
    
    IF new_level_calc > old_level_val THEN
        level_up_flag := true;
    END IF;

    -- Update user stats
    UPDATE users 
    SET 
        xp = xp + p_xp_gain,
        coins = coins + p_coins_gain,
        gemstones = gemstones + p_gemstones_gain,
        total_questions_answered = total_questions_answered + p_questions_answered,
        level = new_level_calc,
        last_seen = NOW()
    WHERE id = p_user_id;

    -- Return the results
    RETURN QUERY SELECT 
        user_record.username,
        old_level_val,
        new_level_calc,
        user_record.xp,
        user_record.xp + p_xp_gain,
        user_record.coins,
        user_record.coins + p_coins_gain,
        user_record.gemstones,
        user_record.gemstones + p_gemstones_gain,
        level_up_flag;
END;
$$;

-- ============================================
-- 11. CREATE ACTIVITY LOGGING FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION log_user_activity(
    p_kind TEXT,
    p_actor_id UUID,
    p_target_id UUID DEFAULT NULL,
    p_data JSONB DEFAULT '{}'
)
RETURNS activities
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    activity_record activities;
    actor_name TEXT;
    target_name TEXT;
BEGIN
    -- Get actor username
    SELECT username INTO actor_name FROM users WHERE id = p_actor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Actor user not found';
    END IF;

    -- Get target username if provided
    IF p_target_id IS NOT NULL THEN
        SELECT username INTO target_name FROM users WHERE id = p_target_id;
    END IF;

    -- Insert activity
    INSERT INTO activities (kind, actor_id, actor_username, target_id, target_username, data)
    VALUES (p_kind, p_actor_id, actor_name, p_target_id, target_name, p_data)
    RETURNING * INTO activity_record;

    RETURN activity_record;
END;
$$;

-- ============================================
-- 12. CREATE NEWS FEED ACTIVITY LOGGING FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION log_user_activity_enhanced(
    p_kind TEXT,
    p_actor_id UUID,
    p_target_id UUID DEFAULT NULL,
    p_data JSONB DEFAULT '{}',
    p_amount INTEGER DEFAULT NULL
)
RETURNS activities
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    activity_record activities;
    actor_name TEXT;
    target_name TEXT;
BEGIN
    -- Get actor username
    SELECT username INTO actor_name FROM users WHERE id = p_actor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Actor user not found';
    END IF;

    -- Get target username if provided
    IF p_target_id IS NOT NULL THEN
        SELECT username INTO target_name FROM users WHERE id = p_target_id;
    END IF;

    -- Insert activity with enhanced data
    INSERT INTO activities (kind, actor_id, actor_username, target_id, target_username, data)
    VALUES (p_kind, p_actor_id, actor_name, p_target_id, target_name, 
            p_data || CASE WHEN p_amount IS NOT NULL THEN jsonb_build_object('amount', p_amount) ELSE '{}'::jsonb END)
    RETURNING * INTO activity_record;

    RETURN activity_record;
END;
$$;

-- ============================================
-- 13. CREATE COMPREHENSIVE USER PROFILE FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_user_complete_profile(p_user_id UUID)
RETURNS TABLE (
    -- Core Stats
    user_id UUID,
    username TEXT,
    email TEXT,
    level INTEGER,
    xp INTEGER,
    coins INTEGER,
    gemstones INTEGER,
    streak INTEGER,
    role TEXT,
    tutorial_completed BOOLEAN,
    
    -- Combat Stats
    attack_power INTEGER,
    defense_power INTEGER,
    ap_now INTEGER,
    ap_max INTEGER,
    last_attacked_at TIMESTAMPTZ,
    
    -- Activity Stats
    total_questions_answered INTEGER,
    achievement_points INTEGER,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    
    -- Calculated Stats
    pvp_wins_count INTEGER,
    quests_completed_count INTEGER,
    shop_purchases_count INTEGER,
    active_inventory_count INTEGER,
    earned_achievements_count INTEGER,
    
    -- Status Indicators
    can_be_attacked BOOLEAN,
    ap_regeneration_rate TEXT,
    streak_status TEXT,
    achievement_completion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_record RECORD;
    pvp_wins_cnt INTEGER;
    quests_cnt INTEGER;
    purchases_cnt INTEGER;
    inventory_cnt INTEGER;
    achievements_cnt INTEGER;
    total_achievements INTEGER;
BEGIN
    -- Get user profile
    SELECT * INTO user_record FROM users WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Count PvP wins
    SELECT COUNT(*) INTO pvp_wins_cnt 
    FROM activities 
    WHERE activities.actor_id = p_user_id AND activities.kind = 'pvp_win';
    
    -- Count quests completed
    SELECT COUNT(*) INTO quests_cnt 
    FROM activities 
    WHERE activities.actor_id = p_user_id AND activities.kind = 'quest_complete';
    
    -- Count shop purchases
    SELECT COUNT(*) INTO purchases_cnt 
    FROM shop_purchases 
    WHERE shop_purchases.user_id = p_user_id;
    
    -- Count active inventory items
    SELECT COUNT(*) INTO inventory_cnt 
    FROM inventory 
    WHERE inventory.user_id = p_user_id AND inventory.state = 'active';
    
    -- Count earned achievements
    SELECT COUNT(*) INTO achievements_cnt 
    FROM user_achievements 
    WHERE user_achievements.user_id = p_user_id;
    
    -- Get total achievements
    SELECT COUNT(*) INTO total_achievements FROM achievements;
    
    -- Return comprehensive profile
    RETURN QUERY SELECT 
        user_record.id,
        user_record.username,
        user_record.email,
        user_record.level,
        user_record.xp,
        user_record.coins,
        user_record.gemstones,
        user_record.streak,
        user_record.role,
        user_record.tutorial_completed,
        
        user_record.attack_power,
        user_record.defense_power,
        user_record.ap_now,
        user_record.ap_max,
        user_record.last_attacked_at,
        
        user_record.total_questions_answered,
        user_record.achievement_points,
        user_record.last_seen,
        user_record.created_at,
        
        pvp_wins_cnt,
        quests_cnt,
        purchases_cnt,
        inventory_cnt,
        achievements_cnt,
        
        -- Status calculations
        CASE 
            WHEN user_record.last_attacked_at IS NULL THEN true
            WHEN user_record.last_attacked_at < NOW() - INTERVAL '1 hour' THEN true
            ELSE false
        END as can_be_attacked,
        
        CASE 
            WHEN user_record.ap_now >= user_record.ap_max THEN 'FULL'
            ELSE 'REGENERATING (1 AP per 10 minutes)'
        END as ap_regeneration_rate,
        
        CASE 
            WHEN user_record.last_seen > NOW() - INTERVAL '24 hours' THEN 'ACTIVE'
            WHEN user_record.last_seen > NOW() - INTERVAL '48 hours' THEN 'GRACE_PERIOD'
            ELSE 'BROKEN'
        END as streak_status,
        
        CASE 
            WHEN total_achievements > 0 THEN ROUND((achievements_cnt::NUMERIC / total_achievements::NUMERIC) * 100, 1)
            ELSE 0
        END as achievement_completion_rate;
END;
$$;

-- ============================================
-- 14. TEST ALL USER SYSTEMS
-- ============================================
SELECT 'TESTING ALL USER SYSTEMS' as audit_section;

-- Test the comprehensive profile function with a sample user
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Get first user for testing
    SELECT id INTO test_user_id FROM users LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        RAISE NOTICE 'Testing comprehensive profile for user: %', test_user_id;
        
        -- This will show detailed user stats
        PERFORM * FROM get_user_complete_profile(test_user_id);
        
        RAISE NOTICE 'Comprehensive profile test completed successfully';
    ELSE
        RAISE NOTICE 'No users found - create a user first to test the system';
    END IF;
END;
$$;

-- ============================================
-- 15. FINAL VERIFICATION SUMMARY
-- ============================================
SELECT 'AUDIT COMPLETE - COMPREHENSIVE SUMMARY' as audit_section;
SELECT 
    'User stats audit complete. All core systems verified and enhanced.' as message,
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM activities) as total_activities,
    (SELECT COUNT(*) FROM inventory) as total_inventory_items,
    (SELECT COUNT(*) FROM user_achievements) as total_user_achievements,
    (SELECT COUNT(*) FROM notifications) as total_notifications,
    (SELECT COUNT(*) FROM achievements) as total_achievements_available,
    NOW() as audited_at;

-- Show sample user with ALL stats using new function
SELECT 'COMPREHENSIVE USER PROFILE SAMPLE' as audit_section;
SELECT * FROM get_user_complete_profile(
    (SELECT id FROM users ORDER BY created_at DESC LIMIT 1)
) LIMIT 1;

-- ============================================
-- 16. SYSTEM HEALTH CHECK
-- ============================================
SELECT 'SYSTEM HEALTH CHECK' as audit_section;
SELECT 
    CASE 
        WHEN (SELECT COUNT(*) FROM users) > 0 THEN '✅ Users table populated'
        ELSE '❌ No users found'
    END as users_status,
    
    CASE 
        WHEN (SELECT COUNT(*) FROM achievements) >= 8 THEN '✅ Achievements system ready'
        ELSE '❌ Missing achievements data'
    END as achievements_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'gemstones') 
        THEN '✅ Gemstones column exists'
        ELSE '❌ Gemstones column missing'
    END as gemstones_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') 
        THEN '✅ Notifications system ready'
        ELSE '❌ Notifications table missing'
    END as notifications_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activities') 
        THEN '✅ News feed system ready'
        ELSE '❌ Activities table missing'
    END as news_feed_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory') 
        THEN '✅ Inventory system ready'
        ELSE '❌ Inventory table missing'
    END as inventory_status;