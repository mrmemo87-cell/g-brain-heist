-- Preserve school context while a member is suspended by moderation.
--
-- Previously trg_sync_user_school cleared users.school_id whenever the last
-- active school_members row became suspended. School students can carry a
-- school-specific legacy users.batch mirror (for example G4/G8), so clearing
-- school_id in the same transaction made users_batch_check fail and rolled
-- back ban/suspension actions.
--
-- A suspended membership is still a school membership. Prefer active rows,
-- then suspended rows. Only a genuine removal clears users.school_id; when it
-- does, normalize a school-only batch mirror so the row remains valid.
create or replace function public.sync_user_school_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_school_id uuid;
begin
  perform set_config('app.school_write_ok', '1', true);

  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  select sm.school_id
  into v_school_id
  from public.school_members sm
  where sm.user_id = v_user_id
    and sm.status in ('active', 'suspended')
  order by case when sm.status = 'active' then 0 else 1 end,
           sm.joined_at asc,
           sm.id asc
  limit 1;

  if v_school_id is not null then
    update public.users u
    set school_id = v_school_id
    where u.id = v_user_id
      and u.school_id is distinct from v_school_id;
  else
    update public.users u
    set school_id = null,
        batch = case
          when u.batch is null or u.batch = 'N/A' then u.batch
          when u.batch ~ '^((6|7|8|9|10|11|12)[ABC])$' then u.batch
          else 'N/A'
        end
    where u.id = v_user_id
      and (
        u.school_id is not null
        or (
          u.batch is not null
          and u.batch <> 'N/A'
          and u.batch !~ '^((6|7|8|9|10|11|12)[ABC])$'
        )
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function public.sync_user_school_id() is
  'Synchronizes users.school_id from active/suspended school membership. Suspensions preserve school context; true removal clears school_id and normalizes legacy batch safely.';

notify pgrst, 'reload schema';
