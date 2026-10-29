-- Rollback for 20261029200000_feed_integrity_and_moments.sql
-- WARNING: reopens client-written feed rows (fakeable task rewards/achievements) and cross-student edits.

drop function if exists public.rpc_react_to_activity(uuid, text);

drop trigger if exists trg_feed_clan_joined on public.clan_members;
drop trigger if exists trg_feed_streak_milestone on public.daily_streak_rewards;
drop trigger if exists trg_feed_achievement on public.user_achievements;
drop trigger if exists trg_feed_level_up on public.users;
drop function if exists private.trg_feed_clan_joined();
drop function if exists private.trg_feed_streak_milestone();
drop function if exists private.trg_feed_achievement();
drop function if exists private.trg_feed_level_up();
drop function if exists private.feed_post(text, uuid, jsonb);

-- Feed RPC without the kind filter.
create or replace function public.get_school_activity_feed(p_limit integer default 30)
returns table(id uuid, kind text, actor_id uuid, actor_username text, target_id uuid, target_username text,
              data jsonb, reactions jsonb, created_at timestamptz, school_id uuid, actor_role text)
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_school_id uuid;
begin
  v_school_id := get_caller_school_id();
  if v_school_id is null then return; end if;
  return query
  select a.id, a.kind, a.actor_id, a.actor_username, a.target_id, a.target_username, a.data, a.reactions,
         a.created_at, a.school_id, u.role as actor_role
  from activities a left join users u on u.id = a.actor_id
  where (a.school_id = v_school_id or (a.school_id is null and exists (
          select 1 from users actor where actor.id = a.actor_id and actor.school_id = v_school_id)))
    and coalesce(u.role, 'student') != 'teacher'
  order by a.created_at desc
  limit least(p_limit, 50);
end;
$function$;

-- rpc_clan_deposit_coins: the step-A version only adds the activity insert; leaving it is harmless.

grant insert, update, delete on table public.activity_reactions to authenticated;
create policy "Users can add reactions" on public.activity_reactions for insert with check ((select auth.uid()) = user_id);
create policy "Users can delete own reactions" on public.activity_reactions for delete using ((select auth.uid()) = user_id);
create policy "Users can manage own reactions" on public.activity_reactions for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant insert, update, delete on table public.activities to authenticated;
create policy "Users can create activities" on public.activities for insert with check ((select auth.uid()) = actor_id);
create policy activities_insert on public.activities for insert with check (actor_id = (select auth.uid()));
create policy activities_insert_own on public.activities for insert with check (actor_id = (select auth.uid()));
create policy activities_delete on public.activities for delete using (actor_id = (select auth.uid()));
create policy activities_update on public.activities for update using (
  (school_id = (select get_caller_school_id()))
  or (school_id is null and exists (select 1 from users u where u.id = activities.actor_id and u.school_id = (select get_caller_school_id()))));
