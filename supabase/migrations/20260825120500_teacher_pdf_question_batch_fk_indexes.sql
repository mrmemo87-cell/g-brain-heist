-- Cover every foreign key used by the teacher PDF question-batch workflow.
-- PostgreSQL does not create these indexes automatically; keeping the foreign
-- key first supports provenance joins and future retention checks efficiently.

create index if not exists teacher_question_pdf_extractions_teacher_user_idx
  on public.teacher_question_pdf_extractions(teacher_user_id, completed_at desc);

create index if not exists teacher_question_pdf_extractions_school_idx
  on public.teacher_question_pdf_extractions(school_id)
  where school_id is not null;

create index if not exists teacher_question_batches_teacher_user_idx
  on public.teacher_question_batches(teacher_user_id, submitted_at desc);

create index if not exists teacher_question_batches_school_idx
  on public.teacher_question_batches(school_id)
  where school_id is not null;
