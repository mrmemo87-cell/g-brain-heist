-- Rollback for 20261028170000_student_push_notifications.sql
-- Removes the push pipeline entirely. Subscriptions are lost; students re-enable from Settings after a redeploy.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'brains-heist-push-dispatcher';
  end if;
end $$;

drop trigger if exists push_assignment_published on public.assignments;
drop trigger if exists push_student_assignment_inserted on public.student_assignments;
drop function if exists private.trg_push_assignment_published();
drop function if exists private.trg_push_student_assignment_inserted();
drop function if exists private.push_new_assignment_for_student(uuid, uuid);
drop function if exists private.enqueue_push(uuid, text, text, text, text, text, jsonb, timestamptz);

drop function if exists public.rpc_push_cleanup();
drop function if exists public.rpc_claim_push_notifications(integer);
drop function if exists public.rpc_enqueue_due_push_reminders();

drop table if exists public.push_dispatch_config;
drop table if exists public.push_notification_outbox;
drop table if exists public.push_subscriptions;
