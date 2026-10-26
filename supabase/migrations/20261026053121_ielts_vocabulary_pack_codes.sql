-- Owner-requested addition (2026-10-26): six optional IELTS vocabulary lessons (IELTS-V1..V6), released to all schools
-- through the existing template mechanism. Access rules, RLS and the decision workflow are unchanged; only the accepted
-- lesson codes widen.
alter table private.ielts_review_draft_packs drop constraint ielts_review_draft_packs_lesson_code_check;
alter table private.ielts_review_draft_packs add constraint ielts_review_draft_packs_lesson_code_check
 check (lesson_code ~ '^IELTS-(0[5-9]|1[0-9]|2[0-4]|X[1-8]|V[1-6]|M[1-3])$');

alter table private.ielts_teacher_pack_templates drop constraint ielts_teacher_pack_templates_lesson_code_check;
alter table private.ielts_teacher_pack_templates add constraint ielts_teacher_pack_templates_lesson_code_check
 check (lesson_code ~ '^IELTS-(0[1-9]|1[0-9]|2[0-4]|X[1-8]|V[1-6]|M[1-3])$');
