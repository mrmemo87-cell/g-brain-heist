-- Named-user pilot of computer-delivered IELTS-M2 (AGENTS.md default pilot; Diagnostic Bible 2.5.1 sections 12A, 13).
-- Owner instruction 2026-11-16 09:47 Asia/Bishkek: put Mock Test 2 (Listening, Reading, Writing) inside the app.
-- Pilot: the default pilot student (Gulzada) plus superadmins. Opening to everyone with full course access
-- ('full_access') is a separate owner decision after the pilot evidence is recorded.
update private.ielts_mock_cbt_forms
set release_scope = 'pilot',
    pilot_users = array['b30e9c28-96f1-4d34-83e9-9b28b4926f42'::uuid],
    authorized_by = (select user_id from public.superadmins order by user_id limit 1),
    authorized_at = now()
where code = 'IELTS-M2' and release_scope = 'off';
