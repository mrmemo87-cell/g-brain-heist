-- ============================================================
-- ADMISSION HUB — Import English Stage 8 Question Pool
-- ============================================================
-- Run AFTER ADM_SCHEMA_MIGRATION.sql (tables must exist)
-- This loads the 96 questions from english_stage8_pool.json
-- into adm_question_pools + adm_questions.
--
-- NOTE: This creates a GLOBAL pool (school_id = NULL) so all
-- schools can use it. Change school_id if you want school-specific.
-- ============================================================

-- Step 1: Create the pool
INSERT INTO adm_question_pools (id, school_id, subject, stage, grade_level, name, description, is_active)
VALUES (
    '00000000-0000-0000-0000-e08118000001'::uuid,
    NULL,  -- global pool
    'english',
    8,
    7,  -- Grade 7 ≈ Cambridge Stage 8
    'English Stage 8 — Cambridge Style',
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
    v_pool_id UUID := '00000000-0000-0000-0000-e08118000001'::uuid;
BEGIN

-- ═══════════════════════════════
-- MCQ — 32 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, options, correct_answer, correct_index, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'mcq', 'I ______ about studying Greek at school next year.', '["think","am thinking","have thought","was thinking"]', '"am thinking"', 1, 1, 'easy', 'application', 'present_continuous', 'grammar', 'Present continuous is used for plans or ideas being considered right now.', 'published'),
(v_pool_id, 'mcq', 'Samir and Leila ______ tennis together right now.', '["play","plays","are playing","played"]', '"are playing"', 2, 1, 'easy', 'application', 'present_continuous', 'grammar', 'Present continuous describes an action happening at the moment of speaking.', 'published'),
(v_pool_id, 'mcq', 'Portuguese is used in formal situations there, ______ various creoles are spoken with friends and family.', '["while","because","until","so"]', '"while"', 0, 1, 'easy', 'application', 'conjunctions', 'grammar', '''While'' is used here to show contrast between two situations.', 'published'),
(v_pool_id, 'mcq', 'Over 2 billion people speak English, ______ for most of them, it is not their first language.', '["if","as","although","because"]', '"although"', 2, 1, 'easy', 'application', 'conjunctions', 'grammar', '''Although'' introduces a contrasting or surprising fact.', 'published'),
(v_pool_id, 'mcq', 'A new football stadium ______ near the park at the moment.', '["builds","is building","is being built","has built"]', '"is being built"', 2, 1, 'medium', 'application', 'present_continuous_passive', 'grammar', 'Present continuous passive = is/are being + past participle. The stadium receives the action.', 'published'),
(v_pool_id, 'mcq', 'The costumes for the school play ______ by a professional designer.', '["design","are designed","are being designed","designing"]', '"are being designed"', 2, 1, 'medium', 'application', 'present_continuous_passive', 'grammar', 'Present continuous passive shows an action in progress where the subject receives the action.', 'published'),
(v_pool_id, 'mcq', 'In the future, petrol cars ______ in garages any more.', '["won''t sell","won''t be sold","aren''t selling","don''t sell"]', '"won''t be sold"', 1, 1, 'medium', 'application', 'future_passive', 'grammar', 'Future passive: will not + be + past participle.', 'published'),
(v_pool_id, 'mcq', 'I usually pack the things I''ve bought ______ — I don''t need any help.', '["itself","myself","yourself","ourselves"]', '"myself"', 1, 1, 'easy', 'knowledge', 'reflexive_pronouns', 'grammar', '''Myself'' is the reflexive pronoun for the first person singular subject ''I''.', 'published'),
(v_pool_id, 'mcq', 'The world''s first TV advertisement, ______ in 1941, appeared on a US channel.', '["show","showing","shown","shows"]', '"shown"', 2, 1, 'medium', 'application', 'past_participle', 'grammar', 'Past participle ''shown'' is used in a reduced relative clause to describe the advertisement.', 'published'),
(v_pool_id, 'mcq', 'All fresh fruit is ______ offer this week — 50% reduction in price!', '["at","in","on","for"]', '"on"', 2, 1, 'easy', 'application', 'prepositions', 'grammar', '''On offer'' is the correct collocation meaning ''available at a special price''.', 'published'),
(v_pool_id, 'mcq', 'We need to reduce energy use ______ help the environment.', '["so that","in order to","whereas","although"]', '"in order to"', 1, 1, 'medium', 'application', 'conjunctions_purpose', 'grammar', '''In order to'' expresses purpose before an infinitive verb.', 'published'),
(v_pool_id, 'mcq', 'Coal, oil and gas will soon run out, ______ solar and wind energy are renewable.', '["so that","whereas","in order to","because"]', '"whereas"', 1, 1, 'medium', 'application', 'conjunctions_contrast', 'grammar', '''Whereas'' is used to contrast two different facts or situations.', 'published'),
(v_pool_id, 'mcq', 'I''m really sorry I invited so many people. I ______ so many people to the event.', '["shouldn''t invite","shouldn''t have invited","mustn''t invite","couldn''t invite"]', '"shouldn''t have invited"', 1, 1, 'medium', 'application', 'past_modals', 'grammar', '''Shouldn''t have + past participle'' expresses regret about a past action.', 'published'),
(v_pool_id, 'mcq', 'It was possible for us to watch that documentary last night, but I didn''t know you were free. We ______ that documentary.', '["should have watched","could have watched","would have watched","must have watched"]', '"could have watched"', 1, 1, 'hard', 'application', 'past_modals', 'grammar', '''Could have + past participle'' expresses a past possibility that didn''t happen.', 'published'),
(v_pool_id, 'mcq', 'The leopard was travelling ______ than the antelope.', '["slightly quicker","slightly more quickly","slight quickly","more slight quickly"]', '"slightly more quickly"', 1, 1, 'medium', 'application', 'comparative_adverbs', 'grammar', 'Comparative adverb: ''more quickly'' (not ''quicker'' for the adverb form), modified by ''slightly''.', 'published'),
(v_pool_id, 'mcq', 'The Caribbean Sea is ______ the sea where I live.', '["a lot warmer than","a lot warmer as","more warm than","most warmer than"]', '"a lot warmer than"', 0, 1, 'easy', 'application', 'comparatives_superlatives', 'grammar', 'Comparative adjective + ''than'' for comparing two things, intensified by ''a lot''.', 'published'),
(v_pool_id, 'mcq', 'Can you speak Hindi? — Yes, but only a ______.', '["few","little","several","much"]', '"little"', 1, 1, 'easy', 'application', 'quantifiers', 'grammar', '''A little'' is used with uncountable nouns or to describe a small amount of a skill.', 'published'),
(v_pool_id, 'mcq', 'Millions of people around the world ______ TV when Mandela walked free from prison.', '["watched","were watching","have watched","had watched"]', '"were watching"', 1, 1, 'medium', 'application', 'past_simple_past_continuous', 'grammar', 'Past continuous for a longer action interrupted by a shorter past simple event.', 'published'),
(v_pool_id, 'mcq', 'She succeeded ______ winning the election after a long campaign.', '["in","on","from","at"]', '"in"', 0, 1, 'medium', 'application', 'verb_preposition', 'grammar', '''Succeed in'' is the correct verb + preposition collocation.', 'published'),
(v_pool_id, 'mcq', 'By the time I was eighteen, I ______ the national music competition three times.', '["win","won","had won","have won"]', '"had won"', 2, 1, 'medium', 'application', 'past_perfect', 'grammar', 'Past perfect is used for an action completed before another past time reference.', 'published'),
(v_pool_id, 'mcq', '''I bought this guitar about a year ago,'' she said. — She said she ______ her guitar about a year before.', '["bought","had bought","has bought","was buying"]', '"had bought"', 1, 1, 'medium', 'application', 'reported_speech', 'grammar', 'In reported speech with a past reporting verb, past simple shifts to past perfect.', 'published'),
(v_pool_id, 'mcq', 'I started working in a bookshop when I was 18. I ______ in a bookshop since I was 18.', '["work","am working","have been working","was working"]', '"have been working"', 2, 1, 'medium', 'application', 'present_perfect_continuous', 'grammar', 'Present perfect continuous describes an action that started in the past and continues to the present.', 'published'),
(v_pool_id, 'mcq', 'I haven''t finished that book you lent me ______ — can I keep it a few more days?', '["already","still","yet","just"]', '"yet"', 2, 1, 'easy', 'application', 'present_perfect_adverbs', 'grammar', '''Yet'' is used in negative sentences and questions with the present perfect to mean ''up to now''.', 'published'),
(v_pool_id, 'mcq', 'I''ve ______ finished reading a great novel — would you like to borrow it?', '["yet","still","already","just"]', '"just"', 3, 1, 'easy', 'application', 'present_perfect_adverbs', 'grammar', '''Just'' with present perfect indicates something that happened very recently.', 'published'),
(v_pool_id, 'mcq', 'This music sounds like someone ______ as quietly as they can.', '["play","plays","playing","played"]', '"playing"', 2, 1, 'medium', 'application', 'participle_clauses', 'grammar', 'Present participle is used after ''sounds like someone'' to describe an ongoing action.', 'published'),
(v_pool_id, 'mcq', 'I wonder how long ______ .', '["is the performance","the performance is","does the performance","the performance does"]', '"the performance is"', 1, 1, 'hard', 'application', 'embedded_questions', 'grammar', 'Embedded questions use statement word order (subject + verb), not question word order.', 'published'),
(v_pool_id, 'mcq', 'I''m not getting ______ well with one of my classmates at the moment.', '["on","up","in","off"]', '"on"', 0, 1, 'easy', 'application', 'phrasal_verbs', 'vocabulary', '''Get on'' means to have a good relationship with someone.', 'published'),
(v_pool_id, 'mcq', 'I could do ______ a rest — I''m feeling really tired!', '["with","for","up","on"]', '"with"', 0, 1, 'medium', 'application', 'phrasal_verbs', 'vocabulary', '''Could do with'' means to need or want something.', 'published'),
(v_pool_id, 'mcq', 'Choose the word closest in meaning to ''congestion''.', '["pollution","overcrowding","construction","recreation"]', '"overcrowding"', 1, 1, 'medium', 'application', 'vocabulary_synonyms', 'vocabulary', '''Congestion'' means a state of being overly crowded or blocked, especially with traffic.', 'published'),
(v_pool_id, 'mcq', 'Which word is the opposite of ''extinct''?', '["living","ancient","rare","forgotten"]', '"living"', 0, 1, 'easy', 'application', 'vocabulary_antonyms', 'vocabulary', '''Extinct'' means no longer existing; ''living'' is the opposite.', 'published'),
(v_pool_id, 'mcq', 'A person who speaks two languages well is described as ______.', '["fluent","bilingual","native","foreign"]', '"bilingual"', 1, 1, 'medium', 'application', 'vocabulary_context', 'vocabulary', '''Bilingual'' means able to speak two languages well.', 'published'),
(v_pool_id, 'mcq', 'Many schools in my country start teaching languages when students are 11, ______ a few start much earlier.', '["than","except","whereas","despite"]', '"whereas"', 2, 1, 'hard', 'application', 'collocations', 'vocabulary', '''Whereas'' is used to contrast two different situations.', 'published');

-- ═══════════════════════════════
-- GAP FILL — 12 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'gap_fill', 'In many cultures, it''s rude to show ______ (impatient) with other people.', '"impatience"', 1, 'easy', 'application', 'abstract_nouns', 'grammar', 'The abstract noun ''impatience'' is formed from the adjective ''impatient''.', 'published'),
(v_pool_id, 'gap_fill', 'It''s important to have lots of ______ (confident) when you''re trying to speak another language.', '"confidence"', 1, 'medium', 'application', 'abstract_nouns', 'grammar', 'The abstract noun ''confidence'' is formed from the adjective ''confident''.', 'published'),
(v_pool_id, 'gap_fill', 'Using certain gestures in other countries can lead to ______ (confuse).', '"confusion"', 1, 'medium', 'application', 'abstract_nouns', 'grammar', 'The abstract noun ''confusion'' is formed from ''confuse'' + ''-ion''.', 'published'),
(v_pool_id, 'gap_fill', 'Write the correct form: ''I''m ______ (think) of studying Greek at school next year.''', '"thinking"', 1, 'easy', 'application', 'present_continuous_error', 'grammar', 'Present continuous uses am/is/are + verb-ing.', 'published'),
(v_pool_id, 'gap_fill', 'If the weather had been good enough, I ______ (would / plant) some trees today.', '"would have planted"', 1, 'medium', 'application', 'past_modals', 'grammar', 'Third conditional: ''would have + past participle'' for unreal past results.', 'published'),
(v_pool_id, 'gap_fill', 'In the weeks before the competition, I ______ (spend) a lot of time studying for exams.', '"had spent"', 1, 'medium', 'application', 'past_perfect', 'grammar', 'Past perfect: ''had spent'' for an action completed before another past event.', 'published'),
(v_pool_id, 'gap_fill', 'Leela asked how long ______ (they / have) the tennis rackets.', '"they had had"', 1, 'medium', 'application', 'reported_speech', 'grammar', 'Reported question: present perfect shifts to past perfect.', 'published'),
(v_pool_id, 'gap_fill', 'She read her first novel six years ago. She ______ (read) novels for six years.', '"has been reading"', 1, 'medium', 'application', 'present_perfect_continuous', 'grammar', 'Present perfect continuous: ''has been reading'' for duration from past to present.', 'published'),
(v_pool_id, 'gap_fill', 'What you need to know to understand a word is its ______ (mean).', '"meaning"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Noun form: ''mean'' → ''meaning''.', 'published'),
(v_pool_id, 'gap_fill', 'The way that a word or language sounds is called its ______ (pronounce).', '"pronunciation"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Noun form: ''pronounce'' → ''pronunciation''.', 'published'),
(v_pool_id, 'gap_fill', 'A ______ (renew) energy source is one that can be used again and again.', '"renewable"', 1, 'hard', 'application', 'word_formation', 'vocabulary', 'Adjective form: ''renew'' → ''renewable''.', 'published'),
(v_pool_id, 'gap_fill', 'Governments create eco-______ (friend) policies to help the environment.', '"friendly"', 1, 'hard', 'application', 'word_formation', 'vocabulary', 'Adjective form: ''friend'' → ''friendly'' in the compound ''eco-friendly''.', 'published');

-- ═══════════════════════════════
-- ERROR CORRECTION — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'error_correction', 'Don''t get upset! I''m not be serious.', '"being"', 1, 'easy', 'application', 'present_continuous', 'grammar', 'Present continuous negative: ''am not being'', not ''am not be''.', 'published'),
(v_pool_id, 'error_correction', 'What does Bashir looking at?', '"is (What is Bashir looking at?)"', 1, 'easy', 'application', 'present_continuous', 'grammar', 'Present continuous question: ''What is … looking at?'' not ''What does … looking at?''', 'published'),
(v_pool_id, 'error_correction', 'Many of the electricity in this country is still produced from gas and coal.', '"Much (Much of the electricity)"', 1, 'medium', 'application', 'quantifiers', 'grammar', '''Electricity'' is uncountable, so use ''much'' not ''many''.', 'published'),
(v_pool_id, 'error_correction', 'Every one of a world''s remaining tigers needs to be saved.', '"the (Every one of the world''s remaining tigers)"', 1, 'medium', 'application', 'articles', 'grammar', '''The world'' is a specific, definite noun and requires ''the'', not ''a''.', 'published'),
(v_pool_id, 'error_correction', 'There aren''t a lots of different birds around where I live.', '"a lot (remove the ''s'' from ''lots'')"', 1, 'medium', 'application', 'quantifiers_plural', 'grammar', '''A lot of'' is the correct form; ''a lots of'' is incorrect.', 'published'),
(v_pool_id, 'error_correction', 'They never see some rare animals in the forest near their home.', '"any (They never see any rare animals)"', 1, 'medium', 'application', 'negative_adverbs', 'grammar', 'In negative sentences, ''any'' is used instead of ''some''.', 'published'),
(v_pool_id, 'error_correction', 'At whom did the judges give the prize?', '"To whom (To whom did the judges give the prize?)"', 1, 'medium', 'application', 'verb_patterns', 'grammar', '''Give something to someone'' — the correct preposition is ''to'', not ''at''.', 'published'),
(v_pool_id, 'error_correction', 'Lots of our tinned foods are in offer this week.', '"on (are on offer)"', 1, 'medium', 'application', 'prepositions', 'grammar', '''On offer'' is the correct collocation, not ''in offer''.', 'published'),
(v_pool_id, 'error_correction', 'I was hungry so I helped myselves to a sandwich.', '"myself"', 1, 'hard', 'application', 'reflexive_pronouns', 'grammar', 'First person singular reflexive pronoun is ''myself'', not ''myselves''.', 'published'),
(v_pool_id, 'error_correction', 'Lots of jobs will be lose in the future because of new technology.', '"lost (will be lost)"', 1, 'hard', 'application', 'passive_voice', 'grammar', 'Passive voice requires the past participle: ''will be lost'', not ''will be lose''.', 'published');

-- ═══════════════════════════════
-- SENTENCE TRANSFORMATION — 12 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, keyword, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'sentence_transformation', 'Cities have more services. Cities are more exciting places to live. Combine using ''as well as''.', 'WELL', '"Cities have more services as well as being more exciting places to live."', 1, 'easy', 'application', 'gerund_vs_infinitive', 'grammar', '''As well as'' + gerund combines two related ideas.', 'published'),
(v_pool_id, 'sentence_transformation', 'If you spend some time in parks when visiting big cities, you can avoid getting tired. (BY)', 'BY', '"You can avoid getting tired by spending some time in parks when visiting big cities."', 1, 'medium', 'application', 'gerund_avoid', 'grammar', '''By'' + gerund describes the means of doing something.', 'published'),
(v_pool_id, 'sentence_transformation', 'I leave home early so I''m never late for school. (RISK)', 'RISK', '"I leave home early so I don''t risk being late for school."', 1, 'medium', 'application', 'risk_gerund', 'grammar', '''Risk'' is followed by a gerund: ''risk being late''.', 'published'),
(v_pool_id, 'sentence_transformation', 'I worked for one hour on my class presentation then went out. (SPENT)', 'SPENT', '"I went out after I''d spent an hour working on my class presentation."', 1, 'medium', 'application', 'spend_time', 'grammar', '''Spend time + gerund'' and past perfect for the earlier action.', 'published'),
(v_pool_id, 'sentence_transformation', 'Make sure you lock the door before you leave for school in the morning. (WITHOUT)', 'WITHOUT', '"Don''t leave for school in the morning without making sure you''ve locked the door."', 1, 'medium', 'application', 'without_gerund', 'grammar', '''Without'' + gerund as a negative condition.', 'published'),
(v_pool_id, 'sentence_transformation', 'No other river is longer than the River Nile. (THE)', 'THE', '"The River Nile is the longest river in the world."', 1, 'easy', 'application', 'comparatives', 'grammar', 'Superlative form converts ''No other … longer than'' to ''the longest''.', 'published'),
(v_pool_id, 'sentence_transformation', 'It''s more interesting to visit a city than to go to a beach. (AS)', 'AS', '"Going to a beach isn''t as interesting as visiting a city."', 1, 'medium', 'application', 'comparatives_equality', 'grammar', '''Not as … as'' is the negative equality comparison.', 'published'),
(v_pool_id, 'sentence_transformation', 'People will download all their books from the internet in the future. (DOWNLOADED)', 'DOWNLOADED', '"All books will be downloaded from the internet in the future."', 1, 'medium', 'application', 'passive_future', 'grammar', 'Future passive: will + be + past participle.', 'published'),
(v_pool_id, 'sentence_transformation', '''I can''t remember where to go,'' she said. (SAID)', 'SAID', '"She said she couldn''t remember where to go."', 1, 'hard', 'reasoning', 'reported_speech', 'grammar', 'In reported speech, ''can''t'' shifts to ''couldn''t''.', 'published'),
(v_pool_id, 'sentence_transformation', '''I was a very good actor when I was young,'' said dad. (THAT)', 'THAT', '"Dad said that he had been a very good actor when he was young."', 1, 'hard', 'reasoning', 'reported_speech', 'grammar', 'Reported speech: past simple shifts to past perfect, ''I'' changes to ''he''.', 'published'),
(v_pool_id, 'sentence_transformation', 'In some cultures, if everyone is silent for a long time, people feel uncomfortable. (LONG)', 'LONG', '"In some cultures, long silences can make people feel uncomfortable."', 1, 'hard', 'reasoning', 'silence_abstract_noun', 'grammar', 'Transform the ''if'' clause using an abstract noun (''silences'') as the subject.', 'published'),
(v_pool_id, 'sentence_transformation', 'I really should have gone to the museum with my friends. (WISH)', 'WISH', '"I really wish I had gone to the museum with my friends."', 1, 'hard', 'reasoning', 'wish_past', 'grammar', '''Wish'' + past perfect expresses regret about the past.', 'published');

-- ═══════════════════════════════
-- WORD FORMATION — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, base_word, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'word_formation', 'The ______ of new words can sometimes be surprising. (PRONOUNCE)', 'PRONOUNCE', '"pronunciation"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Noun form: pronounce → pronunciation.', 'published'),
(v_pool_id, 'word_formation', 'She gave an excellent ______ at the school concert. (PERFORM)', 'PERFORM', '"performance"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Noun form: perform → performance.', 'published'),
(v_pool_id, 'word_formation', 'The explorers showed amazing ______ during their journey. (BRAVE)', 'BRAVE', '"bravery"', 1, 'easy', 'application', 'word_formation', 'vocabulary', 'Noun form: brave → bravery.', 'published'),
(v_pool_id, 'word_formation', 'The ______ of the concert was a famous jazz singer. (COMPOSE)', 'COMPOSE', '"composer"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Person noun form: compose → composer.', 'published'),
(v_pool_id, 'word_formation', 'The artist''s ______ were displayed in the national gallery. (SCULPT)', 'SCULPT', '"sculptures"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Noun form: sculpt → sculpture(s).', 'published'),
(v_pool_id, 'word_formation', 'It would be ______ to go hiking without proper equipment. (DANGER)', 'DANGER', '"dangerous"', 1, 'medium', 'application', 'word_formation', 'vocabulary', 'Adjective form: danger → dangerous.', 'published'),
(v_pool_id, 'word_formation', 'The ______ of the new community centre will begin next month. (CONSTRUCT)', 'CONSTRUCT', '"construction"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Noun form: construct → construction.', 'published'),
(v_pool_id, 'word_formation', 'Nelson Mandela''s fight for ______ inspired millions of people. (FREE)', 'FREE', '"freedom"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Noun form: free → freedom.', 'published'),
(v_pool_id, 'word_formation', 'She is a very ______ person who tells funny stories on stage. (HUMOUR)', 'HUMOUR', '"humorous"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Adjective form: humour → humorous.', 'published'),
(v_pool_id, 'word_formation', 'The ______ of certain animal species is a serious environmental problem. (EXTINCT)', 'EXTINCT', '"extinction"', 1, 'hard', 'reasoning', 'word_formation', 'vocabulary', 'Noun form: extinct → extinction.', 'published');

-- ═══════════════════════════════
-- OPEN CLOZE — 10 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'open_cloze', 'I''m not very good ______ speaking Russian.', '"at"', 1, 'easy', 'application', 'prepositions', 'grammar', 'Adjective + preposition collocation: ''good at''.', 'published'),
(v_pool_id, 'open_cloze', 'If I ______ choose to visit any city in the world, I''d go to Rio de Janeiro.', '"could"', 1, 'easy', 'application', 'conditionals', 'grammar', 'Second conditional: ''If I could'' + infinitive for unreal/hypothetical situations.', 'published'),
(v_pool_id, 'open_cloze', 'People often complain ______ the noise from the construction site.', '"about"', 1, 'medium', 'application', 'verb_preposition', 'grammar', '''Complain about'' is the correct verb + preposition collocation.', 'published'),
(v_pool_id, 'open_cloze', 'If ______ I didn''t have to share a bedroom with my little brother!', '"only"', 1, 'medium', 'application', 'wish', 'grammar', '''If only'' + past tense expresses a strong wish about the present.', 'published'),
(v_pool_id, 'open_cloze', '______ Canada is a huge country, it has a relatively small population.', '"Although"', 1, 'easy', 'application', 'conjunctions', 'grammar', '''Although'' introduces a contrasting or unexpected fact.', 'published'),
(v_pool_id, 'open_cloze', 'If I had lots of money, I ______ buy a sports car!', '"would"', 1, 'medium', 'application', 'second_conditional', 'grammar', 'Second conditional: ''If + past simple, would + infinitive'' for hypothetical situations.', 'published'),
(v_pool_id, 'open_cloze', '______ which country is the Taj Mahal?', '"In"', 1, 'easy', 'application', 'prepositions_place', 'grammar', '''In'' is used with countries.', 'published'),
(v_pool_id, 'open_cloze', 'I don''t feel like ______ any more of this book right now.', '"reading"', 1, 'medium', 'application', 'gerund', 'grammar', '''Feel like'' is followed by a gerund (-ing form).', 'published'),
(v_pool_id, 'open_cloze', 'I''ve ______ found some information about a private music school that looks really good.', '"just"', 1, 'medium', 'application', 'present_perfect', 'grammar', '''Just'' with present perfect means ''very recently''.', 'published'),
(v_pool_id, 'open_cloze', 'The reviews of it online are much better ______ anywhere else.', '"than"', 1, 'medium', 'application', 'comparatives', 'grammar', 'Comparative adjective + ''than'' for comparison.', 'published');

-- ═══════════════════════════════
-- READING COMPREHENSION — 6 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, passage, options, correct_answer, correct_index, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'reading_comprehension', 'What was the name of the mission that first landed on the moon?',
 'In the late 1960s, the USA was determined to land people on the moon. They launched several spaceships into space, each carrying three astronauts, within a single year. In May 1969, one mission made the first successful journey around the moon. Six months later, another mission landed carrying the first colour television cameras. But it was the Apollo 11 mission that was the first to safely descend onto the moon''s surface on the evening of 20 July 1969.

In the early morning of 21 July, Neil Armstrong, the mission commander, stepped onto the moon just five days after leaving Earth. As his foot touched the moon''s dusty ground, he said his famous words about one small step for humanity. After returning to Earth on 24 July 1969, the three astronauts were celebrated as national heroes.

Scientists had previously sent unmanned spacecraft around the moon carrying cameras to scout for suitable landing locations. They needed somewhere flat enough for a safe landing. After launching from Florida, the spacecraft orbited Earth one and a half times to build up speed for the three-day journey to the moon.

To land on the moon, the spacecraft separated into two sections. One astronaut remained orbiting the moon, while the other two descended to the surface. As they got closer, the commander noticed they were off course and would miss their intended landing zone. Despite this, they had just enough fuel to touch down safely in an alternative, rockier area.',
 '["Apollo 10","Apollo 11","Apollo 12","Apollo 13"]',
 '"Apollo 11"', 1, 2, 'easy', 'application', 'main_idea', 'reading', 'The passage states ''it was the Apollo 11 mission that was the first to safely descend onto the moon''s surface''.', 'published'),

(v_pool_id, 'reading_comprehension', 'On which date did the first person walk on the moon?',
 'In the late 1960s, the USA was determined to land people on the moon. They launched several spaceships into space, each carrying three astronauts, within a single year. In May 1969, one mission made the first successful journey around the moon. Six months later, another mission landed carrying the first colour television cameras. But it was the Apollo 11 mission that was the first to safely descend onto the moon''s surface on the evening of 20 July 1969.

In the early morning of 21 July, Neil Armstrong, the mission commander, stepped onto the moon just five days after leaving Earth. As his foot touched the moon''s dusty ground, he said his famous words about one small step for humanity. After returning to Earth on 24 July 1969, the three astronauts were celebrated as national heroes.

Scientists had previously sent unmanned spacecraft around the moon carrying cameras to scout for suitable landing locations. They needed somewhere flat enough for a safe landing. After launching from Florida, the spacecraft orbited Earth one and a half times to build up speed for the three-day journey to the moon.

To land on the moon, the spacecraft separated into two sections. One astronaut remained orbiting the moon, while the other two descended to the surface. As they got closer, the commander noticed they were off course and would miss their intended landing zone. Despite this, they had just enough fuel to touch down safely in an alternative, rockier area.',
 '["16 July 1969","20 July 1969","21 July 1969","24 July 1969"]',
 '"21 July 1969"', 2, 2, 'easy', 'application', 'detail_retrieval', 'reading', 'The passage states ''In the early morning of 21 July, Neil Armstrong… stepped onto the moon''.', 'published'),

(v_pool_id, 'reading_comprehension', 'What did the commander notice as the spacecraft descended towards the moon?',
 'In the late 1960s, the USA was determined to land people on the moon. They launched several spaceships into space, each carrying three astronauts, within a single year. In May 1969, one mission made the first successful journey around the moon. Six months later, another mission landed carrying the first colour television cameras. But it was the Apollo 11 mission that was the first to safely descend onto the moon''s surface on the evening of 20 July 1969.

In the early morning of 21 July, Neil Armstrong, the mission commander, stepped onto the moon just five days after leaving Earth. As his foot touched the moon''s dusty ground, he said his famous words about one small step for humanity. After returning to Earth on 24 July 1969, the three astronauts were celebrated as national heroes.

Scientists had previously sent unmanned spacecraft around the moon carrying cameras to scout for suitable landing locations. They needed somewhere flat enough for a safe landing. After launching from Florida, the spacecraft orbited Earth one and a half times to build up speed for the three-day journey to the moon.

To land on the moon, the spacecraft separated into two sections. One astronaut remained orbiting the moon, while the other two descended to the surface. As they got closer, the commander noticed they were off course and would miss their intended landing zone. Despite this, they had just enough fuel to touch down safely in an alternative, rockier area.',
 '["They wouldn''t be able to land where they wanted.","The spacecraft was slightly damaged.","There wasn''t enough fuel to land.","The landing site was covered in rocks."]',
 '"They wouldn''t be able to land where they wanted."', 0, 2, 'medium', 'reasoning', 'inference', 'reading', 'The passage states ''the commander noticed they were off course and would miss their intended landing zone''.', 'published'),

(v_pool_id, 'reading_comprehension', 'What does Danny like most about his neighbourhood?',
 'I love my area! There''s a shopping centre, which has one or two shops I visit, and there are quite a few parks and gardens too. The way people get on with each other here and help each other out is what makes it such a special place to live. There are lots of residents from other parts of the country and from around the world, which always gives an area a nice atmosphere.

My family''s flat isn''t in a big block like many apartments: it is half of an old house that has been split into two flats. The best thing about it is the fantastic view we have of the river. There''s a busy main road nearby, but it''s far enough away that we can hardly hear the traffic. The street our flat is on is short with no way through to other parts of the city, so very few cars use it.

I''ve just become involved in a charity group that raises money for improvements to the local park. Last year, they managed to raise enough for a fantastic cycle track! Most parks have areas with metal or wooden things that children can climb on. The ones in our park are really old, so we''re trying to get enough money to replace them.',
 '["the wide variety of people","the shopping centre","the community spirit","the number of green spaces"]',
 '"the community spirit"', 2, 2, 'medium', 'application', 'main_idea', 'reading', '''The way people get on with each other here and help each other out is what makes it such a special place'' points to community spirit.', 'published'),

(v_pool_id, 'reading_comprehension', 'Danny says that his family''s flat is ______.', 
 'I love my area! There''s a shopping centre, which has one or two shops I visit, and there are quite a few parks and gardens too. The way people get on with each other here and help each other out is what makes it such a special place to live. There are lots of residents from other parts of the country and from around the world, which always gives an area a nice atmosphere.

My family''s flat isn''t in a big block like many apartments: it is half of an old house that has been split into two flats. The best thing about it is the fantastic view we have of the river. There''s a busy main road nearby, but it''s far enough away that we can hardly hear the traffic. The street our flat is on is short with no way through to other parts of the city, so very few cars use it.

I''ve just become involved in a charity group that raises money for improvements to the local park. Last year, they managed to raise enough for a fantastic cycle track! Most parks have areas with metal or wooden things that children can climb on. The ones in our park are really old, so we''re trying to get enough money to replace them.',
 '["quite noisy","in a car-free area","in a large block","overlooking water"]',
 '"overlooking water"', 3, 2, 'medium', 'application', 'detail_retrieval', 'reading', '''The best thing about it is the fantastic view we have of the river'' means it overlooks water.', 'published'),

(v_pool_id, 'reading_comprehension', 'Danny is currently involved in raising money for ______.', 
 'I love my area! There''s a shopping centre, which has one or two shops I visit, and there are quite a few parks and gardens too. The way people get on with each other here and help each other out is what makes it such a special place to live. There are lots of residents from other parts of the country and from around the world, which always gives an area a nice atmosphere.

My family''s flat isn''t in a big block like many apartments: it is half of an old house that has been split into two flats. The best thing about it is the fantastic view we have of the river. There''s a busy main road nearby, but it''s far enough away that we can hardly hear the traffic. The street our flat is on is short with no way through to other parts of the city, so very few cars use it.

I''ve just become involved in a charity group that raises money for improvements to the local park. Last year, they managed to raise enough for a fantastic cycle track! Most parks have areas with metal or wooden things that children can climb on. The ones in our park are really old, so we''re trying to get enough money to replace them.',
 '["new play equipment","new trees and plants","a new cycle track","new litter bins"]',
 '"new play equipment"', 0, 2, 'hard', 'reasoning', 'inference', 'reading', 'The cycle track was last year. Currently they are ''trying to get enough money to replace'' the old climbing equipment — which is play equipment.', 'published');

-- ═══════════════════════════════
-- EMAIL WRITING — 2 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'email_writing', 'You recently visited a local science museum with your family. Write an email to your English-speaking friend telling them about your visit.

In your email:
• describe what you saw at the museum
• explain what you enjoyed most
• suggest that your friend visits the museum

Write 80–150 words.', '"AI_GRADED"', 10, 'medium', 'reasoning', 'email_writing', 'writing', 'Email should include all three bullet points with appropriate friendly tone and register.', 'published'),
(v_pool_id, 'email_writing', 'Your school is planning to improve its outdoor areas. Write an email to the head teacher with your suggestions.

In your email:
• describe what the outdoor areas are like now
• suggest two improvements that could be made
• explain why students would benefit from these changes

Write 80–150 words.', '"AI_GRADED"', 10, 'hard', 'reasoning', 'email_writing', 'writing', 'Email should be semi-formal with clear suggestions and reasoning for the improvements.', 'published');

-- ═══════════════════════════════
-- ESSAY WRITING — 2 questions
-- ═══════════════════════════════

INSERT INTO adm_questions (pool_id, question_type, stem, correct_answer, marks, difficulty, cognitive_level, topic, skill_tag, explanation, status) VALUES
(v_pool_id, 'essay_writing', 'Some people believe that learning a second language should be compulsory at school, while others think students should be free to choose their own subjects.

Write an essay discussing both views and give your own opinion.

Write 150–300 words.', '"AI_GRADED"', 15, 'hard', 'reasoning', 'essay_writing', 'writing', 'Essay should present both viewpoints with supporting arguments and a clear personal conclusion.', 'published'),
(v_pool_id, 'essay_writing', '"Protecting the environment is the responsibility of everyone, not just governments."

Do you agree or disagree with this statement? Give reasons and examples to support your answer.

Write 150–300 words.', '"AI_GRADED"', 15, 'hard', 'reasoning', 'essay_writing', 'writing', 'Essay should present a clear argument with relevant examples from everyday environmental action.', 'published');

-- ═══════════════════════════════
-- DONE — Create a default blueprint
-- ═══════════════════════════════
-- This creates a global blueprint (school_id NULL)
-- that schools can use out of the box.
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
    '00000000-0000-0000-0000-e08118000002'::uuid,
    NULL,  -- global
    'English Stage 8 — Standard Admission Test',
    'english',
    8,
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
-- SELECT count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e08118000001'::uuid;
-- → should return 96
-- SELECT question_type, difficulty, count(*) FROM adm_questions WHERE pool_id = '00000000-0000-0000-0000-e08118000001'::uuid GROUP BY 1,2 ORDER BY 1,2;
