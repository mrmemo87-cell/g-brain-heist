import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Exercises supabase/migrations/20261029200000_feed_integrity_and_moments.sql on a production-shaped
// schema (activities RLS and grants as found in production on 2026-10-29).
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const SCHOOL_A = id(90), SCHOOL_B = id(91);
const AIDAI = id(1), BEK = id(2), CHOLPON = id(3), TEACHER = id(4), OTHER_SCHOOL = id(5);
const WOLVES = id(500);

await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.schools(id uuid primary key);
create table public.users(id uuid primary key, username text, role text not null default 'student', school_id uuid,
  is_banned boolean default false, level int default 1, xp int default 0, coins int default 0);
create table public.activities(id uuid primary key default gen_random_uuid(), kind text, actor_id uuid references public.users(id) on delete cascade,
  actor_username text, target_id uuid, target_username text, data jsonb, reactions jsonb, created_at timestamptz default now(), school_id uuid);
create table public.activity_reactions(id uuid primary key default gen_random_uuid(), activity_id uuid references public.activities(id) on delete cascade,
  user_id uuid, emoji text, created_at timestamptz default now(), unique (activity_id, user_id));
create table public.achievements(id text primary key, name text, icon text);
create table public.user_achievements(id uuid primary key default gen_random_uuid(), user_id uuid, achievement_id text,
  unlocked_at timestamptz, earned_at timestamptz);
create table public.daily_streak_rewards(user_id uuid, reward_date date, streak int, coins_awarded int default 100, created_at timestamptz default now());
create table public.clans(id uuid primary key, name text, vault_coins int default 0);
create table public.clan_members(id uuid primary key default gen_random_uuid(), clan_id uuid, user_id uuid unique, role text default 'member');
create table public.clan_member_coin_contributions(clan_id uuid, user_id uuid, total_deposited int, last_deposit_at timestamptz,
  updated_at timestamptz, primary key (clan_id, user_id));
create table private.pushes(user_id uuid, event_type text, title text, body text, key text unique);

create function public.get_caller_school_id() returns uuid language sql stable security definer as $$
  select school_id from public.users where id = auth.uid() $$;
create function public.set_activity_school_id() returns trigger language plpgsql as $$
begin new.school_id := coalesce(new.school_id, (select school_id from public.users where id = new.actor_id)); return new; end $$;
create trigger trg_set_activity_school_id before insert on public.activities for each row execute function public.set_activity_school_id();
create function public.can_read_activity(p_activity_id uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from public.activities a left join public.users actor on actor.id = a.actor_id
    join public.users me on me.id = auth.uid()
    where a.id = p_activity_id and (a.actor_id = auth.uid() or (me.school_id is not null and actor.school_id = me.school_id))) $$;
create function private.game_push_bucket_key(p_prefix text, p_user_id uuid, p_now timestamptz, p_minutes integer) returns text
  language sql stable as $$ select p_prefix || '-' || p_user_id || '-' || date_trunc('hour', p_now) $$;
create function private.enqueue_game_push(p_user_id uuid, p_event_type text, p_title text, p_body text, p_url text,
  p_idempotency_key text, p_payload jsonb default '{}'::jsonb, p_now timestamptz default now()) returns void
  language sql security definer as $$
  insert into private.pushes values (p_user_id, p_event_type, p_title, p_body, p_idempotency_key) on conflict do nothing $$;
create function public.rpc_clan_deposit_coins(p_amount integer) returns table(new_clan_vault integer, new_user_coins integer)
  language sql security definer as $$ select 0, 0 $$;
create function public.get_school_activity_feed(p_limit integer default 30)
  returns table(id uuid, kind text, actor_id uuid, actor_username text, target_id uuid, target_username text,
                data jsonb, reactions jsonb, created_at timestamptz, school_id uuid, actor_role text)
  language sql security definer as $$ select null::uuid, null, null::uuid, null, null::uuid, null, null::jsonb, null::jsonb, null::timestamptz, null::uuid, null where false $$;

-- Production grants/policies before the migration.
grant usage on schema public, auth to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
alter table public.activities enable row level security;
create policy activities_select on public.activities for select using (school_id = (select public.get_caller_school_id()));
create policy "Users can create activities" on public.activities for insert with check (auth.uid() = actor_id);
create policy activities_insert on public.activities for insert with check (actor_id = auth.uid());
create policy activities_insert_own on public.activities for insert with check (actor_id = auth.uid());
create policy activities_delete on public.activities for delete using (actor_id = auth.uid());
create policy activities_update on public.activities for update using (school_id = (select public.get_caller_school_id()));
alter table public.activity_reactions enable row level security;
create policy "Users can add reactions" on public.activity_reactions for insert with check (auth.uid() = user_id);
create policy "Users can manage own reactions" on public.activity_reactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy activity_reactions_select_visible_activity on public.activity_reactions for select using (public.can_read_activity(activity_id));

insert into public.schools values ('${SCHOOL_A}'), ('${SCHOOL_B}');
insert into public.users(id, username, role, school_id, level, coins) values
  ('${AIDAI}','Aidai','student','${SCHOOL_A}',3,500), ('${BEK}','Bek','student','${SCHOOL_A}',2,0),
  ('${CHOLPON}','Cholpon','student','${SCHOOL_A}',1,0), ('${TEACHER}','Ms Aida','teacher','${SCHOOL_A}',1,0),
  ('${OTHER_SCHOOL}','Gulnara','student','${SCHOOL_B}',1,0);
insert into public.achievements values ('first_win','First Blood','⚔️');
insert into public.clans values ('${WOLVES}','Wolves',0);
insert into public.clan_members(clan_id, user_id, role) values ('${WOLVES}','${AIDAI}','leader');
insert into public.activities(id, kind, actor_id, actor_username, target_username, data) values
  ('${id(800)}','pvp_win','${AIDAI}','Aidai','Bek','{"roll":12}'),
  ('${id(801)}','attack_success','${AIDAI}','Aidai','Bek','{}'),
  ('${id(802)}','shop_purchase','${AIDAI}','Aidai',null,'{}'),
  ('${id(803)}','pvp_loss','${BEK}','Bek','Aidai','{"roll":80}');
`);

const as = async (userId, sql, params = []) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
};
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

test('before: a student can fake activities and edit a classmate\'s post', async () => {
  await as(BEK, `insert into public.activities(kind, actor_id, data) values ('quest_complete', $1, '{}')`, [BEK]);
  const res = await as(BEK, `update public.activities set data = '{"details":"edited"}' where id = $1`, [id(800)]);
  assert.equal(res.affectedRows, 1, 'the hole exists before the fix');
  await db.exec(`delete from public.activities where kind = 'quest_complete'; update public.activities set data = '{"roll":12}' where id = '${id(800)}'`);
});

test('migration applies', async () => {
  await db.exec(readFileSync('supabase/migrations/20261029200000_feed_integrity_and_moments.sql', 'utf8'));
});

test('students can no longer create, edit or delete feed rows or write reactions directly', async () => {
  for (const sql of [
    `insert into public.activities(kind, actor_id, data) values ('pvp_win', '${BEK}', '{}')`,
    `update public.activities set data = '{}' where id = '${id(800)}'`,
    `delete from public.activities where id = '${id(803)}'`,
    `insert into public.activity_reactions(activity_id, user_id, emoji) values ('${id(800)}', '${BEK}', 'idiot')`,
  ]) {
    await assert.rejects(as(BEK, sql), /permission denied|row-level security/, sql);
  }
  assert.equal((await as(BEK, 'select count(*)::int n from public.activities')).rows[0].n, 4, 'reading still works');
});

test('the feed shows real moments only (no 🤔 duplicates, purchases or deposits)', async () => {
  const kinds = (await as(BEK, 'select kind from public.get_school_activity_feed(30)')).rows.map(r => r.kind).sort();
  assert.deepEqual(kinds, ['pvp_loss', 'pvp_win']);
});

test('the server posts level-ups, achievements, streak milestones and clan joins', async () => {
  await db.exec(`update public.users set level = 4 where id = '${AIDAI}'`);
  await db.exec(`update public.users set level = 5 where id = '${TEACHER}'`);
  await db.exec(`insert into public.user_achievements(user_id, achievement_id, earned_at) values ('${BEK}', 'first_win', now())`);
  await db.exec(`insert into public.daily_streak_rewards(user_id, reward_date, streak) values ('${CHOLPON}', current_date, 5), ('${BEK}', current_date, 4)`);
  await db.exec(`insert into public.clan_members(clan_id, user_id, role) values ('${WOLVES}', '${CHOLPON}', 'member')`);

  const rows = (await as(BEK, 'select kind, actor_username, data from public.get_school_activity_feed(30)')).rows;
  const by = (kind) => rows.filter(r => r.kind === kind);
  assert.equal(by('level_up').length, 1, 'teacher level-ups are not posted');
  assert.equal(by('level_up')[0].data.details, 'Level 4');
  assert.equal(by('achievement_earned')[0].data.achievement_name, 'First Blood');
  assert.equal(by('streak_milestone').length, 1, 'only milestone streaks are posted');
  assert.equal(by('streak_milestone')[0].actor_username, 'Cholpon');
  assert.equal(by('clan_joined')[0].data.details, 'Wolves');
});

test('reactions: toggle, one per student, validated emoji, own school only', async () => {
  let r = (await as(BEK, `select public.rpc_react_to_activity($1, '🔥') as r`, [id(800)])).rows[0].r;
  assert.equal(r.added, true);
  r = (await as(BEK, `select public.rpc_react_to_activity($1, '❤️') as r`, [id(800)])).rows[0].r;
  assert.equal(r.emoji, '❤️');
  assert.equal((await one(`select count(*)::int n from public.activity_reactions where activity_id = $1`, [id(800)])).n, 1);
  r = (await as(BEK, `select public.rpc_react_to_activity($1, '❤️') as r`, [id(800)])).rows[0].r;
  assert.equal(r.added, false, 'same emoji toggles off');
  await assert.rejects(as(BEK, `select public.rpc_react_to_activity($1, 'idiot')`, [id(800)]), /Unsupported reaction/);
  await assert.rejects(as(OTHER_SCHOOL, `select public.rpc_react_to_activity($1, '🔥')`, [id(800)]), /Post not found/);
});

test('reaction pushes: the owner hears about positive moments, at most once an hour, never about a loss', async () => {
  await db.exec('delete from private.pushes');
  await as(BEK, `select public.rpc_react_to_activity($1, '🔥')`, [id(800)]);
  await as(CHOLPON, `select public.rpc_react_to_activity($1, '😮')`, [id(800)]);
  const pushes = (await db.query(`select user_id, event_type, title, body from private.pushes`)).rows;
  assert.equal(pushes.length, 1, 'one push per hour per student');
  assert.equal(pushes[0].user_id, AIDAI);
  assert.match(pushes[0].title, /🔥 Bek reacted/);
  assert.match(pushes[0].body, /your win against Bek/);

  await db.exec('delete from private.pushes');
  await as(AIDAI, `select public.rpc_react_to_activity($1, '😂')`, [id(803)]);
  assert.equal((await one('select count(*)::int n from private.pushes')).n, 0, 'no push for reactions to a lost battle');

  const mine = (await db.query(`select id from public.activities where actor_id = $1 and kind = 'level_up'`, [AIDAI])).rows[0];
  await as(AIDAI, `select public.rpc_react_to_activity($1, '🔥')`, [mine.id]);
  assert.equal((await one('select count(*)::int n from private.pushes')).n, 0, 'no push for reacting to yourself');
});

test('a clan deposit records its own feed row on the server', async () => {
  await as(AIDAI, 'select * from public.rpc_clan_deposit_coins(100)');
  const row = await one(`select actor_username, data from public.activities where kind = 'clan_deposit'`);
  assert.equal(row.actor_username, 'Aidai');
  assert.equal(row.data.amount, 100);
  assert.equal((await one(`select coins from public.users where id = $1`, [AIDAI])).coins, 400);
});
