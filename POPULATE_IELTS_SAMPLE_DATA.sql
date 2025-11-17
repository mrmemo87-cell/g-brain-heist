-- ============================================================
-- Populate IELTS Prep Hub with Sample Data
-- ============================================================
-- This adds sample reading passages, questions, and other content
-- so the IELTS portal is functional out of the box.
-- ============================================================

-- Insert sample reading sets (skip if already exist)
INSERT INTO ielts_reading_sets (
  slug,
  title,
  description,
  level,
  est_band_min,
  est_band_max,
  duration_minutes,
  is_active
) VALUES 
(
  'history-of-coffee',
  'The History of Coffee',
  'An academic reading passage about the origins and spread of coffee culture worldwide.',
  'intermediate',
  5.5,
  7.0,
  20,
  true
),
(
  'climate-change-coral-reefs',
  'Climate Change and Coral Reefs',
  'An advanced academic passage examining the impact of climate change on coral reef ecosystems.',
  'advanced',
  6.5,
  8.0,
  20,
  true
),
(
  'working-from-home',
  'Working from Home',
  'A general training passage about the advantages and challenges of remote work.',
  'beginner',
  4.5,
  6.0,
  15,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Verify the data was inserted
SELECT id, slug, title, level, is_active 
FROM ielts_reading_sets 
ORDER BY level, title;
