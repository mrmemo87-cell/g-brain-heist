-- Create quiz_scores table for storing Cambridge Reading test results
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS quiz_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_class TEXT,
  quiz_name TEXT NOT NULL DEFAULT 'Cambridge Reading 25',
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL DEFAULT 42,
  percentage INTEGER NOT NULL,
  answers JSONB, -- Store individual answers for review
  time_taken_seconds INTEGER, -- How long the student took to complete
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_quiz_scores_submitted_at ON quiz_scores(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_scores_student_class ON quiz_scores(student_class);
CREATE INDEX IF NOT EXISTS idx_quiz_scores_quiz_name ON quiz_scores(quiz_name);

-- Enable Row Level Security
ALTER TABLE quiz_scores ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert (students submit scores)
CREATE POLICY "Anyone can submit quiz scores" ON quiz_scores
  FOR INSERT
  WITH CHECK (true);

-- Policy: Anyone can view scores (for dashboard to work without login)
CREATE POLICY "Anyone can view scores" ON quiz_scores
  FOR SELECT
  USING (true);

-- Alternative: If you want anyone to view scores (for leaderboards), use this instead:
-- CREATE POLICY "Anyone can view scores" ON quiz_scores
--   FOR SELECT
--   USING (true);

-- Grant permissions
GRANT INSERT ON quiz_scores TO anon;
GRANT SELECT ON quiz_scores TO authenticated;

-- View for teachers to see results summary
CREATE OR REPLACE VIEW quiz_scores_summary AS
SELECT 
  student_class,
  quiz_name,
  COUNT(*) as total_submissions,
  ROUND(AVG(percentage), 1) as avg_percentage,
  MAX(percentage) as highest_score,
  MIN(percentage) as lowest_score
FROM quiz_scores
GROUP BY student_class, quiz_name
ORDER BY student_class, quiz_name;

