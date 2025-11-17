-- ============================================================
-- Quick check: Do we have assignment questions in the database?
-- ============================================================
-- Run these queries one by one in Supabase SQL Editor

-- 1. Check if any assignments exist
SELECT COUNT(*) as total_assignments FROM assignments;

-- 2. Check if any assignment_questions links exist
SELECT COUNT(*) as total_assignment_questions FROM assignment_questions;

-- 3. Check if any questions exist
SELECT COUNT(*) as total_questions FROM questions WHERE teacher_id IS NOT NULL;

-- 4. Show assignment details with question counts
SELECT 
  a.id,
  a.title,
  a.subject_name,
  a.topic_name,
  a.batch,
  COUNT(aq.question_id) as question_count
FROM assignments a
LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
GROUP BY a.id, a.title, a.subject_name, a.topic_name, a.batch
ORDER BY a.created_at DESC;

-- 5. Check student assignments
SELECT 
  sa.student_id,
  sa.assignment_id,
  sa.status,
  a.title,
  COUNT(aq.question_id) as question_count
FROM student_assignments sa
JOIN assignments a ON a.id = sa.assignment_id
LEFT JOIN assignment_questions aq ON aq.assignment_id = sa.assignment_id
WHERE sa.status = 'pending'
GROUP BY sa.student_id, sa.assignment_id, sa.status, a.title;
