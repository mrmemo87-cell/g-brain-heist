import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db=new PGlite();
const school="00000000-0000-0000-0000-000000000020",other="00000000-0000-0000-0000-000000000021",
  teacher="00000000-0000-0000-0000-000000000022",student="00000000-0000-0000-0000-000000000023";
await db.exec("create role anon;create role authenticated;create role service_role;create schema private;create schema auth;");
await db.exec("create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
await db.exec("create table public.users(id uuid primary key,is_banned boolean);create table public.schools(id uuid primary key,name text,logo_url text);");
await db.exec("create function public.can_manage_ielts_practice_school(p_school uuid) returns boolean language sql stable as $$select auth.uid()='"+teacher+"'::uuid and p_school='"+school+"'::uuid$$;");
await db.exec("insert into public.users values('"+teacher+"',false),('"+student+"',false);insert into public.schools values('"+school+"','Silk Road',null),('"+other+"','Another school',null);");
await db.exec(readFileSync("supabase/migrations/20261016083435_ielts_lesson_two_teacher_delivery.sql","utf8"));
await db.query("insert into private.ielts_teacher_lesson_two_content (school_id,lesson_code,version,source_blob_sha1,source,authorization_basis,released_at) values ($1,'IELTS-02','1.0.0',$2,$3::jsonb,'Owner approval',now())",[
 school,"a".repeat(40),JSON.stringify({code:"IELTS-02",version:"1.0.0",stages:[{start:0}],reading:{items:[{statement:"Public",answer:"PRIVATE ANSWER"}]},followup:{items:[{answer:"PRIVATE FOLLOWUP"}]}})
]);
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
test("Silk Road teacher retrieves exact private content, other roles/schools are denied",async()=>{
 await actor(teacher);
 const r=(await db.query("select public.rpc_ielts_teacher_lesson_two($1) as j",[school])).rows[0].j;
 assert.equal(r.school.name,"Silk Road");
 assert.equal(r.release,"teacher_only");
 assert.equal(r.content.reading.items[0].answer,"PRIVATE ANSWER");
 await assert.rejects(db.query("select public.rpc_ielts_teacher_lesson_two($1)",[other]),/not_authorized/);
 await actor(student);
 await assert.rejects(db.query("select public.rpc_ielts_teacher_lesson_two($1)",[school]),/not_authorized/);
 await actor("");
 await assert.rejects(db.query("select public.rpc_ielts_teacher_lesson_two($1)",[school]),/not_authorized/);
 await actor(teacher);
 await db.exec("update public.users set is_banned=true where id='"+teacher+"'");
 await assert.rejects(db.query("select public.rpc_ielts_teacher_lesson_two($1)",[school]),/not_authorized/);
 assert.equal((await db.query("select has_function_privilege('anon','public.rpc_ielts_teacher_lesson_two(uuid)','EXECUTE') as ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_table_privilege('authenticated','private.ielts_teacher_lesson_two_content','SELECT') as ok")).rows[0].ok,false);
});
test.after(async()=>db.close());
