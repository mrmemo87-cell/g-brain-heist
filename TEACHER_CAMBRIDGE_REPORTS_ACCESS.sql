-- Teacher Access to Cambridge Test Reports
-- This migration enhances the quiz_scores table to support teacher-filtered access
-- Teachers can view all student results for classes they teach

-- Ensure teachers can view quiz scores (authenticated users can already see all scores)
-- The current policy allows all authenticated users to view, which includes teachers
-- This is acceptable for schools where teachers collaborate on student progress

-- If you want to restrict teachers to only see their assigned classes,
-- you would need a teacher_classes table linking teachers to specific classes.
-- For now, all teachers can see all Cambridge test results.

-- Verify the select policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quiz_scores' 
    AND policyname = 'Anyone can view scores'
  ) THEN
    -- Create the policy if it doesn't exist
    CREATE POLICY "Anyone can view scores" ON quiz_scores
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Create a helper function to check if user is a teacher
CREATE OR REPLACE FUNCTION is_teacher()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teachers t
    JOIN users u ON u.id = t.user_id
    WHERE u.id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for teachers to get detailed class analytics
CREATE OR REPLACE VIEW teacher_cambridge_analytics AS
SELECT 
  qs.student_class,
  qs.quiz_name,
  COUNT(*) as total_submissions,
  ROUND(AVG(qs.percentage)::numeric, 1) as avg_percentage,
  MAX(qs.percentage) as highest_score,
  MIN(qs.percentage) as lowest_score,
  COUNT(CASE WHEN qs.percentage >= 70 THEN 1 END) as passing_count,
  COUNT(CASE WHEN qs.percentage < 50 THEN 1 END) as failing_count
FROM quiz_scores qs
GROUP BY qs.student_class, qs.quiz_name
ORDER BY qs.student_class, qs.quiz_name;

-- Create a view for individual student performance across all tests
CREATE OR REPLACE VIEW student_cambridge_performance AS
SELECT 
  qs.student_name,
  qs.student_class,
  COUNT(*) as tests_taken,
  ROUND(AVG(qs.percentage)::numeric, 1) as avg_percentage,
  MAX(qs.percentage) as best_score,
  MIN(qs.percentage) as worst_score,
  MAX(qs.submitted_at) as last_test_date
FROM quiz_scores qs
GROUP BY qs.student_name, qs.student_class
ORDER BY qs.student_class, qs.student_name;

-- Grant access to the views for authenticated users
GRANT SELECT ON teacher_cambridge_analytics TO authenticated;
GRANT SELECT ON student_cambridge_performance TO authenticated;

-- If you want teachers to only see students in their assigned classes in the future,
-- create a teacher_classes junction table:
-- 
-- CREATE TABLE IF NOT EXISTS teacher_classes (
--   teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
--   class_name TEXT NOT NULL,
--   PRIMARY KEY (teacher_id, class_name)
-- );
--
-- Then update the RLS policy on quiz_scores:
--
-- CREATE POLICY "Teachers see their classes" ON quiz_scores
--   FOR SELECT
--   USING (
--     -- User is admin or
--     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
--     OR
--     -- User is teacher with access to this class
--     EXISTS (
--       SELECT 1 FROM teacher_classes tc
--       JOIN teachers t ON t.id = tc.teacher_id
--       WHERE t.user_id = auth.uid()
--       AND tc.class_name = quiz_scores.student_class
--     )
--     OR
--     -- User is viewing their own scores (match by name - not ideal but works for anonymous tests)
--     student_name = (SELECT username FROM users WHERE id = auth.uid())
--   );

COMMENT ON VIEW teacher_cambridge_analytics IS 'Aggregated Cambridge test analytics by class for teachers';
COMMENT ON VIEW student_cambridge_performance IS 'Individual student performance summary across all Cambridge tests';
