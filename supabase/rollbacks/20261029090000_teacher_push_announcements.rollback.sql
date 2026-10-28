-- Rollback for 20261029090000_teacher_push_announcements.sql
-- Queued announcement messages already in push_notification_outbox are left to drain normally.
drop function if exists public.rpc_teacher_push_reachable_students(uuid[]);
drop function if exists public.rpc_teacher_send_push_announcement(uuid[], text, text);
drop table if exists public.push_announcements;
