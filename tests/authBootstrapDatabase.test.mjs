import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`
create role anon; create role authenticated; create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table users(id uuid primary key,email text,username text,full_name text,full_name_status text,avatar_url text,
 role text,school_id uuid,needs_setup boolean default false,tutorial_completed boolean default true,is_banned boolean default false,
 banned_until timestamptz,required_changes jsonb,profile_locked boolean,grade text,batch text,level int,xp int,coins int,gemstones int,
 streak int,ap_now int,ap_max int,last_ap_update timestamptz,attack_power int,defense_power int,pvp_score int,last_seen timestamptz,
 is_admin boolean,account_tier text,active_cosmetic_frame text,active_cosmetic_theme text,active_cosmetic_effect text,
 brains_master_until timestamptz,brains_master_show_badge boolean);
create table schools(id uuid primary key,name text,logo_url text);
create table superadmins(user_id uuid primary key);
create table student_guardian_relationships(guardian_user_id uuid,student_id uuid,school_id uuid,status text);
create table school_members(id uuid primary key,user_id uuid,school_id uuid,status text,role_in_school text,is_owner boolean,can_teach boolean,joined_at timestamptz);
create table classes(id uuid primary key,school_id uuid,is_active boolean);
create table class_teacher_assignments(class_id uuid,school_id uuid,teacher_user_id uuid,active boolean);
`);
await db.exec(readFileSync('tests/fixtures/authCapabilityFunctions.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260928163701_auth_bootstrap_v1.sql','utf8'));
await db.exec(`
insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'test@example.com',now() from generate_series(1,10) n;
insert into users(id,username,role,school_id) select id,'test','student','${id(100)}' from auth.users where id<>'${id(8)}';
insert into schools values('${id(100)}','School',null),('${id(101)}','Other',null);
insert into school_members values('${id(200)}','${id(2)}','${id(100)}','active','school_admin',true,true,now());
insert into classes values('${id(300)}','${id(100)}',true);
insert into class_teacher_assignments values('${id(300)}','${id(100)}','${id(2)}',true);
insert into student_guardian_relationships values('${id(3)}','${id(1)}','${id(100)}','active');
insert into superadmins values('${id(4)}');
update users set is_banned=true where id='${id(5)}'; update auth.users set email_confirmed_at=null where id='${id(6)}';
update users set needs_setup=true where id='${id(7)}';
`);
const actor=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
const boot=async user=>{await actor(user);return(await db.query('select rpc_auth_bootstrap_v1() b')).rows[0].b};
test('bootstrap SQL: identity, capabilities, guardian, superadmin, bans, verification and setup',async()=>{
 const s=await boot(id(1));assert.equal(s.profile.id,id(1));assert.equal(s.school.name,'School');assert.equal(s.capabilities,null);assert.equal(s.is_superadmin,false);
 const h=await boot(id(2));assert.equal(h.capabilities.is_owner,true);assert.equal(h.capabilities.can_administer,true);assert.equal(h.capabilities.has_active_teacher_allocation,true);
 assert.equal((await boot(id(3))).has_parent_workspace,true);assert.equal((await boot(id(4))).is_superadmin,true);
 const banned=await boot(id(5));assert.equal(banned.is_banned,true);assert.equal(banned.profile,null);assert.equal(banned.capabilities,null);
 const unverified=await boot(id(6));assert.equal(unverified.email_verified,false);assert.equal(unverified.capabilities,null);
 assert.equal((await boot(id(7))).needs_setup,true);const missing=await boot(id(8));assert.equal(missing.needs_setup,true);assert.equal(missing.profile,null);
 await assert.rejects(boot(id(999)),/ACCOUNT_NOT_FOUND/);await assert.rejects(boot(''),/NOT_AUTHENTICATED/);
});
test('bootstrap SQL: revoked allocations and cross-school guardian links never remain cached',async()=>{
 await db.exec(`update classes set is_active=false where id='${id(300)}'`);assert.equal((await boot(id(2))).capabilities.has_active_teacher_allocation,false);
 await db.exec(`update school_members set status='removed' where user_id='${id(2)}'`);assert.equal((await boot(id(2))).capabilities,null);
 await db.exec(`update users set school_id='${id(101)}' where id='${id(1)}'`);assert.equal((await boot(id(3))).has_parent_workspace,false);
 await db.exec(`update users set school_id='${id(100)}' where id='${id(1)}';update student_guardian_relationships set status='revoked'`);assert.equal((await boot(id(3))).has_parent_workspace,false);
});
test('bootstrap SQL: anon denied, authenticated caller is self-bound',async()=>{
 for(const name of ['public.rpc_auth_bootstrap_v1()','private.auth_bootstrap_v1()'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) a',['anon',name,'execute'])).rows[0].a,false);
 await actor(id(1));await db.exec('set role authenticated');
 try{assert.equal((await db.query('select rpc_auth_bootstrap_v1() b')).rows[0].b.profile.id,id(1))}finally{await db.exec('reset role')}
 await assert.rejects(db.query('select rpc_auth_bootstrap_v1($1)',[id(2)]),/does not exist/);
});
test.after(()=>db.close());
