import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = readdirSync('supabase/migrations').find(p => p.endsWith('_ielts_teacher_programme_entry.sql'));
assert.ok(migration, 'The committed teacher entry migration must exist');
const sql = readFileSync(`supabase/migrations/${migration}`, 'utf8');
const baseline = readFileSync('supabase/migrations/20261007130709_ielts_programme_workspace.sql', 'utf8');
const helper = baseline.match(/create function private\.is_ielts_programme_lead[\s\S]*?\$\$;/)[0];
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table schools(id uuid primary key,name text,module_active boolean);
create table users(id uuid primary key,role text,is_banned boolean);
create table school_members(user_id uuid,school_id uuid,status text,role_in_school text);
create table private.ielts_programme_leads(id uuid primary key,school_id uuid,teacher_id uuid,revoked_at timestamptz);
create index ielts_lead_teacher on private.ielts_programme_leads(teacher_id,school_id) where revoked_at is null;
create function school_has_module_access(uuid,text) returns boolean language sql as $$select module_active from public.schools where id=$1$$;
insert into schools values('${id(900)}','School A',true),('${id(901)}','School B',true);
insert into users values('${id(1)}','teacher',false),('${id(2)}','teacher',false),('${id(3)}','student',false),('${id(4)}','teacher',false);
insert into school_members values('${id(1)}','${id(900)}','active','teacher'),('${id(2)}','${id(901)}','active','teacher'),('${id(3)}','${id(900)}','active','teacher'),('${id(4)}','${id(900)}','active','teacher');
insert into private.ielts_programme_leads values('${id(10)}','${id(900)}','${id(1)}',null),('${id(11)}','${id(901)}','${id(2)}',null);
${helper}
${sql}`);
const read = async (actor, role='authenticated') => {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
    await db.exec(`set local role ${role}`);
    return (await db.query('select rpc_ielts_teacher_programme_entry() as value')).rows[0].value;
  } finally { await db.exec('rollback'); }
};
test('allocated teachers receive only their own school link through the authenticated role', async()=>{
  assert.deepEqual(await read(id(1)),{schools:[{id:id(900),name:'School A'}]});
  assert.deepEqual(await read(id(2)),{schools:[{id:id(901),name:'School B'}]});
  assert.deepEqual(await read(id(4)),{schools:[]});
  assert.deepEqual(await read(''),{schools:[]});
});
test('student role cannot inherit lead navigation, and anonymous execution is denied',async()=>{
  await db.exec(`insert into private.ielts_programme_leads values('${id(12)}','${id(900)}','${id(3)}',null)`);
  assert.deepEqual(await read(id(3)),{schools:[]});
  await assert.rejects(read(id(1),'anon'),/permission denied/);
  const grants=(await db.query("select has_function_privilege('anon','rpc_ielts_teacher_programme_entry()','execute') as anon,has_function_privilege('authenticated','rpc_ielts_teacher_programme_entry()','execute') as authenticated")).rows[0];
  assert.deepEqual(grants,{anon:false,authenticated:true});
});
test('ban, inactive membership, wrong membership role, revoked lead and expired module all hide the entry',async()=>{
  for (const [disable,restore] of [
    [`update users set is_banned=true where id='${id(1)}'`,`update users set is_banned=false where id='${id(1)}'`],
    [`update school_members set status='removed' where user_id='${id(1)}'`,`update school_members set status='active' where user_id='${id(1)}'`],
    [`update school_members set role_in_school='student' where user_id='${id(1)}'`,`update school_members set role_in_school='teacher' where user_id='${id(1)}'`],
    [`update private.ielts_programme_leads set revoked_at=now() where id='${id(10)}'`,`update private.ielts_programme_leads set revoked_at=null where id='${id(10)}'`],
    [`update schools set module_active=false where id='${id(900)}'`,`update schools set module_active=true where id='${id(900)}'`],
  ]) { await db.exec(disable); assert.deepEqual(await read(id(1)),{schools:[]}); await db.exec(restore); }
});
test.after(async()=>db.close());
