-- ============================================================
-- ADMISSION HUB — Import English Stage 7 Question Pool
-- ============================================================
-- Run AFTER ADM_SCHEMA_MIGRATION.sql (tables must exist)
-- This loads the 96 questions from english_stage7_pool.json
-- into adm_question_pools + adm_questions.
--
-- NOTE: This creates a GLOBAL pool (school_id = NULL) so all
-- schools can use it. Change school_id if you want school-specific.
-- ============================================================

-- Step 1: Create the pool
INSERT INTO adm_question_pools (id, school_id, subject, stage, grade_level, name, description, is_active)
VALUES (
    '00000000-0000-0000-0000-e07117000001'::uuid,
    NULL,  -- global pool
    'english',
    7,
    6,  -- Grade 6 ≈ Cambridge Stage 7
    'English Stage 7 — Cambridge Style',
    'Original Cambridge-style questions covering grammar, vocabulary, reading comprehension. 96 questions across 9 types.',
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Step 2: Insert all 96 questions
-- Using the pool_id from above

DO $$
DECLARE
    v_pool_id UUID := '00000000-0000-0000-0000-e07117000001'::uuid;
BEGIN

-- ═══════════════════════════════
-- MCQ — 32 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, options, correct_answer, correct_index, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'mcq', 'We ______ to the beach last Saturday.', '["go","goes","went","going"]', '"went"', 2, 1, 'easy', 'application', 'past_simple', 'grammar', 'Past simple of ''go'' is ''went'' for completed actions in the past.', 'published'),
(v_pool_id, 'mcq', 'She ______ her homework before dinner yesterday.', '["finish","finishes","finished","finishing"]', '"finished"', 2, 1, 'easy', 'application', 'past_simple', 'grammar', 'Past simple regular verb: add -ed to ''finish'' for a completed past action.', 'published'),
(v_pool_id, 'mcq', 'They ______ the film because they arrived too late.', '["didn''t saw","didn''t see","don''t see","not see"]', '"didn''t see"', 1, 1, 'easy', 'application', 'past_simple_negative', 'grammar', 'Past simple negative: didn''t + base form of the verb.', 'published'),
(v_pool_id, 'mcq', '______ you visit your grandparents last weekend?', '["Do","Does","Did","Are"]', '"Did"', 2, 1, 'easy', 'application', 'past_simple_questions', 'grammar', 'Past simple questions use ''Did'' + subject + base form.', 'published'),
(v_pool_id, 'mcq', 'That is my ______ car. He bought it last year.', '["fathers","father''s","fathers''","father"]', '"father''s"', 1, 1, 'easy', 'knowledge', 'possessives', 'grammar', 'Singular possessive: add ''s to show that one father owns the car.', 'published'),
(v_pool_id, 'mcq', 'The ______ playground is behind the main building.', '["childrens","children''s","childrens''","child"]', '"children''s"', 1, 1, 'medium', 'application', 'possessives', 'grammar', '''Children'' is already plural; add ''s for the possessive: children''s.', 'published'),
(v_pool_id, 'mcq', 'My birthday is ______ March.', '["in","on","at","to"]', '"in"', 0, 1, 'easy', 'knowledge', 'prepositions_of_time', 'grammar', '''In'' is used with months: in March, in July, etc.', 'published'),
(v_pool_id, 'mcq', 'The concert starts ______ 7 o''clock.', '["in","on","at","by"]', '"at"', 2, 1, 'easy', 'knowledge', 'prepositions_of_time', 'grammar', '''At'' is used with specific times: at 7 o''clock, at noon.', 'published'),
(v_pool_id, 'mcq', 'It was a ______ film that everybody enjoyed.', '["well-make","well-made","good-make","good-maked"]', '"well-made"', 1, 1, 'medium', 'application', 'compound_adjectives', 'grammar', 'Compound adjective: ''well'' + past participle ''made'' joined by a hyphen.', 'published'),
(v_pool_id, 'mcq', 'She is a very ______ person who always thinks about the feelings of others.', '["kind-heart","kind-hearted","kinded-heart","kinds-hearted"]', '"kind-hearted"', 1, 1, 'medium', 'application', 'compound_adjectives', 'grammar', 'Compound adjective: adjective + noun with -ed ending: ''kind-hearted''.', 'published'),
(v_pool_id, 'mcq', 'The boy ______ lives next door is very friendly.', '["which","who","whose","whom"]', '"who"', 1, 1, 'easy', 'application', 'relative_clauses', 'grammar', '''Who'' is the relative pronoun for people as the subject of the clause.', 'published'),
(v_pool_id, 'mcq', 'This is the book ______ I told you about.', '["who","whose","which","whom"]', '"which"', 2, 1, 'easy', 'application', 'relative_clauses', 'grammar', '''Which'' is the relative pronoun for things.', 'published'),
(v_pool_id, 'mcq', 'The girl ______ father is a doctor wants to study medicine.', '["who","which","whose","that"]', '"whose"', 2, 1, 'medium', 'application', 'relative_clauses', 'grammar', '''Whose'' shows possession in relative clauses: the girl''s father.', 'published'),
(v_pool_id, 'mcq', 'You ______ eat in the library. It''s against the rules.', '["must","mustn''t","should","can"]', '"mustn''t"', 1, 1, 'easy', 'application', 'modal_verbs', 'grammar', '''Mustn''t'' expresses prohibition — something you are not allowed to do.', 'published'),
(v_pool_id, 'mcq', 'You look tired. I think you ______ go to bed early tonight.', '["must","can''t","should","might"]', '"should"', 2, 1, 'medium', 'application', 'modal_verbs', 'grammar', '''Should'' is used for advice or recommendations.', 'published'),
(v_pool_id, 'mcq', 'It ______ rain later — look at those dark clouds.', '["should","must","might","can"]', '"might"', 2, 1, 'medium', 'application', 'modal_verbs', 'grammar', '''Might'' expresses possibility — something that is perhaps true.', 'published'),
(v_pool_id, 'mcq', 'The first railway ______ in England in 1825.', '["built","was built","is built","builds"]', '"was built"', 1, 1, 'medium', 'application', 'past_passive', 'grammar', 'Past passive: was/were + past participle for actions done to the subject.', 'published'),
(v_pool_id, 'mcq', 'These photographs ______ by a famous artist in the 1960s.', '["took","were taken","was taken","taking"]', '"were taken"', 1, 1, 'medium', 'application', 'past_passive', 'grammar', 'Past passive plural: ''were taken'' because ''photographs'' is plural.', 'published'),
(v_pool_id, 'mcq', 'She runs ______ than her older brother.', '["more fast","more quickly","more quicker","quicklier"]', '"more quickly"', 1, 1, 'medium', 'application', 'comparatives_adverbs', 'grammar', 'Comparative adverb: ''more quickly'' (not ''more fast'' or ''quicklier'').', 'published'),
(v_pool_id, 'mcq', '______ in the mountains can be dangerous in winter.', '["Walk","Walking","To walking","Walked"]', '"Walking"', 1, 1, 'medium', 'application', 'ing_forms_subject', 'grammar', '-ing form as the subject of a sentence: ''Walking is dangerous''.', 'published'),
(v_pool_id, 'mcq', 'Look at those clouds! It ______ rain soon.', '["will","is going to","is","does"]', '"is going to"', 1, 1, 'easy', 'application', 'future_forms', 'grammar', '''Going to'' is used for predictions based on present evidence (the clouds).', 'published'),
(v_pool_id, 'mcq', 'I think robots ______ do most household tasks in the future.', '["are going to","will","are","do"]', '"will"', 1, 1, 'medium', 'application', 'future_forms', 'grammar', '''Will'' is used for predictions about the future based on opinion (I think).', 'published'),
(v_pool_id, 'mcq', '______ in the class passed the test. Everyone got a good mark.', '["Somebody","Anybody","Everybody","Nobody"]', '"Everybody"', 2, 1, 'medium', 'application', 'indefinite_pronouns', 'grammar', '''Everybody'' means all the people — everyone got a good mark.', 'published'),
(v_pool_id, 'mcq', 'There''s ______ in the fridge. We need to go shopping.', '["anything","something","nothing","everything"]', '"nothing"', 2, 1, 'medium', 'application', 'indefinite_pronouns', 'grammar', '''Nothing'' means not anything — the fridge is empty.', 'published'),
(v_pool_id, 'mcq', 'She didn''t go to school ______ she was feeling ill.', '["so","because","although","however"]', '"because"', 1, 1, 'easy', 'application', 'conjunctions', 'grammar', '''Because'' introduces a reason or cause.', 'published'),
(v_pool_id, 'mcq', 'I love football. ______, I don''t have time to play very often.', '["Because","Although","However","So that"]', '"However"', 2, 1, 'medium', 'application', 'conjunctions', 'grammar', '''However'' introduces a contrasting idea between two sentences.', 'published'),
(v_pool_id, 'mcq', 'If it ______ tomorrow, we will cancel the picnic.', '["will rain","rains","rained","is raining"]', '"rains"', 1, 1, 'medium', 'application', 'first_conditional', 'grammar', 'First conditional: ''if'' + present simple, will + base form.', 'published'),
(v_pool_id, 'mcq', 'You won''t pass the exam ______ you study harder.', '["if","unless","when","because"]', '"unless"', 1, 1, 'hard', 'application', 'first_conditional_unless', 'grammar', '''Unless'' means ''if not'' — you won''t pass if you don''t study harder.', 'published'),
(v_pool_id, 'mcq', '''I am happy,'' she said. — She said she ______ happy.', '["is","was","were","been"]', '"was"', 1, 1, 'hard', 'application', 'reported_speech', 'grammar', 'Reported speech: ''am'' shifts to ''was'' with a past reporting verb.', 'published'),
(v_pool_id, 'mcq', 'Please ______ your coat. It''s cold outside.', '["put on","take off","give up","turn on"]', '"put on"', 0, 1, 'easy', 'application', 'phrasal_verbs', 'vocabulary', '''Put on'' means to place clothing on your body.', 'published'),
(v_pool_id, 'mcq', 'She ______ her jacket because it was very hot inside.', '["put on","took off","tried on","gave away"]', '"took off"', 1, 1, 'medium', 'application', 'phrasal_verbs', 'vocabulary', '''Took off'' means to remove clothing.', 'published'),
(v_pool_id, 'mcq', '______ of the two answers is correct. You need to try again.', '["Both","Neither","Either","All"]', '"Neither"', 1, 1, 'hard', 'application', 'determiners', 'grammar', '''Neither'' means not one and not the other of two things.', 'published');

-- ═══════════════════════════════
-- GAP FILL — 12 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'gap_fill', 'He ______ (buy) a new bicycle for his birthday last week.', '"bought"', 1, 'easy', 'application', 'past_simple_irregular', 'grammar', 'Past simple irregular: buy → bought.', 'published'),
(v_pool_id, 'gap_fill', 'The children ______ (run) around the park for an hour yesterday.', '"ran"', 1, 'easy', 'application', 'past_simple_irregular', 'grammar', 'Past simple irregular: run → ran.', 'published'),
(v_pool_id, 'gap_fill', 'My two ______ (sister) bedroom is at the end of the hall.', '"sisters''"', 1, 'easy', 'application', 'possessives', 'grammar', 'Plural possessive: two sisters share one bedroom, so sisters'' (apostrophe after the s).', 'published'),
(v_pool_id, 'gap_fill', 'This bridge ______ (design) by a famous engineer in 1890.', '"was designed"', 1, 'medium', 'application', 'past_passive', 'grammar', 'Past passive: was + past participle for singular subject.', 'published'),
(v_pool_id, 'gap_fill', 'You need to speak ______ (slow) so that everyone can understand.', '"more slowly"', 1, 'medium', 'application', 'comparative_adverbs', 'grammar', 'Comparative adverb: slow → more slowly.', 'published'),
(v_pool_id, 'gap_fill', 'His ______ (kind) towards animals impressed everyone.', '"kindness"', 1, 'medium', 'application', 'abstract_nouns', 'vocabulary', 'Abstract noun: kind → kindness.', 'published'),
(v_pool_id, 'gap_fill', 'There was great ______ (excite) when the team won the final match.', '"excitement"', 1, 'medium', 'application', 'abstract_nouns', 'vocabulary', 'Abstract noun: excite → excitement.', 'published'),
(v_pool_id, 'gap_fill', 'It''s ______ (danger) to swim in the river when it floods.', '"dangerous"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Adjective form: danger → dangerous.', 'published'),
(v_pool_id, 'gap_fill', '''I can play the guitar,'' he said. — He said he ______ (can) play the guitar.', '"could"', 1, 'hard', 'application', 'reported_speech', 'grammar', 'Reported speech: ''can'' shifts to ''could'' with a past reporting verb.', 'published'),
(v_pool_id, 'gap_fill', 'If you ______ (not / hurry), we will miss the bus.', '"don''t hurry"', 1, 'medium', 'application', 'first_conditional', 'grammar', 'First conditional: if + present simple (negative: don''t + base form).', 'published'),
(v_pool_id, 'gap_fill', 'I need to buy some sun______ (cream / block) before we go to the beach.', '"cream"', 1, 'easy', 'knowledge', 'compound_nouns', 'vocabulary', 'Compound noun: sun + cream = suncream (cream to protect from the sun).', 'published'),
(v_pool_id, 'gap_fill', 'Her ______ (lonely) at the new school made her parents worried.', '"loneliness"', 1, 'hard', 'application', 'abstract_nouns', 'vocabulary', 'Abstract noun: lonely → loneliness.', 'published');

-- ═══════════════════════════════
-- ERROR CORRECTION — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'error_correction', 'She goed to the market with her mother yesterday.', '"went (She went to the market)"', 1, 'easy', 'application', 'past_simple', 'grammar', 'Past simple irregular: ''go'' → ''went'', not ''goed''.', 'published'),
(v_pool_id, 'error_correction', 'Did you went to school yesterday?', '"go (Did you go to school)"', 1, 'easy', 'application', 'past_simple_questions', 'grammar', 'After ''did'', use the base form of the verb, not the past form.', 'published'),
(v_pool_id, 'error_correction', 'The dogs bowl is empty. We need to fill it with water.', '"dog''s (The dog''s bowl)"', 1, 'medium', 'application', 'possessives', 'grammar', 'Possessive: ''dog''s'' needs an apostrophe to show ownership.', 'published'),
(v_pool_id, 'error_correction', 'The woman which lives next door is a teacher.', '"who (The woman who lives next door)"', 1, 'medium', 'application', 'relative_clauses', 'grammar', '''Who'' is used for people, not ''which''.', 'published'),
(v_pool_id, 'error_correction', 'You should to drink more water during the day.', '"should drink (remove ''to'')"', 1, 'medium', 'application', 'modal_verbs', 'grammar', 'Modal verbs are followed by the base form without ''to'': should + drink.', 'published'),
(v_pool_id, 'error_correction', 'The shop opens in 9 o''clock every morning.', '"at (opens at 9 o''clock)"', 1, 'easy', 'application', 'prepositions_of_time', 'grammar', '''At'' is used with specific times, not ''in''.', 'published'),
(v_pool_id, 'error_correction', 'My sister plays the piano more good than I do.', '"better (plays the piano better)"', 1, 'medium', 'application', 'comparatives', 'grammar', '''Good'' has an irregular comparative: good → better, not ''more good''.', 'published'),
(v_pool_id, 'error_correction', 'I didn''t see nobody at the park this morning.', '"anybody (I didn''t see anybody)"', 1, 'medium', 'application', 'indefinite_pronouns', 'grammar', 'Double negative: ''didn''t'' + ''nobody'' is incorrect. Use ''anybody'' with the negative verb.', 'published'),
(v_pool_id, 'error_correction', 'I going to visit my cousin next summer.', '"am going to (I am going to visit)"', 1, 'hard', 'application', 'future_forms', 'grammar', '''Going to'' future needs the auxiliary verb ''am/is/are'': I am going to.', 'published'),
(v_pool_id, 'error_correction', 'Although she was tired, but she finished all her homework.', '"Remove ''but'' (Although she was tired, she finished...)"', 1, 'hard', 'application', 'conjunctions', 'grammar', '''Although'' and ''but'' both show contrast — using both is redundant.', 'published');

-- ═══════════════════════════════
-- SENTENCE TRANSFORMATION — 12 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, keyword, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'sentence_transformation', 'A famous architect designed the building. (WAS)', 'WAS', '"The building was designed by a famous architect."', 1, 'easy', 'application', 'past_passive', 'grammar', 'Active to passive: object becomes subject + was + past participle + by + agent.', 'published'),
(v_pool_id, 'sentence_transformation', 'Someone stole my bicycle last night. (STOLEN)', 'STOLEN', '"My bicycle was stolen last night."', 1, 'easy', 'application', 'past_passive', 'grammar', 'Passive: ''My bicycle was stolen'' — agent (someone) is unknown so omitted.', 'published'),
(v_pool_id, 'sentence_transformation', 'Tom runs fast. James runs faster. (AS)', 'AS', '"Tom doesn''t run as fast as James."', 1, 'medium', 'application', 'comparative_adverbs', 'grammar', '''Not as … as'' is the negative equality comparison for adverbs.', 'published'),
(v_pool_id, 'sentence_transformation', 'Study hard, or you won''t pass the exam. (UNLESS)', 'UNLESS', '"You won''t pass the exam unless you study hard."', 1, 'medium', 'application', 'first_conditional', 'grammar', '''Unless'' means ''if not'': you won''t pass if you don''t study hard.', 'published'),
(v_pool_id, 'sentence_transformation', '''I will call you tomorrow,'' she said. (TOLD)', 'TOLD', '"She told me she would call me the next day."', 1, 'hard', 'reasoning', 'reported_speech', 'grammar', 'Reported speech: ''will'' → ''would'', ''tomorrow'' → ''the next day'', ''you'' → ''me''.', 'published'),
(v_pool_id, 'sentence_transformation', 'It''s a good idea to eat more fruit. (SHOULD)', 'SHOULD', '"You should eat more fruit."', 1, 'medium', 'application', 'modal_advice', 'grammar', '''Should'' is used to express advice or a good idea.', 'published'),
(v_pool_id, 'sentence_transformation', 'The weather was bad. The children played outside. (ALTHOUGH)', 'ALTHOUGH', '"Although the weather was bad, the children played outside."', 1, 'medium', 'application', 'conjunctions', 'grammar', '''Although'' joins two contrasting ideas in one sentence.', 'published'),
(v_pool_id, 'sentence_transformation', 'She plans to travel to Japan next year. (GOING)', 'GOING', '"She is going to travel to Japan next year."', 1, 'easy', 'application', 'future_going_to', 'grammar', '''Going to'' expresses a planned future intention.', 'published'),
(v_pool_id, 'sentence_transformation', 'It is fun to play basketball with your friends. (PLAYING)', 'PLAYING', '"Playing basketball with your friends is fun."', 1, 'medium', 'application', 'ing_forms_subject', 'grammar', '-ing form as subject: ''Playing basketball is fun''.', 'published'),
(v_pool_id, 'sentence_transformation', '''Where do you live?'' he asked me. (ASKED)', 'ASKED', '"He asked me where I lived."', 1, 'hard', 'reasoning', 'reported_speech_question', 'grammar', 'Reported question: question word order changes to statement order, tense shifts back.', 'published'),
(v_pool_id, 'sentence_transformation', 'I don''t like tea. I don''t like coffee. (NEITHER)', 'NEITHER', '"I like neither tea nor coffee."', 1, 'hard', 'reasoning', 'determiners', 'grammar', '''Neither … nor'' joins two negative ideas.', 'published'),
(v_pool_id, 'sentence_transformation', 'He set an alarm. He didn''t want to be late for school. (SO THAT)', 'SO THAT', '"He set an alarm so that he wouldn''t be late for school."', 1, 'hard', 'reasoning', 'purpose_so_that', 'grammar', '''So that'' introduces a purpose clause.', 'published');

-- ═══════════════════════════════
-- WORD FORMATION — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, base_word, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'word_formation', 'The ______ of the holiday made children very happy. (EXCITE)', 'EXCITE', '"excitement"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Noun form: excite → excitement.', 'published'),
(v_pool_id, 'word_formation', 'She is a very ______ swimmer and has won many medals. (TALENT)', 'TALENT', '"talented"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Adjective form: talent → talented.', 'published'),
(v_pool_id, 'word_formation', 'There is a beautiful ______ at the entrance to the park. (DECORATE)', 'DECORATE', '"decoration"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Noun form: decorate → decoration.', 'published'),
(v_pool_id, 'word_formation', 'He gave a very ______ speech at the school assembly. (POWER)', 'POWER', '"powerful"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Adjective form: power → powerful.', 'published'),
(v_pool_id, 'word_formation', 'The ______ of the school choir impressed the audience. (PERFORM)', 'PERFORM', '"performance"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Noun form: perform → performance.', 'published'),
(v_pool_id, 'word_formation', 'The park was full of ______ flowers in spring. (COLOUR)', 'COLOUR', '"colourful"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Adjective form: colour → colourful.', 'published'),
(v_pool_id, 'word_formation', 'The children showed great ______ during the camping trip. (BRAVE)', 'BRAVE', '"bravery"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Noun form: brave → bravery.', 'published'),
(v_pool_id, 'word_formation', 'It was very ______ of him to leave without saying goodbye. (POLITE)', 'POLITE', '"impolite"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Negative adjective form with prefix: polite → impolite.', 'published'),
(v_pool_id, 'word_formation', 'Her ______ was obvious when she heard the good news. (HAPPY)', 'HAPPY', '"happiness"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Abstract noun: happy → happiness.', 'published'),
(v_pool_id, 'word_formation', 'The ______ of the new swimming pool will take about six months. (BUILD)', 'BUILD', '"building"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Noun form: build → building (the process of constructing).', 'published');

-- ═══════════════════════════════
-- OPEN CLOZE — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'open_cloze', 'We always have a big family dinner ______ New Year''s Eve.', '"on"', 1, 'easy', 'knowledge', 'prepositions_of_time', 'grammar', '''On'' is used with specific days and dates: on New Year''s Eve.', 'published'),
(v_pool_id, 'open_cloze', 'I ______ not understand the question the teacher asked.', '"did"', 1, 'easy', 'application', 'past_simple', 'grammar', 'Past simple negative: ''did not'' + base form.', 'published'),
(v_pool_id, 'open_cloze', 'The teacher ______ helped me was very kind.', '"who"', 1, 'easy', 'application', 'relative_clauses', 'grammar', '''Who'' is the relative pronoun for people as subject.', 'published'),
(v_pool_id, 'open_cloze', 'You ______ wear a helmet when riding a bicycle. It''s the law.', '"must"', 1, 'medium', 'application', 'modal_verbs', 'grammar', '''Must'' expresses obligation or a rule.', 'published'),
(v_pool_id, 'open_cloze', 'I wanted to go swimming ______ the pool was closed.', '"but"', 1, 'easy', 'application', 'conjunctions', 'grammar', '''But'' connects two contrasting ideas.', 'published'),
(v_pool_id, 'open_cloze', 'What are you going to ______ when you finish school?', '"do"', 1, 'medium', 'application', 'future_forms', 'grammar', '''Going to'' + base form for planned future actions.', 'published'),
(v_pool_id, 'open_cloze', 'Is there ______ interesting on TV tonight?', '"anything"', 1, 'medium', 'application', 'indefinite_pronouns', 'grammar', '''Anything'' is used in questions.', 'published'),
(v_pool_id, 'open_cloze', 'She is saving money ______ that she can buy a new phone.', '"so"', 1, 'medium', 'application', 'conjunctions_purpose', 'grammar', '''So that'' introduces a purpose clause.', 'published'),
(v_pool_id, 'open_cloze', 'You can have ______ the chocolate cake or the fruit salad for dessert.', '"either"', 1, 'medium', 'application', 'determiners', 'grammar', '''Either … or'' presents a choice between two things.', 'published'),
(v_pool_id, 'open_cloze', 'If you eat too much sugar, you ______ get a stomachache.', '"will"', 1, 'medium', 'application', 'first_conditional', 'grammar', 'First conditional: if + present simple, will + base form.', 'published');

-- ═══════════════════════════════
-- READING COMPREHENSION — 6 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, passage, options, correct_answer, correct_index, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'reading_comprehension', 'What is the passage mainly about?',
 'My name is Fatima and I am twelve years old. I live in a small town near the coast with my parents and two brothers. Every summer, our whole family goes to my grandmother''s house in the countryside for two weeks. It is my favourite time of the year.

My grandmother''s house is very old and has a huge garden with fruit trees and a small pond. In the morning, my brothers and I help pick fruit from the trees. In the afternoon, we usually go swimming in the river nearby or play football in the field. In the evening, my grandmother tells us exciting stories about when she was young.

I love visiting because the countryside is so different from our town. There is no traffic noise, and the air smells fresh and clean. I always feel sad when it is time to go home, but my grandmother always says, ''See you next summer!''',
 '["Fatima''s school life","A family''s summer holiday tradition","How to grow fruit in a garden","Fatima''s grandmother''s life story"]',
 '"A family''s summer holiday tradition"', 1, 2, 'easy', 'application', 'main_idea', 'reading', 'The passage describes Fatima''s family visiting grandmother''s house every summer — a holiday tradition.', 'published'),

(v_pool_id, 'reading_comprehension', 'How long does Fatima''s family stay at her grandmother''s house?',
 'My name is Fatima and I am twelve years old. I live in a small town near the coast with my parents and two brothers. Every summer, our whole family goes to my grandmother''s house in the countryside for two weeks. It is my favourite time of the year.

My grandmother''s house is very old and has a huge garden with fruit trees and a small pond. In the morning, my brothers and I help pick fruit from the trees. In the afternoon, we usually go swimming in the river nearby or play football in the field. In the evening, my grandmother tells us exciting stories about when she was young.

I love visiting because the countryside is so different from our town. There is no traffic noise, and the air smells fresh and clean. I always feel sad when it is time to go home, but my grandmother always says, ''See you next summer!''',
 '["One week","Two weeks","One month","The whole summer"]',
 '"Two weeks"', 1, 2, 'easy', 'application', 'detail_retrieval', 'reading', 'The passage states ''our whole family goes to my grandmother''s house in the countryside for two weeks''.', 'published'),

(v_pool_id, 'reading_comprehension', 'Why does Fatima enjoy visiting the countryside?',
 'My name is Fatima and I am twelve years old. I live in a small town near the coast with my parents and two brothers. Every summer, our whole family goes to my grandmother''s house in the countryside for two weeks. It is my favourite time of the year.

My grandmother''s house is very old and has a huge garden with fruit trees and a small pond. In the morning, my brothers and I help pick fruit from the trees. In the afternoon, we usually go swimming in the river nearby or play football in the field. In the evening, my grandmother tells us exciting stories about when she was young.

I love visiting because the countryside is so different from our town. There is no traffic noise, and the air smells fresh and clean. I always feel sad when it is time to go home, but my grandmother always says, ''See you next summer!''',
 '["Because she can watch television there","Because it is quiet and peaceful compared to her town","Because she goes shopping with her grandmother","Because her school friends live nearby"]',
 '"Because it is quiet and peaceful compared to her town"', 1, 2, 'medium', 'reasoning', 'inference', 'reading', 'Fatima says the countryside ''is so different from our town — no traffic noise, fresh clean air'' — this implies she enjoys the peace.', 'published'),

(v_pool_id, 'reading_comprehension', 'What is the main purpose of this passage?',
 'Do you know how to stay safe online? The internet is a wonderful tool for learning, communicating and having fun. However, it can also be dangerous if you are not careful.

Firstly, never share personal information such as your full name, address, or phone number with strangers online. Secondly, if someone you don''t know sends you a message, don''t reply — tell a parent or teacher instead. Thirdly, remember that not everything you read online is true. Always check information on several different websites before you believe it.

Finally, try to limit the amount of time you spend online each day. Spending too much time looking at screens can affect your sleep and your health. If you follow these simple rules, you can enjoy the internet safely.',
 '["To describe how the internet was invented","To give advice about staying safe on the internet","To explain why the internet is dangerous","To persuade people to stop using the internet"]',
 '"To give advice about staying safe on the internet"', 1, 2, 'medium', 'application', 'main_idea', 'reading', 'The passage gives practical safety tips (don''t share info, check facts, limit screen time) — its purpose is advice.', 'published'),

(v_pool_id, 'reading_comprehension', 'According to the passage, what should you do if a stranger messages you online?',
 'Do you know how to stay safe online? The internet is a wonderful tool for learning, communicating and having fun. However, it can also be dangerous if you are not careful.

Firstly, never share personal information such as your full name, address, or phone number with strangers online. Secondly, if someone you don''t know sends you a message, don''t reply — tell a parent or teacher instead. Thirdly, remember that not everything you read online is true. Always check information on several different websites before you believe it.

Finally, try to limit the amount of time you spend online each day. Spending too much time looking at screens can affect your sleep and your health. If you follow these simple rules, you can enjoy the internet safely.',
 '["Reply politely","Block them immediately","Tell a parent or teacher","Report them to the police"]',
 '"Tell a parent or teacher"', 2, 2, 'medium', 'application', 'detail_retrieval', 'reading', 'The passage states: ''if someone you don''t know sends you a message, don''t reply — tell a parent or teacher instead''.', 'published'),

(v_pool_id, 'reading_comprehension', 'The writer suggests that too much screen time can ______.',
 'Do you know how to stay safe online? The internet is a wonderful tool for learning, communicating and having fun. However, it can also be dangerous if you are not careful.

Firstly, never share personal information such as your full name, address, or phone number with strangers online. Secondly, if someone you don''t know sends you a message, don''t reply — tell a parent or teacher instead. Thirdly, remember that not everything you read online is true. Always check information on several different websites before you believe it.

Finally, try to limit the amount of time you spend online each day. Spending too much time looking at screens can affect your sleep and your health. If you follow these simple rules, you can enjoy the internet safely.',
 '["improve your concentration","make you a better student","harm your sleep and your health","help you make more friends"]',
 '"harm your sleep and your health"', 2, 2, 'hard', 'reasoning', 'inference', 'reading', 'The passage states: ''Spending too much time looking at screens can affect your sleep and your health.''', 'published');

-- ═══════════════════════════════
-- EMAIL WRITING — 2 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'email_writing', 'You recently went on a school trip. Write an email to your English-speaking friend telling them about it.

In your email:
• say where you went and when
• describe what you did there
• explain what you enjoyed most and why

Write 80–150 words.', '"AI_GRADED"', 10, 'medium', 'reasoning', 'email_writing', 'writing', 'Email should include all three bullet points with appropriate friendly tone.', 'published'),
(v_pool_id, 'email_writing', 'Your school wants to start an after-school club. Write an email to your teacher suggesting an idea for a new club.

In your email:
• suggest what the club should be about
• explain why students would enjoy it
• say when and where it could take place

Write 80–150 words.', '"AI_GRADED"', 10, 'hard', 'reasoning', 'email_writing', 'writing', 'Email should be semi-formal with a clear suggestion and supporting reasons.', 'published');

-- ═══════════════════════════════
-- ESSAY WRITING — 2 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'essay_writing', 'Some people think that children should spend more time playing outdoors. Others believe that indoor activities like reading and using computers are more useful.

Write an essay discussing both views and give your own opinion.

Write 150–300 words.', '"AI_GRADED"', 15, 'hard', 'reasoning', 'essay_writing', 'writing', 'Essay should present both viewpoints with simple supporting arguments and a clear personal opinion.', 'published'),
(v_pool_id, 'essay_writing', '"Everyone should learn to cook."

Do you agree or disagree with this statement? Give reasons and examples to support your answer.

Write 150–300 words.', '"AI_GRADED"', 15, 'hard', 'reasoning', 'essay_writing', 'writing', 'Essay should present a clear opinion with relevant everyday examples.', 'published');

-- ═══════════════════════════════
-- DONE — Create a default blueprint
-- ═══════════════════════════════
-- Distribution:
--   mcq: 5 easy + 8 medium + 1 hard = 14
--   gap_fill: 1 easy + 2 medium + 1 hard = 4
--   error_correction: 1 easy + 1 medium + 1 hard = 3
--   sentence_transformation: 1 easy + 2 medium + 1 hard = 4
--   reading_comprehension: 1 easy + 1 medium = 2
--   email_writing: 1 medium = 1 (10 marks)
--   essay_writing: 1 hard = 1 (15 marks)

INSERT INTO adm_blueprints (
    id, school_id, name, subject, target_stage, total_marks, duration_minutes,
    question_distribution, pass_percentage, delivery_mode, is_active
) VALUES (
    '00000000-0000-0000-0000-e07117000002'::uuid,
    NULL,  -- global
    'English Stage 7 — Standard Admission Test',
    'english',
    7,
    54,  -- 25 × 1 mark + 2 × 2 marks (reading comp) + 10 (email) + 15 (essay)
    75,  -- 75 minutes (extra time for writing)
    '{
      "mcq": {"easy": 5, "medium": 8, "hard": 1},
      "gap_fill": {"easy": 1, "medium": 2, "hard": 1},
      "error_correction": {"easy": 1, "medium": 1, "hard": 1},
      "sentence_transformation": {"easy": 1, "medium": 2, "hard": 1},
      "reading_comprehension": {"easy": 1, "medium": 1},
      "email_writing": {"medium": 1},
      "essay_writing": {"hard": 1}
    }'::jsonb,
    50,
    'exam',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    question_distribution = EXCLUDED.question_distribution,
    total_marks = EXCLUDED.total_marks,
    duration_minutes = EXCLUDED.duration_minutes,
    updated_at = NOW();

END $$;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run these to confirm the import:
-- SELECT count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e07117000001'::uuid;
-- → should return 96
-- SELECT question_type, difficulty, count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e07117000001'::uuid GROUP BY 1,2 ORDER BY 1,2;
