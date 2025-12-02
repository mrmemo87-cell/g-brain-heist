-- ============================================================
-- QUICK DEPLOYMENT SCRIPT - Level-Based Unlocking
-- ============================================================
-- Run this script in Supabase SQL Editor
-- Estimated execution time: ~10 seconds
-- ============================================================

-- Quick check: Are we ready?
DO $$
BEGIN
  RAISE NOTICE '🚀 Starting Level-Based Unlocking Deployment...';
  RAISE NOTICE '📋 Checking prerequisites...';
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    RAISE EXCEPTION '❌ users table not found!';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mcq_questions') THEN
    RAISE EXCEPTION '❌ mcq_questions table not found!';
  END IF;
  
  RAISE NOTICE '✅ All prerequisites met. Proceeding...';
END $$;

-- ============================================================
-- INSTRUCTIONS:
-- 1. First, copy and paste the contents of IMPLEMENT_LEVEL_BASED_UNLOCKING.sql
--    into the Supabase SQL Editor and run it
-- 2. Then, run the verification section below
-- ============================================================

-- Verification
DO $$
DECLARE
  mcq_with_tiers INTEGER;
  teacher_with_tiers INTEGER;
  rpcs_created INTEGER;
BEGIN
  RAISE NOTICE '🔍 Running verification checks...';
  
  -- Check mcq_questions have tiers
  SELECT COUNT(*) INTO mcq_with_tiers 
  FROM mcq_questions 
  WHERE tier_level IS NOT NULL;
  
  RAISE NOTICE '✓ MCQ questions with tiers: %', mcq_with_tiers;
  
  -- Check teacher questions have tiers
  SELECT COUNT(*) INTO teacher_with_tiers
  FROM questions
  WHERE tier_level IS NOT NULL;
  
  RAISE NOTICE '✓ Teacher questions with tiers: %', teacher_with_tiers;
  
  -- Check RPCs exist
  SELECT COUNT(*) INTO rpcs_created
  FROM pg_proc
  WHERE proname IN (
    'get_unlocked_mcq_questions',
    'get_unlocked_teacher_questions', 
    'get_player_unlock_status',
    'count_unlocked_questions',
    'record_mcq_attempt'
  );
  
  RAISE NOTICE '✓ RPC functions created: %/5', rpcs_created;
  
  IF rpcs_created = 5 THEN
    RAISE NOTICE '🎉 Deployment successful!';
    RAISE NOTICE '📝 Next steps:';
    RAISE NOTICE '  1. Update frontend gameService.ts';
    RAISE NOTICE '  2. Update QuestView.tsx';
    RAISE NOTICE '  3. Test with different player levels';
  ELSE
    RAISE WARNING '⚠️  Some RPCs may not have been created';
  END IF;
END $$;
