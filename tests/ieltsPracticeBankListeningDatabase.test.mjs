import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {validateBank,KNOWN_CONSTRUCTS} from '../scripts/ielts/practice-bank-contract.mjs';
// Diagnostic Bible 2.0.0 sections 6.1, 15E.2 and 15E.2A: Listening sets in practice-bank batches can only be approved by an
// administrator who played each exact recording to the end. Real installer and review migrations; originality services stubbed.
const admin='00000000-0000-0000-0000-000000000005',other='00000000-0000-0000-0000-000000000006',teacher='00000000-0000-0000-0000-000000000001';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,role text,is_banned boolean,full_name text,username text);
insert into public.users values('${admin}','admin',false,'Admin','admin'),('${other}','superadmin',false,'Other','other'),('${teacher}','teacher',false,'T','t');
create table public.academic_skill_registry_versions(id uuid primary key default gen_random_uuid(),code text unique,subject_key text,title text,description text,authority_model text,status text,effective_from date,created_at timestamptz default now());
create table public.academic_skill_registry_nodes(id uuid primary key default gen_random_uuid(),registry_version_id uuid,parent_id uuid,node_type text,code text unique,name text,description text,applicable_phases text[],status text default 'active',created_at timestamptz default now(),updated_at timestamptz default now());
create table private.ielts_reviewed_practice(material_type text,material_id text,content jsonb,release_ready boolean);
create table private.ielts_learning_tasks(code text primary key,questions jsonb);
create table public.ielts_reading_sets(id bigserial primary key,slug text unique,title text,description text,level text,duration_minutes int,passage_text text,is_active boolean,required_tier text);
create table public.ielts_reading_questions(id bigserial primary key,set_id bigint,question_order int,question_type text,body text,options jsonb,correct_answer jsonb,explanation text);
create table public.ielts_listening_sets(id bigserial primary key,slug text unique,title text,description text,level text,duration_minutes int,audio_url text not null,is_active boolean,required_tier text,instructions text,section_label text,question_range_label text);
create table public.ielts_listening_questions(id bigserial primary key,set_id bigint,question_order int,question_type text,body text,options jsonb,correct_answer jsonb not null,explanation text);
create table private.ielts_material_transcripts(material_id text primary key,transcript text not null);
create table public.ielts_writing_tasks(id bigserial primary key,slug text unique,task_type text,title text,prompt text,is_active boolean,required_tier text);
create table public.ielts_speaking_tasks(id bigserial primary key,slug text unique,part int,prompt text,follow_ups jsonb,is_active boolean,required_tier text);
create table private.reviews(material_type text,material_id text,rationale text,reviewer uuid,recording_checked boolean);
create function private.ielts_material_code(t text,i text) returns text language sql as $$select upper(left(replace(t,'ielts_',''),1))||'-'||i$$;
create function private.ielts_originality_payload(t text,i text) returns jsonb language sql as $$select jsonb_build_object('content_hash',md5(t||i||coalesce((select audio_url from public.ielts_listening_sets where id::text=i and t='ielts_listening_set'),'')))$$;
create function private.ielts_originality_matches(t text,i text) returns jsonb language sql as $$select '[]'::jsonb$$;
create function private.ielts_originality_hash(p text) returns text language sql as $$select md5(p)$$;
create function public.rpc_ielts_material_originality_review(t text,i text,h text,mh text,d text,pt text,pi text,ph text,r text,c boolean,rc boolean,pub boolean) returns jsonb language plpgsql as $$
begin if t='ielts_listening_set' and rc is distinct from true then raise exception 'Listen to the actual recording'; end if;
insert into private.reviews values(t,i,r,auth.uid(),rc);execute format('update public.%I set is_active=true where id::text=$1',t||'s') using i;return '{}';end$$;`);
await db.query("insert into public.academic_skill_registry_nodes(node_type,code,name,description,applicable_phases) select 'subskill',c,c,c,array['upper_secondary'] from unnest($1::text[]) c",[[...KNOWN_CONSTRUCTS]]);
for(const f of ['20261019060000_ielts_practice_construct_mapping.sql','20261019110000_ielts_practice_bank_review.sql','20261019110050_ielts_practice_bank_installer.sql','20261019130000_ielts_practice_bank_listening.sql','20261019130100_ielts_practice_bank_batch_02.sql','20261019140000_ielts_listen_one_at_a_time.sql'])
 await db.exec(readFileSync('supabase/migrations/'+f,'utf8').replace(/insert into private\.ielts_material_construct_maps\(batch_id,material_type,material_id,item_key,node_id,role,rationale\)\nselect b\.id, x\.t[\s\S]*?x\.c;/,'select 1;').replace(/do \$\$ begin\n if \(select count\(\*\) from private\.ielts_material_construct_maps m join[\s\S]*?end \$\$;/,''));
const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
const one=async(sql,p=[])=>(await db.query(sql,p)).rows[0];
const queue=async()=>(await one('select public.rpc_ielts_practice_content_queue() j')).j[0];
const NOTES='Played every recording in full and checked keys against the transcript.';

test('the contract rejects a Listening set whose evidence is not in the transcript or which claims it was already heard',()=>{
 const bank=JSON.parse(readFileSync('docs/ielts/practice-bank/batch-02.json','utf8'));
 assert.deepEqual(validateBank(bank,{constructs:KNOWN_CONSTRUCTS}),[]);
 const bad=structuredClone(bank);bad.listening[0].questions[0].evidence='Words the speaker never says.';bad.listening[1].recording.human_listening='approved';
 const e=validateBank(bad,{constructs:KNOWN_CONSTRUCTS});
 assert.ok(e.some(x=>/lb01\.q1: evidence must be quoted/.test(x)));assert.ok(e.some(x=>/lb02: a new batch cannot claim/.test(x)));
});
test('batch 02 installs six unavailable Listening sets with recordings, private transcripts and mappings',async()=>{
 const r=await one(`select (select count(*)::int from public.ielts_listening_sets where not is_active and audio_url like 'https://%/ielts-audio/practice-bank-02/%') sets,
  (select count(*)::int from public.ielts_listening_questions) q,(select count(*)::int from private.ielts_material_transcripts) tr,
  (select count(*)::int from private.ielts_listening_recordings) rec,(select count(*)::int from private.ielts_content_batch_items) items,
  (select title from private.ielts_content_review_batches where kind='practice_content') title`);
 assert.deepEqual(r,{sets:6,q:36,tr:6,rec:6,items:6,title:'practice-bank-02: 6 Listening sets with recordings'});
 assert.match((await one("select transcript from private.ielts_material_transcripts limit 1")).transcript,/^RECEPTIONIST: Good morning/);
 assert.deepEqual((await one("select correct_answer from public.ielts_listening_questions where question_type='multiple_choice' limit 1")).correct_answer.length,1);
 assert.ok((await one("select count(*)::int n from private.ielts_material_construct_maps where material_type='ielts_listening_set' and role='primary'")).n===36);
});
test('approval needs the deciding administrator to have played each recording to the end',async()=>{
 await as(teacher);await assert.rejects(db.query("select public.rpc_ielts_practice_content_listened(gen_random_uuid(),'x','y',1)"),/forbidden/);
 await as(admin);const b=await queue();
 assert.equal(b.items.length,6);const it=b.items[0];
 assert.equal(it.heard_by_me,false);assert.ok(it.preview.audio_url&&it.preview.transcript&&it.preview.duration_seconds>60&&it.preview.recording_matches);
 const refs=b.items.map(i=>i.ref);
 await assert.rejects(db.query("select public.rpc_ielts_practice_content_decide($1,$2,'approved',$3,'{}',$4)",[b.id,b.sha256,refs,NOTES]),/recording_not_heard/);
 const listen=(i,url,secs)=>db.query('select public.rpc_ielts_practice_content_listened($1,$2,$3,$4) j',[b.id,i.ref,url,secs]);
 await assert.rejects(listen(it,it.preview.audio_url,10),/recording_not_finished/);
 await assert.rejects(listen(it,'https://x/storage/v1/object/public/ielts-audio/other.mp3',999),/recording_changed/);
 await assert.rejects(db.query("select public.rpc_ielts_practice_content_listened($1,'ielts_reading_set:1','u',999)",[b.id]),/not_a_listening_item/);
 // Two recordings played at the same time: the second check is refused.
 await listen(b.items[0],b.items[0].preview.audio_url,b.items[0].preview.duration_seconds);
 await assert.rejects(listen(b.items[1],b.items[1].preview.audio_url,b.items[1].preview.duration_seconds),/recordings_overlap/);
 const later=()=>db.exec("update private.ielts_content_listen_checks set checked_at=checked_at-interval '1 hour'");
 for(const i of b.items.slice(1)){await later();await listen(i,i.preview.audio_url,i.preview.duration_seconds);}
 // Another administrator's listening does not count for this reviewer, and every Listening set must be in the sample.
 await as(other);await assert.rejects(db.query("select public.rpc_ielts_practice_content_decide($1,$2,'approved',$3,'{}',$4)",[b.id,b.sha256,refs,NOTES]),/recording_not_heard/);
 await as(admin);assert.equal((await queue()).items.every(i=>i.heard_by_me),true);
 await assert.rejects(db.query("select public.rpc_ielts_practice_content_decide($1,$2,'approved',$3,'{}',$4)",[b.id,b.sha256,refs.slice(0,5),NOTES]),/recording_not_heard/);
 const res=(await one("select public.rpc_ielts_practice_content_decide($1,$2,'approved',$3,$4,$5) j",[b.id,b.sha256,refs.slice(0,5),[refs[5]],NOTES])).j;
 assert.equal(res.approved,5);
 const s=await one(`select (select count(*)::int from private.reviews where recording_checked and reviewer='${admin}') checked,(select count(*)::int from public.ielts_listening_sets where is_active) active`);
 assert.deepEqual(s,{checked:5,active:5});
 assert.match((await one('select rationale from private.reviews limit 1')).rationale,/recording played in full by the reviewer/);
 await assert.rejects(listen(it,it.preview.audio_url,999),/batch_already_decided/);
});
