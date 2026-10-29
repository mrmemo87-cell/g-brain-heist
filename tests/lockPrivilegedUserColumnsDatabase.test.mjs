import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Exercises supabase/migrations/20261029160000_lock_privileged_user_columns.sql against a copy of
// the production shape: full UPDATE grants for authenticated, "own row" RLS, and the role/is_admin sync.
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const STUDENT = id(1), OWNER = id(2), NEWBIE = id(3), OTHER = id(4);

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.superadmins(user_id uuid primary key);
create table public.users(
  id uuid primary key, email text, created_at timestamptz default now(), updated_at timestamptz,
  username text, avatar_url text, bio text, full_name text, grade int, batch text, school text,
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
create function public.sync_users_role_is_admin() returns trigger language plpgsql as $$
begin
  if new.role is null then new.role := case when coalesce(new.is_admin,false) then 'admin' else 'student' end; end if;
  new.is_admin := (new.role = 'admin'); return new;
end $$;
create trigger trg_sync_users_role_is_admin before insert or update of role, is_admin on public.users
  for each row execute function public.sync_users_role_is_admin();
alter table public.users enable row level security;
grant usage on schema public, auth to anon, authenticated;
grant select on public.superadmins to authenticated;
grant select, insert, update on public.users to anon, authenticated;
create policy users_select on public.users for select to authenticated using (true);
create policy users_insert on public.users for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own data" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
-- A server RPC (owned by postgres) that legitimately changes privileged columns.
create function public.rpc_award_pvp_point() returns void language sql security definer set search_path = public as $$
  update public.users set pvp_score = pvp_score + 1, last_attacked_at = now() where id = auth.uid() $$;
create function public.rpc_make_teacher(p_user uuid) returns void language sql security definer set search_path = public as $$
  update public.users set role = 'teacher' where id = p_user $$;
grant execute on function public.rpc_award_pvp_point() to authenticated;
grant execute on function public.rpc_make_teacher(uuid) to authenticated;
insert into public.users(id, username, coins) values ('${STUDENT}','Aidai',50), ('${OWNER}','Owner',0), ('${OTHER}','Bek',0);
insert into public.superadmins values ('${OWNER}');
`);
await db.exec(readFileSync('supabase/migrations/20261029160000_lock_privileged_user_columns.sql', 'utf8'));

const as = async (userId, sql, params = []) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
};
const row = async (userId) => (await db.query('select * from public.users where id = $1', [userId])).rows[0];
const denied = /can only be changed by the server|must start as a standard student/;

test('a student cannot make themselves admin, teacher, unbanned or premium', async () => {
  for (const [col, value] of [
    ['role', "'admin'"], ['role', "'teacher'"], ['is_admin', 'true'], ['is_banned', 'false'],
    ['banned_until', 'null'], ['account_tier', "'premium'"],
  ]) {
    await db.exec(`update public.users set is_banned = true, banned_until = now() + interval '1 day' where id = '${STUDENT}'`);
    await assert.rejects(as(STUDENT, `update public.users set ${col} = ${value} where id = $1`, [STUDENT]), denied, col);
    await db.exec(`update public.users set is_banned = false, banned_until = null where id = '${STUDENT}'`);
  }
  const r = await row(STUDENT);
  assert.equal(r.role, 'student');
  assert.equal(r.is_admin, false);
});

test('a student cannot inflate game stats or reset their PvP cooldown', async () => {
  await db.exec(`update public.users set last_attacked_at = now() where id = '${STUDENT}'`);
  for (const sql of [
    'update public.users set attack_power = 999 where id = $1',
    'update public.users set defense_power = 999 where id = $1',
    'update public.users set ap_max = 999 where id = $1',
    'update public.users set pvp_score = 999 where id = $1',
    'update public.users set streak = 365 where id = $1',
    'update public.users set last_attacked_at = null where id = $1',
    'update public.users set coins_from_pvp = 1 where id = $1',
  ]) {
    await assert.rejects(as(STUDENT, sql, [STUDENT]), denied, sql);
  }
});

test('normal profile edits from the app still work', async () => {
  await as(STUDENT, `update public.users set username = 'Aidai_2', avatar_url = 'a.png', bio = 'hi',
    active_cosmetic_frame = 'neon', tutorial_completed = true, needs_setup = false, last_seen = now(),
    grade = 7, batch = '7A', brains_master_show_badge = true where id = $1`, [STUDENT]);
  const r = await row(STUDENT);
  assert.equal(r.username, 'Aidai_2');
  assert.equal(r.active_cosmetic_frame, 'neon');
});

test('step-2 columns (coins, gems, AP) are still writable so the shop and clan flows keep working', async () => {
  await as(STUDENT, 'update public.users set coins = 40, gemstones = 1, ap_now = 19, last_ap_update = now() where id = $1', [STUDENT]);
  assert.equal((await row(STUDENT)).coins, 40);
});

test('server RPCs (security definer) can still change privileged columns', async () => {
  await as(STUDENT, 'select public.rpc_award_pvp_point()');
  assert.equal((await row(STUDENT)).pvp_score, 1);
  await as(STUDENT, 'select public.rpc_make_teacher($1)', [OTHER]);
  assert.equal((await row(OTHER)).role, 'teacher');
  await db.exec(`update public.users set role = 'student' where id = '${OTHER}'`); // as postgres: allowed
});

test('the platform owner (superadmins) can still edit directly', async () => {
  await as(OWNER, 'update public.users set admin_visible = false where id = $1', [OWNER]);
  assert.equal((await row(OWNER)).admin_visible, false);
});

test('new profiles must start as a plain student', async () => {
  await assert.rejects(
    as(NEWBIE, `insert into public.users(id, username, role) values ($1, 'x', 'admin')`, [NEWBIE]), denied);
  await assert.rejects(
    as(NEWBIE, `insert into public.users(id, username, coins) values ($1, 'x', 999999)`, [NEWBIE]), denied);
  await as(NEWBIE, `insert into public.users(id, email, username, role, grade, batch, needs_setup, avatar_url)
    values ($1, 'n@x.kg', 'newbie', 'student', null, 'N/A', true, 'a.png')`, [NEWBIE]);
  assert.equal((await row(NEWBIE)).role, 'student');
});
