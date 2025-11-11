-- G-Brains Heist - Safe Database Migration Script
-- This script safely handles existing tables and adds missing components
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CHECK EXISTING TABLES
-- ============================================
SELECT 'EXISTING TABLES CHECK' as check_type;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- ============================================
-- 2. CREATE MISSING TABLES SAFELY
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- MCQ Questions table (referenced in RLS policies but missing)
CREATE TABLE IF NOT EXISTS mcq_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_text TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    wrong_answers TEXT[] NOT NULL,
    subject TEXT NOT NULL,
    grade TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    explanation TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attempts table (for MCQ question attempts)
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES mcq_questions(id) ON DELETE CASCADE,
    selected_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    time_taken_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Announcements table (for admin announcements)
CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    title TEXT,
    content TEXT,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'text'
    ) THEN
        ALTER TABLE announcements ADD COLUMN text TEXT;
        UPDATE announcements SET text = COALESCE(content, title, '');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'priority'
    ) THEN
        ALTER TABLE announcements ADD COLUMN priority TEXT DEFAULT 'normal';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'active'
    ) THEN
        ALTER TABLE announcements ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE announcements ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END;
$$;

-- Track announcement visibility per user
CREATE TABLE IF NOT EXISTS announcement_receipts (
    id BIGSERIAL PRIMARY KEY,
    announcement_id BIGINT REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (announcement_id, user_id)
);

-- RPC Event Log table (for debugging and monitoring)
CREATE TABLE IF NOT EXISTS rpc_event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name TEXT NOT NULL,
    log_level TEXT NOT NULL DEFAULT 'info' CHECK (log_level IN ('info', 'error')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    parameters JSONB,
    result JSONB,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Align legacy rpc_event_log definitions with new schema
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rpc_event_log'
          AND column_name = 'level'
    ) THEN
        ALTER TABLE rpc_event_log RENAME COLUMN level TO log_level;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rpc_event_log'
          AND column_name = 'log_level'
    ) THEN
        ALTER TABLE rpc_event_log ADD COLUMN log_level TEXT;
    END IF;

    -- Drop old check constraint if it exists so we can add the new one
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'rpc_event_log'
          AND constraint_name = 'rpc_event_log_level_check'
    ) THEN
        ALTER TABLE rpc_event_log DROP CONSTRAINT rpc_event_log_level_check;
    END IF;

    BEGIN
        ALTER TABLE rpc_event_log ADD CONSTRAINT rpc_event_log_log_level_check CHECK (log_level IN ('info', 'error'));
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    ALTER TABLE rpc_event_log
        ALTER COLUMN log_level SET DEFAULT 'info';

    UPDATE rpc_event_log
    SET log_level = COALESCE(log_level, 'info')
    WHERE log_level IS NULL;

    ALTER TABLE rpc_event_log
        ALTER COLUMN log_level SET NOT NULL;
END;
$$;

-- Ensure notifications type constraint includes all runtime notification kinds
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND constraint_name = 'notifications_type_check'
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
    END IF;

    BEGIN
        ALTER TABLE notifications
        ADD CONSTRAINT notifications_type_check CHECK (type IN (
            'attack_incoming', 'attack_defended', 'attack_success', 'attack_failed',
            'level_up', 'achievement_earned', 'coins_earned', 'coins_lost',
            'quest_completed', 'gemstone_earned', 'low_ap', 'ap_full',
            'challenge_received', 'clan_invite', 'revenge_available',
            'streak_danger', 'new_rival', 'leaderboard_change'
        ));
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END;
$$;

-- ============================================
-- 3. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- Add columns to users table if they don't exist
DO $$
BEGIN
    -- Add is_admin column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'is_admin') THEN
        ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_admin column to users table';
    END IF;
    
    -- Add is_banned column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'is_banned') THEN
        ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_banned column to users table';
    END IF;
    
    -- Add grade column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'grade') THEN
        ALTER TABLE users ADD COLUMN grade TEXT DEFAULT '8';
        RAISE NOTICE 'Added grade column to users table';
    END IF;
    
    -- Add admin_visible column if missing (for hidden admin accounts)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'admin_visible') THEN
        ALTER TABLE users ADD COLUMN admin_visible BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added admin_visible column to users table';
    END IF;
    
    -- Add email column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'email') THEN
        ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
        RAISE NOTICE 'Added email column to users table';
    END IF;
    
    -- Add username column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'username') THEN
        ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
        RAISE NOTICE 'Added username column to users table';
    END IF;
    
    -- Add created_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added created_at column to users table';
    END IF;
    
    -- Add updated_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to users table';
    END IF;
END;
$$;

-- ============================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- MCQ Questions indexes
CREATE INDEX IF NOT EXISTS idx_mcq_questions_grade ON mcq_questions(grade);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_subject ON mcq_questions(subject);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_active ON mcq_questions(active);

-- Attempts indexes
CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at DESC);

-- Announcements indexes
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active);
CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_receipts_user ON announcement_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_receipts_announcement ON announcement_receipts(announcement_id);

-- RPC Event Log indexes
CREATE INDEX IF NOT EXISTS idx_rpc_event_log_function_name ON rpc_event_log(function_name);
CREATE INDEX IF NOT EXISTS idx_rpc_event_log_user_id ON rpc_event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_rpc_event_log_created_at ON rpc_event_log(created_at DESC);

-- Users table additional indexes
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- 5. ENABLE ROW LEVEL SECURITY ON NEW TABLES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE mcq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpc_event_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. CREATE SAFE RLS POLICIES (ONLY FOR NEW TABLES)
-- ============================================

-- MCQ Questions Policies
DROP POLICY IF EXISTS "Students view grade questions" ON mcq_questions;
CREATE POLICY "Students view grade questions"
    ON mcq_questions FOR SELECT
    USING (
        active = true
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.grade = mcq_questions.grade
              AND COALESCE(u.is_banned, false) = false
        )
    );

DROP POLICY IF EXISTS "Admins manage questions" ON mcq_questions;
CREATE POLICY "Admins manage questions"
    ON mcq_questions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

DROP POLICY IF EXISTS "Students view own attempts" ON attempts;
CREATE POLICY "Students view own attempts"
    ON attempts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Students insert own attempts" ON attempts;
CREATE POLICY "Students insert own attempts"
    ON attempts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view attempts" ON attempts;
CREATE POLICY "Admins view attempts"
    ON attempts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

-- Announcements Policies
DROP POLICY IF EXISTS "Announcements are public" ON announcements;
CREATE POLICY "Announcements are public"
    ON announcements FOR SELECT
    USING (active = true);

-- Announcement receipt policies
DROP POLICY IF EXISTS "Players view own receipts" ON announcement_receipts;
DROP POLICY IF EXISTS "Players acknowledge announcements" ON announcement_receipts;
DROP POLICY IF EXISTS "Players update receipt timestamp" ON announcement_receipts;

CREATE POLICY "Players view own receipts"
    ON announcement_receipts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Players acknowledge announcements"
    ON announcement_receipts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players update receipt timestamp"
    ON announcement_receipts FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins create announcements" ON announcements;
CREATE POLICY "Admins create announcements"
    ON announcements FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

DROP POLICY IF EXISTS "Admins manage announcements" ON announcements;
CREATE POLICY "Admins manage announcements"
    ON announcements FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

-- RPC Event Log Policies
DROP POLICY IF EXISTS "Admins read rpc logs" ON rpc_event_log;
CREATE POLICY "Admins read rpc logs"
    ON rpc_event_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

DROP POLICY IF EXISTS "System insert rpc logs" ON rpc_event_log;
CREATE POLICY "System insert rpc logs"
    ON rpc_event_log FOR INSERT
    WITH CHECK (true); -- Allow system to log RPC calls

-- ============================================
-- 7. CREATE SAMPLE DATA FOR TESTING
-- ============================================

-- Insert sample MCQ questions if table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mcq_questions LIMIT 1) THEN
        INSERT INTO mcq_questions (question_text, correct_answer, wrong_answers, subject, grade, difficulty, explanation) VALUES
        ('What is the capital of Kyrgyzstan?', 'Bishkek', ARRAY['Osh', 'Jalal-Abad', 'Karakol'], 'Geography', '8', 'easy', 'Bishkek is the capital and largest city of Kyrgyzstan.'),
        ('Which mountain range runs through Kyrgyzstan?', 'Tian Shan', ARRAY['Himalayas', 'Andes', 'Alps'], 'Geography', '8', 'medium', 'The Tian Shan mountain range covers most of Kyrgyzstan.'),
        ('What is 15 + 27?', '42', ARRAY['41', '43', '40'], 'Mathematics', '8', 'easy', 'Simple addition: 15 + 27 = 42');
        
        RAISE NOTICE 'Inserted sample MCQ questions';
    END IF;
END;
$$;

-- Insert sample announcement if table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM announcements LIMIT 1) THEN
        INSERT INTO announcements (title, content, priority, created_by) VALUES
        ('Welcome to G-Brains Heist!', 'Complete quests, attack rivals, and climb the leaderboards. Good luck!', 'high', NULL);
        
        RAISE NOTICE 'Inserted welcome announcement';
    END IF;
END;
$$;

-- ============================================
-- 8. VERIFICATION AND STATUS CHECK
-- ============================================

-- Check all tables now exist
SELECT 'FINAL TABLE CHECK' as check_type;
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('users', 'inventory', 'activities', 'clans', 'clan_members', 'clan_chat') THEN 'EXISTING'
        WHEN table_name IN ('mcq_questions', 'attempts', 'announcements', 'rpc_event_log') THEN 'NEWLY_CREATED'
        WHEN table_name IN ('notifications', 'tournaments', 'teachers', 'achievements') THEN 'FROM_MIGRATION'
        ELSE 'OTHER'
    END as table_status
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_status, table_name;

-- Check RLS policies
SELECT 'RLS POLICIES CHECK' as check_type;
SELECT 
    tablename,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Check new columns in users table
SELECT 'NEW USER COLUMNS CHECK' as check_type;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('is_admin', 'is_banned', 'grade', 'admin_visible', 'email', 'username')
ORDER BY column_name;

-- Summary
SELECT 'MIGRATION SUMMARY' as check_type;
SELECT 
    'Safe database migration completed successfully!' as message,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as total_tables,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') as total_policies,
    NOW() as completed_at;

-- ============================================
-- 9. NEXT STEPS INSTRUCTIONS
-- ============================================

SELECT 'NEXT STEPS' as instruction_type;
SELECT 'Database migration completed. You can now:
1. Run the enhanced bot system script (ENHANCED_BOT_SYSTEM.sql)
2. Run the main tournament/teacher/achievement migration (CLEAN_SUPABASE_MIGRATION.sql)
3. Test all new features
4. Deploy to production' as instructions;