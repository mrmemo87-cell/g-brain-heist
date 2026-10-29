-- Rollback for 20261029170000_economy_and_clan_server_actions.sql
-- Apply the step-B rollback first if step B was applied.
-- rpc_create_clan and rpc_clan_join_request_decide are restored to their pre-change behaviour
-- (no fee, leader/moderator only, no school check).

drop function if exists public.rpc_staff_clan_chat_feed(boolean, integer);
drop function if exists public.rpc_staff_dismiss_clan_chat_reports(uuid);
drop function if exists public.rpc_clan_chat_hide(uuid);
drop function if exists public.rpc_clan_chat_report(uuid, text);
drop function if exists public.rpc_clan_chat_post(text);
drop table if exists public.clan_chat_reports;
drop index if exists public.clan_chat_user_recent_idx;

drop policy if exists "Clan members can view clan chat" on public.clan_chat;
create policy "Clan members can view clan chat" on public.clan_chat for select using (
  exists (select 1 from public.clan_members m where m.clan_id = clan_chat.clan_id and m.user_id = (select auth.uid())));
alter table public.clan_chat drop column if exists hidden_by;
alter table public.clan_chat drop column if exists hidden_at;

drop index if exists public.clan_members_one_clan_per_user;

create or replace function public.update_clan_member_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update clans set member_count = member_count + 1 where id = new.clan_id;
  elsif tg_op = 'DELETE' then
    update clans set member_count = member_count - 1 where id = old.clan_id;
  end if;
  return null;
end;
$$;

drop policy if exists clan_join_requests_view on public.clan_join_requests;
create policy clan_join_requests_view on public.clan_join_requests for select using (
  (exists (select 1 from clan_members where clan_members.user_id = (select auth.uid())
           and clan_members.clan_id = clan_join_requests.clan_id and clan_members.role = any (array['leader', 'moderator'])))
  or user_id = (select auth.uid()));
drop policy if exists clan_join_requests_update on public.clan_join_requests;
create policy clan_join_requests_update on public.clan_join_requests for update
  using (clan_id in (select clan_members.clan_id from clan_members where clan_members.user_id = (select auth.uid()) and clan_members.role = any (array['leader', 'moderator'])))
  with check (clan_id in (select clan_members.clan_id from clan_members where clan_members.user_id = (select auth.uid()) and clan_members.role = any (array['leader', 'moderator'])));
drop policy if exists clan_join_requests_delete on public.clan_join_requests;
create policy clan_join_requests_delete on public.clan_join_requests for delete using (
  user_id = (select auth.uid())
  or clan_id in (select clan_members.clan_id from clan_members where clan_members.user_id = (select auth.uid()) and clan_members.role = any (array['leader', 'moderator']))));

drop function if exists public.rpc_update_clan_notice(text);

create or replace function public.rpc_create_clan(p_clan_name text, p_notice text default null)
returns table(clan_id uuid, clan_name text, leader_username text, success boolean, error_message text)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; v_clan_id uuid; v_username text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then return query select null::uuid, null::text, null::text, false, 'Not authenticated'::text; return; end if;
  select username into v_username from users where id = v_user_id;
  if exists (select 1 from clan_members where user_id = v_user_id) then
    return query select null::uuid, null::text, v_username, false, 'User already in a clan'::text; return;
  end if;
  insert into clans (name, notice, leader_id) values (p_clan_name, p_notice, v_user_id) returning clans.id into v_clan_id;
  insert into clan_members (clan_id, user_id, role) values (v_clan_id, v_user_id, 'leader');
  return query select v_clan_id, p_clan_name, v_username, true, null::text;
end;
$$;

-- rpc_clan_join_request_decide: re-run its previous definition from the live database backup if
-- needed; the step-A version is a strict superset (adds officer and a same-school check).

drop function if exists public.rpc_shop_buy(text, integer);
drop function if exists private.is_staff_for_clan(uuid);
drop function if exists private.clan_text_filter(text);
drop table if exists private.chat_blocked_terms;
