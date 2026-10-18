-- Owner-approved teacher release of the 24-lesson reference course to every eligible school (2026-10-18).
-- Widens the shared school-branded template catalogue from Lessons 3-4 to IELTS-01..24. Access rules are unchanged:
-- programme managers only, per-school branding at download, no student, anonymous or write access.
alter table private.ielts_teacher_pack_templates drop constraint ielts_teacher_pack_templates_lesson_code_check;
alter table private.ielts_teacher_pack_templates add constraint ielts_teacher_pack_templates_lesson_code_check
 check (lesson_code ~ '^IELTS-(0[1-9]|1[0-9]|2[0-4])$');
