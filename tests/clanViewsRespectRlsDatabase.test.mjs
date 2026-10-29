import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Exercises supabase/migrations/20261029190000_clan_views_respect_rls.sql: the clan views were
// owner-run (bypassing RLS) and readable by anon. After the fix they follow same-school RLS.
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const A1 = id(1), A2 = id(2), B1 = id(3), SCHOOL_A = id(90), SCHOOL_B = id(91);

await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.users(id uuid primary key, username text, avatar_url text, bio text, level int default 1, xp int default 0,
  pvp_score int default 0, is_banned boolean default false, is_admin boolean default false, school_id uuid);
create table public.clans(id uuid primary key, name text, leader_id uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.clan_members(id uuid primary key default gen_random_uuid(), clan_id uuid, user_id uuid, role text, custom_title text, joined_at timestamptz default now());
create table public.clan_buff_templates(id uuid primary key, code text, name text, description text, effect jsonb, duration_minutes int);
create table public.clan_buffs(id uuid primary key default gen_random_uuid(), clan_id uuid, template_id uuid, activated_by uuid, purchased_at timestamptz default now(), expires_at timestamptz);
create function public.same_school(p_user uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from public.users me join public.users o on o.id = p_user
                 where me.id = auth.uid() and me.school_id is not null and me.school_id = o.school_id) $$;
alter table public.users enable row level security;
create policy u on public.users for select to authenticated using (id = auth.uid() or public.same_school(id));
alter table public.clans enable row level security;
create policy c on public.clans for select to authenticated using (public.same_school(leader_id) or leader_id = auth.uid());
alter table public.clan_members enable row level security;
create policy m on public.clan_members for select to authenticated using (user_id = auth.uid() or public.same_school(user_id));
alter table public.clan_buffs enable row level security;
create policy b on public.clan_buffs for select to authenticated using (clan_id in (select cm.clan_id from public.clan_members cm where cm.user_id = auth.uid()));
alter table public.clan_buff_templates enable row level security;
create policy t on public.clan_buff_templates for select to authenticated using (true);
create view public.clan_member_scores as
  select cm.clan_id, cm.user_id, cm.role, u.username, u.avatar_url, u.bio, u.level, u.xp, u.pvp_score
  from public.clan_members cm join public.users u on u.id = cm.user_id where u.is_banned = false;
create view public.clan_scores as
  select c.id, c.name, count(cm.id) as member_count from public.clans c left join public.clan_members cm on cm.clan_id = c.id group by c.id, c.name;
create view public.clan_active_buffs as
  select cb.id, cb.clan_id, t.code, u.username as activated_by_name from public.clan_buffs cb
  join public.clan_buff_templates t on t.id = cb.template_id left join public.users u on u.id = cb.activated_by;
grant usage on schema public, auth to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
insert into public.users(id, username, bio, school_id) values
  ('${A1}','Aidai','hi','${SCHOOL_A}'), ('${A2}','Bek',null,'${SCHOOL_A}'), ('${B1}','Gulnara','secret bio','${SCHOOL_B}');
insert into public.clans values ('${id(500)}','Wolves','${A1}'), ('${id(501)}','Hawks','${B1}');
insert into public.clan_members(clan_id, user_id, role) values ('${id(500)}','${A1}','leader'), ('${id(500)}','${A2}','member'), ('${id(501)}','${B1}','leader');
insert into public.clan_buff_templates values ('${id(600)}','xp_surge','XP','', '{}', 60);
insert into public.clan_buffs(clan_id, template_id, activated_by) values ('${id(501)}','${id(600)}','${B1}');
`);

const asRole = async (role, userId, sql) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
};

test('before the fix the views leak across schools and to anon', async () => {
  const anon = await asRole('anon', null, 'select count(*)::int n from public.clan_member_scores');
  assert.equal(anon.rows[0].n, 3);
  const studentA = await asRole('authenticated', A1, `select count(*)::int n from public.clan_member_scores where username = 'Gulnara'`);
  assert.equal(studentA.rows[0].n, 1);
});

test('after the fix: anon gets nothing, students see only their own school', async () => {
  await db.exec(readFileSync('supabase/migrations/20261029190000_clan_views_respect_rls.sql', 'utf8'));
  for (const view of ['clan_member_scores', 'clan_scores', 'clan_active_buffs']) {
    await assert.rejects(asRole('anon', null, `select * from public.${view}`), /permission denied/, view);
  }
  const members = await asRole('authenticated', A1, 'select username from public.clan_member_scores order by username');
  assert.deepEqual(members.rows.map(r => r.username), ['Aidai', 'Bek']);
  const clans = await asRole('authenticated', A1, 'select name, member_count::int from public.clan_scores');
  assert.deepEqual(clans.rows, [{ name: 'Wolves', member_count: 2 }]);
  const buffs = await asRole('authenticated', A1, 'select count(*)::int n from public.clan_active_buffs');
  assert.equal(buffs.rows[0].n, 0, 'other school buffs hidden');
  const own = await asRole('authenticated', B1, 'select count(*)::int n from public.clan_active_buffs');
  assert.equal(own.rows[0].n, 1, 'own clan buffs still visible');
  await assert.rejects(asRole('authenticated', A1, `update public.clan_member_scores set bio = 'x'`), /permission denied|cannot update view/);
});
