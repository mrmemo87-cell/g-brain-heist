-- Attach reviewed atomic diagnostic taxonomy to the Grade 4 Future Tense
-- verified supplement. The canonical validation trigger computes taxonomy_hash
-- from the governed row; this migration intentionally does not hand-roll it.

do $taxonomy$
declare
  v_tax record;
  v_question public.questions%rowtype;
  v_item_id uuid;
  v_mapping_id uuid;
  v_existing public.verified_question_diagnostic_taxonomy%rowtype;
  v_verified_count integer;
begin
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
        supersedes_taxonomy_id, reviewed_by_authority, reviewed_at
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
        now()
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
$taxonomy$;
