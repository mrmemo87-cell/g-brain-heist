-- School grade/class configuration is the source of truth for placement.
-- Do not constrain public.users.grade to the solo curriculum's 6-12 band.

alter table public.users
  drop constraint if exists users_grade_check;

alter table public.users
  add constraint users_grade_check
  check (
    grade is null
    or (
      length(btrim(grade)) between 1 and 64
      and grade = btrim(grade)
    )
  ) not valid;

alter table public.users
  validate constraint users_grade_check;

comment on column public.users.grade is
  'School-configured grade or year label. Curriculum modules enforce their own supported bands.';
