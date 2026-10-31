-- Demo seed 00: wipe the demo school so it can be rebuilt fresh (nightly).
-- After the initial copy, every table except the shared content tables was empty, so
-- the demo returns to that state by emptying all non-content tables. Content tables
-- (questions, curriculum, registry ...) and the demo's own private.demo_* tables stay.
-- Refuses to run anywhere without the demo marker table.

do $$ begin
  if to_regclass('private.demo_environment') is null then
    raise exception 'Refusing: not the demo database (private.demo_environment missing)';
  end if;
  if (select count(*) from private.demo_content_tables) < 20 then
    raise exception 'Refusing: content table list is missing, cannot tell content from demo data';
  end if;
end $$;

do $$
declare t record;
begin
  -- No triggers or FK actions while emptying: append-only guards would block the reset,
  -- and cascades must never reach the content tables.
  set local session_replication_role = replica;

  for t in
    select format('%I.%I', n.nspname, c.relname) as fq
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and not c.relispartition
      and n.nspname in ('public', 'private', 'commander_private', 'archive_raids')
      and format('%s.%s', n.nspname, c.relname) not in (select name from private.demo_content_tables)
      and not (n.nspname = 'private' and c.relname like 'demo\_%')
  loop
    execute 'delete from ' || t.fq;
  end loop;

  delete from auth.mfa_factors where user_id in (select id from auth.users where email like 'demo.%@example.com');
  delete from auth.one_time_tokens where user_id in (select id from auth.users where email like 'demo.%@example.com');
  delete from auth.refresh_tokens where user_id in (select id::text from auth.users where email like 'demo.%@example.com');
  delete from auth.sessions where user_id in (select id from auth.users where email like 'demo.%@example.com');
  delete from auth.identities where user_id in (select id from auth.users where email like 'demo.%@example.com');
  delete from auth.users where email like 'demo.%@example.com';

  if to_regclass('private.demo_state') is not null then
    delete from private.demo_state;
  end if;
end $$;
