-- ==========================================================================
-- ADD CAMBRIDGE TRAVEL & TOURISM MISSION (EXAM MODE)
-- ==========================================================================
-- Registers a guarded, teacher-marked Travel & Tourism 9395 Paper 1 style test.
-- AI marking is available only through the protected travel_tourism_marking
-- Supabase Edge Function; no answer key is stored in the public frontend.

ALTER TABLE cambridge_tests
  ADD COLUMN IF NOT EXISTS marking_mode TEXT DEFAULT 'auto_marked',
  ADD COLUMN IF NOT EXISTS ai_marking_available BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guarded_mode BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS paper_style TEXT;

INSERT INTO cambridge_tests (
  id,
  name,
  description,
  duration,
  total_questions,
  difficulty,
  category,
  subject,
  test_url,
  requires_marking,
  marking_mode,
  ai_marking_available,
  guarded_mode,
  paper_style
) VALUES (
  'travel-tourism-sustainable-mission',
  'Operation Sustainable Tourism',
  'Guarded Cambridge International AS & A Level Travel & Tourism 9395 Paper 1 style exam. Teacher-marked, with optional AI marking suggestions for teachers.',
  '90 min',
  80,
  'Intermediate',
  'Writing',
  'Travel & Tourism',
  '/cambridge-tests/Travel%20Tourism/sustainable_tourism_mission.html',
  true,
  'teacher_marked',
  true,
  true,
  'Cambridge International AS & A Level Travel & Tourism 9395 Paper 1'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  duration = EXCLUDED.duration,
  total_questions = EXCLUDED.total_questions,
  difficulty = EXCLUDED.difficulty,
  category = EXCLUDED.category,
  subject = EXCLUDED.subject,
  test_url = EXCLUDED.test_url,
  requires_marking = EXCLUDED.requires_marking,
  marking_mode = EXCLUDED.marking_mode,
  ai_marking_available = EXCLUDED.ai_marking_available,
  guarded_mode = EXCLUDED.guarded_mode,
  paper_style = EXCLUDED.paper_style,
  updated_at = NOW();

-- Optional visibility seed: only applies if a school has already made this test
-- visible before and wants rows present for grades 9-12. Teacher/school toggles
-- remain the source of truth through existing visibility controls.
-- INSERT INTO cambridge_test_visibility (school_id, teacher_user_id, test_id, subject, grade_level, is_visible)
-- SELECT school_id, teacher_user_id, 'travel-tourism-sustainable-mission', 'Travel & Tourism', grade_level, false
-- FROM (SELECT DISTINCT school_id, teacher_user_id FROM cambridge_test_visibility) v
-- CROSS JOIN (VALUES (9), (10), (11), (12)) grades(grade_level)
-- ON CONFLICT (school_id, test_id, subject, grade_level) DO NOTHING;
