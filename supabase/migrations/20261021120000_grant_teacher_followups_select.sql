-- teacher_followups was created without table privileges for signed-in users,
-- so the weekly follow-up counter could not be read. Row-level security
-- (teacher_followups_select_own) still limits each teacher to their own rows.
-- Inserts stay closed: follow-ups are written only by log_teacher_followups().

grant select on table public.teacher_followups to authenticated;
