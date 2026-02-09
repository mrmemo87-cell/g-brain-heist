-- Check Cambridge Test Visibility for Ch2 tests
-- This query will show us if the Ch2 Part 1 and Part 2 tests have visibility records

SELECT 
  ctv.test_id,
  ctv.subject,
  ctv.grade_level,
  ctv.is_visible,
  ctv.teacher_user_id,
  u.email as teacher_email,
  ctv.created_at,
  ctv.updated_at
FROM cambridge_test_visibility ctv
LEFT JOIN users u ON ctv.teacher_user_id = u.id
WHERE ctv.test_id LIKE '%ch2-atoms-molecules-stoichiometry%'
ORDER BY ctv.grade_level, ctv.test_id, ctv.is_visible;

-- Also check if the tests exist in the cambridge_tests table
SELECT 
  id,
  name,
  subject,
  test_url
FROM cambridge_tests
WHERE id LIKE '%ch2-atoms-molecules-stoichiometry%'
ORDER BY id;

-- Count total visibility records for Chemistry tests
SELECT 
  COUNT(*) as total_visibility_records,
  SUM(CASE WHEN is_visible = TRUE THEN 1 ELSE 0 END) as visible_count,
  SUM(CASE WHEN is_visible = FALSE THEN 1 ELSE 0 END) as hidden_count
FROM cambridge_test_visibility
WHERE subject = 'Chemistry';

-- Show all Chemistry tests in visibility system (grouped by teacher and visibility)
SELECT 
  u.email as teacher_email,
  ctv.grade_level,
  ctv.is_visible,
  COUNT(*) as test_count
FROM cambridge_test_visibility ctv
JOIN users u ON ctv.teacher_user_id = u.id
WHERE ctv.subject = 'Chemistry'
GROUP BY u.email, ctv.grade_level, ctv.is_visible
ORDER BY u.email, ctv.grade_level, ctv.is_visible DESC;
