-- ============================================================
-- Create table to store AI-generated student assignment analyses
-- ============================================================

CREATE TABLE IF NOT EXISTS student_assignment_analyses (
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (assignment_id, student_id)
);

-- Enable RLS
ALTER TABLE student_assignment_analyses ENABLE ROW LEVEL SECURITY;

-- RLS: Students can see their own analyses
CREATE POLICY "Students see own analyses"
  ON student_assignment_analyses
  FOR SELECT
  USING (student_id = auth.uid());

-- RLS: Teachers can see analyses for their assignments
CREATE POLICY "Teachers see analyses for their assignments"
  ON student_assignment_analyses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = student_assignment_analyses.assignment_id
      AND a.teacher_id = (SELECT id FROM teachers WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_analyses_student ON student_assignment_analyses(student_id);
CREATE INDEX IF NOT EXISTS idx_analyses_assignment ON student_assignment_analyses(assignment_id);

-- Add comment
COMMENT ON TABLE student_assignment_analyses IS 'Stores AI-generated personalized analysis for student assignment performance including strengths, areas for improvement, and recommendations';
