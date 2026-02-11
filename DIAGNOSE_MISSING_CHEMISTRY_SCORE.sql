-- ============================================================================
-- DIAGNOSTIC: Missing AS Chemistry Ch2 Part 2 Score for raybakchimbaev (11B)
-- ============================================================================
-- Date of test: February 10, 2026
-- Student: raybakchimbaev
-- Class: 11B
-- Test: AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)
--
-- ROOT CAUSE FOUND:
-- The handleSubmit() function collected answers using a sequential loop:
--   for (let i = 1; i <= totalQuestions; i++) → queries q1, q2, ... q32
-- But Part 2 radio buttons are named using original question numbers:
--   q33, q34, ... q64 (from splitQuiz)
-- So ALL Part 2 responses were empty strings → score always 0, answers blank.
--
-- FIX APPLIED: Changed all 9 affected Chemistry test files to use:
--   QUESTIONS.forEach((q) => { ... q.number ... }) instead of sequential loop.
--
-- The student should RETAKE the test now that the fix is deployed.
-- ============================================================================

-- ============================================================================
-- STEP 1: Check if the record actually exists (exact match)
-- ============================================================================
SELECT id, student_name, student_class, quiz_name, score, total_questions, 
       percentage, submitted_at, scores_released, time_taken_seconds
FROM quiz_scores
WHERE quiz_name = 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)'
  AND student_name = 'raybakchimbaev';

-- ============================================================================
-- STEP 2: Fuzzy search - maybe name was entered differently (case, spacing, etc.)
-- ============================================================================
SELECT id, student_name, student_class, quiz_name, score, total_questions,
       percentage, submitted_at, scores_released, time_taken_seconds
FROM quiz_scores
WHERE quiz_name LIKE '%Atoms, molecules%Part 2%'
  AND LOWER(student_name) LIKE '%raybak%';

-- ============================================================================
-- STEP 3: Check ALL Part 2 submissions from yesterday (Feb 10, 2026)
-- ============================================================================
SELECT id, student_name, student_class, quiz_name, score, total_questions,
       percentage, submitted_at, time_taken_seconds
FROM quiz_scores
WHERE quiz_name = 'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)'
  AND submitted_at::date = '2026-02-10'
ORDER BY submitted_at DESC;

-- ============================================================================
-- STEP 4: Check ALL submissions by this student across all tests
-- ============================================================================
SELECT id, student_name, student_class, quiz_name, score, total_questions,
       percentage, submitted_at
FROM quiz_scores
WHERE LOWER(student_name) LIKE '%raybak%'
ORDER BY submitted_at DESC;

-- ============================================================================
-- STEP 5: Check all 11B submissions from yesterday
-- ============================================================================
SELECT id, student_name, student_class, quiz_name, score, submitted_at
FROM quiz_scores
WHERE student_class = '11B'
  AND submitted_at::date = '2026-02-10'
ORDER BY submitted_at DESC;

-- ============================================================================
-- STEP 6: Verify RLS policies allow insertion (this was a past issue)
-- ============================================================================
SELECT policyname, cmd, permissive, roles
FROM pg_policies 
WHERE tablename = 'quiz_scores' AND cmd = 'INSERT'
ORDER BY policyname;

-- Check anon role has INSERT permission 
SELECT grantee, privilege_type
FROM information_schema.role_table_grants 
WHERE table_name = 'quiz_scores' 
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type = 'INSERT';

-- ============================================================================
-- STEP 7: If record is truly missing - MANUALLY INSERT a placeholder
-- ============================================================================
-- IMPORTANT: Only run this AFTER confirming the record doesn't exist (Steps 1-5)
-- The student will need to retake the test OR you can insert with score=0
-- and update later if they have their answers.
--
-- UNCOMMENT the block below to insert:
-- ============================================================================

/*
INSERT INTO quiz_scores (
  student_name,
  student_class,
  quiz_name,
  score,
  total_questions,
  percentage,
  answers,
  time_taken_seconds,
  scores_released
) VALUES (
  'raybakchimbaev',
  '11B',
  'AS Chemistry Ch2 (Atoms, molecules and stoichiometry) (Part 2)',
  0,           -- Set to 0 for now; update after marking
  32,          -- Part 2 typically has ~32 questions (verify from actual test)
  0,           -- Will be updated after marking
  jsonb_build_object(
    'responses', '{}'::jsonb,
    'answer_key_ready', false,
    'pending_answer_key', true,
    'quiz_version', 'v1-manual-recovery',
    'note', 'Manually inserted - original submission was lost on 2026-02-10'
  ),
  0,
  false
);
*/

-- ============================================================================
-- STEP 8: If you need to let the student retake the test cleanly
-- ============================================================================
-- The student's browser may show "already submitted" due to localStorage.
-- Tell the student to:
--   1. Open the test URL in an Incognito/Private window, OR
--   2. Clear site data for the app (DevTools > Application > Clear Storage)
-- This will reset the local submission flag and let them retake.
-- ============================================================================
