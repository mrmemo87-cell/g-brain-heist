-- G-Brains Heist Complete Database Migration
-- Run this entire script in Supabase SQL Editor
-- Estimated execution time: 2-3 minutes

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Check and add missing columns to existing tables
DO $$
BEGIN
    -- Add role column to users table if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin'));
    END IF;
    
    -- Add tutorial_completed column to users table if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'tutorial_completed') THEN
        ALTER TABLE users ADD COLUMN tutorial_completed BOOLEAN DEFAULT false;
    END IF;
    
    -- Add gemstones column to users table if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'gemstones') THEN
        ALTER TABLE users ADD COLUMN gemstones INTEGER DEFAULT 0;
    END IF;
    
    -- Add last_attacked_at column to users table if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_attacked_at') THEN
        ALTER TABLE users ADD COLUMN last_attacked_at TIMESTAMPTZ;
    END IF;
END $$;

-- 1. NOTIFICATIONS SYSTEM
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'attack_incoming', 'attack_defended', 'attack_success', 'attack_failed',
    'level_up', 'achievement_earned', 'coins_earned', 'coins_lost',
    'quest_completed', 'low_ap', 'ap_full', 'challenge_received',
    'clan_invite', 'revenge_available', 'streak_danger', 'new_rival',
    'leaderboard_change'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(user_id, priority, read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert_system" ON notifications;
CREATE POLICY "notifications_insert_system" ON notifications FOR INSERT WITH CHECK (true);

-- 2. TOURNAMENT SYSTEM
CREATE TABLE IF NOT EXISTS tournament_seasons (
  id uuid primary key default gen_random_uuid(),
  slug text generated always as (lower(replace(name, ' ', '-'))) stored,
  name text not null,
  description text,
  registration_opens timestamptz,
  registration_closes timestamptz,
  start_date timestamptz,
  end_date timestamptz,
  status text not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS tournament_school_signups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references tournament_seasons(id) on delete cascade,
  school_name text not null,
  school_code text not null,
  contact_name text,
  contact_email text,
  notes text,
  status text not null default 'pending',
  roster jsonb default '[]'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  unique (season_id, school_code)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references tournament_seasons(id) on delete cascade,
  round_number integer not null,
  match_number integer not null,
  team_a_id uuid references tournament_school_signups(id) on delete set null,
  team_b_id uuid references tournament_school_signups(id) on delete set null,
  scheduled_at timestamptz,
  location text,
  stream_url text,
  status text not null default 'pending',
  winner_id uuid references tournament_school_signups(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  unique (season_id, round_number, match_number)
);

CREATE INDEX IF NOT EXISTS idx_tournament_school_signups_season ON tournament_school_signups (season_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_season_round ON tournament_matches (season_id, round_number);

CREATE OR REPLACE VIEW tournament_public_bracket AS
  SELECT
    m.id as match_id,
    m.season_id,
    s.name as season_name,
    m.round_number,
    m.match_number,
    m.scheduled_at,
    m.location,
    m.stream_url,
    m.status,
    m.winner_id,
    m.metadata,
    team_a.school_name as team_a_name,
    team_a.school_code as team_a_code,
    team_b.school_name as team_b_name,
    team_b.school_code as team_b_code
  FROM tournament_matches m
  LEFT JOIN tournament_school_signups team_a ON team_a.id = m.team_a_id
  LEFT JOIN tournament_school_signups team_b ON team_b.id = m.team_b_id
  LEFT JOIN tournament_seasons s ON s.id = m.season_id;

ALTER TABLE tournament_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_school_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tournament_seasons_select_all" ON tournament_seasons;
CREATE POLICY "tournament_seasons_select_all" ON tournament_seasons FOR SELECT USING (true);

DROP POLICY IF EXISTS "tournament_signups_select_all" ON tournament_school_signups;
CREATE POLICY "tournament_signups_select_all" ON tournament_school_signups FOR SELECT USING (true);

DROP POLICY IF EXISTS "tournament_matches_select_all" ON tournament_matches;
CREATE POLICY "tournament_matches_select_all" ON tournament_matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "tournament_seasons_admin_only" ON tournament_seasons;
CREATE POLICY "tournament_seasons_admin_only" ON tournament_seasons FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

DROP POLICY IF EXISTS "tournament_signups_insert_all" ON tournament_school_signups;
CREATE POLICY "tournament_signups_insert_all" ON tournament_school_signups FOR INSERT WITH CHECK (true);

-- 3. TEACHER SYSTEM
CREATE TABLE IF NOT EXISTS teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    school_name TEXT,
    subject_specializations TEXT[] DEFAULT '{}',
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question_text TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    wrong_answers TEXT[] NOT NULL,
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES teacher_questions(id) ON DELETE CASCADE,
    selected_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    time_taken_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_questions_teacher_id ON teacher_questions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_questions_subject ON teacher_questions(subject);
CREATE INDEX IF NOT EXISTS idx_question_attempts_student_id ON question_attempts(student_id);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teachers_select_own" ON teachers;
CREATE POLICY "teachers_select_own" ON teachers FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "teachers_insert_own" ON teachers;
CREATE POLICY "teachers_insert_own" ON teachers FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "teachers_update_own" ON teachers;
CREATE POLICY "teachers_update_own" ON teachers FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "teacher_questions_teacher_access" ON teacher_questions;
CREATE POLICY "teacher_questions_teacher_access" ON teacher_questions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM teachers 
    WHERE teachers.id = teacher_questions.teacher_id 
    AND teachers.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "teacher_questions_student_read" ON teacher_questions;
CREATE POLICY "teacher_questions_student_read" ON teacher_questions FOR SELECT USING (true);

DROP POLICY IF EXISTS "question_attempts_student_own" ON question_attempts;
CREATE POLICY "question_attempts_student_own" ON question_attempts FOR ALL USING (auth.uid() = student_id);

-- 4. ACHIEVEMENT SYSTEM
-- Drop existing achievements table if it has wrong structure
DO $$
BEGIN
    -- Check if achievements table exists with UUID id (wrong type)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'achievements' AND column_name = 'id' AND data_type = 'uuid') THEN
        -- Drop the table if it has wrong id type and recreate
        DROP TABLE IF EXISTS user_achievements CASCADE;
        DROP TABLE IF EXISTS achievements CASCADE;
        RAISE NOTICE 'Dropped existing achievements tables with wrong structure';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to achievements table if they don't exist
DO $$
BEGIN
    -- Ensure all required columns exist in achievements table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'achievements' AND column_name = 'name') THEN
        ALTER TABLE achievements ADD COLUMN name TEXT NOT NULL DEFAULT 'Unknown Achievement';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'achievements' AND column_name = 'description') THEN
        ALTER TABLE achievements ADD COLUMN description TEXT NOT NULL DEFAULT 'Achievement description';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'achievements' AND column_name = 'icon') THEN
        ALTER TABLE achievements ADD COLUMN icon TEXT NOT NULL DEFAULT '🏆';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'achievements' AND column_name = 'category') THEN
        ALTER TABLE achievements ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'achievements' AND column_name = 'points') THEN
        ALTER TABLE achievements ADD COLUMN points INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'achievements' AND column_name = 'rarity') THEN
        ALTER TABLE achievements ADD COLUMN rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'achievements' AND column_name = 'created_at') THEN
        ALTER TABLE achievements ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT REFERENCES achievements(id) ON DELETE CASCADE,
    progress INTEGER DEFAULT 0,
    target INTEGER NOT NULL,
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- Add missing columns to user_achievements if they don't exist
DO $$
BEGIN
    -- Add unlocked_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_achievements' AND column_name = 'unlocked_at') THEN
        ALTER TABLE user_achievements ADD COLUMN unlocked_at TIMESTAMPTZ;
    END IF;
    
    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_achievements' AND column_name = 'updated_at') THEN
        ALTER TABLE user_achievements ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked ON user_achievements(user_id, unlocked_at);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievements_select_all" ON achievements;
CREATE POLICY "achievements_select_all" ON achievements FOR SELECT USING (true);

DROP POLICY IF EXISTS "user_achievements_select_own" ON user_achievements;
CREATE POLICY "user_achievements_select_own" ON user_achievements FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_achievements_insert_own" ON user_achievements;
CREATE POLICY "user_achievements_insert_own" ON user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_achievements_update_own" ON user_achievements;
CREATE POLICY "user_achievements_update_own" ON user_achievements FOR UPDATE USING (auth.uid() = user_id);

-- Insert default achievements safely
DO $$
BEGIN
    -- Check if achievements table exists and has correct TEXT id column before inserting
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'achievements') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'achievements' AND column_name = 'name')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'achievements' AND column_name = 'id' AND data_type = 'text') THEN
        
        INSERT INTO achievements (id, name, description, icon, category, points, rarity) VALUES
        ('first_login', 'Welcome Hacker', 'Complete your first login', '👋', 'getting_started', 10, 'common'),
        ('level_5', 'Rising Star', 'Reach level 5', '⭐', 'progression', 25, 'common'),
        ('level_10', 'Cyber Warrior', 'Reach level 10', '⚔️', 'progression', 50, 'rare'),
        ('first_pvp_win', 'First Blood', 'Win your first PvP battle', '🩸', 'pvp', 30, 'common'),
        ('pvp_10_wins', 'Dominator', 'Win 10 PvP battles', '👑', 'pvp', 100, 'rare'),
        ('streak_7', 'Week Warrior', 'Maintain a 7-day streak', '🔥', 'consistency', 75, 'rare'),
        ('coins_1000', 'Crypto Collector', 'Earn 1000 coins', '💰', 'wealth', 40, 'common'),
        ('quest_master', 'Quest Master', 'Complete 50 quests', '🎯', 'quests', 80, 'epic')
        ON CONFLICT (id) DO UPDATE SET 
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            category = EXCLUDED.category,
            points = EXCLUDED.points,
            rarity = EXCLUDED.rarity;
            
        RAISE NOTICE 'Successfully inserted achievement data';
    ELSE
        RAISE NOTICE 'Achievements table not ready for data insertion - wrong id type or missing columns';
    END IF;
END $$;

-- 5. CORE RPC FUNCTIONS

-- Drop existing functions that might have different signatures or conflict
DROP FUNCTION IF EXISTS create_teacher_profile(text,text[],text);
DROP FUNCTION IF EXISTS create_teacher_profile(text);
DROP FUNCTION IF EXISTS create_teacher_profile();
DROP FUNCTION IF EXISTS record_question_attempt(uuid,text,integer);
DROP FUNCTION IF EXISTS record_question_attempt(uuid,text);
DROP FUNCTION IF EXISTS approve_tournament_signup(uuid);
DROP FUNCTION IF EXISTS regenerate_user_ap(uuid);
DROP FUNCTION IF EXISTS notify_ap_full(uuid);
DROP FUNCTION IF EXISTS notify_level_up(uuid,integer,integer,integer);
DROP FUNCTION IF EXISTS notify_attack_incoming(uuid,text);

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
    SELECT id, ap_now, ap_max, last_ap_update
    INTO user_record
    FROM users
    WHERE id = user_id_param
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    minutes_since_update := EXTRACT(EPOCH FROM (current_time - COALESCE(user_record.last_ap_update, current_time))) / 60.0;
    ap_to_add := FLOOR(minutes_since_update / 10.0)::INTEGER;
    new_ap_value := LEAST(user_record.ap_now + ap_to_add, user_record.ap_max);
    
    IF new_ap_value != user_record.ap_now THEN
        UPDATE users 
        SET ap_now = new_ap_value, last_ap_update = current_time
        WHERE id = user_id_param;
    END IF;

    RETURN QUERY SELECT 
        user_record.id,
        user_record.ap_now,
        new_ap_value,
        (new_ap_value - user_record.ap_now),
        minutes_since_update;
END;
$$;

CREATE OR REPLACE FUNCTION approve_tournament_signup(signup_id uuid)
RETURNS tournament_school_signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated tournament_school_signups;
BEGIN
  UPDATE tournament_school_signups
    SET status = 'approved'
  WHERE id = signup_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION create_teacher_profile(
    p_school_name TEXT DEFAULT NULL,
    p_subject_specializations TEXT[] DEFAULT '{}',
    p_bio TEXT DEFAULT NULL
)
RETURNS teachers
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_teacher teachers;
    current_user_id UUID := auth.uid();
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO new_teacher FROM teachers WHERE user_id = current_user_id;
    IF FOUND THEN
        RETURN new_teacher;
    END IF;

    INSERT INTO teachers (user_id, school_name, subject_specializations, bio)
    VALUES (current_user_id, p_school_name, p_subject_specializations, p_bio)
    RETURNING * INTO new_teacher;

    RETURN new_teacher;
END;
$$;

CREATE OR REPLACE FUNCTION record_question_attempt(
    p_question_id UUID,
    p_selected_answer TEXT,
    p_time_taken_seconds INTEGER DEFAULT NULL
)
RETURNS question_attempts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    attempt_record question_attempts;
    question_record teacher_questions;
    current_user_id UUID := auth.uid();
    is_answer_correct BOOLEAN;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO question_record FROM teacher_questions WHERE id = p_question_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Question not found';
    END IF;

    is_answer_correct := (p_selected_answer = question_record.correct_answer);

    INSERT INTO question_attempts (
        student_id, 
        question_id, 
        selected_answer, 
        is_correct, 
        time_taken_seconds
    )
    VALUES (
        current_user_id, 
        p_question_id, 
        p_selected_answer, 
        is_answer_correct, 
        p_time_taken_seconds
    )
    RETURNING * INTO attempt_record;

    RETURN attempt_record;
END;
$$;

-- 6. NOTIFICATION RPC FUNCTIONS
CREATE OR REPLACE FUNCTION notify_ap_full(user_id_param UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO notifications (user_id, type, title, message, priority)
    VALUES (
        user_id_param,
        'ap_full',
        '⚡ AP Fully Charged!',
        'Your Action Points are at maximum capacity. Time to hack!',
        'medium'
    );
END;
$$;

CREATE OR REPLACE FUNCTION notify_level_up(
    user_id_param UUID,
    new_level INTEGER,
    rewards_xp INTEGER,
    rewards_coins INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO notifications (user_id, type, title, message, priority, data)
    VALUES (
        user_id_param,
        'level_up',
        '🎉 Level Up!',
        'Congratulations! You reached level ' || new_level || '!',
        'high',
        jsonb_build_object(
            'level', new_level,
            'xp_reward', rewards_xp,
            'coins_reward', rewards_coins
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION notify_attack_incoming(
    user_id_param UUID,
    attacker_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO notifications (user_id, type, title, message, priority)
    VALUES (
        user_id_param,
        'attack_incoming',
        '⚔️ Under Attack!',
        attacker_name || ' is trying to hack you!',
        'urgent'
    );
END;
$$;

-- 7. TRIGGERS & AUTOMATION
CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS _tournament_seasons_updated_at ON tournament_seasons;
CREATE TRIGGER _tournament_seasons_updated_at
  BEFORE UPDATE ON tournament_seasons
  FOR EACH ROW
  EXECUTE FUNCTION set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS _teachers_updated_at ON teachers;
CREATE TRIGGER _teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW
  EXECUTE FUNCTION set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS _teacher_questions_updated_at ON teacher_questions;
CREATE TRIGGER _teacher_questions_updated_at
  BEFORE UPDATE ON teacher_questions
  FOR EACH ROW
  EXECUTE FUNCTION set_current_timestamp_updated_at();

-- FINALIZATION
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE 'G-Brains Heist database migration completed successfully!';
    RAISE NOTICE 'Added: Tournaments, Notifications, Teachers, Achievements';
    RAISE NOTICE 'Added: All RPC functions and security policies';
    RAISE NOTICE 'Applied: Row Level Security to all new tables';
    RAISE NOTICE 'Your database is now fully operational!';
END;
$$;