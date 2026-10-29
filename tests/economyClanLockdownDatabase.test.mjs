import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Exercises the two-step economy & clan migrations on a production-shaped schema:
//   20261029160000_lock_privileged_user_columns (already live)
//   20261029170000_economy_and_clan_server_actions (step A, additive)
//   20261029180000_economy_and_clan_lockdown (step B)
// Grants mirror production: authenticated and anon hold every table privilege; RLS decides rows.
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const SCHOOL_A = id(901), SCHOOL_B = id(902);
const LEADER = id(1), MEMBER = id(2), OFFICER = id(3), OUTSIDER = id(4), RICH = id(5);
const TEACHER_A = id(11), TEACHER_B = id(12), OTHER_SCHOOL_KID = id(21), POOR = id(6);

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.superadmins(user_id uuid primary key);
create table public.users(
  id uuid primary key, email text, created_at timestamptz default now(), updated_at timestamptz,
  username text, avatar_url text, bio text, full_name text, grade int, batch text, school text, school_id uuid,
  needs_setup boolean, tutorial_completed boolean, last_seen timestamptz,
  active_cosmetic_frame text, active_cosmetic_theme text, active_cosmetic_effect text, brains_master_show_badge boolean,
  role text not null default 'student', is_admin boolean default false, is_banned boolean default false,
  banned_until timestamptz, account_tier text not null default 'free', admin_visible boolean default true,
  brains_master_until timestamptz, profile_locked boolean default false,
  full_name_status text not null default 'pending', full_name_verified_at timestamptz, full_name_verified_by uuid,
  coins int default 0, gemstones int not null default 0, ap_now int default 18, ap_max int default 20, last_ap_update timestamptz,
  attack_power int default 10, defense_power int default 10, pvp_score int not null default 0, pvp_wins int default 0,
  last_attacked_at timestamptz, streak int default 0, achievement_points int default 0, total_questions_answered int default 0,
  coins_from_achievements int, coins_from_assignments int, coins_from_pvp int, coins_from_quests int,
  xp_from_achievements int, xp_from_assignments int, xp_from_pvp int, xp_from_quests int);
create table public.activities(id bigserial primary key, kind text, actor_id uuid, actor_username text, target_id uuid, target_username text, data jsonb, created_at timestamptz default now());
create table public.shop_purchases(id uuid primary key default gen_random_uuid(), user_id uuid, item_id text not null, quantity int default 1,
  total_cost int not null, purchase_date date default current_date, created_at timestamptz default now());
create table public.inventory(id uuid primary key default gen_random_uuid(), user_id uuid, item_id text not null, name text not null, kind text not null,
  state text default 'unused', activated_at timestamptz, expires_at timestamptz, description text, effect_summary text,
  attack_bonus int default 0, defense_bonus int default 0, created_at timestamptz default now());
create table public.clans(id uuid primary key default gen_random_uuid(), name text unique, notice text, vault_coins int default 0,
  leader_id uuid references public.users(id), member_count int default 1, created_at timestamptz default now(), updated_at timestamptz default now(),
  color text, crest_url text, member_limit int default 5, extra_member_slots_purchased int default 0);
create table public.clan_members(id uuid primary key default gen_random_uuid(), clan_id uuid references public.clans(id) on delete cascade,
  user_id uuid references public.users(id), role text default 'member' check (role in ('leader','officer','member')),
  joined_at timestamptz default now(), custom_title text, unique (clan_id, user_id));
create table public.clan_chat(id uuid primary key default gen_random_uuid(), clan_id uuid references public.clans(id) on delete cascade,
  user_id uuid references public.users(id), username text, message text, created_at timestamptz default now());
create table public.clan_join_requests(id uuid primary key default gen_random_uuid(), clan_id uuid not null, user_id uuid not null,
  status text not null default 'pending', created_at timestamptz default now(), approved_by uuid, approved_at timestamptz);
create function public.can_use_feature(p_feature_key text, p_allow_individual boolean) returns boolean language sql stable as $$ select true $$;
create function public.update_clan_member_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then update clans set member_count = member_count + 1 where id = new.clan_id;
  elsif tg_op = 'DELETE' then update clans set member_count = member_count - 1 where id = old.clan_id; end if;
  return null;
end $$;
create trigger clan_members_count after insert or delete on public.clan_members for each row execute function public.update_clan_member_count();
create function public.rpc_join_clan(p_clan_id uuid) returns table(success boolean, error_message text, member_count integer)
  language sql security definer as $$ select true, null::text, 0 $$;
create function public.rpc_create_clan(p_clan_name text, p_notice text default null)
  returns table(clan_id uuid, clan_name text, leader_username text, success boolean, error_message text)
  language sql security definer as $$ select null::uuid, null::text, null::text, false, 'old'::text $$;
create function public.rpc_clan_join_request_decide(p_request_id uuid, p_action text)
  returns table(success boolean, error_message text, request_status text, clan_id uuid, member_count integer)
  language sql security definer as $$ select false, 'old'::text, null::text, null::uuid, 0 $$;

-- Production-shaped privileges and RLS.
grant usage on schema public, auth to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter table public.users enable row level security;
create policy users_select on public.users for select to authenticated using (true);
create policy "Users can update own data" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
alter table public.activities enable row level security;
create policy act_insert on public.activities for insert with check (actor_id = auth.uid());
alter table public.inventory enable row level security;
create policy active_players_select_inventory on public.inventory for select using (auth.uid() = user_id);
create policy active_players_insert_inventory on public.inventory for insert with check (auth.uid() = user_id);
create policy active_players_update_inventory on public.inventory for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy active_players_delete_inventory on public.inventory for delete using (auth.uid() = user_id);
alter table public.shop_purchases enable row level security;
create policy active_players_select_shop_purchases on public.shop_purchases for select using (auth.uid() = user_id);
create policy active_players_insert_shop_purchases on public.shop_purchases for insert with check (auth.uid() = user_id);
alter table public.clans enable row level security;
create policy clans_select on public.clans for select to authenticated using (true);
create policy "Users can create clans" on public.clans for insert with check (auth.uid() = leader_id);
create policy "Leaders can update own clan" on public.clans for update using (auth.uid() = leader_id);
create policy "Leaders can delete own clan" on public.clans for delete using (auth.uid() = leader_id);
alter table public.clan_members enable row level security;
create policy cm_select on public.clan_members for select to authenticated using (true);
create policy "Users can join clans" on public.clan_members for insert with check (auth.uid() = user_id);
create policy "Leaders can add members to clan" on public.clan_members for insert with check (
  clan_id in (select m.clan_id from public.clan_members m where m.user_id = auth.uid() and m.role in ('leader','moderator')));
create policy "Users can leave clans" on public.clan_members for delete using (auth.uid() = user_id);
alter table public.clan_chat enable row level security;
create policy "Clan members can post messages" on public.clan_chat for insert with check (
  auth.uid() = user_id and exists (select 1 from public.clan_members m where m.clan_id = clan_chat.clan_id and m.user_id = auth.uid()));
create policy "Clan members can view clan chat" on public.clan_chat for select using (
  exists (select 1 from public.clan_members m where m.clan_id = clan_chat.clan_id and m.user_id = auth.uid()));
alter table public.clan_join_requests enable row level security;
create policy clan_join_requests_insert on public.clan_join_requests for insert with check (user_id = auth.uid());

insert into public.users(id, username, role, school_id, coins, gemstones) values
  ('${LEADER}', 'Aidai', 'student', '${SCHOOL_A}', 500, 0),
  ('${MEMBER}', 'Bek', 'student', '${SCHOOL_A}', 0, 0),
  ('${OFFICER}', 'Cholpon', 'student', '${SCHOOL_A}', 0, 0),
  ('${OUTSIDER}', 'Dastan', 'student', '${SCHOOL_A}', 0, 0),
  ('${RICH}', 'Eldiyar', 'student', '${SCHOOL_A}', 5000, 10),
  ('${POOR}', 'Farida', 'student', '${SCHOOL_A}', 999, 0),
  ('${TEACHER_A}', 'Ms Aida', 'teacher', '${SCHOOL_A}', 0, 0),
  ('${TEACHER_B}', 'Mr Bolot', 'teacher', '${SCHOOL_B}', 0, 0),
  ('${OTHER_SCHOOL_KID}', 'Gulnara', 'student', '${SCHOOL_B}', 0, 0);
insert into public.clans(id, name, leader_id, vault_coins, member_count) values ('${id(500)}', 'Wolves', '${LEADER}', 0, 1);
insert into public.clan_members(clan_id, user_id, role) values
  ('${id(500)}', '${LEADER}', 'leader'), ('${id(500)}', '${MEMBER}', 'member'), ('${id(500)}', '${OFFICER}', 'officer');
`);

for (const file of [
  'supabase/migrations/20261029160000_lock_privileged_user_columns.sql',
  'supabase/migrations/20261029170000_economy_and_clan_server_actions.sql',
]) {
  await db.exec(readFileSync(file, 'utf8'));
}

const as = async (userId, sql, params = []) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
};
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const WOLVES = id(500);

// ───────────── step A: server actions ─────────────

test('A: shop purchase charges the server price, grants the item and enforces limits', async () => {
  const r = (await as(RICH, `select public.rpc_shop_buy('item_exploit_kit', 2) as r`)).rows[0].r;
  assert.equal(r.coins_spent, 700);
  assert.equal(r.gemstones_spent, 8);
  assert.equal(r.new_balance, 4300);
  const u = await one(`select coins, gemstones from public.users where id = $1`, [RICH]);
  assert.deepEqual(u, { coins: 4300, gemstones: 2 });
  const inv = await one(`select count(*)::int n, min(attack_bonus) a from public.inventory where user_id = $1 and item_id = 'item_exploit_kit'`, [RICH]);
  assert.deepEqual(inv, { n: 2, a: 25 });
  await assert.rejects(as(RICH, `select public.rpc_shop_buy('item_exploit_kit', 1)`), /Daily purchase limit/);
  await assert.rejects(as(RICH, `select public.rpc_shop_buy('item_free_money', 1)`), /Item not found/);
  await assert.rejects(as(MEMBER, `select public.rpc_shop_buy('item_shield', 1)`), /Not enough coins/);
});

test('A: creating a clan costs 1,000 coins on the server and validates the name', async () => {
  let r = (await as(POOR, `select * from public.rpc_create_clan('Eagles', 'hi')`)).rows[0];
  assert.equal(r.success, false);
  assert.match(r.error_message, /Not enough coins/);
  await db.exec(`update public.users set coins = 1200 where id = '${POOR}'`);
  r = (await as(POOR, `select * from public.rpc_create_clan('fuck squad', 'hi')`)).rows[0];
  assert.equal(r.success, false);
  r = (await as(POOR, `select * from public.rpc_create_clan('Wolves', 'hi')`)).rows[0];
  assert.match(r.error_message, /taken/);
  r = (await as(POOR, `select * from public.rpc_create_clan('Eagles', 'Welcome!')`)).rows[0];
  assert.equal(r.success, true);
  assert.equal((await one(`select coins from public.users where id = $1`, [POOR])).coins, 200);
  const clan = await one(`select member_count, leader_id from public.clans where id = $1`, [r.clan_id]);
  assert.deepEqual(clan, { member_count: 1, leader_id: POOR });
});

test('A: chat posts get the real name, a filter, a length limit and a rate limit', async () => {
  const r = (await as(MEMBER, `select * from public.rpc_clan_chat_post('  you  are a NOOB  ')`)).rows[0];
  assert.equal(r.username, 'Bek');
  assert.equal(r.message, 'you are a ▮▮▮');
  await assert.rejects(as(MEMBER, `select * from public.rpc_clan_chat_post($1)`, ['x'.repeat(281)]), /too long/);
  await assert.rejects(as(OUTSIDER, `select * from public.rpc_clan_chat_post('hi')`), /not in a clan/);
  for (let i = 0; i < 4; i += 1) await as(MEMBER, `select * from public.rpc_clan_chat_post('msg ${i}')`);
  await assert.rejects(as(MEMBER, `select * from public.rpc_clan_chat_post('spam')`), /Slow down/);
});

test('A: reports reach the right teacher; hidden messages disappear for students', async () => {
  const msg = await one(`select id from public.clan_chat where user_id = $1 order by created_at limit 1`, [MEMBER]);
  await assert.rejects(as(MEMBER, `select public.rpc_clan_chat_report($1, 'mine')`, [msg.id]), /own message/);
  await as(LEADER, `select public.rpc_clan_chat_report($1, 'rude')`, [msg.id]);

  const feedA = (await as(TEACHER_A, `select * from public.rpc_staff_clan_chat_feed(true, 50)`)).rows;
  assert.equal(feedA.length, 1);
  assert.equal(feedA[0].open_reports, 1);
  assert.equal(feedA[0].report_reasons, 'rude');
  assert.equal(feedA[0].clan_name, 'Wolves');

  const feedB = (await as(TEACHER_B, `select * from public.rpc_staff_clan_chat_feed(false, 50)`)).rows;
  assert.equal(feedB.filter((row) => row.clan_name === 'Wolves').length, 0, 'other school sees nothing');
  await assert.rejects(as(MEMBER, `select * from public.rpc_staff_clan_chat_feed(false, 50)`), /Only teachers/);
  await assert.rejects(as(TEACHER_B, `select public.rpc_clan_chat_hide($1)`, [msg.id]), /Only the clan leader/);
  await assert.rejects(as(MEMBER, `select public.rpc_clan_chat_hide($1)`, [msg.id]), /Only the clan leader/);

  const before = (await as(MEMBER, `select count(*)::int n from public.clan_chat`)).rows[0].n;
  await as(TEACHER_A, `select public.rpc_clan_chat_hide($1)`, [msg.id]);
  const after = (await as(MEMBER, `select count(*)::int n from public.clan_chat`)).rows[0].n;
  assert.equal(after, before - 1);
  const report = await one(`select status from public.clan_chat_reports where message_id = $1`, [msg.id]);
  assert.equal(report.status, 'hidden');
});

test('A: officers can approve join requests, but only for students of the same school', async () => {
  await db.exec(`insert into public.clan_join_requests(id, clan_id, user_id) values
    ('${id(700)}', '${WOLVES}', '${OUTSIDER}'), ('${id(701)}', '${WOLVES}', '${OTHER_SCHOOL_KID}')`);
  let r = (await as(OFFICER, `select * from public.rpc_clan_join_request_decide($1, 'approve')`, [id(700)])).rows[0];
  assert.equal(r.success, true);
  r = (await as(OFFICER, `select * from public.rpc_clan_join_request_decide($1, 'approve')`, [id(701)])).rows[0];
  assert.equal(r.success, false);
  assert.match(r.error_message, /not in your school/);
  assert.equal((await one(`select member_count from public.clans where id = $1`, [WOLVES])).member_count, 4);
});

test('A: notice edits go through the server and are filtered', async () => {
  const r = (await as(OFFICER, `select public.rpc_update_clan_notice('Welcome, no cheater talk') as n`)).rows[0];
  assert.equal(r.n, 'Welcome, no ▮▮▮ talk');
  await assert.rejects(as(MEMBER, `select public.rpc_update_clan_notice('mine now')`), /leader or an officer/);
});

test('A: one clan per student', async () => {
  await assert.rejects(
    db.query(`insert into public.clan_members(clan_id, user_id, role) select id, '${MEMBER}', 'member' from public.clans where name = 'Eagles'`),
    /clan_members_one_clan_per_user/,
  );
});

test('A is additive: the current app\'s direct writes still work before step B', async () => {
  await as(RICH, `update public.users set coins = coins - 1 where id = $1`, [RICH]);
  await as(RICH, `insert into public.inventory(user_id, item_id, name, kind) values ($1, 'item_shield', 'Shield', 'shield')`, [RICH]);
  await as(MEMBER, `insert into public.clan_chat(clan_id, user_id, username, message) values ($1, $2, 'Bek', 'old app')`, [WOLVES, MEMBER]);
});

// ───────────── step B: lockdown ─────────────

test('B: lockdown applies cleanly', async () => {
  await db.exec(readFileSync('supabase/migrations/20261029180000_economy_and_clan_lockdown.sql', 'utf8'));
});

test('B: students can no longer edit coins, gems or AP directly', async () => {
  for (const sql of [
    'update public.users set coins = 999999 where id = $1',
    'update public.users set gemstones = 999 where id = $1',
    'update public.users set ap_now = 99 where id = $1',
    'update public.users set last_ap_update = now() - interval \'10 days\' where id = $1',
  ]) {
    await assert.rejects(as(RICH, sql, [RICH]), /can only be changed by the server/, sql);
  }
  await as(RICH, `update public.users set bio = 'still fine' where id = $1`, [RICH]);
});

test('B: no free or tampered inventory items; switching a cosmetic off still works', async () => {
  await assert.rejects(
    as(RICH, `insert into public.inventory(user_id, item_id, name, kind, attack_bonus) values ($1, 'x', 'x', 'exploit_kit', 9999)`, [RICH]),
    /permission denied|only be added by the server|row-level security/,
  );
  const item = await one(`select id from public.inventory where user_id = $1 and item_id = 'item_exploit_kit' limit 1`, [RICH]);
  await assert.rejects(as(RICH, `update public.inventory set attack_bonus = 9999 where id = $1`, [item.id]), /only be changed by the server/);
  await assert.rejects(as(RICH, `update public.inventory set state = 'unused' where id = $1`, [item.id]), /only be changed by the server/);
  await db.exec(`update public.inventory set state = 'active' where id = '${item.id}'`);
  await as(RICH, `update public.inventory set state = 'consumed', expires_at = now() where id = $1`, [item.id]);
  // The shop still works through the server.
  const r = (await as(RICH, `select public.rpc_shop_buy('item_shield', 1) as r`)).rows[0].r;
  assert.equal(r.coins_spent, 150);
});

test('B: no self-join, no force-adding, no direct clan creation or vault edits', async () => {
  await assert.rejects(
    as(OTHER_SCHOOL_KID, `insert into public.clan_members(clan_id, user_id, role) values ($1, $2, 'leader')`, [WOLVES, OTHER_SCHOOL_KID]),
    /permission denied|row-level security/,
  );
  await assert.rejects(
    as(LEADER, `insert into public.clan_members(clan_id, user_id, role) values ($1, $2, 'member')`, [WOLVES, OTHER_SCHOOL_KID]),
    /permission denied|row-level security/,
  );
  await assert.rejects(
    as(OTHER_SCHOOL_KID, `insert into public.clans(name, leader_id, vault_coins) values ('Free', $1, 1000000)`, [OTHER_SCHOOL_KID]),
    /permission denied|row-level security/,
  );
  const res = await as(LEADER, `update public.clans set vault_coins = 1000000 where id = $1`, [WOLVES]);
  assert.equal(res.affectedRows ?? 0, 0);
  assert.equal((await one(`select vault_coins from public.clans where id = $1`, [WOLVES])).vault_coins, 0);
  await assert.rejects(as(OTHER_SCHOOL_KID, `select * from public.rpc_join_clan($1)`, [WOLVES]), /permission denied/);
});

test('B: chat only through the server; leaving a clan still works', async () => {
  await assert.rejects(
    as(MEMBER, `insert into public.clan_chat(clan_id, user_id, username, message) values ($1, $2, 'Ms Aida', 'fake teacher')`, [WOLVES, MEMBER]),
    /permission denied|row-level security/,
  );
  await db.exec(`delete from public.clan_chat where user_id = '${OUTSIDER}'`);
  const r = (await as(OUTSIDER, `select * from public.rpc_clan_chat_post('hello team')`)).rows[0];
  assert.equal(r.username, 'Dastan');
  await as(OUTSIDER, `delete from public.clan_members where user_id = $1`, [OUTSIDER]);
  assert.equal((await one(`select member_count from public.clans where id = $1`, [WOLVES])).member_count, 3);
});
