-- Add a focused Grade 4 Future Tense supplement to the immutable Brains Heist
-- Verified pool. The existing 2026.11 Grade 4 core release is intentionally not
-- modified. This migration imports a new versioned package through the canonical
-- verified-question importer, then attaches reviewed atomic diagnostic taxonomy.
--
-- The migration is idempotent: the importer reuses an identical package receipt,
-- and taxonomy rows are inserted only when absent. Any drift under the same
-- identities fails closed.

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
    "curriculum": {
      "frameworkCode": "brain-heist-international",
      "versionCode": "2026-11"
    },
    "questions": [
      {
        "externalId": "bh-g4-eng-future-2026.12-001",
        "subject": "English",
        "subjectCode": "english",
        "grade": 4,
        "language": "en",
        "topic": "Future Tense",
        "difficulty": "easy",
        "questionText": "Which sentence tells about something that will happen in the future?",
        "questionType": "multiple_choice",
        "options": [
          "We will visit the museum tomorrow.",
          "We visited the museum yesterday.",
          "We visit the museum every Friday.",
          "We are visiting the museum now."
        ],
        "correctAnswer": "We will visit the museum tomorrow.",
        "explanation": "The word will with the base verb visit shows an action that is expected to happen later.",
        "points": 10,
        "timeLimit": 45,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {
          "strand": "Grammar and punctuation",
          "skill": "Future Tense",
          "subskill": "Recognise future tense",
          "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."
        },
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-002",
        "subject": "English",
        "subjectCode": "english",
        "grade": 4,
        "language": "en",
        "topic": "Future Tense",
        "difficulty": "easy",
        "questionText": "Complete the sentence: Maya ___ her grandmother next Saturday.",
        "questionType": "multiple_choice",
        "options": ["visits", "will visit", "visited", "is visit"],
        "correctAnswer": "will visit",
        "explanation": "Next Saturday signals future time, so will visit correctly uses will plus the base verb visit.",
        "points": 10,
        "timeLimit": 45,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {
          "strand": "Grammar and punctuation",
          "skill": "Future Tense",
          "subskill": "Form affirmative future tense",
          "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."
        },
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-003",
        "subject": "English",
        "subjectCode": "english",
        "grade": 4,
        "language": "en",
        "topic": "Future Tense",
        "difficulty": "medium",
        "questionText": "Which sentence uses the verb correctly after will?",
        "questionType": "multiple_choice",
        "options": [
          "The team will practised after school.",
          "The team will practising after school.",
          "The team will practise after school.",
          "The team will practises after school."
        ],
        "correctAnswer": "The team will practise after school.",
        "explanation": "After will, use the base form of the verb: will practise.",
        "points": 15,
        "timeLimit": 60,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {
          "strand": "Grammar and punctuation",
          "skill": "Future Tense",
          "subskill": "Use the base verb after will",
          "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."
        },
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-004",
        "subject": "English",
        "subjectCode": "english",
        "grade": 4,
        "language": "en",
        "topic": "Future Tense",
        "difficulty": "medium",
        "questionText": "Which sentence correctly says that Leo will not take the bus tomorrow?",
        "questionType": "multiple_choice",
        "options": [
          "Leo not will take the bus tomorrow.",
          "Leo will not took the bus tomorrow.",
          "Leo does not took the bus tomorrow.",
          "Leo will not take the bus tomorrow."
        ],
        "correctAnswer": "Leo will not take the bus tomorrow.",
        "explanation": "The negative future form is will not followed by the base verb take.",
        "points": 15,
        "timeLimit": 60,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {
          "strand": "Grammar and punctuation",
          "skill": "Future Tense",
          "subskill": "Form negative future tense",
          "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."
        },
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-005",
        "subject": "English",
        "subjectCode": "english",
        "grade": 4,
        "language": "en",
        "topic": "Future Tense",
        "difficulty": "medium",
        "questionText": "Which question is correctly written in the future tense?",
        "questionType": "multiple_choice",
        "options": [
          "Will you bring your book tomorrow?",
          "Did you bring your book tomorrow?",
          "Will you brought your book tomorrow?",
          "You will bring your book tomorrow?"
        ],
        "correctAnswer": "Will you bring your book tomorrow?",
        "explanation": "A future question begins with will, then the subject, then the base verb: Will you bring... ?",
        "points": 15,
        "timeLimit": 60,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {
          "strand": "Grammar and punctuation",
          "skill": "Future Tense",
          "subskill": "Form future-tense questions",
          "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."
        },
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      },
      {
        "externalId": "bh-g4-eng-future-2026.12-006",
        "subject": "English",
        "subjectCode": "english",
        "grade": 4,
        "language": "en",
        "topic": "Future Tense",
        "difficulty": "hard",
        "questionText": "Tomorrow is Sports Day. Complete the sentence: Our class ___ in the relay race.",
        "questionType": "multiple_choice",
        "options": ["ran", "will run", "run yesterday", "will ran"],
        "correctAnswer": "will run",
        "explanation": "Tomorrow shows that the action is in the future, so the correct form is will run.",
        "points": 20,
        "timeLimit": 75,
        "tags": ["eng4-grammar-punctuation", "future tense", "skill:Future Tense"],
        "curriculum": {
          "strand": "Grammar and punctuation",
          "skill": "Future Tense",
          "subskill": "Choose future tense from context",
          "objective": "Build and edit sentences using correct tense, agreement, conjunctions and punctuation for speech."
        },
        "mappings": [{"scopeCode": "english-grade-4", "objectiveCode": "eng4-grammar-punctuation"}]
      }
    ]
  }
  $package$::jsonb;
  v_import_result jsonb;
  v_tax record;
  v_question public.questions%rowtype;
  v_item_id uuid;
  v_mapping_id uuid;
  v_existing public.verified_question_diagnostic_taxonomy%rowtype;
  v_taxonomy_hash text;
  v_verified_count integer;
begin
  select public.rpc_import_verified_question_package(v_package, false)
  into v_import_result;

  if coalesce((v_import_result ->> 'success')::boolean, false) is not true
     or coalesce((v_import_result ->> 'questionCount')::integer, 0) <> 6 then
    raise exception using
      errcode = '23514',
      message = 'grade4_future_tense_verified_import_failed';
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
    raise exception using
      errcode = '23514',
      message = 'grade4_future_tense_verified_question_integrity_failed';
  end if;

  for v_tax in
    select *
    from (values
      (
        'bh-g4-eng-future-2026.12-001',
        'english.future-tense.identify-a-future-action-marked-by-will',
        'Identify a future action expressed with will',
        'AO1', 'understand',
        'A correct response shows that the learner can recognise a sentence that expresses a future action using will plus a base verb.'
      ),
      (
        'bh-g4-eng-future-2026.12-002',
        'english.future-tense.form-affirmative-will-plus-base-verb',
        'Form an affirmative future sentence with will + base verb',
        'AO2', 'apply',
        'A correct response shows that the learner can complete a future-time sentence using will followed by the base form of the verb.'
      ),
      (
        'bh-g4-eng-future-2026.12-003',
        'english.future-tense.use-base-verb-after-will',
        'Use the base verb after will',
        'AO2', 'apply',
        'A correct response shows that the learner can apply the rule that will is followed by the base form of the main verb.'
      ),
      (
        'bh-g4-eng-future-2026.12-004',
        'english.future-tense.form-negative-will-not-plus-base-verb',
        'Form the negative future with will not + base verb',
        'AO2', 'apply',
        'A correct response shows that the learner can form a negative future sentence using will not followed by the base verb.'
      ),
      (
        'bh-g4-eng-future-2026.12-005',
        'english.future-tense.form-question-will-subject-base-verb',
        'Form a future question with will + subject + base verb',
        'AO2', 'apply',
        'A correct response shows that the learner can form a future-tense question using will, the subject, and the base verb in the correct order.'
      ),
      (
        'bh-g4-eng-future-2026.12-006',
        'english.future-tense.select-future-form-from-time-context',
        'Select the future form from a future-time context',
        'AO2', 'apply',
        'A correct response shows that the learner can use a future-time clue such as tomorrow to select will plus the base verb.'
      )
    ) expected(
      external_id, atomic_subskill_code, atomic_subskill_name,
      assessment_process_code, cognitive_process, evidence_statement
    )
  loop
    select q.* into strict v_question
    from public.questions q
    where q.verified_external_id = v_tax.external_id;

    select item.id, mapping.id
    into strict v_item_id, v_mapping_id
    from public.curriculum_assessment_items item
    join public.curriculum_item_objective_mappings mapping
      on mapping.assessment_item_id = item.id
     and mapping.status = 'approved'
     and mapping.mapping_role = 'primary'
     and mapping.superseded_at is null
     and mapping.item_content_hash = item.content_hash
    join public.curriculum_scopes scope
      on scope.id = mapping.curriculum_scope_id
     and scope.code = 'english-grade-4'
    join public.curriculum_objectives objective
      on objective.id = mapping.curriculum_objective_id
     and objective.code = 'eng4-grammar-punctuation'
     and objective.is_assessable
    join public.curriculum_framework_versions version
      on version.id = mapping.framework_version_id
     and version.version_code = '2026-11'
     and version.status in ('published', 'retired')
     and version.content_hash = mapping.curriculum_version_content_hash
    where item.source_type = 'question_bank'
      and item.source_record_id = v_question.id::text
      and item.source_item_key = 'question'
      and item.is_active
      and item.content_hash = v_question.verified_content_hash;

    v_taxonomy_hash := encode(extensions.digest(
      concat_ws('|',
        v_question.id::text,
        v_question.verified_content_hash,
        'english-grade-4',
        'eng4-grammar-punctuation',
        '2026.12.0',
        'bh-canonical-1',
        'english.future-tense',
        'Future Tense',
        v_tax.atomic_subskill_code,
        v_tax.atomic_subskill_name,
        v_tax.assessment_process_code,
        v_tax.cognitive_process,
        v_tax.evidence_statement
      ),
      'sha256'
    ), 'hex');

    select taxonomy.* into v_existing
    from public.verified_question_diagnostic_taxonomy taxonomy
    where taxonomy.question_id = v_question.id
      and taxonomy.taxonomy_version = 'bh-canonical-1';

    if found then
      if v_existing.assessment_item_id <> v_item_id
         or v_existing.curriculum_mapping_id <> v_mapping_id
         or v_existing.question_content_hash <> v_question.verified_content_hash
         or v_existing.scope_code <> 'english-grade-4'
         or v_existing.objective_code <> 'eng4-grammar-punctuation'
         or v_existing.package_version <> '2026.12.0'
         or v_existing.primary_skill_code <> 'english.future-tense'
         or v_existing.primary_skill_name <> 'Future Tense'
         or v_existing.atomic_subskill_code <> v_tax.atomic_subskill_code
         or v_existing.atomic_subskill_name <> v_tax.atomic_subskill_name
         or v_existing.assessment_process_code <> v_tax.assessment_process_code
         or v_existing.cognitive_process <> v_tax.cognitive_process
         or v_existing.evidence_statement <> v_tax.evidence_statement
         or v_existing.review_status <> 'approved'
         or v_existing.human_review_required then
        raise exception using
          errcode = '23505',
          message = 'grade4_future_tense_taxonomy_identity_conflict:' || v_tax.external_id;
      end if;
    else
      insert into public.verified_question_diagnostic_taxonomy(
        id, question_id, assessment_item_id, curriculum_mapping_id,
        question_content_hash, scope_code, objective_code, package_version,
        taxonomy_version, primary_skill_code, primary_skill_name,
        atomic_subskill_code, atomic_subskill_name, assessment_process_code,
        cognitive_process, evidence_statement, secondary_skill_codes,
        confidence_score, review_status, human_review_required, review_reason,
        supersedes_taxonomy_id, reviewed_by_authority, reviewed_at, taxonomy_hash
      ) values (
        gen_random_uuid(), v_question.id, v_item_id, v_mapping_id,
        v_question.verified_content_hash, 'english-grade-4',
        'eng4-grammar-punctuation', '2026.12.0', 'bh-canonical-1',
        'english.future-tense', 'Future Tense',
        v_tax.atomic_subskill_code, v_tax.atomic_subskill_name,
        v_tax.assessment_process_code, v_tax.cognitive_process,
        v_tax.evidence_statement, array[]::text[], 0.980,
        'approved', false,
        'Reviewed as part of the versioned Grade 4 Future Tense verified supplement.',
        null,
        'Brains Heist Academic Governance — Grade 4 Future Tense supplement',
        now(), v_taxonomy_hash
      );
    end if;
  end loop;

  select count(*) into v_verified_count
  from private.active_verified_question_diagnostic_taxonomy taxonomy
  join public.questions q on q.id = taxonomy.question_id
  where q.verified_external_id like 'bh-g4-eng-future-2026.12-%'
    and taxonomy.scope_code = 'english-grade-4'
    and taxonomy.objective_code = 'eng4-grammar-punctuation'
    and taxonomy.primary_skill_code = 'english.future-tense'
    and taxonomy.primary_skill_name = 'Future Tense';

  if v_verified_count <> 6 then
    raise exception using
      errcode = '23514',
      message = 'grade4_future_tense_active_taxonomy_integrity_failed';
  end if;
end;
$migration$;
