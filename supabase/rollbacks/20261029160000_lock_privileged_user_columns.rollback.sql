-- Rollback for 20261029160000_lock_privileged_user_columns.sql
-- WARNING: restores the hole where any signed-in user can edit role/is_admin/ban/tier on their own row.
drop trigger if exists trg_00_guard_user_privileged_columns on public.users;
drop function if exists private.guard_user_privileged_columns();
