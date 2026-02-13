-- ============================================================
-- ADMISSION HUB — Fix Essay Visibility + AI Grading Support
-- ============================================================
-- Run AFTER ADM_SCHEMA_MIGRATION.sql & ADM_RPCS.sql
--
-- FIXES:
--   1. Adds 'email_writing' and 'essay_writing' to question_type CHECK
--   2. Migrates existing writing questions from 'open_cloze' to proper types
--   3. Adds ai_feedback + ai_grading_prompt columns to adm_answers / adm_questions
--   4. Updates the default blueprint to include writing questions
--   5. Updates submit & scoring RPCs to handle AI-gradable types
-- ============================================================

-- ============================================================
-- STEP 1: Expand question_type CHECK constraint
-- ============================================================
-- Drop the old constraint and add the new one with writing types
ALTER TABLE adm_questions DROP CONSTRAINT IF EXISTS adm_questions_question_type_check;
ALTER TABLE adm_questions ADD CONSTRAINT adm_questions_question_type_check
    CHECK (question_type IN (
        'mcq', 'gap_fill', 'error_correction', 'sentence_transformation',
        'word_formation', 'open_cloze', 'reading_comprehension', 'short_answer',
        'structured', 'email_writing', 'essay_writing'
    ));

-- ============================================================
-- STEP 2: Migrate existing writing questions from open_cloze → proper type
-- ============================================================
-- Email writing: topic = 'email_writing' and currently stored as open_cloze
UPDATE adm_questions
SET question_type = 'email_writing', updated_at = NOW()
WHERE question_type = 'open_cloze'
  AND topic = 'email_writing'
  AND skill_tag = 'writing';

-- Essay writing: topic = 'essay_writing' and currently stored as open_cloze
UPDATE adm_questions
SET question_type = 'essay_writing', updated_at = NOW()
WHERE question_type = 'open_cloze'
  AND topic = 'essay_writing'
  AND skill_tag = 'writing';

-- ============================================================
-- STEP 3: Add AI grading columns
-- ============================================================
-- Per-question AI grading prompt (Cambridge marking scheme context for the AI)
ALTER TABLE adm_questions
    ADD COLUMN IF NOT EXISTS ai_grading_prompt TEXT;

-- Per-answer AI feedback (filled after AI grades)
ALTER TABLE adm_answers
    ADD COLUMN IF NOT EXISTS ai_feedback TEXT;

-- Per-answer AI grading status
ALTER TABLE adm_answers
    ADD COLUMN IF NOT EXISTS ai_grading_status TEXT DEFAULT NULL
    CHECK (ai_grading_status IS NULL OR ai_grading_status IN ('pending', 'graded', 'failed'));

-- ============================================================
-- STEP 4: Set Cambridge-aligned AI grading prompts for writing questions
-- ============================================================
-- Email writing prompts
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this email response using the Cambridge Assessment English writing mark scheme for Lower Secondary (Stage 7-9).

MARKING CRITERIA (each scored 0-5):
1. CONTENT (5 marks): Has the candidate addressed ALL bullet points in the task? Are ideas relevant and sufficiently developed?
2. COMMUNICATIVE ACHIEVEMENT (5 marks): Is the register appropriate (informal/semi-formal email)? Does the writing hold the reader''s attention? Is the purpose of the email achieved?
3. ORGANISATION (5 marks): Is the email logically organised with clear paragraphing? Are cohesive devices (linking words, pronouns) used effectively? Does it follow email conventions (greeting, body, sign-off)?
4. LANGUAGE (5 marks): Is there a range of vocabulary appropriate to the topic? Are grammar structures varied and accurate? Are spelling and punctuation generally correct?

SCORING GUIDE:
5 = All requirements fully met with sophistication
4 = Good performance, minor lapses only
3 = Satisfactory, task mostly achieved
2 = Inadequate, significant gaps or errors
1 = Very limited attempt
0 = No meaningful attempt or completely off-topic

Return JSON: {"content": X, "communicative_achievement": X, "organisation": X, "language": X, "total": X, "max": 20, "feedback": "...", "strengths": ["..."], "improvements": ["..."], "corrected_version": "..."}'
WHERE question_type = 'email_writing' AND ai_grading_prompt IS NULL;

-- Essay writing prompts
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this essay using the Cambridge Assessment English writing mark scheme for Lower Secondary (Stage 7-9).

MARKING CRITERIA (each scored 0-5):
1. CONTENT (5 marks): Has the candidate presented a clear argument/discussion? Are both viewpoints considered (if required)? Is a personal opinion stated and supported with reasons/examples?
2. COMMUNICATIVE ACHIEVEMENT (5 marks): Is the register appropriate (neutral/formal essay)? Is the writing persuasive and engaging? Does it demonstrate awareness of audience and purpose?
3. ORGANISATION (5 marks): Is there a clear introduction, developed body paragraphs, and conclusion? Are paragraphs logically sequenced with effective topic sentences? Are discourse markers and cohesive devices used well?
4. LANGUAGE (5 marks): Is vocabulary precise and varied? Are complex grammatical structures attempted and mostly accurate? Is there a range of sentence types?

SCORING GUIDE:
5 = Exceptional command, sophisticated and accurate throughout
4 = Good command, only minor slips
3 = Adequate, some errors but meaning is clear
2 = Limited, frequent errors obscure meaning
1 = Very poor, barely comprehensible
0 = No relevant content

Return JSON: {"content": X, "communicative_achievement": X, "organisation": X, "language": X, "total": X, "max": 20, "feedback": "...", "strengths": ["..."], "improvements": ["..."], "corrected_version": "..."}'
WHERE question_type = 'essay_writing' AND ai_grading_prompt IS NULL;

-- Gap fill AI grading prompt (for flexible grading with alternate answers)
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this gap-fill answer. The student must provide the correct word form or grammatical structure.

IMPORTANT: Students may include extra words around their answer:
- "had already begun" when the answer is "had already begun" → CORRECT
- "The hardly" when the answer is "hardly" → extract key word and accept
- Accept contracted forms as equivalent to full forms (don''t = do not, hadn''t = had not)

RULES:
- Accept minor spelling variations if the intended word is clearly recognisable
- Accept valid alternative answers that are grammatically correct in context
- Strip leading articles (the, a, an) and trailing punctuation before comparing
- The answer must fit the gap grammatically AND semantically
- Case-insensitive comparison

Return JSON: {"is_correct": true/false, "marks_awarded": X, "marks_possible": X, "feedback": "Brief explanation of why correct/incorrect", "accepted_answer": "the answer you accepted or the correct one"}'
WHERE question_type = 'gap_fill' AND ai_grading_prompt IS NULL;

-- Sentence transformation AI grading prompt
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this sentence transformation answer using Cambridge Key Word Transformation criteria.

RULES:
- The student must use the given keyword WITHOUT changing its form
- The transformed sentence must have the same meaning as the original
- Award 2 marks if the answer is fully correct
- Award 1 mark if one half of the answer is correct (split the response at the keyword)
- Award 0 marks if neither half is correct
- Minor spelling errors are acceptable if the intended word is clear
- Contractions (e.g. don''t = do not) are acceptable

Return JSON: {"is_correct": true/false, "marks_awarded": X, "marks_possible": X, "feedback": "Explanation comparing student answer to expected transformation", "accepted_answer": "..."}'
WHERE question_type = 'sentence_transformation' AND ai_grading_prompt IS NULL;

-- Error correction AI grading prompt
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this error correction answer. The student must identify and provide the corrected word/phrase.

IMPORTANT: Students may respond in TWO different ways:
1. Just the corrected WORD (e.g. "doesn''t") — compare directly to the correct answer
2. The FULL corrected sentence (e.g. "I''m looking forward to meeting you") — check if the correction they made is the right one

RULES:
- If the student rewrites the full sentence, check WHETHER THE SPECIFIC ERROR was correctly fixed
- The student must fix the CORRECT error (not change something else)
- If they fixed the right error but also changed other words unnecessarily, still award the mark
- Accept minor spelling mistakes in the corrected word if intent is clear
- Case-insensitive
- Example: Sentence has "to meet" (should be "to meeting"). Student writes "I''m looking forward to meeting you" → CORRECT
- Example: Sentence has "have" (should be "has"). Student writes full sentence changing "have" to "had" → INCORRECT

Return JSON: {"is_correct": true/false, "marks_awarded": X, "marks_possible": X, "feedback": "explain what the error was and whether the student fixed it correctly"}'
WHERE question_type = 'error_correction' AND ai_grading_prompt IS NULL;

-- Word formation AI grading prompt
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this word formation answer. The student must transform the base word into the correct form to complete the sentence.

IMPORTANT: Students may include extra words around their answer:
- "The competition" when the answer is "competition" → extract the key word and grade it
- Strip articles (the, a, an), pronouns, and other filler words to find the actual answer word

RULES:
- The core transformed word must be the correct derived form (noun, adjective, adverb, verb, etc.)
- Spelling must be correct for the KEY WORD (this type tests word knowledge specifically)
- Ignore extra words the student may have added around the answer
- Case-insensitive
- Example: Base word COMPETE, correct "competition". Student writes "The competition" → CORRECT
- Example: Base word WILLING, correct "willingness". Student writes "Willing" → INCORRECT (not transformed to noun)

Return JSON: {"is_correct": true/false, "marks_awarded": X, "marks_possible": X, "feedback": "explain the correct form and whether the student''s answer matches"}'
WHERE question_type = 'word_formation' AND ai_grading_prompt IS NULL;

-- Math short_answer AI grading prompt
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this mathematics short answer.

RULES:
- Accept equivalent mathematical forms (e.g., 0.5 = 1/2 = 50%)
- Accept answers with or without units if the unit is implied
- For multi-step problems, award partial credit if the method is partially correct
- Numerical precision: accept reasonable rounding

Return JSON: {"is_correct": true/false, "marks_awarded": X, "marks_possible": X, "feedback": "Step-by-step explanation of the correct solution"}'
WHERE question_type = 'short_answer' AND ai_grading_prompt IS NULL;

-- Math structured AI grading prompt
UPDATE adm_questions
SET ai_grading_prompt = 'Grade this structured mathematics question. The student shows working and provides a final answer.

RULES:
- Award marks for correct method even if the final answer has an arithmetic error
- Check each step of the working for logical correctness
- Award full marks only if both method and answer are correct
- Partial marks: method marks + answer marks as specified

Return JSON: {"is_correct": true/false, "marks_awarded": X, "marks_possible": X, "feedback": "Detailed marking of each step with marks allocated", "working_analysis": "..."}'
WHERE question_type = 'structured' AND ai_grading_prompt IS NULL;

-- ============================================================
-- STEP 5: Update the default English Stage 9 blueprint to include writing
-- ============================================================
UPDATE adm_blueprints
SET question_distribution = '{
      "mcq": {"easy": 5, "medium": 8, "hard": 1},
      "gap_fill": {"easy": 1, "medium": 2, "hard": 1},
      "error_correction": {"medium": 1, "hard": 1},
      "sentence_transformation": {"medium": 2, "hard": 1},
      "reading_comprehension": {"easy": 1, "medium": 1},
      "email_writing": {"medium": 1},
      "essay_writing": {"hard": 1}
    }'::jsonb,
    total_marks = 52,  -- 27 (previous) + 10 (email) + 15 (essay)
    duration_minutes = 75,  -- extra time for writing
    updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-e09119000002'::uuid;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Check writing questions now have correct types:
-- SELECT id, question_type, topic, skill_tag, marks FROM adm_questions WHERE question_type IN ('email_writing', 'essay_writing');

-- Check blueprint distribution includes writing:
-- SELECT name, question_distribution FROM adm_blueprints WHERE id = '00000000-0000-0000-0000-e09119000002'::uuid;

-- Check AI grading prompts are set:
-- SELECT question_type, LEFT(ai_grading_prompt, 80) FROM adm_questions WHERE ai_grading_prompt IS NOT NULL GROUP BY question_type, ai_grading_prompt;
