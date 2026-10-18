-- Owner-requested additions (2026-10-18): three full paper mock tests (IELTS-M1..M3) and eight optional extension lessons
-- (IELTS-X1..X8). They arrive as school-scoped review drafts first; a template row (all-school release) is added only after
-- the owner approves each exact version. Access rules, RLS and the decision workflow are unchanged; only the accepted
-- lesson codes widen.
alter table private.ielts_review_draft_packs drop constraint ielts_review_draft_packs_lesson_code_check;
alter table private.ielts_review_draft_packs add constraint ielts_review_draft_packs_lesson_code_check
 check (lesson_code ~ '^IELTS-(0[5-9]|1[0-9]|2[0-4]|X[1-8]|M[1-3])$');

alter table private.ielts_teacher_pack_templates drop constraint ielts_teacher_pack_templates_lesson_code_check;
alter table private.ielts_teacher_pack_templates add constraint ielts_teacher_pack_templates_lesson_code_check
 check (lesson_code ~ '^IELTS-(0[1-9]|1[0-9]|2[0-4]|X[1-8]|M[1-3])$');
