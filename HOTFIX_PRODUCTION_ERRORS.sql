-- ==============================================================================
-- G-BRAIN HEIST: HOTFIX FOR PRODUCTION ERRORS
-- ==============================================================================
-- Run this in Supabase SQL Editor to fix:
-- 1. rpc_event_log missing context column
-- 2. AP regeneration COALESCE type error
-- 3. Leaderboard integer parse errors
-- 4. Task completion tracking
-- ==============================================================================

-- ============================================
-- 1. FIX RPC_EVENT_LOG SCHEMA
-- ============================================

-- Add missing context column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'rpc_event_log' 
        AND column_name = 'context'
    ) THEN
        ALTER TABLE rpc_event_log ADD COLUMN context JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Added context column to rpc_event_log';
    END IF;
END;
$$;

-- Rename message column if it exists (conflicting name), skip if error_message already exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'rpc_event_log' 
        AND column_name = 'message'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'rpc_event_log' 
        AND column_name = 'error_message'
    ) THEN
        ALTER TABLE rpc_event_log RENAME COLUMN message TO error_message;
        RAISE NOTICE 'Renamed message to error_message in rpc_event_log';
    END IF;
END;
$$;

-- ============================================
-- 2. FIX AP REGENERATION FUNCTION
-- ============================================

-- Drop and recreate with proper type casting
DROP FUNCTION IF EXISTS regenerate_user_ap(uuid) CASCADE;

CREATE OR REPLACE FUNCTION regenerate_user_ap(user_id_param UUID)
RETURNS TABLE (
    user_id UUID,
    old_ap INTEGER,
    new_ap INTEGER,
    ap_regenerated INTEGER,
    minutes_elapsed NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_time TIMESTAMPTZ := NOW();
    user_record RECORD;
    minutes_since_update NUMERIC;
    ap_to_add INTEGER;
    new_ap_value INTEGER;
BEGIN
    -- Get user data with row lock
    SELECT id, ap_now, ap_max, last_ap_update
    INTO user_record
    FROM users
    WHERE id = user_id_param
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Calculate minutes since last update (handle NULL safely)
    IF user_record.last_ap_update IS NULL THEN
        minutes_since_update := 0;
    ELSE
        minutes_since_update := EXTRACT(EPOCH FROM (current_time - user_record.last_ap_update)) / 60.0;
    END IF;
    
    -- Calculate AP to add (1 AP per 10 minutes)
    ap_to_add := FLOOR(minutes_since_update / 10.0)::INTEGER;
    
    -- Calculate new AP (capped at max)
    new_ap_value := LEAST(user_record.ap_now + ap_to_add, user_record.ap_max);
    
    -- Only update if AP changed
    IF new_ap_value != user_record.ap_now THEN
        UPDATE users 
        SET ap_now = new_ap_value, last_ap_update = current_time
        WHERE id = user_id_param;
    END IF;

    -- Log the regeneration (with error handling in case columns don't exist)
    BEGIN
        INSERT INTO rpc_event_log (function_name, log_level, user_id, parameters, result, context)
        VALUES (
            'regenerate_user_ap',
            'info',
            user_id_param,
            jsonb_build_object('user_id', user_id_param),
            jsonb_build_object(
                'old_ap', user_record.ap_now,
                'new_ap', new_ap_value,
                'ap_regenerated', new_ap_value - user_record.ap_now
            ),
            jsonb_build_object(
                'minutes_elapsed', minutes_since_update,
                'timestamp', current_time
            )
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;  -- Silently fail logging if table schema issues
    END;

    -- Return results
    RETURN QUERY SELECT 
        user_record.id,
        user_record.ap_now,
        new_ap_value,
        (new_ap_value - user_record.ap_now),
        minutes_since_update;
END;
$$;

-- ============================================
-- 3. FIX ANNOUNCEMENTS RPC FUNCTIONS
-- ============================================

-- Drop old announcement functions
DROP FUNCTION IF EXISTS rpc_announcement_next() CASCADE;
DROP FUNCTION IF EXISTS rpc_announcement_post(text) CASCADE;
DROP FUNCTION IF EXISTS rpc_announcement_post(text, text) CASCADE;
DROP FUNCTION IF EXISTS rpc_announcement_mark_seen(bigint) CASCADE;
DROP FUNCTION IF EXISTS rpc_announcement_mark_seen(uuid) CASCADE;

-- Create announcement_next function
CREATE OR REPLACE FUNCTION rpc_announcement_next()
RETURNS TABLE (
    id BIGINT,
    text TEXT,
    title TEXT,
    priority TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID := auth.uid();
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Log the call (with error handling)
    BEGIN
        INSERT INTO rpc_event_log (function_name, log_level, user_id, context)
        VALUES ('rpc_announcement_next', 'info', current_user_id, jsonb_build_object('action', 'fetch_next'));
    EXCEPTION WHEN OTHERS THEN
        NULL;  -- Silently fail logging if table schema issues
    END;

    -- Return next unseen announcement
    RETURN QUERY
    SELECT 
        a.id,
        a.text,
        a.title,
        a.priority,
        a.created_at,
        a.expires_at
    FROM announcements a
    WHERE a.active = true
    AND (a.expires_at IS NULL OR a.expires_at > NOW())
    AND NOT EXISTS (
        SELECT 1 FROM announcement_receipts ar
        WHERE ar.announcement_id = a.id
        AND ar.user_id = current_user_id
    )
    ORDER BY a.created_at DESC
    LIMIT 1;
END;
$$;

-- Create announcement_post function
CREATE OR REPLACE FUNCTION rpc_announcement_post(
    p_text TEXT,
    p_priority TEXT DEFAULT 'normal',
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS announcements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    new_announcement announcements;
    is_admin BOOLEAN;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check admin status
    SELECT u.is_admin INTO is_admin FROM users u WHERE u.id = current_user_id;
    IF is_admin IS NULL OR is_admin = false THEN
        RAISE EXCEPTION 'Only admins can post announcements';
    END IF;

    -- Insert announcement
    INSERT INTO announcements (text, priority, created_by, active, expires_at)
    VALUES (p_text, p_priority, current_user_id, true, p_expires_at)
    RETURNING * INTO new_announcement;

    -- Log (with error handling)
    BEGIN
        INSERT INTO rpc_event_log (function_name, log_level, user_id, parameters, context)
        VALUES (
            'rpc_announcement_post',
            'info',
            current_user_id,
            jsonb_build_object('text', p_text, 'priority', p_priority, 'expires_at', p_expires_at),
            jsonb_build_object('announcement_id', new_announcement.id)
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;  -- Silently fail logging if table schema issues
    END;

    RETURN new_announcement;
END;
$$;

-- Create announcement_mark_seen function
CREATE OR REPLACE FUNCTION rpc_announcement_mark_seen(p_announcement_id BIGINT)
RETURNS announcement_receipts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    receipt announcement_receipts;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Insert or update receipt
    INSERT INTO announcement_receipts (announcement_id, user_id, seen_at)
    VALUES (p_announcement_id, current_user_id, NOW())
    ON CONFLICT (announcement_id, user_id) 
    DO UPDATE SET seen_at = NOW()
    RETURNING * INTO receipt;

    -- Log (with error handling)
    BEGIN
        INSERT INTO rpc_event_log (function_name, log_level, user_id, parameters, context)
        VALUES (
            'rpc_announcement_mark_seen',
            'info',
            current_user_id,
            jsonb_build_object('announcement_id', p_announcement_id),
            jsonb_build_object('timestamp', NOW())
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;  -- Silently fail logging if table schema issues
    END;

    RETURN receipt;
END;
$$;

-- ============================================
-- 4. FIX LEADERBOARD QUERIES (TYPE CASTING)
-- ============================================

-- Ensure xp column is properly typed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'xp'
        AND data_type != 'integer'
    ) THEN
        ALTER TABLE users ALTER COLUMN xp TYPE INTEGER USING COALESCE(xp, 0)::INTEGER;
        RAISE NOTICE 'Fixed xp column type in users table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'coins'
        AND data_type != 'integer'
    ) THEN
        ALTER TABLE users ALTER COLUMN coins TYPE INTEGER USING COALESCE(coins, 0)::INTEGER;
        RAISE NOTICE 'Fixed coins column type in users table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'level'
        AND data_type != 'integer'
    ) THEN
        ALTER TABLE users ALTER COLUMN level TYPE INTEGER USING COALESCE(level, 1)::INTEGER;
        RAISE NOTICE 'Fixed level column type in users table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'pvp_wins'
        AND data_type != 'integer'
    ) THEN
        ALTER TABLE users ALTER COLUMN pvp_wins TYPE INTEGER USING COALESCE(pvp_wins, 0)::INTEGER;
        RAISE NOTICE 'Fixed pvp_wins column type in users table';
    END IF;
END;
$$;

-- ============================================
-- 5. FIX TASK COMPLETION TRACKING
-- ============================================

-- Ensure tasks table has required columns
CREATE TABLE IF NOT EXISTS task_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    target INTEGER DEFAULT 1,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_progress_user ON task_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_completed ON task_progress(user_id, completed);

-- ============================================
-- 6. AVATAR UPLOAD SUPPORT
-- ============================================

-- Ensure users table has avatar_url column with proper size
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'avatar_url'
    ) THEN
        ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT '';
        RAISE NOTICE 'Added avatar_url column to users table';
    END IF;
END;
$$;

-- ============================================
-- 7. VERIFICATION
-- ============================================

SELECT 'HOTFIX VERIFICATION' as check_type;

-- Check rpc_event_log columns
SELECT 'RPC Event Log Columns' as check;
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'rpc_event_log'
ORDER BY ordinal_position;

-- Check users table numeric columns
SELECT 'Users Table Numeric Columns' as check;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('xp', 'coins', 'level', 'pvp_wins')
ORDER BY column_name;

-- Check functions exist
SELECT 'RPC Functions' as check;
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('regenerate_user_ap', 'rpc_announcement_next', 'rpc_announcement_post', 'rpc_announcement_mark_seen')
ORDER BY routine_name;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Hotfix completed successfully!';
    RAISE NOTICE '🔧 Fixed: rpc_event_log schema, AP regeneration, announcements, leaderboard types';
    RAISE NOTICE '📝 Added: task_progress tracking, avatar_url support';
    RAISE NOTICE '🚀 Ready to test!';
END;
$$;
