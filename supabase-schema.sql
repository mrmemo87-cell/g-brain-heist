-- ============================================
-- G-Brain Heist - Supabase Database Schema
-- ============================================
-- Run this in Supabase SQL Editor to create all tables
-- Execution time: ~30 seconds

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    batch TEXT NOT NULL CHECK (batch IN ('8A', '8B', '8C')),
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_batch ON users(batch);
CREATE INDEX idx_users_last_seen ON users(last_seen);

-- ============================================
-- INVENTORY TABLE
-- ============================================
CREATE TABLE inventory (
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

CREATE INDEX idx_inventory_user_id ON inventory(user_id);
CREATE INDEX idx_inventory_state ON inventory(state);

-- ============================================
-- CLANS TABLE
-- ============================================
CREATE TABLE clans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    notice TEXT,
    vault_coins INTEGER DEFAULT 0,
    leader_id UUID REFERENCES users(id) ON DELETE CASCADE,
    member_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clans_name ON clans(name);
CREATE INDEX idx_clans_leader_id ON clans(leader_id);

-- ============================================
-- CLAN MEMBERS TABLE
-- ============================================
CREATE TABLE clan_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_id UUID REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clan_id, user_id)
);

CREATE INDEX idx_clan_members_clan_id ON clan_members(clan_id);
CREATE INDEX idx_clan_members_user_id ON clan_members(user_id);

-- ============================================
-- CLAN CHAT TABLE
-- ============================================
CREATE TABLE clan_chat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_id UUID REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clan_chat_clan_id ON clan_chat(clan_id, created_at DESC);

-- ============================================
-- ACTIVITIES TABLE (News Feed)
-- ============================================
CREATE TABLE activities (
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

CREATE INDEX idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX idx_activities_actor_id ON activities(actor_id);

-- ============================================
-- ACTIVITY REACTIONS TABLE
-- ============================================
CREATE TABLE activity_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(activity_id, user_id)
);

CREATE INDEX idx_reactions_activity_id ON activity_reactions(activity_id);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('daily', 'weekly')),
    task_type TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    target INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_expires_at ON tasks(expires_at);

-- ============================================
-- SHOP PURCHASES TABLE
-- ============================================
CREATE TABLE shop_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    total_cost INTEGER NOT NULL,
    purchase_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_purchases_user_date ON shop_purchases(user_id, purchase_date);

-- ============================================
-- SESSIONS TABLE (for XP boosters)
-- ============================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    multiplier NUMERIC DEFAULT 1.0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    today_used BOOLEAN DEFAULT false,
    UNIQUE(user_id)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- ============================================
-- CAPS TABLE (daily/weekly limits)
-- ============================================
CREATE TABLE caps (
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

CREATE INDEX idx_caps_user_id ON caps(user_id);

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

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

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

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================
-- Uncomment to add sample data

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
