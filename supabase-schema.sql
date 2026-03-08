-- ============================================
-- G-Brains Heist - Supabase Database Schema
-- ============================================
-- Run this in Supabase SQL Editor to create all tables
-- Execution time: ~30 seconds

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    grade SMALLINT CHECK (grade IS NULL OR (grade >= 6 AND grade <= 12)),
    batch TEXT CHECK (batch IS NULL OR batch IN (
        '6A', '6B', '6C',
        '7A', '7B', '7C',
        '8A', '8B', '8C',
        '9A', '9B', '9C',
        '10A', '10B', '10C',
        '11A', '11B', '11C',
        '12A', '12B', '12C',
        'N/A'
    )),
    avatar_url TEXT,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    ap_now INTEGER DEFAULT 18,
    ap_max INTEGER DEFAULT 20,
    last_ap_update TIMESTAMPTZ DEFAULT NOW(),
    attack_power INTEGER DEFAULT 10,
    defense_power INTEGER DEFAULT 10,
    is_admin BOOLEAN DEFAULT false,
    is_banned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_batch ON users(batch);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);

-- ============================================
-- PROFILES VIEW (Phase 1 Competition)
-- ============================================
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
FROM users;

-- ============================================
-- MCQ QUESTIONS (Silk Road Event)
-- ============================================
CREATE TABLE IF NOT EXISTS mcq_questions (
    id BIGSERIAL PRIMARY KEY,
    subject TEXT,
    grade SMALLINT NOT NULL CHECK (grade IN (8, 9)),
    difficulty TEXT CHECK (difficulty IN ('easy', 'med', 'hard')),
    stem TEXT NOT NULL,
    opt1 TEXT NOT NULL,
    opt2 TEXT NOT NULL,
    opt3 TEXT NOT NULL,
    opt4 TEXT NOT NULL,
    correct SMALLINT NOT NULL CHECK (correct BETWEEN 1 AND 4),
    lang TEXT DEFAULT 'ru',
    reward_xp INTEGER DEFAULT 20,
    reward_coins INTEGER DEFAULT 10,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcq_questions_grade ON mcq_questions(grade);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_active ON mcq_questions(active);

-- ============================================
-- ATTEMPTS TABLE (Quiz Attempts)
-- ============================================
CREATE TABLE IF NOT EXISTS attempts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    question_id BIGINT REFERENCES mcq_questions(id) ON DELETE CASCADE,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);

-- ============================================
-- ANNOUNCEMENTS TABLE (Broadcasts)
-- ============================================
CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);

-- Track which users have seen each announcement
CREATE TABLE IF NOT EXISTS announcement_receipts (
    id BIGSERIAL PRIMARY KEY,
    announcement_id BIGINT REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_receipts_user ON announcement_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_receipts_announcement ON announcement_receipts(announcement_id);

-- ============================================
-- RPC EVENT LOG (Telemetry)
-- ============================================
CREATE TABLE IF NOT EXISTS rpc_event_log (
    id BIGSERIAL PRIMARY KEY,
    function_name TEXT NOT NULL,
    log_level TEXT NOT NULL CHECK (log_level IN ('info', 'error')),
    message TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure legacy installations have the new log_level column
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

    -- Drop legacy constraint if present and re-add with the correct name
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
END;
$$;

ALTER TABLE rpc_event_log
    ALTER COLUMN log_level SET DEFAULT 'info';

UPDATE rpc_event_log
SET log_level = COALESCE(log_level, 'info')
WHERE log_level IS NULL;

ALTER TABLE rpc_event_log
    ALTER COLUMN log_level SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rpc_event_log_level ON rpc_event_log(log_level, created_at DESC);

-- ============================================
-- INVENTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    state TEXT DEFAULT 'unused' CHECK (state IN ('unused', 'active', 'consumed')),
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    description TEXT,
    effect_summary TEXT,
    attack_bonus INTEGER DEFAULT 0,
    defense_bonus INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_state ON inventory(state);

-- ============================================
-- CLANS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    notice TEXT,
    vault_coins INTEGER DEFAULT 0,
    leader_id UUID REFERENCES users(id) ON DELETE CASCADE,
    member_count INTEGER DEFAULT 1,
    member_limit INTEGER NOT NULL DEFAULT 5,
    extra_member_slots_purchased INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clans_name ON clans(name);
CREATE INDEX IF NOT EXISTS idx_clans_leader_id ON clans(leader_id);

-- ============================================
-- CLAN MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clan_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_id UUID REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'moderator', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clan_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_members_clan_id ON clan_members(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_user_id ON clan_members(user_id);

-- ============================================
-- CLAN JOIN REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clan_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_id UUID REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clan_join_requests_clan_id ON clan_join_requests(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_join_requests_pending ON clan_join_requests(clan_id, status);

-- ============================================
-- CLAN CHAT TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clan_chat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_id UUID REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clan_chat_clan_id ON clan_chat(clan_id, created_at DESC);

-- ============================================
-- ACTIVITIES TABLE (News Feed)
-- ============================================
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    actor_username TEXT NOT NULL,
    target_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_username TEXT,
    data JSONB DEFAULT '{}',
    reactions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_actor_id ON activities(actor_id);

-- ============================================
-- ACTIVITY REACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS activity_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_activity_id ON activity_reactions(activity_id);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('daily', 'weekly')),
    task_type TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    target INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_expires_at ON tasks(expires_at);

-- ============================================
-- SHOP PURCHASES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shop_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    total_cost INTEGER NOT NULL,
    purchase_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_user_date ON shop_purchases(user_id, purchase_date);

-- ============================================
-- SESSIONS TABLE (for XP boosters)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    multiplier NUMERIC DEFAULT 1.0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    today_used BOOLEAN DEFAULT false,
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ============================================
-- CAPS TABLE (daily/weekly limits)
-- ============================================
CREATE TABLE IF NOT EXISTS caps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    xp_daily_earned INTEGER DEFAULT 0,
    coins_daily_earned INTEGER DEFAULT 0,
    xp_weekly_earned INTEGER DEFAULT 0,
    coins_weekly_earned INTEGER DEFAULT 0,
    daily_reset_at DATE DEFAULT CURRENT_DATE,
    weekly_reset_at DATE DEFAULT CURRENT_DATE,
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_caps_user_id ON caps(user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS clans_updated_at ON clans;
CREATE TRIGGER clans_updated_at
    BEFORE UPDATE ON clans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Auto-update clan member_count
CREATE OR REPLACE FUNCTION update_clan_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE clans SET member_count = member_count + 1 WHERE id = NEW.clan_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE clans SET member_count = member_count - 1 WHERE id = OLD.clan_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clan_members_count ON clan_members;
CREATE TRIGGER clan_members_count
    AFTER INSERT OR DELETE ON clan_members
    FOR EACH ROW
    EXECUTE FUNCTION update_clan_member_count();

-- Auto-update user last_seen on any activity
CREATE OR REPLACE FUNCTION update_user_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET last_seen = NOW() WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Triggers for this function should be added to specific tables as needed

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================
-- Uncomment to add sample data
-- NOTE: This is commented out to avoid constraint violations on re-runs

/*
-- Insert a test user
INSERT INTO users (email, username, batch, avatar_url, level, xp, coins)
VALUES 
    ('test@student.com', 'TestStudent', '8B', 'https://picsum.photos/seed/test/100/100', 12, 420, 8750),
    ('demo@student.com', 'DemoUser', '8A', 'https://picsum.photos/seed/demo/100/100', 15, 800, 12000);

-- Insert sample activities
INSERT INTO activities (kind, actor_username, data)
VALUES
    ('level_up', 'TestStudent', '{"level": 12}'::jsonb),
    ('quest_cleared', 'DemoUser', '{"subject": "Math"}'::jsonb);
*/

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify everything is set up correctly

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Expected tables:
-- activities, activity_reactions, caps, clan_chat, clan_members, clans,
-- inventory, sessions, shop_purchases, tasks, users
