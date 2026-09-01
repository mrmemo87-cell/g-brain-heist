-- Add a focused Grade 4 Future Tense supplement to the immutable Brains Heist
-- Verified pool. The existing 2026.11 Grade 4 core release is intentionally not
-- modified. This migration publishes a separate versioned release through the
-- canonical verified-question importer.
--
-- Diagnostic taxonomy is attached in the immediately following migration so the
-- package receipt, question mappings and taxonomy each retain an auditable gate.

do $migration$
declare
  v_package jsonb := $package$
  {
    "schemaVersion": 1,
    "packageId": "brain-heist-grade-4-future-tense-2026-12",
    "packageVersion": "2026.12.0",
    "contentVersion": "brain-heist-2026-12-future-tense",
    "authority": "Brains Heist Academic Governance",
    "releaseNotes": "Grade 4 English Future Tense verified supplement: six focused remediation questions for the governed grammar and punctuation objective.",
    "curriculum": {"frameworkCode": "brain-heist-international", "versionCode": "2026-11"},
    "questions": [
      {
        "externalId": "bh-g4-eng-future-2026.12-001",
        "subject": "English", "subjectCode": "english", "grade": 4, "language": "en",
        "topic": "Future Tense", "difficulty": "easy",
        "questionText": "Which sentence tells about something that will happen in the future?",
        "questionType": "multiple_choice",
        "options": ["We will visit the museum tomorrow.", "We visited the museum yesterday.", "We visit the museum every Friday.", "We are visiting the museum now."],
        "correctAnswer": "We will visit the museum tomorrow.",
        "explanation": "The word will with the base verb visit shows an action that is expected to happen later.",
        "points": 10, "timeLimit": 45,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {"strand": "Grammar and punctuation", "skill": "Future Tense", "subskill": "Recognise future tense", "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."},
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-002",
        "subject": "English", "subjectCode": "english", "grade": 4, "language": "en",
        "topic": "Future Tense", "difficulty": "easy",
        "questionText": "Complete the sentence: Maya ___ her grandmother next Saturday.",
        "questionType": "multiple_choice",
        "options": ["visits", "will visit", "visited", "is visit"],
        "correctAnswer": "will visit",
        "explanation": "Next Saturday signals future time, so will visit correctly uses will plus the base verb visit.",
        "points": 10, "timeLimit": 45,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {"strand": "Grammar and punctuation", "skill": "Future Tense", "subskill": "Form affirmative future tense", "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."},
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-003",
        "subject": "English", "subjectCode": "english", "grade": 4, "language": "en",
        "topic": "Future Tense", "difficulty": "medium",
        "questionText": "Which sentence uses the verb correctly after will?",
        "questionType": "multiple_choice",
        "options": ["The team will practised after school.", "The team will practising after school.", "The team will practise after school.", "The team will practises after school."],
        "correctAnswer": "The team will practise after school.",
        "explanation": "After will, use the base form of the verb: will practise.",
        "points": 15, "timeLimit": 60,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {"strand": "Grammar and punctuation", "skill": "Future Tense", "subskill": "Use the base verb after will", "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."},
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-004",
        "subject": "English", "subjectCode": "english", "grade": 4, "language": "en",
        "topic": "Future Tense", "difficulty": "medium",
        "questionText": "Which sentence correctly says that Leo will not take the bus tomorrow?",
        "questionType": "multiple_choice",
        "options": ["Leo not will take the bus tomorrow.", "Leo will not took the bus tomorrow.", "Leo does not took the bus tomorrow.", "Leo will not take the bus tomorrow."],
        "correctAnswer": "Leo will not take the bus tomorrow.",
        "explanation": "The negative future form is will not followed by the base verb take.",
        "points": 15, "timeLimit": 60,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {"strand": "Grammar and punctuation", "skill": "Future Tense", "subskill": "Form negative future tense", "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."},
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-005",
        "subject": "English", "subjectCode": "english", "grade": 4, "language": "en",
        "topic": "Future Tense", "difficulty": "medium",
        "questionText": "Which question is correctly written in the future tense?",
        "questionType": "multiple_choice",
        "options": ["Will you bring your book tomorrow?", "Did you bring your book tomorrow?", "Will you brought your book tomorrow?", "You will bring your book tomorrow?"],
        "correctAnswer": "Will you bring your book tomorrow?",
        "explanation": "A future question begins with will, then the subject, then the base verb: Will you bring... ?",
        "points": 15, "timeLimit": 60,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {"strand": "Grammar and punctuation", "skill": "Future Tense", "subskill": "Form future-tense questions", "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."},
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-006",
        "subject": "English", "subjectCode": "english", "grade": 4, "language": "en",
        "topic": "Future Tense", "difficulty": "hard",
        "questionText": "Tomorrow is Sports Day. Complete the sentence: Our class ___ in the relay race.",
        "questionType": "multiple_choice",
        "options": ["ran", "will run", "run yesterday", "will ran"],
        "correctAnswer": "will run",
        "explanation": "Tomorrow shows that the action is in the future, so the correct form is will run.",
        "points": 20, "timeLimit": 75,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {"strand": "Grammar and punctuation", "skill": "Future Tense", "subskill": "Choose future tense from context", "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."},
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      }
    ]
  }
  $package$::jsonb;
  v_import_result jsonb;
  v_verified_count integer;
begin
  select public.rpc_import_verified_question_package(v_package, false)
  into v_import_result;

  if coalesce((v_import_result ->> 'success')::boolean, false) is not true
     or coalesce((v_import_result ->> 'questionCount')::integer, 0) <> 6 then
    raise exception using errcode = '23514', message = 'grade4_future_tense_verified_import_failed';
  end if;

  select count(*) into v_verified_count
  from public.questions q
  where q.verified_external_id like 'bh-g4-eng-future-2026.12-%'
    and q.verification_status = 'verified'
    and q.content_origin = 'brain_heist'
    and q.pool_scope = 'global'
    and q.is_active
    and q.is_public
    and q.grade = 4
    and 4 = any(q.eligible_grade_levels)
    and q.curriculum_skill = 'Future Tense'
    and q.topic_name = 'Future Tense'
    and q.current_content_hash = q.verified_content_hash;

  if v_verified_count <> 6 then
    raise exception using errcode = '23514', message = 'grade4_future_tense_verified_question_integrity_failed';
  end if;
end;
$migration$;
