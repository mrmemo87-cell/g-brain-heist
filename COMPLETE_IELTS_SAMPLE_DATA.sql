-- ============================================================
-- Complete IELTS Sample Data with Passages and Questions
-- ============================================================
-- This adds complete reading passages with questions so students
-- can actually practice and see results
-- ============================================================

-- First, add passage_text column to reading sets if it doesn't exist
ALTER TABLE ielts_reading_sets 
ADD COLUMN IF NOT EXISTS passage_text TEXT;

-- Update the existing reading sets with full passage content
UPDATE ielts_reading_sets
SET passage_text = E'Coffee is one of the most popular beverages in the world. The coffee plant, a shrub native to Ethiopia, was first cultivated for its stimulating properties in the 9th century. According to legend, an Ethiopian goat herder named Kaldi discovered coffee after noticing that his goats became energetic after eating berries from a certain tree.\n\nThe practice of drinking coffee then spread from Ethiopia to the Arabian Peninsula. By the 15th century, coffee was being grown in the Yemeni district of Arabia and by the 16th century, it was known in Persia, Egypt, Syria, and Turkey. Coffee was not only drunk at home but also in public coffee houses called qahveh khaneh. These establishments became important centers for social activity and communication.\n\nCoffee reached Europe in the 17th century, where it initially met with suspicion and controversy. Some religious leaders condemned it as the "bitter invention of Satan." However, Pope Clement VIII tasted the beverage and gave it papal approval. Coffee houses quickly became centers of social activity and intellectual discussion in major European cities.\n\nToday, coffee is a global industry employing millions of people and generating billions of dollars in revenue. The two most commonly grown coffee species are Coffea arabica and Coffea robusta, with arabica accounting for approximately 60% of the world''s coffee production.'
WHERE slug = 'history-of-coffee';

UPDATE ielts_reading_sets
SET passage_text = E'Coral reefs are among the most biologically diverse ecosystems on Earth, often called the "rainforests of the sea." These underwater structures are formed by colonies of tiny animals called coral polyps, which secrete calcium carbonate to build protective skeletons. Over thousands of years, these skeletons accumulate to create the massive reef structures we see today.\n\nHowever, coral reefs face an existential threat from climate change. Rising ocean temperatures cause a phenomenon called coral bleaching, where corals expel the symbiotic algae living in their tissues, turning white and becoming more susceptible to disease. When water temperatures remain elevated for extended periods, corals can die.\n\nOcean acidification, another consequence of increased atmospheric carbon dioxide, further threatens reef ecosystems. As oceans absorb CO2, their pH decreases, making it harder for corals to build their calcium carbonate skeletons. This process essentially weakens the structural foundation of reef systems.\n\nScientists estimate that without significant action to reduce greenhouse gas emissions, over 90% of coral reefs could disappear by 2050. This would be catastrophic not only for marine biodiversity but also for the millions of people who depend on reefs for food, coastal protection, and income from tourism.'
WHERE slug = 'climate-change-coral-reefs';

UPDATE ielts_reading_sets
SET passage_text = E'The COVID-19 pandemic accelerated a trend that had been slowly developing for years: working from home. What was once a rare perk offered by progressive companies became an overnight necessity for millions of workers worldwide.\n\nWorking from home offers several advantages. Employees save time and money by eliminating their daily commute. They often report higher productivity due to fewer office distractions and interruptions. Parents particularly appreciate the flexibility to manage childcare responsibilities alongside their work duties.\n\nHowever, remote work also presents challenges. Many people struggle with work-life balance when their home becomes their office. The lack of face-to-face interaction can lead to feelings of isolation and disconnect from colleagues. Technical issues and inadequate home office setups can hinder productivity.\n\nAs we move forward, many organizations are adopting hybrid models that combine remote and office work. This approach aims to capture the benefits of both arrangements while minimizing their respective drawbacks.'
WHERE slug = 'working-from-home';

-- Now add questions using the correct schema
DO $$
DECLARE
  v_coffee_set_id BIGINT;
  v_coral_set_id BIGINT;
  v_wfh_set_id BIGINT;
BEGIN
  -- Get the set IDs
  SELECT id INTO v_coffee_set_id FROM ielts_reading_sets WHERE slug = 'history-of-coffee';
  SELECT id INTO v_coral_set_id FROM ielts_reading_sets WHERE slug = 'climate-change-coral-reefs';
  SELECT id INTO v_wfh_set_id FROM ielts_reading_sets WHERE slug = 'working-from-home';

  -- Add questions for Coffee passage (using actual schema: question_order, question_type, body, options, correct_answer, explanation)
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
    'The passage mentions "an Ethiopian goat herder named Kaldi discovered coffee."'
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

  -- Add questions for Coral Reefs passage
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
    'The passage states "over 90% of coral reefs could disappear by 2050."'
  );

  -- Add questions for Working from Home passage
  INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
  (
    v_wfh_set_id,
    1,
    'multiple_choice',
    'What accelerated the trend of working from home?',
    '["The COVID-19 pandemic", "Technology advances", "Company policies", "Economic recession"]'::jsonb,
    '"The COVID-19 pandemic"'::jsonb,
    'The passage begins by stating "The COVID-19 pandemic accelerated a trend."'
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
    'The passage concludes that "many organizations are adopting hybrid models."'
  );

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
  END IF;
END;
$$;

-- Verify
SELECT 'Sample content with questions created!' as status;
SELECT rs.title, rs.slug, COUNT(rq.id) as question_count, 
       CASE WHEN rs.passage_text IS NOT NULL THEN 'Yes' ELSE 'No' END as has_passage
FROM ielts_reading_sets rs
LEFT JOIN ielts_reading_questions rq ON rq.set_id = rs.id
GROUP BY rs.id, rs.title, rs.slug, rs.passage_text
ORDER BY rs.slug;
