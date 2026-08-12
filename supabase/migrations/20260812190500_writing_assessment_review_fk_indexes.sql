-- Cover teacher-review foreign keys used by scoped review and student-history reads.

create index if not exists idx_bh_writing_reviews_reviewer
  on public.bh_writing_assessment_reviews(reviewer_id);

create index if not exists idx_bh_writing_reviews_student_created
  on public.bh_writing_assessment_reviews(student_id, created_at desc);
