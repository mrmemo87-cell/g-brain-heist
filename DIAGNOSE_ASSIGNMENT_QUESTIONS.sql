-- ============================================================
-- Diagnostic queries for assignment questions not rendering
-- ============================================================

-- Check if there are any assignments
SELECT 
  id,
  teacher_id,
  subject_name,
  topic_name,
  batch,
  title,
  assigned_at,
  due_at
FROM assignments
ORDER BY assigned_at DESC
LIMIT 10;

-- Check if there are any assignment questions linked
SELECT 
  aq.assignment_id,
  aq.question_id,
  aq.order_index,
  a.title AS assignment_title,
  q.question_text
FROM assignment_questions aq
JOIN assignments a ON a.id = aq.assignment_id
LEFT JOIN questions q ON q.id = aq.question_id
ORDER BY aq.assignment_id, aq.order_index
LIMIT 20;

-- Check if there are any student assignments
SELECT 
  sa.id,
  sa.assignment_id,
  sa.student_id,
  sa.status,
  sa.batch,
  a.title AS assignment_title,
  u.username AS student_username
FROM student_assignments sa
JOIN assignments a ON a.id = sa.assignment_id
JOIN users u ON u.id = sa.student_id
WHERE sa.status = 'pending'
ORDER BY sa.assigned_at DESC
LIMIT 10;

-- Test the RPC function directly (run this as a logged-in student)
SELECT rpc_get_student_active_assignment();

-- Check what the assignment_question_details view returns
SELECT * FROM assignment_question_details
LIMIT 10;

-- Verify questions table has data
SELECT 
  id,
  teacher_id,
  question_text,
  question_type,
  is_public,
  is_active,
  subject,
  topic,
  topic_name
FROM questions
WHERE teacher_id IS NOT NULL
LIMIT 10;
