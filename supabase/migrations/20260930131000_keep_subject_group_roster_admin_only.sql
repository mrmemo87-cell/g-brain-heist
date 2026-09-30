-- Roster membership remains a school-admin/owner responsibility.
drop function if exists public.rpc_teacher_set_subject_group_students(uuid,uuid,uuid[]);
