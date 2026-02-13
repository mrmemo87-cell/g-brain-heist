-- ============================================================
-- ADMISSION HUB — Import English Stage 9 Question Pool
-- ============================================================
-- Run AFTER ADM_SCHEMA_MIGRATION.sql (tables must exist)
-- This loads the 96 questions from english_stage9_pool.json
-- into adm_question_pools + adm_questions.
--
-- NOTE: This creates a GLOBAL pool (school_id = NULL) so all
-- schools can use it. Change school_id if you want school-specific.
-- ============================================================

-- Step 1: Create the pool
INSERT INTO adm_question_pools (id, school_id, subject, stage, grade_level, name, description, is_active)
VALUES (
    '00000000-0000-0000-0000-e09119000001'::uuid,
    NULL,  -- global pool
    'english',
    9,
    8,  -- Grade 8 ≈ Cambridge Stage 9
    'English Stage 9 — Cambridge Style',
    'Original Cambridge-style questions covering grammar, vocabulary, reading comprehension. 96 questions across 7 types.',
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
    v_pool_id UUID := '00000000-0000-0000-0000-e09119000001'::uuid;
BEGIN

-- ═══════════════════════════════
-- MCQ — 32 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, options, correct_answer, correct_index, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'mcq', 'I ______ to the new science museum last weekend.', '["have been","have gone","went","go"]', '"went"', 2, 1, 'easy', 'application', 'present_perfect_vs_past_simple', 'grammar', 'Past simple is used for completed actions at a specific past time (''last weekend'').', 'published'),
(v_pool_id, 'mcq', 'She ______ three novels since the beginning of the year.', '["read","has read","was reading","reads"]', '"has read"', 1, 1, 'easy', 'application', 'present_perfect_vs_past_simple', 'grammar', 'Present perfect is used for actions that started in the past and continue to the present (''since the beginning of the year'').', 'published'),
(v_pool_id, 'mcq', 'We ______ in this neighbourhood for over ten years now.', '["lived","are living","have lived","live"]', '"have lived"', 2, 1, 'medium', 'application', 'present_perfect_vs_past_simple', 'grammar', 'Present perfect with ''for'' expresses duration continuing to the present.', 'published'),
(v_pool_id, 'mcq', 'If I ______ you, I would apologise immediately.', '["am","was","were","be"]', '"were"', 2, 1, 'easy', 'application', 'second_conditional', 'grammar', 'The second conditional uses ''were'' for all subjects in the if-clause.', 'published'),
(v_pool_id, 'mcq', 'If it ______ tomorrow, the school trip will be cancelled.', '["rained","rains","will rain","would rain"]', '"rains"', 1, 1, 'easy', 'application', 'first_conditional', 'grammar', 'The first conditional uses present simple in the if-clause.', 'published'),
(v_pool_id, 'mcq', 'She would have passed the exam if she ______ harder.', '["studied","had studied","would study","studies"]', '"had studied"', 1, 1, 'medium', 'application', 'third_conditional', 'grammar', 'The third conditional uses past perfect in the if-clause.', 'published'),
(v_pool_id, 'mcq', 'The children ______ not to touch the fragile equipment.', '["told","were telling","were told","have telling"]', '"were told"', 2, 1, 'easy', 'application', 'passive_voice', 'grammar', 'Passive voice: subject receives the action. Were told = past simple passive.', 'published'),
(v_pool_id, 'mcq', 'A new library ______ next to the main hall right now.', '["builds","is building","is being built","has built"]', '"is being built"', 2, 1, 'medium', 'application', 'passive_voice', 'grammar', 'Present continuous passive = is/are being + past participle.', 'published'),
(v_pool_id, 'mcq', 'The teacher asked us what we ______ the previous evening.', '["did","have done","had done","do"]', '"had done"', 2, 1, 'medium', 'application', 'reported_speech', 'grammar', 'Reported speech with past reporting verb shifts past simple to past perfect.', 'published'),
(v_pool_id, 'mcq', 'He told me that he ______ visit us the following week.', '["will","shall","would","can"]', '"would"', 2, 1, 'easy', 'application', 'reported_speech', 'grammar', 'In reported speech, ''will'' becomes ''would''.', 'published'),
(v_pool_id, 'mcq', 'The woman ______ car was parked outside is my neighbour.', '["who","whose","which","whom"]', '"whose"', 1, 1, 'easy', 'application', 'relative_clauses', 'grammar', '''Whose'' shows possession in relative clauses.', 'published'),
(v_pool_id, 'mcq', 'The project, ______ was due on Friday, has been postponed.', '["that","who","which","whom"]', '"which"', 2, 1, 'medium', 'application', 'relative_clauses', 'grammar', 'Non-defining relative clauses (with commas) use ''which'' for things.', 'published'),
(v_pool_id, 'mcq', 'You ______ bring your own equipment; the school will provide everything.', '["mustn''t","don''t need to","shouldn''t","can''t"]', '"don''t need to"', 1, 1, 'medium', 'application', 'modal_verbs', 'grammar', '''Don''t need to'' expresses lack of necessity.', 'published'),
(v_pool_id, 'mcq', 'She ______ be at home — I just saw her at the supermarket.', '["mustn''t","can''t","shouldn''t","needn''t"]', '"can''t"', 1, 1, 'medium', 'application', 'modal_verbs', 'grammar', '''Can''t'' expresses impossibility based on evidence.', 'published'),
(v_pool_id, 'mcq', 'My parents encouraged me ______ part in the debate competition.', '["take","taking","to take","taken"]', '"to take"', 2, 1, 'easy', 'application', 'gerunds_infinitives', 'grammar', '''Encourage'' is followed by object + to-infinitive.', 'published'),
(v_pool_id, 'mcq', 'I really enjoy ______ documentaries about ocean wildlife.', '["watch","to watch","watching","watched"]', '"watching"', 2, 1, 'easy', 'application', 'gerunds_infinitives', 'grammar', '''Enjoy'' is followed by the gerund (-ing form).', 'published'),
(v_pool_id, 'mcq', 'We arrived at the cinema ______ time to see the last showing.', '["at","on","in","by"]', '"in"', 2, 1, 'medium', 'application', 'prepositions', 'grammar', '''In time'' means early enough, not late.', 'published'),
(v_pool_id, 'mcq', 'This painting is ______ the one in the gallery downtown.', '["more beautiful as","the most beautiful","more beautiful than","most beautiful than"]', '"more beautiful than"', 2, 1, 'easy', 'application', 'comparatives_superlatives', 'grammar', 'Comparative form + ''than'' for comparing two things.', 'published'),
(v_pool_id, 'mcq', 'I wish I ______ more time to prepare for the presentation.', '["have","had","will have","am having"]', '"had"', 1, 1, 'medium', 'application', 'wish_clauses', 'grammar', '''Wish'' + past simple expresses a present unreal desire.', 'published'),
(v_pool_id, 'mcq', 'The building was ______ old that it had to be demolished.', '["such","very","so","too"]', '"so"', 2, 1, 'medium', 'application', 'so_such', 'grammar', '''So'' + adjective + ''that'' clause expresses result.', 'published'),
(v_pool_id, 'mcq', 'It was ______ an interesting lecture that everyone stayed until the end.', '["so","such","very","too"]', '"such"', 1, 1, 'medium', 'application', 'so_such', 'grammar', '''Such'' + a/an + adjective + noun + ''that'' clause.', 'published'),
(v_pool_id, 'mcq', '______ the heavy rain, the match continued without interruption.', '["Although","Despite","However","Even"]', '"Despite"', 1, 1, 'medium', 'application', 'connectives', 'grammar', '''Despite'' + noun phrase shows contrast.', 'published'),
(v_pool_id, 'mcq', 'She worked hard; ______, she didn''t pass the final exam.', '["although","because","however","despite"]', '"however"', 2, 1, 'medium', 'application', 'connectives', 'grammar', '''However'' is used as a linking adverb to show contrast between two sentences.', 'published'),
(v_pool_id, 'mcq', 'Choose the word closest in meaning to "abundant".', '["scarce","plentiful","ordinary","strict"]', '"plentiful"', 1, 1, 'medium', 'application', 'vocabulary_synonyms', 'vocabulary', '''Abundant'' means existing in large quantities; ''plentiful'' is the closest synonym.', 'published'),
(v_pool_id, 'mcq', 'Which word is the opposite of "reveal"?', '["display","conceal","announce","discover"]', '"conceal"', 1, 1, 'easy', 'application', 'vocabulary_antonyms', 'vocabulary', '''Reveal'' means to make known; ''conceal'' means to hide.', 'published'),
(v_pool_id, 'mcq', 'The politician tried to ______ the audience with a passionate speech.', '["avoid","persuade","prevent","refuse"]', '"persuade"', 1, 1, 'medium', 'application', 'vocabulary_context', 'vocabulary', '''Persuade'' means to convince someone through reasoning or argument.', 'published'),
(v_pool_id, 'mcq', 'Many species are on the ______ of extinction due to habitat loss.', '["boundary","verge","edge","line"]', '"verge"', 1, 1, 'medium', 'application', 'collocations', 'vocabulary', '''On the verge of'' is the correct collocation meaning ''about to''.', 'published'),
(v_pool_id, 'mcq', 'The athletes ______ up before every training session.', '["heat","warm","hot","fire"]', '"warm"', 1, 1, 'easy', 'application', 'phrasal_verbs', 'vocabulary', '''Warm up'' is the phrasal verb meaning to prepare the body for exercise.', 'published'),
(v_pool_id, 'mcq', 'She takes ______ her mother — they look almost identical.', '["after","up","on","in"]', '"after"', 0, 1, 'medium', 'application', 'phrasal_verbs', 'vocabulary', '''Take after'' means to resemble a family member.', 'published'),
(v_pool_id, 'mcq', 'After many attempts, the scientists finally ______ through in their research.', '["came","broke","went","passed"]', '"broke"', 1, 1, 'medium', 'application', 'phrasal_verbs', 'vocabulary', '''Broke through'' means achieved a significant advance.', 'published'),
(v_pool_id, 'mcq', 'Neither the students ______ the teacher was aware of the schedule change.', '["or","and","nor","but"]', '"nor"', 2, 1, 'medium', 'application', 'correlative_conjunctions', 'grammar', '''Neither … nor'' is the correct correlative conjunction pair.', 'published'),
(v_pool_id, 'mcq', 'The evidence clearly shows that climate change ______ a global challenge.', '["remain","remains","remaining","are remaining"]', '"remains"', 1, 1, 'hard', 'reasoning', 'subject_verb_agreement', 'grammar', 'The subject ''climate change'' is singular, requiring ''remains''.', 'published');

-- ═══════════════════════════════
-- GAP FILL — 14 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'gap_fill', 'The children were so excited that they could ______ (hard) sit still during the show.', '"hardly"', 1, 'easy', 'application', 'adverb_formation', 'grammar', '''Hardly'' is the adverb meaning ''barely'' or ''scarcely''.', 'published'),
(v_pool_id, 'gap_fill', 'By the time we arrived, the concert ______ (already / begin).', '"had already begun"', 1, 'medium', 'application', 'past_perfect', 'grammar', 'Past perfect is used for an action completed before another past event.', 'published'),
(v_pool_id, 'gap_fill', 'If the weather ______ (be) nicer, we would go to the beach.', '"were"', 1, 'easy', 'application', 'second_conditional', 'grammar', 'Second conditional uses ''were'' for hypothetical present situations.', 'published'),
(v_pool_id, 'gap_fill', 'She avoided ______ (make) eye contact with the teacher.', '"making"', 1, 'medium', 'application', 'gerunds_infinitives', 'grammar', '''Avoid'' is followed by the gerund (-ing form).', 'published'),
(v_pool_id, 'gap_fill', 'The message was written in ______ (complete) illegible handwriting.', '"completely"', 1, 'medium', 'application', 'adverb_formation', 'vocabulary', 'The adverb ''completely'' modifies the adjective ''illegible''.', 'published'),
(v_pool_id, 'gap_fill', 'The museum is famous for its ______ (impress) collection of ancient artefacts.', '"impressive"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'The adjective ''impressive'' is formed from ''impress'' + ''-ive''.', 'published'),
(v_pool_id, 'gap_fill', 'The runner collapsed from ______ (exhaust) after the marathon.', '"exhaustion"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'The noun ''exhaustion'' is formed from ''exhaust'' + ''-ion''.', 'published'),
(v_pool_id, 'gap_fill', 'He apologised for the ______ (convenient) caused by the delay.', '"inconvenience"', 1, 'hard', 'application', 'word_formation', 'vocabulary', 'The noun ''inconvenience'' uses prefix ''in-'' (negation) + noun form.', 'published'),
(v_pool_id, 'gap_fill', 'The ______ (science) community has expressed concern about the findings.', '"scientific"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'The adjective ''scientific'' is the correct form to modify ''community''.', 'published'),
(v_pool_id, 'gap_fill', 'She ______ (not / finish) her homework when her friends arrived.', '"had not finished"', 1, 'medium', 'application', 'past_perfect', 'grammar', 'Past perfect negative for an incomplete action before a past event.', 'published'),
(v_pool_id, 'gap_fill', 'The new regulations will ______ (sure) improve workplace safety.', '"surely"', 1, 'hard', 'application', 'adverb_formation', 'grammar', '''Surely'' is the adverb form of ''sure''.', 'published'),
(v_pool_id, 'gap_fill', 'The students are expected ______ (hand) in their projects by Friday.', '"to hand"', 1, 'medium', 'application', 'gerunds_infinitives', 'grammar', '''Expected'' is followed by to-infinitive.', 'published'),
(v_pool_id, 'gap_fill', 'This decision could have ______ (disaster) consequences for the environment.', '"disastrous"', 1, 'hard', 'application', 'word_formation', 'vocabulary', 'The adjective ''disastrous'' is the correct form before the noun ''consequences''.', 'published'),
(v_pool_id, 'gap_fill', 'There is growing ______ (aware) of the need to recycle plastic waste.', '"awareness"', 1, 'hard', 'application', 'word_formation', 'vocabulary', 'The noun ''awareness'' is formed from ''aware'' + ''-ness''.', 'published');

-- ═══════════════════════════════
-- ERROR CORRECTION — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'error_correction', 'She don''t like swimming in cold water.', '"doesn''t"', 1, 'easy', 'application', 'subject_verb_agreement', 'grammar', 'Third person singular requires ''doesn''t'', not ''don''t''.', 'published'),
(v_pool_id, 'error_correction', 'The news are very shocking this morning.', '"is"', 1, 'easy', 'application', 'uncountable_nouns', 'grammar', '''News'' is an uncountable noun and takes a singular verb.', 'published'),
(v_pool_id, 'error_correction', 'He has went to the library to return his books.', '"gone"', 1, 'medium', 'application', 'present_perfect', 'grammar', 'The correct past participle of ''go'' is ''gone'', not ''went''.', 'published'),
(v_pool_id, 'error_correction', 'I am looking forward to meet you at the conference.', '"meeting"', 1, 'medium', 'application', 'gerunds_infinitives', 'grammar', '''Look forward to'' is followed by the gerund because ''to'' is a preposition here.', 'published'),
(v_pool_id, 'error_correction', 'She suggested me to take the earlier train.', '"suggested that I take / suggested taking"', 1, 'medium', 'application', 'verb_patterns', 'grammar', '''Suggest'' is not followed by object + infinitive. Correct: ''suggested that I take'' or ''suggested taking''.', 'published'),
(v_pool_id, 'error_correction', 'Each of the students have completed their assignments.', '"has"', 1, 'medium', 'application', 'subject_verb_agreement', 'grammar', '''Each'' takes a singular verb: ''has''.', 'published'),
(v_pool_id, 'error_correction', 'The informations provided in the report were inaccurate.', '"information"', 1, 'medium', 'application', 'uncountable_nouns', 'grammar', '''Information'' is uncountable and has no plural form.', 'published'),
(v_pool_id, 'error_correction', 'Despite of the bad weather, the event was a success.', '"Despite (remove of)"', 1, 'hard', 'application', 'prepositions', 'grammar', '''Despite'' is not followed by ''of''. Use ''Despite'' alone or ''In spite of''.', 'published'),
(v_pool_id, 'error_correction', 'The amount of people attending the festival was surprising.', '"number"', 1, 'hard', 'application', 'countable_uncountable', 'grammar', '''Number'' is used with countable nouns (people); ''amount'' is for uncountable nouns.', 'published'),
(v_pool_id, 'error_correction', 'She speaks English more fluenter than her brother.', '"more fluently"', 1, 'hard', 'application', 'comparatives', 'grammar', '''Fluent'' is a two-syllable adjective; comparative adverb = ''more fluently''.', 'published');

-- ═══════════════════════════════
-- SENTENCE TRANSFORMATION — 14 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, keyword, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'sentence_transformation', 'It is not necessary for you to attend the meeting. (HAVE)', 'HAVE', '"You don''t have to attend the meeting."', 1, 'easy', 'application', 'modal_obligation', 'grammar', '''Don''t have to'' expresses lack of obligation.', 'published'),
(v_pool_id, 'sentence_transformation', '"I will help you with the project," she said. (OFFERED)', 'OFFERED', '"She offered to help me with the project."', 1, 'medium', 'application', 'reported_speech', 'grammar', '''Offer'' + to-infinitive transforms direct speech promises.', 'published'),
(v_pool_id, 'sentence_transformation', 'I haven''t seen such a beautiful sunset before. (EVER)', 'EVER', '"It is the most beautiful sunset I have ever seen."', 1, 'medium', 'application', 'superlatives', 'grammar', 'Superlative + present perfect with ''ever'' for life experience.', 'published'),
(v_pool_id, 'sentence_transformation', 'They started building the bridge two years ago. (BEEN)', 'BEEN', '"The bridge has been being built for two years."', 1, 'hard', 'reasoning', 'passive_continuous', 'grammar', 'Present perfect continuous passive expresses ongoing construction.', 'published'),
(v_pool_id, 'sentence_transformation', 'Nobody in the class runs faster than Amir. (FASTEST)', 'FASTEST', '"Amir is the fastest runner in the class."', 1, 'medium', 'application', 'comparatives_superlatives', 'grammar', 'Superlative form converts ''nobody … faster than'' to the highest degree.', 'published'),
(v_pool_id, 'sentence_transformation', 'I regret not studying harder for the exam. (WISH)', 'WISH', '"I wish I had studied harder for the exam."', 1, 'medium', 'application', 'wish_clauses', 'grammar', '''Wish'' + past perfect expresses regret about the past.', 'published'),
(v_pool_id, 'sentence_transformation', 'The storm was so severe that all flights were cancelled. (SUCH)', 'SUCH', '"It was such a severe storm that all flights were cancelled."', 1, 'medium', 'application', 'so_such', 'grammar', '''Such'' + a/an + adjective + noun replaces ''so'' + adjective.', 'published'),
(v_pool_id, 'sentence_transformation', 'Someone broke into the office last night. (BROKEN)', 'BROKEN', '"The office was broken into last night."', 1, 'medium', 'application', 'passive_voice', 'grammar', 'Passive voice with phrasal verb ''break into''.', 'published'),
(v_pool_id, 'sentence_transformation', 'The film was too frightening for the young children. (ENOUGH)', 'ENOUGH', '["The film was not suitable enough for the young children.","The young children were not old enough to watch the film."]', 1, 'hard', 'reasoning', 'too_enough', 'grammar', '''Not … enough'' is the inverse of ''too + adjective''.', 'published'),
(v_pool_id, 'sentence_transformation', 'People believe that the ancient city was destroyed by a volcano. (BELIEVED)', 'BELIEVED', '"The ancient city is believed to have been destroyed by a volcano."', 1, 'hard', 'reasoning', 'passive_reporting', 'grammar', 'Impersonal passive reporting structure: subject + is believed + to have + past participle.', 'published'),
(v_pool_id, 'sentence_transformation', 'She locked all the doors because she didn''t want anyone to enter. (PREVENT)', 'PREVENT', '"She locked all the doors to prevent anyone from entering."', 1, 'medium', 'application', 'gerunds_infinitives', 'grammar', '''Prevent'' + object + ''from'' + gerund.', 'published'),
(v_pool_id, 'sentence_transformation', 'Despite leaving early, we still missed the bus. (EVEN)', 'EVEN', '"Even though we left early, we still missed the bus."', 1, 'hard', 'reasoning', 'connectives', 'grammar', '''Even though'' + clause replaces ''Despite'' + gerund.', 'published'),
(v_pool_id, 'sentence_transformation', 'They haven''t made a decision about the proposal yet. (STILL)', 'STILL', '"They still haven''t made a decision about the proposal."', 1, 'hard', 'application', 'present_perfect', 'grammar', '''Still'' + present perfect negative emphasises non-completion.', 'published'),
(v_pool_id, 'sentence_transformation', 'It is possible that she left her phone at work. (MAY)', 'MAY', '"She may have left her phone at work."', 1, 'hard', 'reasoning', 'modal_speculation', 'grammar', '''May have'' + past participle expresses past possibility.', 'published');

-- ═══════════════════════════════
-- WORD FORMATION — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, base_word, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'word_formation', 'The ______ of the new sports centre has been delayed. (CONSTRUCT)', 'CONSTRUCT', '"construction"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Noun form: construct → construction.', 'published'),
(v_pool_id, 'word_formation', 'The hotel offers very ______ rooms with a sea view. (COMFORT)', 'COMFORT', '"comfortable"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Adjective form: comfort → comfortable.', 'published'),
(v_pool_id, 'word_formation', 'The explorers made an ______ discovery in the cave. (AMAZE)', 'AMAZE', '"amazing"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Adjective form: amaze → amazing (describes the discovery).', 'published'),
(v_pool_id, 'word_formation', 'The ______ between the two teams was fierce and exciting. (COMPETE)', 'COMPETE', '"competition"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Noun form: compete → competition.', 'published'),
(v_pool_id, 'word_formation', 'Her ______ to help others is truly admirable. (WILLING)', 'WILLING', '"willingness"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Noun form: willing → willingness.', 'published'),
(v_pool_id, 'word_formation', 'The government plans to ______ the railway network. (MODERN)', 'MODERN', '"modernise"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Verb form: modern → modernise (to make modern).', 'published'),
(v_pool_id, 'word_formation', 'The charity provides ______ to families in need. (ASSIST)', 'ASSIST', '"assistance"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Noun form: assist → assistance.', 'published'),
(v_pool_id, 'word_formation', 'It would be ______ to ignore the warning signs. (RESPOND)', 'RESPOND', '"irresponsible"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Adjective form with negative prefix: respond → responsible → irresponsible.', 'published'),
(v_pool_id, 'word_formation', 'She felt a great sense of ______ after finishing the race. (ACHIEVE)', 'ACHIEVE', '"achievement"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Noun form: achieve → achievement.', 'published'),
(v_pool_id, 'word_formation', 'There has been a ______ improvement in his behaviour. (NOTICE)', 'NOTICE', '"noticeable"', 1, 'hard', 'application', 'word_formation', 'vocabulary', 'Adjective form: notice → noticeable.', 'published');

-- ═══════════════════════════════
-- OPEN CLOZE — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'open_cloze', 'She is very good ______ playing the violin.', '"at"', 1, 'easy', 'application', 'prepositions', 'grammar', 'Adjective + preposition collocation: ''good at''.', 'published'),
(v_pool_id, 'open_cloze', 'He has been studying English ______ he was six years old.', '"since"', 1, 'easy', 'application', 'present_perfect', 'grammar', '''Since'' is used with present perfect for a specific starting point.', 'published'),
(v_pool_id, 'open_cloze', 'There were very ______ people at the park due to the storm.', '"few"', 1, 'medium', 'application', 'quantifiers', 'grammar', '''Few'' is used with countable nouns to mean ''not many''.', 'published'),
(v_pool_id, 'open_cloze', 'The exam turned ______ to be easier than we expected.', '"out"', 1, 'medium', 'application', 'phrasal_verbs', 'grammar', '''Turn out'' means to prove to be or to result in.', 'published'),
(v_pool_id, 'open_cloze', 'I''d rather stay home tonight ______ go to the party.', '"than"', 1, 'medium', 'application', 'preferences', 'grammar', '''Would rather … than'' expresses preference.', 'published'),
(v_pool_id, 'open_cloze', 'The children are not allowed to use their phones ______ school hours.', '"during"', 1, 'easy', 'application', 'prepositions', 'grammar', '''During'' indicates a period within which something happens.', 'published'),
(v_pool_id, 'open_cloze', 'You can borrow my umbrella as ______ as you return it tomorrow.', '"long"', 1, 'medium', 'application', 'conditionals', 'grammar', '''As long as'' expresses a condition.', 'published'),
(v_pool_id, 'open_cloze', 'Not only did she win the prize, ______ she also broke the school record.', '"but"', 1, 'medium', 'application', 'correlative_conjunctions', 'grammar', '''Not only … but also'' is a correlative conjunction pair.', 'published'),
(v_pool_id, 'open_cloze', 'The teacher insisted ______ everyone completing the task before leaving.', '"on"', 1, 'medium', 'application', 'verb_preposition', 'grammar', '''Insist on'' is the correct verb + preposition collocation.', 'published'),
(v_pool_id, 'open_cloze', 'He is ______ clever student that all his teachers admire him.', '"such a"', 1, 'easy', 'application', 'so_such', 'grammar', '''Such a'' + adjective + singular noun.', 'published');

-- ═══════════════════════════════
-- READING COMPREHENSION — 6 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, passage, options, correct_answer, correct_index, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'reading_comprehension', 'What is the passage mainly about?',
 'The Great Barrier Reef off the coast of Australia is one of the most remarkable natural structures on Earth. Stretching over 2,300 kilometres, it is the world''s largest coral reef system and can even be seen from outer space. However, in recent decades, the reef has faced serious threats from rising ocean temperatures, pollution, and destructive fishing practices. Scientists warn that without urgent action, up to 90% of its coral could be lost within the next thirty years. Various conservation programmes have been launched, including coral replanting and stricter marine protection laws.',
 '["How to replant coral reefs","The size comparison of world reefs","The Great Barrier Reef and threats it faces","Australia''s tourism industry"]',
 '"The Great Barrier Reef and threats it faces"', 2, 2, 'easy', 'application', 'main_idea', 'reading', 'The passage discusses the reef, its significance, and the threats it faces.', 'published'),
(v_pool_id, 'reading_comprehension', 'According to the passage, what could happen to the coral within 30 years?',
 'The Great Barrier Reef off the coast of Australia is one of the most remarkable natural structures on Earth. Stretching over 2,300 kilometres, it is the world''s largest coral reef system and can even be seen from outer space. However, in recent decades, the reef has faced serious threats from rising ocean temperatures, pollution, and destructive fishing practices. Scientists warn that without urgent action, up to 90% of its coral could be lost within the next thirty years. Various conservation programmes have been launched, including coral replanting and stricter marine protection laws.',
 '["It could double in size","Up to 90% could disappear","It could move to cooler waters","All of it will be protected"]',
 '"Up to 90% could disappear"', 1, 2, 'easy', 'application', 'detail_retrieval', 'reading', 'Stated explicitly: ''up to 90% of its coral could be lost within the next thirty years''.', 'published'),
(v_pool_id, 'reading_comprehension', 'What does the word "launched" mean in this context?',
 'The Great Barrier Reef off the coast of Australia is one of the most remarkable natural structures on Earth. Stretching over 2,300 kilometres, it is the world''s largest coral reef system and can even be seen from outer space. However, in recent decades, the reef has faced serious threats from rising ocean temperatures, pollution, and destructive fishing practices. Scientists warn that without urgent action, up to 90% of its coral could be lost within the next thirty years. Various conservation programmes have been launched, including coral replanting and stricter marine protection laws.',
 '["Thrown into the air","Started or initiated","Finished successfully","Delayed indefinitely"]',
 '"Started or initiated"', 1, 2, 'medium', 'application', 'vocabulary_in_context', 'reading', '''Launched'' here means started or set in motion (programmes).', 'published'),
(v_pool_id, 'reading_comprehension', 'What is the main idea of the second paragraph?',
 'In the early twentieth century, most people communicated through letters and telegrams. Messages could take days or even weeks to reach their destination. The invention of the telephone revolutionised personal communication, but it was the arrival of the internet in the 1990s that truly transformed how humans connect.

Today, billions of people rely on digital platforms for communication, education, and entertainment. Social media, in particular, has reshaped the way we form relationships, share news, and express opinions. However, experts caution that excessive screen time and the spread of misinformation pose significant challenges that society must address.',
 '["The speed of old postal systems","How the telephone was invented","Digital communication and its challenges","Why people prefer letters to emails"]',
 '"Digital communication and its challenges"', 2, 2, 'medium', 'application', 'main_idea', 'reading', 'The second paragraph focuses on digital platforms, social media benefits, and associated challenges.', 'published'),
(v_pool_id, 'reading_comprehension', 'The writer suggests that the internet has had a ______ impact on communication.',
 'In the early twentieth century, most people communicated through letters and telegrams. Messages could take days or even weeks to reach their destination. The invention of the telephone revolutionised personal communication, but it was the arrival of the internet in the 1990s that truly transformed how humans connect.

Today, billions of people rely on digital platforms for communication, education, and entertainment. Social media, in particular, has reshaped the way we form relationships, share news, and express opinions. However, experts caution that excessive screen time and the spread of misinformation pose significant challenges that society must address.',
 '["minor","transformative","negative","temporary"]',
 '"transformative"', 1, 2, 'hard', 'reasoning', 'inference', 'reading', 'The passage uses strong words like ''revolutionised'' and ''truly transformed'', implying a transformative impact.', 'published'),
(v_pool_id, 'reading_comprehension', 'According to experts, what are TWO challenges posed by digital communication?',
 'In the early twentieth century, most people communicated through letters and telegrams. Messages could take days or even weeks to reach their destination. The invention of the telephone revolutionised personal communication, but it was the arrival of the internet in the 1990s that truly transformed how humans connect.

Today, billions of people rely on digital platforms for communication, education, and entertainment. Social media, in particular, has reshaped the way we form relationships, share news, and express opinions. However, experts caution that excessive screen time and the spread of misinformation pose significant challenges that society must address.',
 '["High costs and slow speeds","Excessive screen time and misinformation","Lack of devices and poor coverage","Complicated interfaces and language barriers"]',
 '"Excessive screen time and misinformation"', 1, 2, 'hard', 'reasoning', 'detail_retrieval', 'reading', 'Explicitly stated: ''excessive screen time and the spread of misinformation''.', 'published');

-- ═══════════════════════════════
-- EMAIL WRITING — 2 questions (proper email_writing type)
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'email_writing', 'You recently visited a local museum with your family. Write an email to your English-speaking friend telling them about your visit.

In your email:
• describe what you saw at the museum
• explain what you enjoyed most
• suggest that your friend visits the museum

Write 80-150 words.', '"AI_GRADED"', 10, 'medium', 'reasoning', 'email_writing', 'writing', 'Email should include all three bullet points with appropriate friendly tone and register.', 'published'),
(v_pool_id, 'email_writing', 'Your school is organising a charity event. Write an email to the head teacher suggesting an idea for the event.

In your email:
• explain your idea for the charity event
• say why students would enjoy participating
• suggest how the money raised could be used

Write 80-150 words.', '"AI_GRADED"', 10, 'hard', 'reasoning', 'email_writing', 'writing', 'Email should be semi-formal with clear suggestions and reasoning.', 'published');

-- ═══════════════════════════════
-- ESSAY WRITING — 2 questions (proper essay_writing type)
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'essay_writing', 'Some people believe that students should wear school uniforms, while others think students should be free to choose their own clothes.

Write an essay discussing both views and give your own opinion.

Write 150-300 words.', '"AI_GRADED"', 15, 'hard', 'reasoning', 'essay_writing', 'writing', 'Essay should present both viewpoints with supporting arguments and a clear personal conclusion.', 'published'),
(v_pool_id, 'essay_writing', '"Technology has made our lives easier but also more complicated."

Do you agree or disagree with this statement? Give reasons and examples to support your answer.

Write 150-300 words.', '"AI_GRADED"', 15, 'hard', 'reasoning', 'essay_writing', 'writing', 'Essay should present a clear argument with relevant examples from technology use.', 'published');

-- ═══════════════════════════════
-- DONE — Create a default blueprint
-- ═══════════════════════════════
-- This creates a global blueprint (school_id NULL)
-- that schools can use out of the box.
-- Distribution requests questions (including writing):
--   mcq: 5 easy + 8 medium + 1 hard = 14
--   gap_fill: 1 easy + 2 medium + 1 hard = 4
--   error_correction: 1 medium + 1 hard = 2
--   sentence_transformation: 2 medium + 1 hard = 3
--   reading_comprehension: 1 easy + 1 medium = 2
--   email_writing: 1 medium = 1 (10 marks)
--   essay_writing: 1 hard = 1 (15 marks)

INSERT INTO adm_blueprints (
    id, school_id, name, subject, target_stage, total_marks, duration_minutes,
    question_distribution, pass_percentage, delivery_mode, is_active
) VALUES (
    '00000000-0000-0000-0000-e09119000002'::uuid,
    NULL,  -- global
    'English Stage 9 — Standard Admission Test',
    'english',
    9,
    52,  -- 25 × 1 mark + 2 × 2 marks (reading comp) + 10 (email) + 15 (essay)
    75,  -- 75 minutes (extra time for writing)
    '{
      "mcq": {"easy": 5, "medium": 8, "hard": 1},
      "gap_fill": {"easy": 1, "medium": 2, "hard": 1},
      "error_correction": {"medium": 1, "hard": 1},
      "sentence_transformation": {"medium": 2, "hard": 1},
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
-- SELECT count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e09119000001'::uuid;
-- → should return 96
-- SELECT question_type, difficulty, count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e09119000001'::uuid GROUP BY 1,2 ORDER BY 1,2;
