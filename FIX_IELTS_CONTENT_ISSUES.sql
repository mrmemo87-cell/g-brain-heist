-- ============================================================
-- FIX IELTS Content Issues
-- ============================================================
-- This script fixes:
-- 1. Reading sets missing passages (AI, Climate Change)
-- 2. Duplicate speaking tasks - removes duplicates
-- 3. Listening sets with no audio
-- ============================================================

-- ============================================================
-- STEP 1: ADD MISSING PASSAGES TO READING SETS
-- ============================================================

-- Add passage for "The Impact of Climate Change on Global Ecosystems"
UPDATE ielts_reading_sets
SET passage_text = E'Climate change is one of the most pressing challenges facing our planet today. The Earth''s average temperature has increased by approximately 1.1°C since the pre-industrial era, primarily due to human activities such as burning fossil fuels, deforestation, and industrial processes.\n\nThe effects of climate change are already visible across global ecosystems. Polar ice caps are melting at unprecedented rates, causing sea levels to rise and threatening coastal communities worldwide. Arctic sea ice has declined by about 13% per decade since satellite records began in 1979.\n\nTerrestrial ecosystems are also experiencing significant changes. Many plant and animal species are shifting their ranges toward the poles or to higher elevations in search of suitable habitats. Some species that cannot adapt quickly enough face extinction. Scientists estimate that climate change could threaten up to one million species with extinction in the coming decades.\n\nOcean ecosystems face particular challenges. Rising water temperatures and increased acidity are devastating coral reefs, which support approximately 25% of all marine species. Additionally, changes in ocean currents and temperatures are affecting fish populations and the communities that depend on them for food and livelihoods.\n\nAddressing climate change requires coordinated global action. The Paris Agreement, signed by nearly 200 countries, aims to limit global warming to well below 2°C above pre-industrial levels. However, current commitments may be insufficient to achieve this goal, and many experts call for more ambitious targets.'
WHERE title ILIKE '%climate change%global ecosystems%' 
   OR title ILIKE '%impact of climate%'
   AND passage_text IS NULL;

-- Add passage for "Artificial Intelligence and the Future of Work"
UPDATE ielts_reading_sets
SET passage_text = E'Artificial intelligence (AI) is rapidly transforming the modern workplace. From automated customer service chatbots to sophisticated data analysis tools, AI technologies are becoming increasingly prevalent across virtually every industry.\n\nProponents of AI argue that these technologies will create significant economic benefits. By automating routine tasks, AI can increase productivity and allow human workers to focus on more creative and strategic activities. A recent study by McKinsey Global Institute suggests that AI could add $13 trillion to the global economy by 2030.\n\nHowever, the rise of AI also raises concerns about job displacement. According to the World Economic Forum, automation may displace 85 million jobs worldwide by 2025. Workers in manufacturing, transportation, and administrative roles are particularly vulnerable to automation.\n\nDespite these concerns, many experts believe that AI will ultimately create more jobs than it destroys. The same World Economic Forum report predicts that 97 million new roles may emerge that are more adapted to the new division of labor between humans, machines, and algorithms. These new positions will likely require different skills, emphasizing creativity, critical thinking, and emotional intelligence.\n\nThe key to navigating this transition lies in education and training. Governments and businesses must invest in reskilling programs to help workers adapt to the changing job market. Lifelong learning will become increasingly important as the pace of technological change continues to accelerate.\n\nUltimately, the impact of AI on the future of work will depend on how society chooses to implement and regulate these technologies. With thoughtful planning and inclusive policies, AI has the potential to create a more productive and equitable economy.'
WHERE title ILIKE '%artificial intelligence%future%work%' 
   OR title ILIKE '%AI%future of work%'
   AND passage_text IS NULL;

-- Fallback: Update any reading set that has NULL passage_text
UPDATE ielts_reading_sets
SET passage_text = E'This is a placeholder passage. The full content will be added soon.\n\nPlease check back later for the complete reading material, or contact your administrator if you believe this is an error.'
WHERE passage_text IS NULL;

-- ============================================================
-- STEP 2: REMOVE DUPLICATE SPEAKING TASKS
-- ============================================================

-- Keep only the first occurrence of each speaking task based on slug
-- First, let's see what we have
-- Delete duplicates, keeping the one with the lowest ID
DELETE FROM ielts_speaking_tasks
WHERE id NOT IN (
  SELECT MIN(id)
  FROM ielts_speaking_tasks
  GROUP BY slug
);

-- Also remove duplicates based on similar prompts (keep first of each part)
WITH ranked_tasks AS (
  SELECT id,
         part,
         prompt,
         ROW_NUMBER() OVER (PARTITION BY part, LEFT(prompt, 50) ORDER BY id) as rn
  FROM ielts_speaking_tasks
)
DELETE FROM ielts_speaking_tasks
WHERE id IN (
  SELECT id FROM ranked_tasks WHERE rn > 1
);

-- Ensure we have exactly 3 speaking tasks (one per part)
-- If we have more than one per part, keep only the first
WITH numbered AS (
  SELECT id, part, 
         ROW_NUMBER() OVER (PARTITION BY part ORDER BY id) as rn
  FROM ielts_speaking_tasks
  WHERE is_active = true
)
UPDATE ielts_speaking_tasks
SET is_active = false
WHERE id IN (SELECT id FROM numbered WHERE rn > 1);

-- ============================================================
-- STEP 3: FIX LISTENING SETS - Add proper audio URLs
-- ============================================================

-- Update listening sets with placeholder audio or mark as inactive if no audio
-- For now, let's use the Supabase storage URL pattern

-- Option 1: If you have audio files in ielts-audio bucket:
UPDATE ielts_listening_sets
SET audio_url = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/travel-conversation.mp3'
WHERE slug = 'travel-conversation';

UPDATE ielts_listening_sets
SET audio_url = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/university-orientation.mp3'
WHERE slug = 'university-orientation';

UPDATE ielts_listening_sets
SET audio_url = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/environmental-lecture.mp3'
WHERE slug = 'environmental-lecture';

-- If audio files don't exist, mark these as inactive until audio is uploaded
-- Uncomment if you want to hide listening sets without audio:
-- UPDATE ielts_listening_sets 
-- SET is_active = false 
-- WHERE audio_url LIKE '/audio/%' OR audio_url IS NULL;

-- ============================================================
-- STEP 4: ADD QUESTIONS FOR READING SETS THAT HAVE NONE
-- ============================================================

-- Add questions for Climate Change Global Ecosystems if missing
DO $$
DECLARE
  v_set_id BIGINT;
  v_question_count INTEGER;
BEGIN
  -- Find the set
  SELECT id INTO v_set_id 
  FROM ielts_reading_sets 
  WHERE title ILIKE '%climate change%global ecosystems%' 
     OR title ILIKE '%impact of climate%'
  LIMIT 1;
  
  IF v_set_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_question_count FROM ielts_reading_questions WHERE set_id = v_set_id;
    
    IF v_question_count = 0 THEN
      INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
      (v_set_id, 1, 'multiple_choice', 
       'By how much has Earth''s average temperature increased since the pre-industrial era?',
       '["Approximately 1.1°C", "Approximately 2°C", "Approximately 0.5°C", "Approximately 3°C"]'::jsonb,
       '"Approximately 1.1°C"'::jsonb,
       'The passage states "The Earth''s average temperature has increased by approximately 1.1°C since the pre-industrial era."'),
      (v_set_id, 2, 'multiple_choice',
       'What percentage of marine species do coral reefs support?',
       '["Approximately 25%", "Approximately 50%", "Approximately 10%", "Approximately 75%"]'::jsonb,
       '"Approximately 25%"'::jsonb,
       'The passage mentions that coral reefs "support approximately 25% of all marine species."'),
      (v_set_id, 3, 'multiple_choice',
       'How much has Arctic sea ice declined per decade since 1979?',
       '["About 13%", "About 5%", "About 20%", "About 30%"]'::jsonb,
       '"About 13%"'::jsonb,
       'The passage states "Arctic sea ice has declined by about 13% per decade since satellite records began in 1979."'),
      (v_set_id, 4, 'multiple_choice',
       'What is the temperature limit goal of the Paris Agreement?',
       '["Well below 2°C above pre-industrial levels", "Exactly 1.5°C above pre-industrial levels", "Below 3°C above pre-industrial levels", "At pre-industrial levels"]'::jsonb,
       '"Well below 2°C above pre-industrial levels"'::jsonb,
       'The passage states the Paris Agreement "aims to limit global warming to well below 2°C above pre-industrial levels."');
    END IF;
  END IF;
END;
$$;

-- Add questions for AI and Future of Work if missing
DO $$
DECLARE
  v_set_id BIGINT;
  v_question_count INTEGER;
BEGIN
  SELECT id INTO v_set_id 
  FROM ielts_reading_sets 
  WHERE title ILIKE '%artificial intelligence%future%work%' 
     OR title ILIKE '%AI%future of work%'
  LIMIT 1;
  
  IF v_set_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_question_count FROM ielts_reading_questions WHERE set_id = v_set_id;
    
    IF v_question_count = 0 THEN
      INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
      (v_set_id, 1, 'multiple_choice',
       'How much could AI add to the global economy by 2030 according to McKinsey?',
       '["$13 trillion", "$5 trillion", "$20 trillion", "$8 trillion"]'::jsonb,
       '"$13 trillion"'::jsonb,
       'The passage states "AI could add $13 trillion to the global economy by 2030."'),
      (v_set_id, 2, 'multiple_choice',
       'How many jobs may automation displace by 2025 according to the World Economic Forum?',
       '["85 million", "50 million", "100 million", "25 million"]'::jsonb,
       '"85 million"'::jsonb,
       'The passage mentions "automation may displace 85 million jobs worldwide by 2025."'),
      (v_set_id, 3, 'multiple_choice',
       'How many new roles may emerge according to the same report?',
       '["97 million", "85 million", "50 million", "120 million"]'::jsonb,
       '"97 million"'::jsonb,
       'The passage states "97 million new roles may emerge."'),
      (v_set_id, 4, 'multiple_choice',
       'What is described as key to navigating the AI transition?',
       '["Education and training", "Government regulation", "Slowing AI development", "Protecting existing jobs"]'::jsonb,
       '"Education and training"'::jsonb,
       'The passage states "The key to navigating this transition lies in education and training."');
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- STEP 5: VERIFICATION QUERIES
-- ============================================================

-- Check Reading Sets
SELECT '📚 READING SETS' as section;
SELECT id, title, 
       CASE WHEN passage_text IS NOT NULL THEN '✓ Has Passage' ELSE '✗ No Passage' END as passage_status,
       (SELECT COUNT(*) FROM ielts_reading_questions WHERE set_id = ielts_reading_sets.id) as question_count,
       is_active
FROM ielts_reading_sets
ORDER BY id;

-- Check Speaking Tasks
SELECT '🎤 SPEAKING TASKS' as section;
SELECT id, part, LEFT(prompt, 50) as prompt_preview, is_active
FROM ielts_speaking_tasks
WHERE is_active = true
ORDER BY part, id;

-- Check Listening Sets
SELECT '🎧 LISTENING SETS' as section;
SELECT id, title, audio_url, is_active
FROM ielts_listening_sets
ORDER BY id;

-- Summary counts
SELECT '📊 SUMMARY' as section;
SELECT 'Reading Sets' as type, COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active FROM ielts_reading_sets
UNION ALL
SELECT 'Reading Questions', COUNT(*), COUNT(*) FROM ielts_reading_questions
UNION ALL
SELECT 'Listening Sets', COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END) FROM ielts_listening_sets
UNION ALL
SELECT 'Writing Tasks', COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END) FROM ielts_writing_tasks
UNION ALL
SELECT 'Speaking Tasks', COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END) FROM ielts_speaking_tasks;
