-- Economy & clan server actions (step A of 2, audit 2026-10-29). ADDITIVE ONLY.
--
-- Adds server-side versions of actions the app currently performs from the phone, plus clan
-- chat safety tools. Nothing the current app relies on is removed, so this is safe to apply
-- BEFORE the app update. Step B (20261029180000_economy_and_clan_lockdown) removes the
-- direct client writes and must be applied only AFTER the updated app is deployed.
--
--   Shop:   rpc_shop_buy                — server prices, balances, daily limits, item grant
--   Clans:  rpc_create_clan (replaced)  — charges the 1,000-coin fee server-side, validates name
--           rpc_update_clan_notice      — leader/officer edits the clan notice
--           rpc_clan_join_request_decide (replaced) — officers may decide; same-school check
--   Chat:   rpc_clan_chat_post          — server sets the sender name; length, rate limit, filter
--           rpc_clan_chat_report        — any member can report a message
--           rpc_clan_chat_hide          — leader/officer of that clan, or school staff, hide a message
--           rpc_staff_clan_chat_feed    — teachers/school admins read their school's clan chat
--           rpc_staff_dismiss_clan_chat_reports
--   Fixes:  officer role in join-request RLS; member_count trigger runs as definer + recount;
--           one clan per student (unique index; production has no duplicates).
--
-- Rollback: supabase/rollbacks/20261029170000_economy_and_clan_server_actions.rollback.sql

-- ───────────────────────────── helpers ─────────────────────────────
create table if not exists private.chat_blocked_terms (
  term text primary key check (length(term) between 2 and 40)
);
revoke all on table private.chat_blocked_terms from public, anon, authenticated;

-- Starting list: the three terms the app already filtered, plus common English and Russian
-- profanity roots and slurs. Extend by inserting rows; matching is case-insensitive substring.
insert into private.chat_blocked_terms(term) values
  ('noob'), ('hax'), ('cheater'),
  ('fuck'), ('shit'), ('bitch'), ('cunt'), ('dick'), ('pussy'), ('asshole'), ('bastard'),
  ('whore'), ('slut'), ('retard'), ('faggot'), ('nigger'), ('nigga'),
  ('хуй'), ('хуё'), ('хуе'), ('пизд'), ('ебат'), ('ебан'), ('ёбан'), ('ебал'), ('ебу'),
  ('бляд'), ('блят'), ('сука'), ('суки'), ('мудак'), ('мудил'), ('пидор'), ('пидар'),
  ('гандон'), ('шлюх'), ('дебил'), ('долбоёб'), ('долбоеб'), ('залуп')
on conflict do nothing;

create or replace function private.clan_text_filter(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out text := coalesce(p_text, '');
  v_term text;
begin
  for v_term in select t.term from private.chat_blocked_terms t loop
    v_out := regexp_replace(
      v_out,
      regexp_replace(v_term, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'),
      '▮▮▮',
      'gi'
    );
  end loop;
  return v_out;
end;
$$;
revoke all on function private.clan_text_filter(text) from public, anon, authenticated;

-- Teachers and school admins of the clan leader's school, or the platform owner.
create or replace function private.is_staff_for_clan(p_clan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.superadmins s where s.user_id = (select auth.uid()))
      or exists (
        select 1
        from public.users me
        join public.clans c on c.id = p_clan_id
        join public.users leader on leader.id = c.leader_id
        where me.id = (select auth.uid())
          and me.role in ('teacher', 'school_admin')
          and coalesce(me.is_banned, false) = false
          and me.school_id is not null
          and me.school_id = leader.school_id
      );
$$;
revoke all on function private.is_staff_for_clan(uuid) from public, anon, authenticated;

-- ───────────────────────────── shop ─────────────────────────────
create or replace function public.rpc_shop_buy(p_item_id text, p_quantity integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user record;
  v_item record;
  v_qty integer := coalesce(p_quantity, 1);
  v_bought_today integer;
  v_coin_cost integer;
  v_gem_cost integer;
  v_inventory_ids uuid[] := '{}';
  v_new_id uuid;
  i integer;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_qty < 1 or v_qty > 10 then raise exception 'Invalid quantity'; end if;
  if not public.can_use_feature('shop', true) then
    raise exception 'The shop is not enabled for your school.' using errcode = '42501';
  end if;

  -- Server-side catalogue (mirrors the app's shop list; prices are authoritative here).
  select * into v_item from (values
    ('item_shield',          'Shield',         'shield',         150,   0, 3, 0,  20, 'Blocks one incoming hack attempt before shattering. +20 Defense.', '+20 Defense'),
    ('item_firewall',        'Firewall',       'firewall',       300,   0, 2, 0,  30, 'Advanced defense system. +30 Defense until cracked.', '+30 Defense'),
    ('item_encryption_key',  'Encryption Key', 'encryption_key', 200,   0, 3, 15, 0,  'Permanent attack boost. +15 Attack.', '+15 Attack (Permanent)'),
    ('item_exploit_kit',     'Exploit Kit',    'exploit_kit',    350,   4, 2, 25, 0,  'Advanced hacking tools. +25 Attack permanently.', '+25 Attack (Permanent)'),
    ('item_cracker',         'Cracker',        'cracker',        200,   0, 2, 0,  0,  'Bypasses an active enemy shield during a hack.', 'Negates 1 shield'),
    ('item_booster',         'Booster',        'booster',        250,   0, 1, 0,  0,  'Grants 1.5x XP from all sources for 1 hour.', '1.5x XP (1h)'),
    ('item_major_booster',   'Major Booster',  'major_booster',  400,   6, 1, 0,  0,  'Grants a massive 2.0x XP from all sources for 1 hour.', '2.0x XP (1h)'),
    ('item_cosmetic_frame',  'Neon Frame',     'cosmetic',       10000, 50, 1, 0, 0,  'A flashy neon frame for your avatar. Show off your style!', 'Purely cosmetic'),
    ('item_cosmetic_theme',  'Flicker Theme',  'cosmetic',       20000, 100, 1, 0, 0, 'Apply a flickering, datamosh effect to your profile card.', 'Purely cosmetic'),
    ('item_cosmetic_glitch', 'Glitch Effect',  'cosmetic',       50000, 150, 1, 0, 0, 'A mesmerizing glitch distortion effect that warps your avatar with digital artifacts. The ultimate flex.', 'Glitch distortion effect'),
    ('item_quantum_cloak',   'Quantum Cloak',  'shield',         500,   12, 1, 0, 20, 'Phase-shifted armor that nullifies three attacks before collapsing.', 'Blocks 3 attacks')
  ) as c(id, name, kind, price, gem_price, daily_limit, attack_bonus, defense_bonus, description, effect_summary)
  where c.id = p_item_id;

  if not found then raise exception 'Item not found.'; end if;

  select id, username, coins, gemstones, coalesce(is_banned, false) as is_banned
    into v_user from public.users where id = v_user_id for update;
  if not found then raise exception 'User profile not found'; end if;
  if v_user.is_banned then raise exception 'Account is banned' using errcode = '42501'; end if;

  select coalesce(sum(quantity), 0) into v_bought_today
  from public.shop_purchases
  where user_id = v_user_id and item_id = p_item_id and purchase_date = current_date;
  if v_bought_today + v_qty > v_item.daily_limit then
    raise exception 'Daily purchase limit exceeded.';
  end if;

  v_coin_cost := v_item.price * v_qty;
  v_gem_cost := v_item.gem_price * v_qty;
  if coalesce(v_user.coins, 0) < v_coin_cost then raise exception 'Not enough coins.'; end if;
  if coalesce(v_user.gemstones, 0) < v_gem_cost then raise exception 'Not enough gemstones.'; end if;

  update public.users
  set coins = coalesce(coins, 0) - v_coin_cost,
      gemstones = coalesce(gemstones, 0) - v_gem_cost
  where id = v_user_id
  returning coins, gemstones into v_user.coins, v_user.gemstones;

  insert into public.shop_purchases (user_id, item_id, quantity, total_cost)
  values (v_user_id, p_item_id, v_qty, v_coin_cost);

  for i in 1..v_qty loop
    insert into public.inventory (user_id, item_id, name, kind, state, description, effect_summary, attack_bonus, defense_bonus)
    values (v_user_id, v_item.id, v_item.name, v_item.kind, 'unused', v_item.description, v_item.effect_summary,
            v_item.attack_bonus, v_item.defense_bonus)
    returning id into v_new_id;
    v_inventory_ids := v_inventory_ids || v_new_id;
  end loop;

  insert into public.activities (kind, actor_id, actor_username, data, created_at)
  values ('shop_purchase', v_user_id, v_user.username,
          jsonb_build_object('item_id', v_item.id, 'item_name', v_item.name, 'quantity', v_qty, 'amount', v_coin_cost),
          now());

  return jsonb_build_object(
    'item_id', v_item.id,
    'quantity', v_qty,
    'coins_spent', v_coin_cost,
    'gemstones_spent', v_gem_cost,
    'new_balance', v_user.coins,
    'new_gemstone_balance', v_user.gemstones,
    'inventory_ids', to_jsonb(v_inventory_ids)
  );
end;
$$;
revoke all on function public.rpc_shop_buy(text, integer) from public, anon;
grant execute on function public.rpc_shop_buy(text, integer) to authenticated;

-- ───────────────────────────── clans ─────────────────────────────
create or replace function public.rpc_create_clan(p_clan_name text, p_notice text default null)
returns table(clan_id uuid, clan_name text, leader_username text, success boolean, error_message text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  c_fee constant integer := 1000;
  v_user_id uuid := auth.uid();
  v_user record;
  v_name text := btrim(coalesce(p_clan_name, ''));
  v_notice text := left(btrim(coalesce(p_notice, '')), 280);
  v_clan_id uuid;
begin
  if v_user_id is null then
    return query select null::uuid, null::text, null::text, false, 'Not authenticated'::text; return;
  end if;
  if not public.can_use_feature('clans', true) then
    return query select null::uuid, null::text, null::text, false, 'Clans are not enabled for your school.'::text; return;
  end if;

  select id, username, coins, role, coalesce(is_banned, false) as is_banned
    into v_user from public.users where id = v_user_id for update;
  if not found or v_user.is_banned or v_user.role <> 'student' then
    return query select null::uuid, null::text, null::text, false, 'Only students can create clans.'::text; return;
  end if;

  if exists (select 1 from public.clan_members m where m.user_id = v_user_id) then
    return query select null::uuid, null::text, v_user.username, false, 'You are already in a clan.'::text; return;
  end if;
  if length(v_name) < 3 or length(v_name) > 30 then
    return query select null::uuid, null::text, v_user.username, false, 'Clan name must be 3–30 characters.'::text; return;
  end if;
  if private.clan_text_filter(v_name) <> v_name then
    return query select null::uuid, null::text, v_user.username, false, 'Please choose a different clan name.'::text; return;
  end if;
  if coalesce(v_user.coins, 0) < c_fee then
    return query select null::uuid, null::text, v_user.username, false, 'Not enough coins to create a clan.'::text; return;
  end if;

  begin
    insert into public.clans (name, notice, leader_id, vault_coins, member_count)
    values (v_name, coalesce(nullif(private.clan_text_filter(v_notice), ''), 'Welcome to the clan!'), v_user_id, 0, 0)
    returning id into v_clan_id;
  exception when unique_violation then
    return query select null::uuid, null::text, v_user.username, false, 'That clan name is taken.'::text; return;
  end;

  insert into public.clan_members (clan_id, user_id, role) values (v_clan_id, v_user_id, 'leader');
  update public.users set coins = coins - c_fee where id = v_user_id;

  insert into public.activities (kind, actor_id, actor_username, data, created_at)
  values ('clan_create', v_user_id, v_user.username, jsonb_build_object('details', v_name), now());

  return query select v_clan_id, v_name, v_user.username, true, null::text;
end;
$$;
revoke all on function public.rpc_create_clan(text, text) from public, anon;
grant execute on function public.rpc_create_clan(text, text) to authenticated;

create or replace function public.rpc_update_clan_notice(p_notice text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_clan_id uuid;
  v_role text;
  v_notice text := private.clan_text_filter(left(btrim(coalesce(p_notice, '')), 280));
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select m.clan_id, m.role into v_clan_id, v_role from public.clan_members m where m.user_id = v_user_id;
  if v_clan_id is null then raise exception 'You are not in a clan.'; end if;
  if v_role not in ('leader', 'officer') then
    raise exception 'Only the leader or an officer can edit the clan notice.' using errcode = '42501';
  end if;
  update public.clans set notice = v_notice where id = v_clan_id;
  return v_notice;
end;
$$;
revoke all on function public.rpc_update_clan_notice(text) from public, anon;
grant execute on function public.rpc_update_clan_notice(text) to authenticated;

create or replace function public.rpc_clan_join_request_decide(p_request_id uuid, p_action text)
returns table(success boolean, error_message text, request_status text, clan_id uuid, member_count integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_request record;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_approver_clan_id uuid;
  v_approver_role text;
  v_member_limit integer;
  v_member_count integer;
begin
  if v_user_id is null then
    return query select false, 'Not authenticated'::text, null::text, null::uuid, 0; return;
  end if;
  if v_action = 'approve' then v_action := 'approved'; elsif v_action = 'reject' then v_action := 'rejected'; end if;
  if v_action not in ('approved', 'rejected') then
    return query select false, 'Invalid action. Use approve/reject.'::text, null::text, null::uuid, 0; return;
  end if;

  select r.id, r.clan_id, r.user_id, r.status into v_request
  from public.clan_join_requests r where r.id = p_request_id for update;
  if v_request.id is null then
    return query select false, 'Join request not found'::text, null::text, null::uuid, 0; return;
  end if;
  if v_request.status <> 'pending' then
    return query select false, 'Join request already processed'::text, v_request.status, v_request.clan_id, 0; return;
  end if;

  select m.clan_id, m.role into v_approver_clan_id, v_approver_role
  from public.clan_members m where m.user_id = v_user_id;
  if v_approver_clan_id is null or v_approver_clan_id <> v_request.clan_id then
    return query select false, 'Not authorized for this clan request'::text, null::text, v_request.clan_id, 0; return;
  end if;
  if v_approver_role not in ('leader', 'officer', 'moderator') then
    return query select false, 'Only the leader or an officer can decide join requests'::text, null::text, v_request.clan_id, 0; return;
  end if;

  if v_action = 'approved' then
    if exists (select 1 from public.clan_members m where m.user_id = v_request.user_id) then
      update public.clan_join_requests set status = 'rejected', approved_by = v_user_id, approved_at = now() where id = v_request.id;
      return query select false, 'User is already in a clan'::text, 'rejected'::text, v_request.clan_id, 0; return;
    end if;

    -- Clans are per school: the new member must belong to the approver's school.
    if not exists (
      select 1 from public.users a join public.users b on b.id = v_request.user_id
      where a.id = v_user_id and a.school_id is not null and a.school_id = b.school_id
    ) then
      update public.clan_join_requests set status = 'rejected', approved_by = v_user_id, approved_at = now() where id = v_request.id;
      return query select false, 'This student is not in your school'::text, 'rejected'::text, v_request.clan_id, 0; return;
    end if;

    select c.member_limit into v_member_limit from public.clans c where c.id = v_request.clan_id for update;
    if v_member_limit is null then
      return query select false, 'Clan not found'::text, null::text, v_request.clan_id, 0; return;
    end if;
    select count(*) into v_member_count from public.clan_members m where m.clan_id = v_request.clan_id;
    if v_member_count >= v_member_limit then
      return query select false, 'Clan is full. Buy another member slot before approving.'::text, null::text, v_request.clan_id, v_member_count; return;
    end if;

    insert into public.clan_members (clan_id, user_id, role) values (v_request.clan_id, v_request.user_id, 'member');
    update public.clan_join_requests set status = 'approved', approved_by = v_user_id, approved_at = now() where id = v_request.id;
    return query select true, null::text, 'approved'::text, v_request.clan_id, v_member_count + 1; return;
  end if;

  update public.clan_join_requests set status = 'rejected', approved_by = v_user_id, approved_at = now() where id = v_request.id;
  return query select true, null::text, 'rejected'::text, v_request.clan_id, 0;
end;
$$;
revoke all on function public.rpc_clan_join_request_decide(uuid, text) from public, anon;
grant execute on function public.rpc_clan_join_request_decide(uuid, text) to authenticated;

-- Officers were locked out: the role check constraint allows leader/officer/member, but these
-- policies only accepted leader/moderator.
drop policy if exists clan_join_requests_view on public.clan_join_requests;
create policy clan_join_requests_view on public.clan_join_requests for select using (
  user_id = (select auth.uid())
  or exists (select 1 from public.clan_members m
             where m.user_id = (select auth.uid()) and m.clan_id = clan_join_requests.clan_id
               and m.role in ('leader', 'officer', 'moderator')));
drop policy if exists clan_join_requests_update on public.clan_join_requests;
create policy clan_join_requests_update on public.clan_join_requests for update
  using (clan_id in (select m.clan_id from public.clan_members m
                     where m.user_id = (select auth.uid()) and m.role in ('leader', 'officer', 'moderator')))
  with check (clan_id in (select m.clan_id from public.clan_members m
                          where m.user_id = (select auth.uid()) and m.role in ('leader', 'officer', 'moderator')));
drop policy if exists clan_join_requests_delete on public.clan_join_requests;
create policy clan_join_requests_delete on public.clan_join_requests for delete using (
  user_id = (select auth.uid())
  or clan_id in (select m.clan_id from public.clan_members m
                 where m.user_id = (select auth.uid()) and m.role in ('leader', 'officer', 'moderator')));

-- member_count silently failed for ordinary members (the trigger ran with their permissions).
create or replace function public.update_clan_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.clans set member_count = (select count(*) from public.clan_members where clan_id = new.clan_id) where id = new.clan_id;
  elsif tg_op = 'DELETE' then
    update public.clans set member_count = (select count(*) from public.clan_members where clan_id = old.clan_id) where id = old.clan_id;
  end if;
  return null;
end;
$$;
revoke all on function public.update_clan_member_count() from public, anon, authenticated;
update public.clans c set member_count = (select count(*) from public.clan_members m where m.clan_id = c.id);

-- One clan per student. The app and every RPC already assume this; production has no duplicates.
create unique index if not exists clan_members_one_clan_per_user on public.clan_members (user_id);

-- ───────────────────────────── clan chat safety ─────────────────────────────
alter table public.clan_chat add column if not exists hidden_at timestamptz;
alter table public.clan_chat add column if not exists hidden_by uuid references public.users(id) on delete set null;

-- Members no longer see hidden messages.
drop policy if exists "Clan members can view clan chat" on public.clan_chat;
create policy "Clan members can view clan chat" on public.clan_chat for select using (
  hidden_at is null
  and exists (select 1 from public.clan_members m
              where m.clan_id = clan_chat.clan_id and m.user_id = (select auth.uid())));

create table if not exists public.clan_chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.clan_chat(id) on delete cascade,
  clan_id uuid not null references public.clans(id) on delete cascade,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reason text not null default '' check (length(reason) <= 200),
  status text not null default 'open' check (status in ('open', 'hidden', 'dismissed')),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
create index if not exists clan_chat_reports_open_idx on public.clan_chat_reports (clan_id, status, created_at desc);
alter table public.clan_chat_reports enable row level security;
revoke all on table public.clan_chat_reports from public, anon, authenticated;
comment on table public.clan_chat_reports is 'Student reports on clan chat messages. Written and read only through RPCs.';

create index if not exists clan_chat_user_recent_idx on public.clan_chat (user_id, created_at desc);

create or replace function public.rpc_clan_chat_post(p_message text)
returns table(id uuid, username text, message text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_user record;
  v_clan_id uuid;
  v_text text := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  v_recent integer;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.can_use_feature('clans', true) then
    raise exception 'Clans are not enabled for your school.' using errcode = '42501';
  end if;
  select u.id, u.username, coalesce(u.is_banned, false) as is_banned into v_user from public.users u where u.id = v_user_id;
  if v_user.is_banned then raise exception 'Account is banned' using errcode = '42501'; end if;

  select m.clan_id into v_clan_id from public.clan_members m where m.user_id = v_user_id;
  if v_clan_id is null then raise exception 'You are not in a clan.'; end if;

  if length(v_text) = 0 then raise exception 'Message is empty.'; end if;
  if length(v_text) > 280 then raise exception 'Message is too long (280 characters max).'; end if;

  select count(*) into v_recent from public.clan_chat c
  where c.user_id = v_user_id and c.created_at > now() - interval '30 seconds';
  if v_recent >= 5 then raise exception 'Slow down — wait a few seconds before sending more.'; end if;

  return query
  insert into public.clan_chat as c (clan_id, user_id, username, message)
  values (v_clan_id, v_user_id, coalesce(nullif(btrim(v_user.username), ''), 'Player'), private.clan_text_filter(v_text))
  returning c.id, c.username, c.message, c.created_at;
end;
$$;
revoke all on function public.rpc_clan_chat_post(text) from public, anon;
grant execute on function public.rpc_clan_chat_post(text) to authenticated;

create or replace function public.rpc_clan_chat_report(p_message_id uuid, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_msg record;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select c.id, c.clan_id, c.user_id into v_msg from public.clan_chat c where c.id = p_message_id;
  if not found then raise exception 'Message not found.'; end if;
  if not exists (select 1 from public.clan_members m where m.clan_id = v_msg.clan_id and m.user_id = v_user_id) then
    raise exception 'You can only report messages in your own clan.' using errcode = '42501';
  end if;
  if v_msg.user_id = v_user_id then raise exception 'You cannot report your own message.'; end if;
  insert into public.clan_chat_reports (message_id, clan_id, reporter_id, reason)
  values (v_msg.id, v_msg.clan_id, v_user_id, left(btrim(coalesce(p_reason, '')), 200))
  on conflict (message_id, reporter_id) do nothing;
  return true;
end;
$$;
revoke all on function public.rpc_clan_chat_report(uuid, text) from public, anon;
grant execute on function public.rpc_clan_chat_report(uuid, text) to authenticated;

create or replace function public.rpc_clan_chat_hide(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_msg record;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select c.id, c.clan_id into v_msg from public.clan_chat c where c.id = p_message_id;
  if not found then raise exception 'Message not found.'; end if;
  if not (
    exists (select 1 from public.clan_members m
            where m.clan_id = v_msg.clan_id and m.user_id = v_user_id and m.role in ('leader', 'officer'))
    or private.is_staff_for_clan(v_msg.clan_id)
  ) then
    raise exception 'Only the clan leader, an officer or a teacher can hide messages.' using errcode = '42501';
  end if;
  update public.clan_chat set hidden_at = now(), hidden_by = v_user_id where id = v_msg.id and hidden_at is null;
  update public.clan_chat_reports set status = 'hidden', resolved_by = v_user_id, resolved_at = now()
  where message_id = v_msg.id and status = 'open';
  return true;
end;
$$;
revoke all on function public.rpc_clan_chat_hide(uuid) from public, anon;
grant execute on function public.rpc_clan_chat_hide(uuid) to authenticated;

create or replace function public.rpc_staff_dismiss_clan_chat_reports(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clan_id uuid;
begin
  select c.clan_id into v_clan_id from public.clan_chat c where c.id = p_message_id;
  if v_clan_id is null then raise exception 'Message not found.'; end if;
  if not private.is_staff_for_clan(v_clan_id) then
    raise exception 'Only school staff can dismiss reports.' using errcode = '42501';
  end if;
  update public.clan_chat_reports set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now()
  where message_id = p_message_id and status = 'open';
  return true;
end;
$$;
revoke all on function public.rpc_staff_dismiss_clan_chat_reports(uuid) from public, anon;
grant execute on function public.rpc_staff_dismiss_clan_chat_reports(uuid) to authenticated;

-- Teachers and school admins: recent clan chat across their school's clans (newest first).
create or replace function public.rpc_staff_clan_chat_feed(p_only_reported boolean default false, p_limit integer default 150)
returns table(
  message_id uuid, clan_id uuid, clan_name text, user_id uuid, username text, message text,
  created_at timestamptz, hidden_at timestamptz, open_reports integer, report_reasons text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me record;
  v_is_owner boolean;
begin
  select u.id, u.role, u.school_id, coalesce(u.is_banned, false) as is_banned into v_me
  from public.users u where u.id = auth.uid();
  v_is_owner := exists (select 1 from public.superadmins s where s.user_id = auth.uid());
  if not v_is_owner and (v_me.id is null or v_me.is_banned or v_me.role not in ('teacher', 'school_admin') or v_me.school_id is null) then
    raise exception 'Only teachers and school admins can view clan chat.' using errcode = '42501';
  end if;

  return query
  select c.id, c.clan_id, cl.name, c.user_id, coalesce(u.username, c.username), c.message, c.created_at, c.hidden_at,
         coalesce(r.open_reports, 0)::integer, r.reasons
  from public.clan_chat c
  join public.clans cl on cl.id = c.clan_id
  join public.users leader on leader.id = cl.leader_id
  left join public.users u on u.id = c.user_id
  left join lateral (
    select count(*) filter (where rr.status = 'open') as open_reports,
           string_agg(nullif(rr.reason, ''), ' · ') filter (where rr.status = 'open') as reasons
    from public.clan_chat_reports rr where rr.message_id = c.id
  ) r on true
  where (v_is_owner or leader.school_id = v_me.school_id)
    and (not coalesce(p_only_reported, false) or coalesce(r.open_reports, 0) > 0)
  order by coalesce(r.open_reports, 0) > 0 desc, c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 150), 500));
end;
$$;
revoke all on function public.rpc_staff_clan_chat_feed(boolean, integer) from public, anon;
grant execute on function public.rpc_staff_clan_chat_feed(boolean, integer) to authenticated;
