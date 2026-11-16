-- Open computer-delivered IELTS-M2 to every learner with full IELTS course access (Prime or a school seat).
-- Owner decision recorded 2026-11-16 13:36 Asia/Bishkek after the owner's own pilot sitting
-- (attempt a4e7a6a9-68fa-40a6-bd27-ae1b5122e2ff completed; Listening skipped on purpose, Reading and Writing saved).
update private.ielts_mock_cbt_forms
set release_scope = 'full_access',
    authorized_by = (select user_id from public.superadmins order by user_id limit 1),
    authorized_at = now()
where code = 'IELTS-M2' and release_scope = 'pilot';
