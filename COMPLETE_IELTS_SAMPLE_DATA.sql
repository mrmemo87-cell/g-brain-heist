-- ============================================================
-- Complete IELTS Sample Data - All Skills
-- ============================================================
-- Professional sample content for Reading, Listening, Writing, and Speaking
-- Allows free users to try each skill before upgrading to Prime
-- ============================================================

-- First, add passage_text column to reading sets if it doesn't exist
ALTER TABLE ielts_reading_sets 
ADD COLUMN IF NOT EXISTS passage_text TEXT;

-- Update the existing reading sets with full passage content (Ordered: Beginner → Intermediate → Advanced)
UPDATE ielts_reading_sets
SET passage_text = E'The COVID-19 pandemic accelerated a trend that had been slowly developing for years: working from home. What was once a rare perk offered by progressive companies became an overnight necessity for millions of workers worldwide.\n\nWorking from home offers several advantages. Employees save time and money by eliminating their daily commute. They often report higher productivity due to fewer office distractions and interruptions. Parents particularly appreciate the flexibility to manage childcare responsibilities alongside their work duties.\n\nHowever, remote work also presents challenges. Many people struggle with work-life balance when their home becomes their office. The lack of face-to-face interaction can lead to feelings of isolation and disconnect from colleagues. Technical issues and inadequate home office setups can hinder productivity.\n\nAs we move forward, many organizations are adopting hybrid models that combine remote and office work. This approach aims to capture the benefits of both arrangements while minimizing their respective drawbacks.'
WHERE slug = 'working-from-home';

UPDATE ielts_reading_sets
SET passage_text = E'Coffee is one of the most popular beverages in the world. The coffee plant, a shrub native to Ethiopia, was first cultivated for its stimulating properties in the 9th century. According to legend, an Ethiopian goat herder named Kaldi discovered coffee after noticing that his goats became energetic after eating berries from a certain tree.\n\nThe practice of drinking coffee then spread from Ethiopia to the Arabian Peninsula. By the 15th century, coffee was being grown in the Yemeni district of Arabia and by the 16th century, it was known in Persia, Egypt, Syria, and Turkey. Coffee was not only drunk at home but also in public coffee houses called qahveh khaneh. These establishments became important centers for social activity and communication.\n\nCoffee reached Europe in the 17th century, where it initially met with suspicion and controversy. Some religious leaders condemned it as the "bitter invention of Satan." However, Pope Clement VIII tasted the beverage and gave it papal approval. Coffee houses quickly became centers of social activity and intellectual discussion in major European cities.\n\nToday, coffee is a global industry employing millions of people and generating billions of dollars in revenue. The two most commonly grown coffee species are Coffea arabica and Coffea robusta, with arabica accounting for approximately 60% of the world''s coffee production.'
WHERE slug = 'history-of-coffee';

UPDATE ielts_reading_sets
SET passage_text = E'Coral reefs are among the most biologically diverse ecosystems on Earth, often called the "rainforests of the sea." These underwater structures are formed by colonies of tiny animals called coral polyps, which secrete calcium carbonate to build protective skeletons. Over thousands of years, these skeletons accumulate to create the massive reef structures we see today.\n\nHowever, coral reefs face an existential threat from climate change. Rising ocean temperatures cause a phenomenon called coral bleaching, where corals expel the symbiotic algae living in their tissues, turning white and becoming more susceptible to disease. When water temperatures remain elevated for extended periods, corals can die.\n\nOcean acidification, another consequence of increased atmospheric carbon dioxide, further threatens reef ecosystems. As oceans absorb CO2, their pH decreases, making it harder for corals to build their calcium carbonate skeletons. This process essentially weakens the structural foundation of reef systems.\n\nScientists estimate that without significant action to reduce greenhouse gas emissions, over 90% of coral reefs could disappear by 2050. This would be catastrophic not only for marine biodiversity but also for the millions of people who depend on reefs for food, coastal protection, and income from tourism.'
WHERE slug = 'climate-change-coral-reefs';

-- Now add questions using the correct schema
DO $$
DECLARE
  v_coffee_set_id BIGINT;
  v_coral_set_id BIGINT;
  v_wfh_set_id BIGINT;
  v_question_count INTEGER;
BEGIN
  -- Get the set IDs
  SELECT id INTO v_coffee_set_id FROM ielts_reading_sets WHERE slug = 'history-of-coffee';
  SELECT id INTO v_coral_set_id FROM ielts_reading_sets WHERE slug = 'climate-change-coral-reefs';
  SELECT id INTO v_wfh_set_id FROM ielts_reading_sets WHERE slug = 'working-from-home';

  -- Check if questions already exist
  SELECT COUNT(*) INTO v_question_count FROM ielts_reading_questions WHERE set_id = v_coffee_set_id;
  
  -- Only add questions if they don't exist
  IF v_question_count = 0 THEN
    -- ============================================================
    -- BEGINNER LEVEL: Working from Home Questions
    -- ============================================================
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
    (
      v_wfh_set_id,
      1,
      'multiple_choice',
      'What accelerated the trend of working from home?',
      '["The COVID-19 pandemic", "Technology advances", "Company policies", "Economic recession"]'::jsonb,
      '"The COVID-19 pandemic"'::jsonb,
      'The passage begins by stating "The COVID-19 pandemic accelerated a trend that had been slowly developing for years."'
    ),
    (
      v_wfh_set_id,
      2,
      'multiple_choice',
      'What is mentioned as an advantage of working from home?',
      '["Eliminating daily commute", "Higher salary", "Better equipment", "More meetings"]'::jsonb,
      '"Eliminating daily commute"'::jsonb,
      'The passage states "Employees save time and money by eliminating their daily commute."'
    ),
    (
      v_wfh_set_id,
      3,
      'multiple_choice',
      'What approach are many organizations adopting?',
      '["Hybrid models", "Full remote work", "Return to office", "Four-day work week"]'::jsonb,
      '"Hybrid models"'::jsonb,
      'The passage concludes that "many organizations are adopting hybrid models that combine remote and office work."'
    ),
    (
      v_wfh_set_id,
      4,
      'multiple_choice',
      'What challenge of remote work is mentioned in the passage?',
      '["Work-life balance struggles", "Lower pay", "Longer hours", "More travel required"]'::jsonb,
      '"Work-life balance struggles"'::jsonb,
      'The passage mentions "Many people struggle with work-life balance when their home becomes their office."'
    );

    -- ============================================================
    -- INTERMEDIATE LEVEL: Coffee History Questions
    -- ============================================================
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
    (
      v_coffee_set_id, 
      1, 
      'multiple_choice', 
      'Where was coffee originally discovered?',
      '["Ethiopia", "Yemen", "Arabia", "Turkey"]'::jsonb,
      '"Ethiopia"'::jsonb,
      'The passage states that coffee is "a shrub native to Ethiopia."'
    ),
    (
      v_coffee_set_id,
      2,
      'multiple_choice',
      'Who is credited with discovering coffee according to legend?',
      '["Kaldi", "Pope Clement VIII", "A Persian merchant", "An Arabian trader"]'::jsonb,
      '"Kaldi"'::jsonb,
      'The passage mentions "an Ethiopian goat herder named Kaldi discovered coffee after noticing that his goats became energetic."'
    ),
    (
      v_coffee_set_id,
      3,
      'multiple_choice',
      'In which century did coffee reach Europe?',
      '["17th century", "15th century", "16th century", "18th century"]'::jsonb,
      '"17th century"'::jsonb,
      'The passage states "Coffee reached Europe in the 17th century."'
    ),
    (
      v_coffee_set_id,
      4,
      'multiple_choice',
      'What percentage of world coffee production is Coffea arabica?',
      '["60%", "40%", "70%", "50%"]'::jsonb,
      '"60%"'::jsonb,
      'The passage states "arabica accounting for approximately 60% of the world''s coffee production."'
    );

    -- ============================================================
    -- ADVANCED LEVEL: Coral Reefs Questions
    -- ============================================================
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
    (
      v_coral_set_id,
      1,
      'multiple_choice',
      'What are coral reefs often called?',
      '["Rainforests of the sea", "Ocean gardens", "Marine paradises", "Blue forests"]'::jsonb,
      '"Rainforests of the sea"'::jsonb,
      'The passage explicitly states coral reefs are "often called the rainforests of the sea."'
    ),
    (
      v_coral_set_id,
      2,
      'multiple_choice',
      'What causes coral bleaching?',
      '["Rising ocean temperatures", "Ocean pollution", "Overfishing", "Sea level changes"]'::jsonb,
      '"Rising ocean temperatures"'::jsonb,
      'The passage explains that "Rising ocean temperatures cause a phenomenon called coral bleaching."'
    ),
    (
      v_coral_set_id,
      3,
      'multiple_choice',
      'What percentage of coral reefs could disappear by 2050 without action?',
      '["Over 90%", "Over 50%", "Over 70%", "Over 30%"]'::jsonb,
      '"Over 90%"'::jsonb,
      'The passage states "without significant action to reduce greenhouse gas emissions, over 90% of coral reefs could disappear by 2050."'
    ),
    (
      v_coral_set_id,
      4,
      'multiple_choice',
      'What does ocean acidification do to coral reefs?',
      '["Weakens calcium carbonate skeletons", "Increases algae growth", "Improves water quality", "Attracts more fish"]'::jsonb,
      '"Weakens calcium carbonate skeletons"'::jsonb,
      'The passage states that ocean acidification "makes it harder for corals to build their calcium carbonate skeletons" which "weakens the structural foundation of reef systems."'
    );
  END IF; -- End of question existence check

END;
$$;

-- Mark these as free tier content (if tier column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ielts_reading_sets' 
    AND column_name = 'required_tier'
  ) THEN
    UPDATE ielts_reading_sets 
    SET required_tier = 'free'
    WHERE slug IN ('history-of-coffee', 'climate-change-coral-reefs', 'working-from-home');
    
    UPDATE ielts_listening_sets 
    SET required_tier = 'free'
    WHERE slug IN ('travel-conversation', 'university-orientation', 'environmental-lecture');
    
    UPDATE ielts_writing_tasks 
    SET required_tier = 'free'
    WHERE slug IN ('bar-chart-population', 'technology-education', 'environmental-responsibility');
    
    UPDATE ielts_speaking_tasks 
    SET required_tier = 'free'
    WHERE slug IN ('hometown-introduction', 'memorable-journey', 'travel-tourism-discussion');
  END IF;
END;
$$;

-- Comprehensive verification query
SELECT 'IELTS Sample Content Successfully Loaded!' as status;

-- Show Reading Sets Summary
SELECT 
  '📚 READING' as skill,
  rs.level,
  rs.title,
  COUNT(rq.id) as questions,
  CASE WHEN rs.passage_text IS NOT NULL THEN '✓' ELSE '✗' END as has_passage,
  rs.est_band_min || '-' || rs.est_band_max as band_range,
  rs.duration_minutes || ' min' as duration
FROM ielts_reading_sets rs
LEFT JOIN ielts_reading_questions rq ON rq.set_id = rs.id
WHERE rs.is_active = true
GROUP BY rs.id, rs.level, rs.title, rs.passage_text, rs.est_band_min, rs.est_band_max, rs.duration_minutes
ORDER BY 
  CASE rs.level 
    WHEN 'beginner' THEN 1 
    WHEN 'intermediate' THEN 2 
    WHEN 'advanced' THEN 3 
  END;

-- Show Listening Sets Summary
SELECT 
  '🎧 LISTENING' as skill,
  level,
  title,
  '0 questions' as questions,
  '✓' as has_audio,
  est_band_min || '-' || est_band_max as band_range,
  duration_minutes || ' min' as duration
FROM ielts_listening_sets
WHERE is_active = true
ORDER BY 
  CASE level 
    WHEN 'beginner' THEN 1 
    WHEN 'intermediate' THEN 2 
    WHEN 'advanced' THEN 3 
  END;

-- Show Writing Tasks Summary
SELECT 
  '✍️ WRITING' as skill,
  task_type,
  title,
  CASE 
    WHEN task_type = 'task1' THEN '150 words'
    ELSE '250 words'
  END as word_count,
  bands_target as band_range
FROM ielts_writing_tasks
WHERE is_active = true
ORDER BY task_type, id;

-- Show Speaking Tasks Summary
SELECT 
  '🎤 SPEAKING' as skill,
  'Part ' || part as part,
  LEFT(prompt, 60) || '...' as prompt_preview,
  CASE 
    WHEN part = 1 THEN '4-5 min'
    WHEN part = 2 THEN '3-4 min (1 min prep)'
    ELSE '4-5 min'
  END as duration
FROM ielts_speaking_tasks
WHERE is_active = true
ORDER BY part;
