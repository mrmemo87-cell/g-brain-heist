// Isolated PostgreSQL verification. Never connects to a project database.
const { PGlite } = require(
    process.env.COMMANDER_PGLITE_MODULE || "@electric-sql/pglite",
  ),
  fs = require("fs"),
  assert = require("assert/strict");
(async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.users(id uuid primary key,role text,is_banned boolean,banned_until timestamptz);create table public.reward_event_receipts(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text,event_id text,created_at timestamptz default now());`,
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20260913073842_commander_headquarters_pilot.sql",
      "utf8",
    ),
  );
  const u = "10000000-0000-0000-0000-000000000001",
    other = "10000000-0000-0000-0000-000000000002";
  await db.exec(
    `insert into users values('${u}','student',false,null),('${other}','student',false,null);set request.jwt.claim.sub='${u}';set request.jwt.claim.role='authenticated';set role authenticated;`,
  );
  const hq = async () =>
    (await db.query("select public.rpc_commander_headquarters() h")).rows[0].h;
  const cmd = async (op, target, version, id = crypto.randomUUID()) =>
    (
      await db.query("select public.rpc_commander_command($1,$2,$3,$4) h", [
        id,
        op,
        target,
        version,
      ])
    ).rows[0].h;
  const rejects = async (fn, pattern) => assert.rejects(fn, pattern);
  // Model the actual shared owner-insert policy. A forged true marker must be stripped.
  await db.exec(`reset role;grant usage on schema auth to authenticated;grant insert,select on public.reward_event_receipts to authenticated;alter table public.reward_event_receipts enable row level security;create policy receipt_owner on public.reward_event_receipts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());set role authenticated;`);
  assert.equal((await hq()).profile, null);
  const request = crypto.randomUUID();
  let x = await cmd("enroll", null, null, request);
  assert.equal(x.profile.coins, 150);
  await db.exec(`insert into public.reward_event_receipts(user_id,event_type,event_id,commander_server_verified) values('${u}','task_reward_claim','task:task_d1:2026-09-12',true)`);
  assert.equal((await db.query('select commander_server_verified from public.reward_event_receipts')).rows[0].commander_server_verified,false);
  assert.equal((await hq()).profile.coins,150,'client-created receipts must never credit Commander');

  assert.equal(x.owned.length, 4);
  assert.equal((await cmd("enroll", null, null, request)).profile.coins, 150);
  const buy = crypto.randomUUID();
  x = await cmd("buy", "rift_blade", x.profile.version, buy);
  assert.equal(x.profile.coins, 50);
  assert.equal(x.profile.weapon, "void_saber");
  assert.equal((await cmd("buy", "rift_blade", 1, buy)).profile.coins, 50);
  await rejects(() => cmd("buy", "bastion_plate", 1, buy), /request_conflict/);
  await rejects(
    () => cmd("buy", "bastion_plate", x.profile.version),
    /insufficient_coins/,
  );
  await rejects(() => cmd("equip", "rift_blade", 1), /stale_profile/);
  x = await cmd("equip", "rift_blade", x.profile.version);
  assert.equal(x.loadout.bolt, 32);
  assert.equal(x.loadout.hp, 92);
  x = await cmd("train", "force", x.profile.version);
  assert.equal(x.profile.coins, 25);
  assert.equal(x.loadout.bolt, 34);
  await rejects(
    () => db.query("update public.commander_profiles set coins=999999"),
    /permission denied/,
  );
  await rejects(
    () => db.query("select * from public.commander_profiles"),
    /permission denied/,
  );
  await rejects(
    () => db.query("select commander_private.snapshot($1)", [other]),
    /permission denied/,
  );
  await rejects(
    () => db.query("select public.rpc_commander_owned_loadout($1)", [u]),
    /permission denied/,
  );
  await db.exec(
    `reset role;create function public.fixture_claim() returns void language sql security definer set search_path='' as $$insert into public.reward_event_receipts(user_id,event_type,event_id,created_at) values('${u}','task_reward_claim','task:task_d1:2026-09-13',now()+interval '1 second'),('${u}','task_reward_claim','task:task_d2:2026-09-13',now()+interval '1 second')$$;set role authenticated;select public.fixture_claim();`,
  );
  x = await hq();
  assert.equal(x.profile.coins, 225);
  assert.equal(x.profile.xp, 150);
  assert.equal(x.profile.level, 2);
  assert.equal((await hq()).profile.coins, 225);
  await db.exec(
    `reset role;set request.jwt.claim.sub='${other}';set role authenticated`,
  );
  assert.equal((await hq()).profile, null);
  await db.exec(
    `reset role;update users set is_banned=true where id='${u}';set request.jwt.claim.sub='${u}';set role authenticated`,
  );
  await rejects(hq, /students_only/);
  await db.exec(`reset role;set request.jwt.claim.sub='';set role anon`);
  await rejects(hq, /permission denied/);
  console.log(
    "PASS migration, enrollment, purchase idempotency, request conflicts, balance protection, stale versions, equipment, training, reward bridge, isolation, RLS/grants, bans, anonymous denial",
  );
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
