create index if not exists teacher_question_manual_submissions_school_idx
  on public.teacher_question_manual_submissions(school_id);

create index if not exists teacher_question_manual_submissions_teacher_user_idx
  on public.teacher_question_manual_submissions(teacher_user_id);
