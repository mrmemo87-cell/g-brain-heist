-- ============================================
-- IELTS Sample Content for Testing
-- Run this after IELTS_DATABASE_SETUP.sql
-- Uses ON CONFLICT to handle re-runs safely
-- ============================================

-- ============================================
-- READING SET 1: Climate Change
-- ============================================
INSERT INTO ielts_reading_sets (slug, title, description, level, est_band_min, est_band_max, duration_minutes, is_active)
VALUES (
  'climate-change-impacts',
  'The Impact of Climate Change on Global Ecosystems',
  'An academic passage discussing how climate change affects various ecosystems around the world, including coral reefs, polar regions, and tropical rainforests.',
  'Academic',
  6.0,
  7.5,
  20,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Get the ID of the reading set and insert questions (skip if exist)
DO $$
DECLARE
  reading_set_id bigint;
BEGIN
  SELECT id INTO reading_set_id FROM ielts_reading_sets WHERE slug = 'climate-change-impacts';
  
  -- Only insert if questions don't exist for this set
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 1) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      1,
      'multiple_choice',
      'According to the passage, what is the primary cause of coral bleaching?',
      '["Increased ocean acidity", "Rising water temperatures", "Pollution from coastal cities", "Overfishing in reef areas"]',
      '"Rising water temperatures"',
      'The passage states that "elevated sea temperatures cause corals to expel the symbiotic algae living in their tissues, resulting in coral bleaching."'
    );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 2) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      2,
      'multiple_choice',
      'The author suggests that polar bears are particularly vulnerable because:',
      '["They cannot adapt to warmer climates", "Their hunting grounds are disappearing", "They are being hunted by humans", "They cannot find mates"]',
      '"Their hunting grounds are disappearing"',
      'The passage explains that "as sea ice diminishes, polar bears lose critical hunting platforms they depend on to catch seals."'
    );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 3) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      3,
      'true_false_ng',
      'The Amazon rainforest has already lost more than half of its original coverage.',
      '["True", "False", "Not Given"]',
      '"Not Given"',
      'The passage discusses deforestation concerns but does not provide specific percentages of forest loss.'
    );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 4) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      4,
      'true_false_ng',
      'Scientists predict that some coral species may adapt to warmer temperatures over time.',
      '["True", "False", "Not Given"]',
      '"True"',
      'The passage mentions that "researchers have identified heat-resistant coral varieties that may survive in warming oceans."'
    );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 5) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      5,
      'fill_blank',
      'The migration patterns of many bird species have shifted by an average of _____ kilometers northward.',
      null,
      '"150"',
      'The passage states: "Studies show that migratory birds have shifted their routes an average of 150 kilometers northward."'
    );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 6) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      6,
      'multiple_choice',
      'What solution does the author propose for protecting vulnerable ecosystems?',
      '["Complete ban on fossil fuels", "Creating marine protected areas", "Relocating endangered species", "Reducing global temperatures by 5 degrees"]',
      '"Creating marine protected areas"',
      'The passage advocates for "expanding marine protected areas to give ecosystems time to recover and adapt."'
    );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 7) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      7,
      'multiple_choice',
      'Which paragraph discusses the economic impact of ecosystem destruction?',
      '["Paragraph A", "Paragraph B", "Paragraph C", "Paragraph D"]',
      '"Paragraph C"',
      'Paragraph C discusses how "the loss of coral reefs alone could cost the global economy $1 trillion by 2050."'
    );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 8) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (
      reading_set_id,
      8,
      'multiple_choice',
      'The tone of the passage can best be described as:',
      '["Optimistic and hopeful", "Alarmed but informative", "Pessimistic and fatalistic", "Neutral and detached"]',
      '"Alarmed but informative"',
      'While presenting concerning data, the author maintains an educational approach and offers potential solutions.'
    );
  END IF;
END $$;

-- ============================================
-- READING SET 2: Artificial Intelligence
-- ============================================
INSERT INTO ielts_reading_sets (slug, title, description, level, est_band_min, est_band_max, duration_minutes, is_active)
VALUES (
  'ai-future-work',
  'Artificial Intelligence and the Future of Work',
  'An exploration of how AI and automation are transforming employment across various industries.',
  'Academic',
  5.5,
  7.0,
  20,
  true
)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  reading_set_id bigint;
BEGIN
  SELECT id INTO reading_set_id FROM ielts_reading_sets WHERE slug = 'ai-future-work';
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 1) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES 
    (reading_set_id, 1, 'multiple_choice', 
     'According to the passage, which sector is most likely to be affected by AI automation?',
     '["Healthcare", "Manufacturing", "Education", "Agriculture"]',
     '"Manufacturing"',
     'The passage indicates that "manufacturing jobs face the highest risk of automation, with up to 47% of positions potentially replaceable."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 2) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES 
    (reading_set_id, 2, 'multiple_choice',
     'The author''s attitude toward AI in the workplace is:',
     '["Entirely negative", "Cautiously optimistic", "Completely positive", "Indifferent"]',
     '"Cautiously optimistic"',
     'The author acknowledges risks but also highlights opportunities for new job creation.');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 3) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES 
    (reading_set_id, 3, 'true_false_ng',
     'All jobs requiring creativity are safe from automation.',
     '["True", "False", "Not Given"]',
     '"False"',
     'The passage notes that "even creative fields like graphic design and music composition are seeing AI tools emerge."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 4) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES 
    (reading_set_id, 4, 'true_false_ng',
     'The majority of workers support the introduction of AI in their workplaces.',
     '["True", "False", "Not Given"]',
     '"Not Given"',
     'The passage does not provide survey data on worker opinions about AI.');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 5) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES 
    (reading_set_id, 5, 'fill_blank',
     'The passage suggests that workers should focus on developing _____ skills that complement AI capabilities.',
     null,
     '"soft"',
     'The passage emphasizes "soft skills like emotional intelligence, critical thinking, and interpersonal communication."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_reading_questions WHERE set_id = reading_set_id AND question_order = 6) THEN
    INSERT INTO ielts_reading_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES 
    (reading_set_id, 6, 'multiple_choice',
     'What does the author recommend governments do to prepare for AI disruption?',
     '["Ban AI development", "Invest in retraining programs", "Increase minimum wages", "Reduce working hours"]',
     '"Invest in retraining programs"',
     'The author advocates for "robust retraining and upskilling programs to help displaced workers transition."');
  END IF;
END $$;

-- ============================================
-- LISTENING SET 1: University Lecture
-- ============================================
INSERT INTO ielts_listening_sets (slug, title, description, level, est_band_min, est_band_max, duration_minutes, audio_url, is_active)
VALUES (
  'university-orientation',
  'University Campus Orientation',
  'A recording of a university orientation session covering campus facilities, registration, and student services.',
  'Academic',
  5.0,
  6.5,
  10,
  'https://example.com/audio/orientation.mp3',
  true
)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  listening_set_id bigint;
BEGIN
  SELECT id INTO listening_set_id FROM ielts_listening_sets WHERE slug = 'university-orientation';
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 1) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 1, 'multiple_choice',
     'What time does the library open on weekdays?',
     '["7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM"]',
     '"8:00 AM"',
     'The speaker says "The main library opens at 8 AM on weekdays."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 2) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 2, 'multiple_choice',
     'Where is the student health center located?',
     '["Building A", "Building C", "Building E", "Building G"]',
     '"Building C"',
     'The speaker mentions "You can find the health center in Building C, next to the cafeteria."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 3) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 3, 'fill_blank',
     'Students must complete registration by the _____ of September.',
     null,
     '"15th"',
     'The deadline mentioned is "September 15th for all course registrations."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 4) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 4, 'fill_blank',
     'The campus shuttle runs every _____ minutes during peak hours.',
     null,
     '"10"',
     'The speaker states "Shuttles run every 10 minutes between 8 AM and 6 PM."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 5) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 5, 'multiple_choice',
     'What document is required to get a student ID card?',
     '["Passport only", "Enrollment letter and photo", "Driver''s license", "Birth certificate"]',
     '"Enrollment letter and photo"',
     'The requirements are "your enrollment confirmation letter and a passport-sized photo."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 6) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 6, 'multiple_choice',
     'How many meals per week are included in the basic meal plan?',
     '["10", "14", "21", "Unlimited"]',
     '"14"',
     'The basic plan includes "14 meals per week, which works out to two per day."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 7) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 7, 'fill_blank',
     'International students should contact the _____ office for visa questions.',
     null,
     '"International Student Services"',
     'The speaker directs students to "the International Student Services office for any visa or immigration queries."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 8) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 8, 'multiple_choice',
     'What is the maximum number of books students can borrow at once?',
     '["5", "8", "10", "15"]',
     '"10"',
     'Library policy allows "up to 10 books at a time for undergraduate students."');
  END IF;
END $$;

-- ============================================
-- LISTENING SET 2: Job Interview Tips
-- ============================================
INSERT INTO ielts_listening_sets (slug, title, description, level, est_band_min, est_band_max, duration_minutes, audio_url, is_active)
VALUES (
  'job-interview-workshop',
  'Job Interview Preparation Workshop',
  'A career counselor provides tips on preparing for and succeeding in job interviews.',
  'General Training',
  5.5,
  7.0,
  12,
  'https://example.com/audio/interview-tips.mp3',
  true
)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  listening_set_id bigint;
BEGIN
  SELECT id INTO listening_set_id FROM ielts_listening_sets WHERE slug = 'job-interview-workshop';
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 1) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 1, 'multiple_choice',
     'According to the speaker, what should you research before an interview?',
     '["The interviewer''s personal life", "The company''s history and values", "Competitor salaries", "Office parking options"]',
     '"The company''s history and values"',
     'The speaker emphasizes "researching the company thoroughly, including its mission, values, and recent news."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 2) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 2, 'fill_blank',
     'Candidates should arrive _____ minutes before the scheduled interview time.',
     null,
     '"10-15"',
     'The advice given is to "arrive 10-15 minutes early to compose yourself."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 3) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 3, 'multiple_choice',
     'What does the speaker say about asking questions at the end of an interview?',
     '["It''s not recommended", "It shows genuine interest", "Only ask about salary", "Keep it very brief"]',
     '"It shows genuine interest"',
     'The speaker says "Asking thoughtful questions demonstrates genuine interest in the role."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 4) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 4, 'multiple_choice',
     'When answering behavioral questions, what method does the speaker recommend?',
     '["The STAR method", "The SWOT analysis", "The 5 Whys", "The Elevator Pitch"]',
     '"The STAR method"',
     'The speaker recommends "using the STAR method: Situation, Task, Action, Result."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 5) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 5, 'fill_blank',
     'You should send a thank-you email within _____ hours after the interview.',
     null,
     '"24"',
     'The speaker advises "sending a thank-you note within 24 hours of your interview."');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM ielts_listening_questions WHERE set_id = listening_set_id AND question_order = 6) THEN
    INSERT INTO ielts_listening_questions (set_id, question_order, question_type, body, options, correct_answer, explanation)
    VALUES (listening_set_id, 6, 'multiple_choice',
     'What should you avoid discussing in a first interview?',
     '["Your qualifications", "Salary expectations", "Why you want the job", "Your relevant experience"]',
     '"Salary expectations"',
     'The speaker warns against "bringing up salary or benefits in the first interview unless the interviewer does."');
  END IF;
END $$;

-- ============================================
-- WRITING TASK 1: Academic (Graph)
-- ============================================
INSERT INTO ielts_writing_tasks (slug, task_type, title, prompt, bands_target, sample_answer, is_active)
VALUES (
  'internet-usage-graph',
  'Task 1 Academic',
  'Internet Usage by Age Group',
  'The bar chart below shows the percentage of adults who used the internet daily in five different age groups in 2010 and 2020.

Summarize the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAILY INTERNET USAGE BY AGE GROUP (%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Age Group    │  2010   │  2020
─────────────┼─────────┼─────────
18-24        │   75%   │   98%
25-34        │   68%   │   95%
35-44        │   52%   │   88%
45-54        │   38%   │   79%
55+          │   22%   │   61%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 2010 (darker)  □ 2020 (lighter)',
  '7.0',
  'The bar chart illustrates the proportion of adults using the internet on a daily basis across five age categories in 2010 and 2020.

Overall, internet usage increased significantly across all age groups over the decade, with younger demographics maintaining higher usage rates throughout both years.

In 2010, the 18-24 age group had the highest daily internet usage at 75%, followed by the 25-34 group at 68%. Usage declined progressively with age, with the 35-44 bracket at 52%, the 45-54 group at 38%, and those aged 55 and over showing the lowest usage at just 22%.

By 2020, all categories experienced substantial growth. The youngest group reached near-universal adoption at 98%, while the 25-34 demographic rose to 95%. Notably, the older age groups showed the most dramatic improvements: the 55+ category nearly tripled their usage to 61%, and the 45-54 group more than doubled to 79%. The 35-44 age bracket also increased considerably to 88%.

The data reveals that while the digital divide between age groups persisted, it narrowed considerably over the ten-year period.',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- WRITING TASK 1b: Academic (Population Chart)
-- ============================================
INSERT INTO ielts_writing_tasks (slug, task_type, title, prompt, bands_target, sample_answer, is_active)
VALUES (
  'population-changes-cities',
  'Task 1 Academic',
  'Population Changes in Three Cities',
  'The bar chart below shows population changes in three cities between 2000 and 2020.

Summarize the information by selecting and reporting the main features, and make comparisons where relevant.

Write at least 150 words.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POPULATION OF THREE CITIES (in millions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

City          │  2000   │  2010   │  2020
──────────────┼─────────┼─────────┼─────────
Metro City    │   2.1   │   3.4   │   5.2
Riverside     │   1.8   │   2.0   │   1.9
Oldtown       │   3.5   │   3.2   │   2.8
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bar Chart Visualization:

Metro City:  2000 ████████████ 2.1M
             2010 ████████████████████ 3.4M
             2020 ██████████████████████████████ 5.2M

Riverside:   2000 ██████████ 1.8M
             2010 ███████████ 2.0M
             2020 ██████████ 1.9M

Oldtown:     2000 ████████████████████ 3.5M
             2010 ██████████████████ 3.2M
             2020 ████████████████ 2.8M',
  '7.0',
  'The bar chart illustrates population trends in three cities—Metro City, Riverside, and Oldtown—over a twenty-year period from 2000 to 2020.

Overall, while Metro City experienced substantial population growth, Oldtown showed a consistent decline, and Riverside remained relatively stable throughout the period.

In 2000, Oldtown had the largest population at 3.5 million, followed by Metro City with 2.1 million and Riverside with 1.8 million. However, this ranking changed dramatically over the following two decades.

Metro City demonstrated the most remarkable growth, more than doubling its population from 2.1 million to 5.2 million by 2020. This represents an increase of approximately 148%. In contrast, Oldtown experienced steady decline, falling from 3.5 million to 2.8 million, a decrease of 20%.

Riverside showed minimal change, with its population fluctuating slightly between 1.8 and 2.0 million throughout the period, ending at 1.9 million in 2020.

By 2020, Metro City had become the most populous of the three cities, overtaking Oldtown which had held that position in 2000.',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- WRITING TASK 2: Essay (Opinion)
-- ============================================
INSERT INTO ielts_writing_tasks (slug, task_type, title, prompt, bands_target, sample_answer, is_active)
VALUES (
  'remote-work-essay',
  'Task 2',
  'Remote Work Opinion Essay',
  'Some people believe that working from home is more beneficial for both employees and employers than working in an office. Others think that working in an office environment is more productive.

Discuss both views and give your own opinion.

Write at least 250 words.',
  '7.5',
  'The debate over remote versus office-based work has intensified in recent years, particularly following global shifts in working patterns. While both arrangements offer distinct advantages, I believe a hybrid approach combining elements of both is most beneficial.

Proponents of remote work argue that it offers greater flexibility and work-life balance. Employees save commuting time and costs, which can improve their overall wellbeing and job satisfaction. Furthermore, companies can reduce overhead expenses related to office space and utilities. Studies have shown that many workers report higher productivity when working from home, free from office distractions and interruptions.

On the other hand, advocates for office work emphasize the importance of face-to-face interaction for collaboration and creativity. Spontaneous conversations often lead to innovative ideas that might not emerge in scheduled video calls. Additionally, the office environment helps maintain a clear boundary between professional and personal life, which some employees find beneficial for their mental health. New employees particularly benefit from in-person mentoring and the opportunity to absorb company culture.

In my opinion, the ideal solution lies in flexibility rather than rigid adherence to either model. A hybrid approach allows employees to enjoy the focused productivity of remote work while maintaining the collaborative benefits of periodic office attendance. This arrangement acknowledges that different tasks may require different environments—complex individual work might be better suited to home, while brainstorming sessions benefit from in-person interaction.

In conclusion, rather than viewing this as an either-or choice, organizations should embrace flexibility, allowing employees to work in ways that optimize both their productivity and wellbeing.',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- WRITING TASK: General Training Letter
-- ============================================
INSERT INTO ielts_writing_tasks (slug, task_type, title, prompt, bands_target, sample_answer, is_active)
VALUES (
  'complaint-letter',
  'Task 1 General',
  'Complaint Letter to Restaurant',
  'You recently had dinner at a restaurant and were unhappy with the service.

Write a letter to the restaurant manager. In your letter:
- Say when you visited and what problems you had
- Describe how the staff dealt with your complaints
- Suggest what the manager should do

Write at least 150 words.
You do NOT need to write any addresses.
Begin your letter as follows: Dear Sir or Madam,',
  '7.0',
  'Dear Sir or Madam,

I am writing to express my disappointment regarding my dining experience at your restaurant on Saturday, 15th November. My family and I visited to celebrate my mother''s birthday, but unfortunately, the evening did not meet our expectations.

Firstly, despite having a reservation for 7 PM, we were kept waiting for 30 minutes before being seated. Once at our table, we waited an additional 20 minutes before a waiter took our order. When the food finally arrived, two of the four dishes were cold, and my steak was overcooked despite requesting it medium-rare.

When I raised these issues with the waiter, he seemed dismissive and offered no apology or solution. He simply shrugged and said the kitchen was busy. No manager was available to speak with us.

I would suggest that you review your staff training procedures, particularly regarding customer service and handling complaints. Additionally, implementing better communication between front-of-house and kitchen staff might prevent such issues.

I look forward to hearing from you regarding how you intend to address these concerns.

Yours faithfully,
[Your name]',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- SPEAKING TASK: Part 1 (Introduction)
-- ============================================
INSERT INTO ielts_speaking_tasks (slug, part, prompt, follow_ups, is_active)
VALUES (
  'hometown-part1',
  1,
  'Let''s talk about your hometown. Where is your hometown located?',
  '{
    "questions": [
      "What do you like most about your hometown?",
      "Has your hometown changed much since you were a child?",
      "Would you recommend tourists to visit your hometown? Why?",
      "Do you think you will continue to live in your hometown in the future?"
    ],
    "speaking_time": 30,
    "prep_time": 0
  }',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- SPEAKING TASK: Part 2 (Cue Card)
-- ============================================
INSERT INTO ielts_speaking_tasks (slug, part, prompt, follow_ups, is_active)
VALUES (
  'memorable-journey-part2',
  2,
  'Describe a memorable journey you have taken.

You should say:
- Where you went
- How you traveled there
- Who you went with
- And explain why this journey was memorable',
  '{
    "questions": [
      "Do you prefer traveling alone or with others?",
      "What mode of transportation do you usually prefer for long journeys?"
    ],
    "speaking_time": 120,
    "prep_time": 60,
    "topic": "Memorable Journey"
  }',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- SPEAKING TASK: Part 3 (Discussion)
-- ============================================
INSERT INTO ielts_speaking_tasks (slug, part, prompt, follow_ups, is_active)
VALUES (
  'travel-discussion-part3',
  3,
  'Let''s discuss travel and tourism more generally. How has tourism changed in your country over the past few decades?',
  '{
    "questions": [
      "What are the positive and negative effects of tourism on local communities?",
      "Do you think international travel will become more or less popular in the future?",
      "How can tourism be made more sustainable?",
      "Should governments invest more in promoting tourism? Why or why not?"
    ],
    "speaking_time": 120,
    "prep_time": 0
  }',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- SPEAKING TASK: Part 2 (Technology Topic)
-- ============================================
INSERT INTO ielts_speaking_tasks (slug, part, prompt, follow_ups, is_active)
VALUES (
  'useful-technology-part2',
  2,
  'Describe a piece of technology that you find useful in your daily life.

You should say:
- What it is
- How often you use it
- What you use it for
- And explain why it is useful to you',
  '{
    "questions": [
      "Do you think we rely too much on technology?",
      "What technology would you like to see invented in the future?"
    ],
    "speaking_time": 120,
    "prep_time": 60,
    "topic": "Useful Technology"
  }',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Verify inserted data
-- ============================================
SELECT 'Reading Sets' as content_type, COUNT(*) as count FROM ielts_reading_sets WHERE is_active = true
UNION ALL
SELECT 'Reading Questions', COUNT(*) FROM ielts_reading_questions
UNION ALL
SELECT 'Listening Sets', COUNT(*) FROM ielts_listening_sets WHERE is_active = true
UNION ALL
SELECT 'Listening Questions', COUNT(*) FROM ielts_listening_questions
UNION ALL
SELECT 'Writing Tasks', COUNT(*) FROM ielts_writing_tasks WHERE is_active = true
UNION ALL
SELECT 'Speaking Tasks', COUNT(*) FROM ielts_speaking_tasks WHERE is_active = true;
