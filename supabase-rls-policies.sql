-- ============================================
-- G-Brains Heist - Row Level Security Policies
-- ============================================
-- Run this AFTER running supabase-schema.sql
-- This ensures users can only access their own data

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE clans ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpc_event_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- Users can view other users (for PvP targets, leaderboards)
CREATE POLICY "Users can view other users"
    ON users FOR SELECT
    USING (true);

-- New users can insert their profile on signup
CREATE POLICY "Users can insert own profile"
    ON users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================
-- MCQ QUESTIONS POLICIES
-- ============================================

-- Students can view active questions in their grade
CREATE POLICY "Students view grade questions"
    ON mcq_questions FOR SELECT
    USING (
        active
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.grade = mcq_questions.grade
              AND COALESCE(u.is_banned, false) = false
        )
    );

-- Admins can manage all questions
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

-- ============================================
-- ATTEMPTS POLICIES
-- ============================================

CREATE POLICY "Students view own attempts"
    ON attempts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Students insert own attempts"
    ON attempts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view attempts"
    ON attempts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

-- ============================================
-- ANNOUNCEMENTS POLICIES
-- ============================================

CREATE POLICY "Announcements are public"
    ON announcements FOR SELECT
    USING (true);

CREATE POLICY "Admins create announcements"
    ON announcements FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

-- ============================================
-- RPC EVENT LOG POLICIES
-- ============================================

CREATE POLICY "Admins read rpc logs"
    ON rpc_event_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = true
        )
    );

-- ============================================
-- INVENTORY TABLE POLICIES
-- ============================================

-- Users can only see their own inventory
CREATE POLICY "Users can view own inventory"
    ON inventory FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert items to their inventory
CREATE POLICY "Users can add to own inventory"
    ON inventory FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own inventory items
CREATE POLICY "Users can update own inventory"
    ON inventory FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own inventory items
CREATE POLICY "Users can delete own inventory"
    ON inventory FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- CLANS TABLE POLICIES
-- ============================================

-- Everyone can view clans (for clan list)
CREATE POLICY "Anyone can view clans"
    ON clans FOR SELECT
    USING (true);

-- Users can create clans
CREATE POLICY "Users can create clans"
    ON clans FOR INSERT
    WITH CHECK (auth.uid() = leader_id);

-- Clan leaders can update their clan
CREATE POLICY "Leaders can update own clan"
    ON clans FOR UPDATE
    USING (auth.uid() = leader_id);

-- Clan leaders can delete their clan
CREATE POLICY "Leaders can delete own clan"
    ON clans FOR DELETE
    USING (auth.uid() = leader_id);

-- ============================================
-- CLAN MEMBERS TABLE POLICIES
-- ============================================

-- Everyone can view clan members
CREATE POLICY "Anyone can view clan members"
    ON clan_members FOR SELECT
    USING (true);

-- Users can join clans
CREATE POLICY "Users can join clans"
    ON clan_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can leave clans (delete their membership)
CREATE POLICY "Users can leave clans"
    ON clan_members FOR DELETE
    USING (auth.uid() = user_id);

-- Clan leaders can remove members
CREATE POLICY "Leaders can remove members"
    ON clan_members FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM clans
            WHERE clans.id = clan_members.clan_id
            AND clans.leader_id = auth.uid()
        )
    );

-- ============================================
-- CLAN CHAT TABLE POLICIES
-- ============================================

-- Clan members can view their clan's chat
CREATE POLICY "Clan members can view clan chat"
    ON clan_chat FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clan_members
            WHERE clan_members.clan_id = clan_chat.clan_id
            AND clan_members.user_id = auth.uid()
        )
    );

-- Clan members can post messages
CREATE POLICY "Clan members can post messages"
    ON clan_chat FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM clan_members
            WHERE clan_members.clan_id = clan_chat.clan_id
            AND clan_members.user_id = auth.uid()
        )
    );

-- ============================================
-- ACTIVITIES TABLE POLICIES
-- ============================================

-- Everyone can view activities (global news feed)
CREATE POLICY "Anyone can view activities"
    ON activities FOR SELECT
    USING (true);

-- Users can create activities
CREATE POLICY "Users can create activities"
    ON activities FOR INSERT
    WITH CHECK (auth.uid() = actor_id);

-- ============================================
-- ACTIVITY REACTIONS TABLE POLICIES
-- ============================================

-- Everyone can view reactions
CREATE POLICY "Anyone can view reactions"
    ON activity_reactions FOR SELECT
    USING (true);

-- Users can add their own reactions
CREATE POLICY "Users can add reactions"
    ON activity_reactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
    ON activity_reactions FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- TASKS TABLE POLICIES
-- ============================================

-- Users can only see their own tasks
CREATE POLICY "Users can view own tasks"
    ON tasks FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own tasks
CREATE POLICY "Users can create own tasks"
    ON tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own tasks
CREATE POLICY "Users can update own tasks"
    ON tasks FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own tasks
CREATE POLICY "Users can delete own tasks"
    ON tasks FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- SHOP PURCHASES TABLE POLICIES
-- ============================================

-- Users can only see their own purchases
CREATE POLICY "Users can view own purchases"
    ON shop_purchases FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own purchases
CREATE POLICY "Users can create purchases"
    ON shop_purchases FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- SESSIONS TABLE POLICIES
-- ============================================

-- Users can only see their own session
CREATE POLICY "Users can view own session"
    ON sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own session
CREATE POLICY "Users can create own session"
    ON sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own session
CREATE POLICY "Users can update own session"
    ON sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own session
CREATE POLICY "Users can delete own session"
    ON sessions FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- CAPS TABLE POLICIES
-- ============================================

-- Users can only see their own caps
CREATE POLICY "Users can view own caps"
    ON caps FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own caps
CREATE POLICY "Users can create own caps"
    ON caps FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own caps
CREATE POLICY "Users can update own caps"
    ON caps FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to see all policies

SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Expected: ~35 policies across 11 tables
