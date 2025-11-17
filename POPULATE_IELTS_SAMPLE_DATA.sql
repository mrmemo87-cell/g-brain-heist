-- ============================================================
-- Populate IELTS Prep Hub with Sample Data
-- ============================================================
-- This adds sample reading passages, questions, and other content
-- so the IELTS portal is functional out of the box.
-- ============================================================

-- ============================================================
-- READING SETS (Ordered: Beginner → Intermediate → Advanced)
-- ============================================================
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
  'working-from-home',
  'Working from Home',
  'A general training passage exploring the advantages and challenges of remote work in the modern workplace.',
  'beginner',
  4.5,
  6.0,
  15,
  true
),
(
  'history-of-coffee',
  'The History of Coffee',
  'An academic reading passage tracing the origins and global spread of coffee culture from Ethiopia to Europe.',
  'intermediate',
  5.5,
  7.0,
  20,
  true
),
(
  'climate-change-coral-reefs',
  'Climate Change and Coral Reefs',
  'An advanced academic passage examining the impact of rising ocean temperatures on coral reef ecosystems.',
  'advanced',
  6.5,
  8.0,
  20,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- LISTENING SETS (Ordered: Beginner → Intermediate → Advanced)
-- ============================================================
INSERT INTO ielts_listening_sets (
  slug,
  title,
  description,
  level,
  est_band_min,
  est_band_max,
  duration_minutes,
  audio_url,
  is_active
) VALUES
(
  'travel-conversation',
  'Travel Agency Conversation',
  'A phone conversation between a customer and a travel agent discussing vacation plans and booking details.',
  'beginner',
  4.5,
  6.0,
  10,
  '/audio/travel-conversation.mp3',
  true
),
(
  'university-orientation',
  'University Orientation Talk',
  'A campus orientation presentation for new students covering facilities, schedules, and student services.',
  'intermediate',
  5.5,
  7.0,
  15,
  '/audio/university-orientation.mp3',
  true
),
(
  'environmental-lecture',
  'Environmental Science Lecture',
  'An academic lecture on renewable energy sources and their role in combating climate change.',
  'advanced',
  6.5,
  8.0,
  20,
  '/audio/environmental-lecture.mp3',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- WRITING TASKS (Ordered: Task 1 → Task 2, Beginner → Advanced)
-- ============================================================
INSERT INTO ielts_writing_tasks (
  slug,
  task_type,
  title,
  prompt,
  bands_target,
  sample_answer,
  is_active
) VALUES
(
  'bar-chart-population',
  'task1',
  'Population Changes Bar Chart',
  'The bar chart below shows population changes in three cities between 2000 and 2020. Summarize the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
  '5.0-7.0',
  'The bar chart illustrates population changes across three cities over a twenty-year period from 2000 to 2020...',
  true
),
(
  'technology-education',
  'task2',
  'Technology in Education',
  'Some people believe that technology has made learning easier and more accessible, while others think it has created more distractions. Discuss both views and give your own opinion. Write at least 250 words.',
  '5.5-7.5',
  'In the modern educational landscape, technology has become increasingly prevalent...',
  true
),
(
  'environmental-responsibility',
  'task2',
  'Environmental Responsibility',
  'Some people think that environmental problems should be solved on a global scale, while others believe individual responsibility is more important. Discuss both views and give your opinion. Write at least 250 words.',
  '6.0-8.0',
  'Environmental degradation is one of the most pressing challenges facing humanity today...',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SPEAKING TASKS (Ordered: Part 1 → Part 2 → Part 3)
-- ============================================================
INSERT INTO ielts_speaking_tasks (
  slug,
  part,
  prompt,
  follow_ups,
  is_active
) VALUES
(
  'hometown-introduction',
  1,
  'Let''s talk about your hometown. Can you describe where you come from?',
  '{
    "questions": [
      "What do you like most about your hometown?",
      "Has your hometown changed much since you were a child?",
      "Would you like to live there in the future?"
    ],
    "time_limit": 4,
    "preparation_time": 0
  }'::jsonb,
  true
),
(
  'memorable-journey',
  2,
  'Describe a memorable journey you have made. You should say: where you went, who you went with, what you did there, and explain why this journey was memorable.',
  '{
    "preparation_time": 60,
    "speaking_time": 120,
    "cue_card_points": [
      "Where you went",
      "Who you went with",
      "What you did there",
      "Why it was memorable"
    ]
  }'::jsonb,
  true
),
(
  'travel-tourism-discussion',
  3,
  'Let''s discuss travel and tourism in more depth.',
  '{
    "questions": [
      "How has tourism changed in your country over the past few decades?",
      "What are the positive and negative impacts of mass tourism?",
      "Do you think virtual reality could replace real travel in the future?",
      "How can countries balance tourism development with environmental protection?"
    ],
    "time_limit": 5,
    "preparation_time": 0
  }'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Verify the data was inserted
SELECT id, slug, title, level, is_active 
FROM ielts_reading_sets 
ORDER BY level, title;
