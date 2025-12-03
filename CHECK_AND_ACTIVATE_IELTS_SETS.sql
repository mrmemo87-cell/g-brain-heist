-- Check and Activate IELTS Sets
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CHECK CURRENT STATE OF ALL IELTS TABLES
-- ============================================

-- Check reading sets
SELECT 'READING SETS' as table_name, COUNT(*) as total, 
       SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
FROM ielts_reading_sets;

-- Check listening sets
SELECT 'LISTENING SETS' as table_name, COUNT(*) as total,
       SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
FROM ielts_listening_sets;

-- Check writing tasks
SELECT 'WRITING TASKS' as table_name, COUNT(*) as total,
       SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
FROM ielts_writing_tasks;

-- Check speaking tasks
SELECT 'SPEAKING TASKS' as table_name, COUNT(*) as total,
       SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
FROM ielts_speaking_tasks;

-- ============================================
-- 2. VIEW ALL SETS (to see what exists)
-- ============================================

SELECT id, title, is_active, created_at FROM ielts_reading_sets ORDER BY created_at DESC LIMIT 10;
SELECT id, title, is_active, created_at FROM ielts_listening_sets ORDER BY created_at DESC LIMIT 10;
SELECT id, title, task_type, is_active, created_at FROM ielts_writing_tasks ORDER BY created_at DESC LIMIT 10;
SELECT id, part, is_active, created_at FROM ielts_speaking_tasks ORDER BY created_at DESC LIMIT 10;

-- ============================================
-- 3. ACTIVATE ALL EXISTING SETS
-- ============================================

-- Activate all reading sets
UPDATE ielts_reading_sets SET is_active = true WHERE is_active = false OR is_active IS NULL;

-- Activate all listening sets
UPDATE ielts_listening_sets SET is_active = true WHERE is_active = false OR is_active IS NULL;

-- Activate all writing tasks
UPDATE ielts_writing_tasks SET is_active = true WHERE is_active = false OR is_active IS NULL;

-- Activate all speaking tasks
UPDATE ielts_speaking_tasks SET is_active = true WHERE is_active = false OR is_active IS NULL;

-- ============================================
-- 4. IF NO DATA EXISTS, INSERT SAMPLE DATA
-- ============================================

-- Insert sample reading set if none exist
INSERT INTO ielts_reading_sets (slug, title, description, level, est_band_min, est_band_max, duration_minutes, passage_text, is_active)
SELECT 'sample-reading-1', 'The History of Coffee', 'A reading passage about the origins and spread of coffee culture around the world.', 'intermediate', 5.5, 7.0, 20,
'Coffee is one of the most popular beverages in the world, with billions of cups consumed daily. The history of coffee dates back to ancient Ethiopia, where legend has it that a goat herder named Kaldi discovered the energizing effects of coffee beans after noticing his goats becoming unusually lively after eating berries from a certain tree.

The cultivation and trade of coffee began on the Arabian Peninsula in the 15th century. Yemen was the first country to cultivate coffee, and the port city of Mocha became synonymous with the beverage. From Yemen, coffee spread throughout the Middle East, Persia, Turkey, and North Africa.

Coffee reached Europe in the 17th century and quickly became popular. Coffee houses, known as "penny universities" in England, became important social gathering places where people would discuss politics, business, and ideas. The first coffee house in England opened in Oxford in 1650.

Today, coffee is grown in over 70 countries, primarily in the equatorial regions of the Americas, Southeast Asia, the Indian subcontinent, and Africa. Brazil is the world''s largest producer of coffee, followed by Vietnam and Colombia.

The coffee industry employs millions of people worldwide and is worth over $100 billion annually. However, the industry faces challenges including climate change, fair trade concerns, and sustainability issues.',
true
WHERE NOT EXISTS (SELECT 1 FROM ielts_reading_sets LIMIT 1);

-- Insert sample listening set if none exist
INSERT INTO ielts_listening_sets (slug, title, description, level, est_band_min, est_band_max, duration_minutes, audio_url, is_active)
SELECT 'sample-listening-1', 'University Orientation', 'A listening task about a university campus tour and orientation session.', 'intermediate', 5.5, 7.0, 10,
'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/ielts-audio/Test%201-Section%201.mp3',
true
WHERE NOT EXISTS (SELECT 1 FROM ielts_listening_sets LIMIT 1);

-- Insert sample writing task if none exist
INSERT INTO ielts_writing_tasks (slug, task_type, title, prompt, bands_target, is_active)
SELECT 'sample-writing-task-2', 'Task 2', 'Technology in Education', 
'Some people believe that technology has made learning easier for students, while others argue that it has created new challenges.

Discuss both views and give your own opinion.

Write at least 250 words.',
'6.0-7.5', true
WHERE NOT EXISTS (SELECT 1 FROM ielts_writing_tasks LIMIT 1);

-- Insert sample speaking tasks if none exist (Parts 1, 2, 3)
INSERT INTO ielts_speaking_tasks (slug, part, prompt, follow_ups, prep_time_seconds, speak_time_seconds, is_active)
SELECT 'sample-speaking-part1', 1, 'Let''s talk about your hometown. Where are you from?', 
ARRAY['What do you like most about your hometown?', 'Has your hometown changed much in recent years?', 'Would you recommend your hometown to tourists?'],
0, 120, true
WHERE NOT EXISTS (SELECT 1 FROM ielts_speaking_tasks WHERE part = 1 LIMIT 1);

INSERT INTO ielts_speaking_tasks (slug, part, prompt, follow_ups, prep_time_seconds, speak_time_seconds, is_active)
SELECT 'sample-speaking-part2', 2, 
'Describe a book that you have read recently.

You should say:
- what the book was about
- why you decided to read it
- how long it took you to finish it

And explain whether you would recommend this book to others.',
NULL, 60, 120, true
WHERE NOT EXISTS (SELECT 1 FROM ielts_speaking_tasks WHERE part = 2 LIMIT 1);

INSERT INTO ielts_speaking_tasks (slug, part, prompt, follow_ups, prep_time_seconds, speak_time_seconds, is_active)
SELECT 'sample-speaking-part3', 3, 'Let''s discuss reading habits in general.',
ARRAY['Do you think people read less nowadays than in the past?', 'How has technology affected the way people read?', 'What are the benefits of reading for young people?', 'Do you think schools should encourage students to read more?'],
0, 120, true
WHERE NOT EXISTS (SELECT 1 FROM ielts_speaking_tasks WHERE part = 3 LIMIT 1);

-- ============================================
-- 5. VERIFY AFTER UPDATES
-- ============================================

SELECT 'AFTER UPDATE - READING' as status, COUNT(*) as active FROM ielts_reading_sets WHERE is_active = true;
SELECT 'AFTER UPDATE - LISTENING' as status, COUNT(*) as active FROM ielts_listening_sets WHERE is_active = true;
SELECT 'AFTER UPDATE - WRITING' as status, COUNT(*) as active FROM ielts_writing_tasks WHERE is_active = true;
SELECT 'AFTER UPDATE - SPEAKING' as status, COUNT(*) as active FROM ielts_speaking_tasks WHERE is_active = true;
