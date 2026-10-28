-- Rollback for 20261029120000_game_event_push_notifications.sql
-- Restores the cron command and assignment triggers from 20261028170000; removes game-event pushes.
do $$
declare v_command text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    v_command := $cmd$
      select public.rpc_push_cleanup();
      select public.rpc_enqueue_due_push_reminders();
      select net.http_post(
        url := (select function_url from public.push_dispatch_config where singleton = true),
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-push-dispatch-key', (select dispatch_key from public.push_dispatch_config where singleton = true)),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $cmd$;
    perform cron.unschedule(jobid) from cron.job where jobname = 'brains-heist-push-dispatcher';
    perform cron.schedule('brains-heist-push-dispatcher', '* * * * *', v_command);
  end if;
end $$;

drop trigger if exists push_pvp_defence on public.pvp_attack_attempts;
drop function if exists private.trg_push_pvp_defence();
drop function if exists private.push_pvp_defence(uuid, uuid, jsonb, timestamptz);
drop function if exists public.rpc_enqueue_streak_push_reminders(timestamptz);
drop function if exists private.enqueue_game_push(uuid, text, text, text, text, text, jsonb, timestamptz);
drop function if exists private.game_push_available_at(timestamptz);
drop table if exists public.push_preferences;

-- Assignment triggers: back to invoker functions without the error guard (as in 20261028170000).
create or replace function private.trg_push_student_assignment_inserted()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform private.push_new_assignment_for_student(new.assignment_id, new.student_id);
  return new;
end $$;
create or replace function private.trg_push_assignment_published()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare r record;
begin
  if coalesce(old.publish_status, 'published') = 'published' or coalesce(new.publish_status, 'published') <> 'published' then
    return new;
  end if;
  for r in select sa.student_id from public.student_assignments sa where sa.assignment_id = new.id loop
    perform private.push_new_assignment_for_student(new.id, r.student_id);
  end loop;
  return new;
end $$;
