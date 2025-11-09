-- ============================================
-- G-Brains Heist - Safe RLS Policies Script
-- ============================================
-- This script only applies RLS policies to tables that actually exist
-- Run this AFTER running SAFE_DATABASE_MIGRATION.sql

-- ============================================
-- ENABLE RLS ON EXISTING TABLES ONLY
-- ============================================

-- Check which tables exist and enable RLS
DO $$
DECLARE
    table_names TEXT[] := ARRAY[
        'users', 'inventory', 'clans', 'clan_members', 'clan_chat', 
        'activities', 'activity_reactions', 'tasks', 'shop_purchases', 
    'sessions', 'caps', 'mcq_questions', 'attempts', 'announcements', 'announcement_receipts', 
        'rpc_event_log', 'notifications', 'tournament_seasons', 
        'tournament_school_signups', 'tournament_matches', 'teachers', 
        'teacher_questions', 'question_attempts', 'achievements', 'user_achievements'
    ];
    current_table TEXT;
BEGIN
    FOREACH current_table IN ARRAY table_names
    LOOP
        -- Check if table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = current_table) THEN
            -- Enable RLS
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', current_table);
            RAISE NOTICE 'Enabled RLS on table: %', current_table;
        ELSE
            RAISE NOTICE 'Table does not exist, skipping: %', current_table;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- USERS TABLE POLICIES (ALWAYS EXISTS)
-- ============================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;  
DROP POLICY IF EXISTS "Users can view other users" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;

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
-- CONDITIONAL POLICIES FOR EXISTING TABLES
-- ============================================

-- Inventory Table Policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory') THEN
        -- Drop existing policies
        DROP POLICY IF EXISTS "Users can view own inventory" ON inventory;
        DROP POLICY IF EXISTS "Users can add to own inventory" ON inventory;
        DROP POLICY IF EXISTS "Users can update own inventory" ON inventory;
        DROP POLICY IF EXISTS "Users can delete own inventory" ON inventory;
        
        -- Create policies
        EXECUTE 'CREATE POLICY "Users can view own inventory" ON inventory FOR SELECT USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Users can add to own inventory" ON inventory FOR INSERT WITH CHECK (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Users can update own inventory" ON inventory FOR UPDATE USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Users can delete own inventory" ON inventory FOR DELETE USING (auth.uid() = user_id)';
        
        RAISE NOTICE 'Created inventory table policies';
    END IF;
END $$;

-- Clans Table Policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clans') THEN
        DROP POLICY IF EXISTS "Anyone can view clans" ON clans;
        DROP POLICY IF EXISTS "Users can create clans" ON clans;
        DROP POLICY IF EXISTS "Leaders can update own clan" ON clans;
        DROP POLICY IF EXISTS "Leaders can delete own clan" ON clans;
        
        EXECUTE 'CREATE POLICY "Anyone can view clans" ON clans FOR SELECT USING (true)';
        EXECUTE 'CREATE POLICY "Users can create clans" ON clans FOR INSERT WITH CHECK (auth.uid() = leader_id)';
        EXECUTE 'CREATE POLICY "Leaders can update own clan" ON clans FOR UPDATE USING (auth.uid() = leader_id)';
        EXECUTE 'CREATE POLICY "Leaders can delete own clan" ON clans FOR DELETE USING (auth.uid() = leader_id)';
        
        RAISE NOTICE 'Created clans table policies';
    END IF;
END $$;

-- Clan Members Table Policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clan_members') THEN
        DROP POLICY IF EXISTS "Anyone can view clan members" ON clan_members;
        DROP POLICY IF EXISTS "Users can join clans" ON clan_members;
        DROP POLICY IF EXISTS "Users can leave clans" ON clan_members;
        DROP POLICY IF EXISTS "Leaders can remove members" ON clan_members;
        
        EXECUTE 'CREATE POLICY "Anyone can view clan members" ON clan_members FOR SELECT USING (true)';
        EXECUTE 'CREATE POLICY "Users can join clans" ON clan_members FOR INSERT WITH CHECK (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Users can leave clans" ON clan_members FOR DELETE USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Leaders can remove members" ON clan_members FOR DELETE USING (EXISTS (SELECT 1 FROM clans WHERE clans.id = clan_members.clan_id AND clans.leader_id = auth.uid()))';
        
        RAISE NOTICE 'Created clan_members table policies';
    END IF;
END $$;

-- Activities Table Policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities') THEN
        DROP POLICY IF EXISTS "Anyone can view activities" ON activities;
        DROP POLICY IF EXISTS "Users can create activities" ON activities;
        
        EXECUTE 'CREATE POLICY "Anyone can view activities" ON activities FOR SELECT USING (true)';
        EXECUTE 'CREATE POLICY "Users can create activities" ON activities FOR INSERT WITH CHECK (auth.uid() = actor_id)';
        
        RAISE NOTICE 'Created activities table policies';
    END IF;
END $$;

-- Shop Purchases Table Policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shop_purchases') THEN
        DROP POLICY IF EXISTS "Users can view own purchases" ON shop_purchases;
        DROP POLICY IF EXISTS "Users can create purchases" ON shop_purchases;
        
        EXECUTE 'CREATE POLICY "Users can view own purchases" ON shop_purchases FOR SELECT USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Users can create purchases" ON shop_purchases FOR INSERT WITH CHECK (auth.uid() = user_id)';
        
        RAISE NOTICE 'Created shop_purchases table policies';
    END IF;
END $$;

-- Notifications Table Policies (if exists from migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
        DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
        DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
        DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
        DROP POLICY IF EXISTS "notifications_insert_system" ON notifications;
        
        EXECUTE 'CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "notifications_insert_system" ON notifications FOR INSERT WITH CHECK (true)';
        
        RAISE NOTICE 'Created notifications table policies';
    END IF;
END $$;

-- Announcement Receipt Policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'announcement_receipts') THEN
        DROP POLICY IF EXISTS "Players view own receipts" ON announcement_receipts;
        DROP POLICY IF EXISTS "Players acknowledge announcements" ON announcement_receipts;
        DROP POLICY IF EXISTS "Players refresh receipt" ON announcement_receipts;

        EXECUTE 'CREATE POLICY "Players view own receipts" ON announcement_receipts FOR SELECT USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Players acknowledge announcements" ON announcement_receipts FOR INSERT WITH CHECK (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "Players refresh receipt" ON announcement_receipts FOR UPDATE USING (auth.uid() = user_id)';

        RAISE NOTICE 'Created announcement receipt policies';
    END IF;
END $$;

-- Teachers Table Policies (if exists from migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teachers') THEN
        DROP POLICY IF EXISTS "teachers_select_own" ON teachers;
        DROP POLICY IF EXISTS "teachers_insert_own" ON teachers;
        DROP POLICY IF EXISTS "teachers_update_own" ON teachers;
        
        EXECUTE 'CREATE POLICY "teachers_select_own" ON teachers FOR SELECT USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "teachers_insert_own" ON teachers FOR INSERT WITH CHECK (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "teachers_update_own" ON teachers FOR UPDATE USING (auth.uid() = user_id)';
        
        RAISE NOTICE 'Created teachers table policies';
    END IF;
END $$;

-- Achievements Table Policies (if exists from migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'achievements') THEN
        DROP POLICY IF EXISTS "achievements_select_all" ON achievements;
        EXECUTE 'CREATE POLICY "achievements_select_all" ON achievements FOR SELECT USING (true)';
        RAISE NOTICE 'Created achievements table policies';
    END IF;
END $$;

-- User Achievements Table Policies (if exists from migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_achievements') THEN
        DROP POLICY IF EXISTS "user_achievements_select_own" ON user_achievements;
        DROP POLICY IF EXISTS "user_achievements_insert_own" ON user_achievements;
        DROP POLICY IF EXISTS "user_achievements_update_own" ON user_achievements;
        
        EXECUTE 'CREATE POLICY "user_achievements_select_own" ON user_achievements FOR SELECT USING (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "user_achievements_insert_own" ON user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id)';
        EXECUTE 'CREATE POLICY "user_achievements_update_own" ON user_achievements FOR UPDATE USING (auth.uid() = user_id)';
        
        RAISE NOTICE 'Created user_achievements table policies';
    END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================

-- Show which tables have RLS enabled
SELECT 'RLS STATUS CHECK' as check_type;
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Show all policies created
SELECT 'POLICIES CREATED' as check_type;
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Summary
SELECT 'RLS SETUP COMPLETE' as final_status;
SELECT 
    'Row Level Security policies applied successfully to all existing tables!' as message,
    (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) as tables_with_rls,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') as total_policies,
    NOW() as completed_at;