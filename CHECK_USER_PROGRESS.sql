-- Diagnostic: Check user's answered questions and available questions
-- Run this in Supabase SQL Editor to diagnose the reward issue

-- 1. Check user's basic stats
SELECT 
    id,
    username,
    xp,
    coins,
    level,
    gemstones
FROM users 
WHERE id = '843b94c3-7d25-4772-8da8-b5f39e0ea491';

-- 2. Count how many questions the user has answered correctly
SELECT 
    COUNT(*) as total_correct_answers,
    COUNT(DISTINCT question_id) as unique_questions_answered
FROM question_attempts
WHERE student_id = '843b94c3-7d25-4772-8da8-b5f39e0ea491'
AND is_correct = true;

-- 3. Check total available questions
SELECT 
    COUNT(*) as total_questions_in_db
FROM questions;

-- 4. Show recent question attempts (last 10)
SELECT 
    qa.created_at,
    qa.question_id,
    qa.is_correct,
    qa.points_earned
FROM question_attempts qa
WHERE qa.student_id = '843b94c3-7d25-4772-8da8-b5f39e0ea491'
ORDER BY qa.created_at DESC
LIMIT 10;

-- 5. Find questions the user HASN'T answered yet (available for rewards)
SELECT 
    COUNT(*) as unanswered_questions
FROM questions q
WHERE NOT EXISTS (
    SELECT 1 
    FROM question_attempts qa 
    WHERE qa.question_id::uuid = q.id 
    AND qa.student_id = '843b94c3-7d25-4772-8da8-b5f39e0ea491'
    AND qa.is_correct = true
);

-- 6. Check if there's an issue with recent updates
SELECT 
    updated_at,
    xp,
    coins,
    level
FROM users
WHERE id = '843b94c3-7d25-4772-8da8-b5f39e0ea491';
