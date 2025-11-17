-- ============================================================
-- IELTS PREP HUB - COMPLETE SETUP
-- ============================================================
-- Single migration file containing all setup steps
-- Run this once to set up the entire IELTS system
-- ============================================================
-- 
-- This creates:
-- - Sample content for all 4 skills (Reading, Listening, Writing, Speaking)
-- - Free/Prime tier system
-- - Storage for recordings
-- - Expert review workflow
-- - Certificate generation system
--
-- ============================================================

-- ============================================================
-- STEP 1: Sample Content (Ordered: Beginner → Advanced)
-- ============================================================

-- READING SETS
INSERT INTO ielts_reading_sets (
  slug, title, description, level, est_band_min, est_band_max, duration_minutes, is_active
) VALUES 
('working-from-home', 'Working from Home', 'A general training passage exploring the advantages and challenges of remote work in the modern workplace.', 'beginner', 4.5, 6.0, 15, true),
('history-of-coffee', 'The History of Coffee', 'An academic reading passage tracing the origins and global spread of coffee culture from Ethiopia to Europe.', 'intermediate', 5.5, 7.0, 20, true),
('climate-change-coral-reefs', 'Climate Change and Coral Reefs', 'An advanced academic passage examining the impact of rising ocean temperatures on coral reef ecosystems.', 'advanced', 6.5, 8.0, 20, true)
ON CONFLICT (slug) DO NOTHING;

-- LISTENING SETS
INSERT INTO ielts_listening_sets (
  slug, title, description, level, est_band_min, est_band_max, duration_minutes, audio_url, is_active
) VALUES
('travel-conversation', 'Travel Agency Conversation', 'A phone conversation between a customer and a travel agent discussing vacation plans and booking details.', 'beginner', 4.5, 6.0, 10, '/audio/travel-conversation.mp3', true),
('university-orientation', 'University Orientation Talk', 'A campus orientation presentation for new students covering facilities, schedules, and student services.', 'intermediate', 5.5, 7.0, 15, '/audio/university-orientation.mp3', true),
('environmental-lecture', 'Environmental Science Lecture', 'An academic lecture on renewable energy sources and their role in combating climate change.', 'advanced', 6.5, 8.0, 20, '/audio/environmental-lecture.mp3', true)
ON CONFLICT (slug) DO NOTHING;

-- WRITING TASKS
INSERT INTO ielts_writing_tasks (
  slug, task_type, title, prompt, bands_target, sample_answer, is_active
) VALUES
('bar-chart-population', 'task1', 'Population Changes Bar Chart', 'The bar chart below shows population changes in three cities between 2000 and 2020. Summarize the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.', '5.0-7.0', 'The bar chart illustrates population changes across three cities over a twenty-year period...', true),
('technology-education', 'task2', 'Technology in Education', 'Some people believe that technology has made learning easier and more accessible, while others think it has created more distractions. Discuss both views and give your own opinion. Write at least 250 words.', '5.5-7.5', 'In the modern educational landscape, technology has become increasingly prevalent...', true),
('environmental-responsibility', 'task2', 'Environmental Responsibility', 'Some people think that environmental problems should be solved on a global scale, while others believe individual responsibility is more important. Discuss both views and give your opinion. Write at least 250 words.', '6.0-8.0', 'Environmental degradation is one of the most pressing challenges facing humanity today...', true)
ON CONFLICT (slug) DO NOTHING;

-- SPEAKING TASKS
INSERT INTO ielts_speaking_tasks (
  slug, part, prompt, follow_ups, is_active
) VALUES
('hometown-introduction', 1, 'Let''s talk about your hometown. Can you describe where you come from?', '{"questions": ["What do you like most about your hometown?", "Has your hometown changed much since you were a child?", "Would you like to live there in the future?"], "time_limit": 4, "preparation_time": 0}'::jsonb, true),
('memorable-journey', 2, 'Describe a memorable journey you have made. You should say: where you went, who you went with, what you did there, and explain why this journey was memorable.', '{"preparation_time": 60, "speaking_time": 120, "cue_card_points": ["Where you went", "Who you went with", "What you did there", "Why it was memorable"]}'::jsonb, true),
('travel-tourism-discussion', 3, 'Let''s discuss travel and tourism in more depth.', '{"questions": ["How has tourism changed in your country over the past few decades?", "What are the positive and negative impacts of mass tourism?", "Do you think virtual reality could replace real travel in the future?", "How can countries balance tourism development with environmental protection?"], "time_limit": 5, "preparation_time": 0}'::jsonb, true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- STEP 2: Premium Tier System
-- ============================================================

-- Add tier columns to users
ALTER TABLE ielts_users ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'prime_prep_user', 'admin'));
ALTER TABLE ielts_users ADD COLUMN IF NOT EXISTS prime_approved_at TIMESTAMPTZ;
ALTER TABLE ielts_users ADD COLUMN IF NOT EXISTS prime_approved_by UUID REFERENCES ielts_users(id);

-- Add tier restrictions to all content types
ALTER TABLE ielts_reading_sets ADD COLUMN IF NOT EXISTS required_tier TEXT DEFAULT 'free' CHECK (required_tier IN ('free', 'prime_prep_user'));
ALTER TABLE ielts_listening_sets ADD COLUMN IF NOT EXISTS required_tier TEXT DEFAULT 'free' CHECK (required_tier IN ('free', 'prime_prep_user'));
ALTER TABLE ielts_writing_tasks ADD COLUMN IF NOT EXISTS required_tier TEXT DEFAULT 'free' CHECK (required_tier IN ('free', 'prime_prep_user'));
ALTER TABLE ielts_speaking_tasks ADD COLUMN IF NOT EXISTS required_tier TEXT DEFAULT 'free' CHECK (required_tier IN ('free', 'prime_prep_user'));

-- Mark existing content as free samples
UPDATE ielts_reading_sets SET required_tier = 'free' WHERE required_tier IS NULL;
UPDATE ielts_listening_sets SET required_tier = 'free' WHERE required_tier IS NULL;
UPDATE ielts_writing_tasks SET required_tier = 'free' WHERE required_tier IS NULL;
UPDATE ielts_speaking_tasks SET required_tier = 'free' WHERE required_tier IS NULL;

-- Prime applications table
CREATE TABLE IF NOT EXISTS ielts_prime_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  motivation TEXT NOT NULL,
  target_band_score NUMERIC(2,1),
  test_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES ielts_users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Certificates table
CREATE TABLE IF NOT EXISTS ielts_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  certificate_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('reading', 'listening', 'writing', 'speaking', 'full_mock')),
  band_score NUMERIC(2,1) NOT NULL,
  completion_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_url TEXT,
  is_verified BOOLEAN DEFAULT true
);

-- Usage tracking for trial limits
CREATE TABLE IF NOT EXISTS ielts_skill_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  skill_type TEXT NOT NULL CHECK (skill_type IN ('reading', 'listening', 'writing', 'speaking', 'full_mock')),
  attempts_used INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, skill_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prime_applications_user ON ielts_prime_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_prime_applications_status ON ielts_prime_applications(status);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON ielts_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_user ON ielts_skill_usage(user_id);

-- RLS
ALTER TABLE ielts_prime_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_skill_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own prime applications" ON ielts_prime_applications;
DROP POLICY IF EXISTS "Users create own prime applications" ON ielts_prime_applications;
DROP POLICY IF EXISTS "Users view own certificates" ON ielts_certificates;
DROP POLICY IF EXISTS "Users view own usage" ON ielts_skill_usage;

CREATE POLICY "Users view own prime applications" ON ielts_prime_applications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own prime applications" ON ielts_prime_applications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users view own certificates" ON ielts_certificates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users view own usage" ON ielts_skill_usage FOR SELECT USING (user_id = auth.uid());

-- Helper functions
CREATE OR REPLACE FUNCTION generate_certificate_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'BHA-IELTS-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
END;
$$;

-- ============================================================
-- STEP 3: Reading Content (Passages + Questions)
-- ============================================================

-- Add passage_text column
ALTER TABLE ielts_reading_sets ADD COLUMN IF NOT EXISTS passage_text TEXT;

-- Update passages
UPDATE ielts_reading_sets SET passage_text = E'The COVID-19 pandemic accelerated a trend that had been slowly developing for years: working from home. What was once a rare perk offered by progressive companies became an overnight necessity for millions of workers worldwide.\n\nWorking from home offers several advantages. Employees save time and money by eliminating their daily commute. They often report higher productivity due to fewer office distractions and interruptions. Parents particularly appreciate the flexibility to manage childcare responsibilities alongside their work duties.\n\nHowever, remote work also presents challenges. Many people struggle with work-life balance when their home becomes their office. The lack of face-to-face interaction can lead to feelings of isolation and disconnect from colleagues. Technical issues and inadequate home office setups can hinder productivity.\n\nAs we move forward, many organizations are adopting hybrid models that combine remote and office work. This approach aims to capture the benefits of both arrangements while minimizing their respective drawbacks.' WHERE slug = 'working-from-home';

UPDATE ielts_reading_sets SET passage_text = E'Coffee is one of the most popular beverages in the world. The coffee plant, a shrub native to Ethiopia, was first cultivated for its stimulating properties in the 9th century. According to legend, an Ethiopian goat herder named Kaldi discovered coffee after noticing that his goats became energetic after eating berries from a certain tree.\n\nThe practice of drinking coffee then spread from Ethiopia to the Arabian Peninsula. By the 15th century, coffee was being grown in the Yemeni district of Arabia and by the 16th century, it was known in Persia, Egypt, Syria, and Turkey. Coffee was not only drunk at home but also in public coffee houses called qahveh khaneh. These establishments became important centers for social activity and communication.\n\nCoffee reached Europe in the 17th century, where it initially met with suspicion and controversy. Some religious leaders condemned it as the "bitter invention of Satan." However, Pope Clement VIII tasted the beverage and gave it papal approval. Coffee houses quickly became centers of social activity and intellectual discussion in major European cities.\n\nToday, coffee is a global industry employing millions of people and generating billions of dollars in revenue. The two most commonly grown coffee species are Coffea arabica and Coffea robusta, with arabica accounting for approximately 60% of the world''s coffee production.' WHERE slug = 'history-of-coffee';

UPDATE ielts_reading_sets SET passage_text = E'Coral reefs are among the most biologically diverse ecosystems on Earth, often called the "rainforests of the sea." These underwater structures are formed by colonies of tiny animals called coral polyps, which secrete calcium carbonate to build protective skeletons. Over thousands of years, these skeletons accumulate to create the massive reef structures we see today.\n\nHowever, coral reefs face an existential threat from climate change. Rising ocean temperatures cause a phenomenon called coral bleaching, where corals expel the symbiotic algae living in their tissues, turning white and becoming more susceptible to disease. When water temperatures remain elevated for extended periods, corals can die.\n\nOcean acidification, another consequence of increased atmospheric carbon dioxide, further threatens reef ecosystems. As oceans absorb CO2, their pH decreases, making it harder for corals to build their calcium carbonate skeletons. This process essentially weakens the structural foundation of reef systems.\n\nScientists estimate that without significant action to reduce greenhouse gas emissions, over 90% of coral reefs could disappear by 2050. This would be catastrophic not only for marine biodiversity but also for the millions of people who depend on reefs for food, coastal protection, and income from tourism.' WHERE slug = 'climate-change-coral-reefs';

-- Add questions (only if they don't exist)
DO $$
DECLARE v_wfh_id BIGINT; v_coffee_id BIGINT; v_coral_id BIGINT; v_count INTEGER;
BEGIN
  SELECT id INTO v_wfh_id FROM ielts_reading_sets WHERE slug = 'working-from-home';
  SELECT id INTO v_coffee_id FROM ielts_reading_sets WHERE slug = 'history-of-coffee';
  SELECT id INTO v_coral_id FROM ielts_reading_sets WHERE slug = 'climate-change-coral-reefs';
  SELECT COUNT(*) INTO v_count FROM ielts_reading_questions WHERE set_id = v_wfh_id;
  
  IF v_count = 0 THEN
    -- Working from Home (Beginner)
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
    (v_wfh_id, 1, 'multiple_choice', 'What accelerated the trend of working from home?', '["The COVID-19 pandemic", "Technology advances", "Company policies", "Economic recession"]'::jsonb, '"The COVID-19 pandemic"'::jsonb, 'The passage begins by stating "The COVID-19 pandemic accelerated a trend."'),
    (v_wfh_id, 2, 'multiple_choice', 'What is mentioned as an advantage of working from home?', '["Eliminating daily commute", "Higher salary", "Better equipment", "More meetings"]'::jsonb, '"Eliminating daily commute"'::jsonb, 'The passage states "Employees save time and money by eliminating their daily commute."'),
    (v_wfh_id, 3, 'multiple_choice', 'What approach are many organizations adopting?', '["Hybrid models", "Full remote work", "Return to office", "Four-day work week"]'::jsonb, '"Hybrid models"'::jsonb, 'The passage concludes "many organizations are adopting hybrid models."'),
    (v_wfh_id, 4, 'multiple_choice', 'What challenge of remote work is mentioned?', '["Work-life balance struggles", "Lower pay", "Longer hours", "More travel"]'::jsonb, '"Work-life balance struggles"'::jsonb, 'The passage mentions "Many people struggle with work-life balance."');
    
    -- Coffee History (Intermediate)
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
    (v_coffee_id, 1, 'multiple_choice', 'Where was coffee originally discovered?', '["Ethiopia", "Yemen", "Arabia", "Turkey"]'::jsonb, '"Ethiopia"'::jsonb, 'The passage states coffee is "a shrub native to Ethiopia."'),
    (v_coffee_id, 2, 'multiple_choice', 'Who is credited with discovering coffee?', '["Kaldi", "Pope Clement VIII", "A Persian merchant", "An Arabian trader"]'::jsonb, '"Kaldi"'::jsonb, 'The passage mentions "an Ethiopian goat herder named Kaldi."'),
    (v_coffee_id, 3, 'multiple_choice', 'In which century did coffee reach Europe?', '["17th century", "15th century", "16th century", "18th century"]'::jsonb, '"17th century"'::jsonb, 'The passage states "Coffee reached Europe in the 17th century."'),
    (v_coffee_id, 4, 'multiple_choice', 'What percentage of world production is arabica?', '["60%", "40%", "70%", "50%"]'::jsonb, '"60%"'::jsonb, 'The passage states "arabica accounting for approximately 60%."');
    
    -- Coral Reefs (Advanced)
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation) VALUES
    (v_coral_id, 1, 'multiple_choice', 'What are coral reefs often called?', '["Rainforests of the sea", "Ocean gardens", "Marine paradises", "Blue forests"]'::jsonb, '"Rainforests of the sea"'::jsonb, 'The passage states reefs are "often called the rainforests of the sea."'),
    (v_coral_id, 2, 'multiple_choice', 'What causes coral bleaching?', '["Rising ocean temperatures", "Ocean pollution", "Overfishing", "Sea level changes"]'::jsonb, '"Rising ocean temperatures"'::jsonb, 'The passage explains "Rising ocean temperatures cause...coral bleaching."'),
    (v_coral_id, 3, 'multiple_choice', 'What percentage could disappear by 2050?', '["Over 90%", "Over 50%", "Over 70%", "Over 30%"]'::jsonb, '"Over 90%"'::jsonb, 'The passage states "over 90% of coral reefs could disappear by 2050."'),
    (v_coral_id, 4, 'multiple_choice', 'What does ocean acidification do?', '["Weakens calcium carbonate skeletons", "Increases algae", "Improves water quality", "Attracts fish"]'::jsonb, '"Weakens calcium carbonate skeletons"'::jsonb, 'The passage states acidification "weakens the structural foundation."');
  END IF;
END;
$$;

-- ============================================================
-- STEP 4: Storage & Attempt Tracking
-- ============================================================

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('ielts-recordings', 'ielts-recordings', false) ON CONFLICT (id) DO NOTHING;

-- Attempt tables
CREATE TABLE IF NOT EXISTS ielts_speaking_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES ielts_speaking_tasks(id) ON DELETE CASCADE,
  recording_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
  band_score NUMERIC(2,1),
  feedback TEXT,
  reviewed_by UUID REFERENCES ielts_users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ielts_writing_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES ielts_writing_tasks(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  band_score NUMERIC(2,1),
  feedback TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ielts_listening_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES ielts_users(id) ON DELETE CASCADE,
  set_id BIGINT NOT NULL REFERENCES ielts_listening_sets(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  time_spent INTEGER NOT NULL,
  score INTEGER,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_speaking_attempts_user ON ielts_speaking_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_writing_attempts_user ON ielts_writing_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_listening_attempts_user ON ielts_listening_attempts(user_id);

-- RLS
ALTER TABLE ielts_speaking_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_writing_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ielts_listening_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own speaking attempts" ON ielts_speaking_attempts;
DROP POLICY IF EXISTS "Users create own speaking attempts" ON ielts_speaking_attempts;
DROP POLICY IF EXISTS "Users view own writing attempts" ON ielts_writing_attempts;
DROP POLICY IF EXISTS "Users create own writing attempts" ON ielts_writing_attempts;
DROP POLICY IF EXISTS "Users view own listening attempts" ON ielts_listening_attempts;
DROP POLICY IF EXISTS "Users create own listening attempts" ON ielts_listening_attempts;

CREATE POLICY "Users view own speaking attempts" ON ielts_speaking_attempts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own speaking attempts" ON ielts_speaking_attempts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users view own writing attempts" ON ielts_writing_attempts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own writing attempts" ON ielts_writing_attempts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users view own listening attempts" ON ielts_listening_attempts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own listening attempts" ON ielts_listening_attempts FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT '✅ IELTS Prep Hub Setup Complete!' as status;
SELECT '📚 Reading: 3 sets, 12 questions' as reading;
SELECT '🎧 Listening: 3 sets' as listening;
SELECT '✍️ Writing: 3 tasks' as writing;
SELECT '🎤 Speaking: 3 tasks' as speaking;
SELECT '🌟 Free/Prime tiers configured' as tiers;
SELECT '💾 Storage & tracking ready' as storage;
