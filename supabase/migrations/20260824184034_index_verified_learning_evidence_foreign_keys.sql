-- Cover the foreign-key columns introduced by the verified diagnostic ledger.
-- These indexes keep parent lifecycle checks and governed evidence joins from
-- degrading as answer-level evidence accumulates.

create index if not exists verified_question_taxonomy_assessment_item_idx
  on public.verified_question_diagnostic_taxonomy(assessment_item_id);

create index if not exists student_learning_item_evidence_school_idx
  on public.student_learning_item_evidence(school_id);

create index if not exists student_learning_item_evidence_assignment_idx
  on public.student_learning_item_evidence(assignment_id);

create index if not exists student_learning_item_evidence_question_idx
  on public.student_learning_item_evidence(question_id);

create index if not exists student_learning_item_evidence_academic_year_idx
  on public.student_learning_item_evidence(academic_year_id);

create index if not exists student_learning_item_evidence_academic_term_idx
  on public.student_learning_item_evidence(academic_term_id);

create index if not exists student_learning_item_evidence_subject_idx
  on public.student_learning_item_evidence(academic_subject_id);

create index if not exists student_learning_item_evidence_scope_idx
  on public.student_learning_item_evidence(curriculum_scope_id);

create index if not exists student_learning_item_evidence_objective_fk_idx
  on public.student_learning_item_evidence(curriculum_objective_id);

create index if not exists student_learning_item_evidence_mapping_idx
  on public.student_learning_item_evidence(curriculum_mapping_id);

create index if not exists student_learning_item_evidence_taxonomy_idx
  on public.student_learning_item_evidence(diagnostic_taxonomy_id);
