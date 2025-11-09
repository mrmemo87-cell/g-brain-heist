-- G-Brains Heist Database Verification Script
-- Run this in Supabase SQL Editor to verify migration success

-- Check all tables exist
SELECT 'TABLES CHECK' as verification_type;
SELECT 
    schemaname, 
    tablename, 
    tableowner, 
    hasindexes, 
    hasrules, 
    hastriggers,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'notifications',
    'tournament_seasons', 
    'tournament_school_signups', 
    'tournament_matches',
    'teachers',
    'teacher_questions',
    'question_attempts',
    'achievements',
    'user_achievements'
)
ORDER BY tablename;

-- Check all RPC functions exist
SELECT 'FUNCTIONS CHECK' as verification_type;
SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'regenerate_user_ap',
    'approve_tournament_signup',
    'create_teacher_profile',
    'record_question_attempt',
    'notify_ap_full',
    'notify_level_up',
    'notify_attack_incoming'
)
ORDER BY routine_name;

-- Check RLS policies exist
SELECT 'POLICIES CHECK' as verification_type;
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN (
    'notifications',
    'tournament_seasons', 
    'tournament_school_signups', 
    'tournament_matches',
    'teachers',
    'teacher_questions',
    'question_attempts',
    'achievements',
    'user_achievements'
)
ORDER BY tablename, policyname;

-- Check indexes exist
SELECT 'INDEXES CHECK' as verification_type;
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN (
    'notifications',
    'tournament_school_signups',
    'tournament_matches',
    'teachers',
    'teacher_questions',
    'question_attempts',
    'user_achievements'
)
ORDER BY tablename, indexname;

-- Check user table has new columns
SELECT 'USER COLUMNS CHECK' as verification_type;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('role', 'tutorial_completed', 'gemstones', 'last_attacked_at')
ORDER BY column_name;

-- Check achievement data was inserted
SELECT 'ACHIEVEMENT DATA CHECK' as verification_type;
SELECT 
    id,
    name,
    category,
    rarity,
    points
FROM achievements 
ORDER BY category, id;

-- Check triggers exist
SELECT 'TRIGGERS CHECK' as verification_type;
SELECT 
    trigger_schema,
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name IN (
    '_tournament_seasons_updated_at',
    '_teachers_updated_at', 
    '_teacher_questions_updated_at'
)
ORDER BY event_object_table, trigger_name;

-- Test one RPC function
SELECT 'RPC FUNCTION TEST' as verification_type;
SELECT 'Testing regenerate_user_ap function...' as status;
-- This will show function signature without executing
SELECT 
    p.proname,
    pg_catalog.pg_get_function_arguments(p.oid) as arguments,
    pg_catalog.pg_get_function_result(p.oid) as return_type
FROM pg_catalog.pg_proc p
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' 
AND p.proname = 'regenerate_user_ap';

-- Summary
SELECT 'VERIFICATION SUMMARY' as verification_type;
SELECT 
    'Migration verification complete. Check all sections above for any missing components.' as message,
    NOW() as verified_at;