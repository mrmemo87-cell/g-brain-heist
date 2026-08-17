-- Follow-up for environments where the evidence-led workspace migration was
-- applied before the foreign-key advisor check.

create index if not exists student_learning_professional_reviews_academic_year_idx
  on public.student_learning_professional_reviews(academic_year_id)
  where academic_year_id is not null;

create index if not exists student_learning_professional_reviews_reviewer_idx
  on public.student_learning_professional_reviews(reviewed_by, reviewed_at desc);
