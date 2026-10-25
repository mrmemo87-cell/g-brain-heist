import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(p=>p.endsWith('_shared_question_learning_catalogue.sql')),'utf8');
const id=n=>'70000000-0000-0000-0000-'+String(n).padStart(12,'0');
const db=new PGlite();
await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;`);
await db.exec(readFileSync('tests/fixtures/questionLearningCatalogueSchema.sql','utf8'));
await db.exec(`create function public.academic_resolve_operational_year_id(uuid,timestamptz) returns uuid language sql stable as $$select '${id(100)}'::uuid$$;
create function public.rpc_question_curriculum_metadata(uuid[]) returns jsonb language sql stable as $$select '[]'::jsonb$$;
create function private.academic_registry_subject_matches(uuid,text) returns boolean language sql stable as $$select exists(select 1 from public.academic_skill_registry_versions v where v.id=$1 and v.status='published' and (v.subject_key=lower($2) or exists(select 1 from public.academic_skill_registry_subject_aliases a where a.registry_version_id=v.id and a.alias_normalized=lower($2) and a.status='active')))$$;
create function private.question_browse_subject_key(text) returns text language sql immutable as $$select lower(trim($1))$$;
create function private.question_browse_matches_search(public.questions,text) returns boolean language sql stable as $$select $1.question_text ilike '%'||$2||'%'$$;
insert into academic_subjects(id,code,name,is_active) values('${id(10)}','english','English',true);
insert into academic_skill_registry_versions(id,subject_key,status) values('${id(20)}','english','published');
insert into academic_skill_registry_nodes(id,registry_version_id,node_type,status,parent_id) values('${id(21)}','${id(20)}','skill','active',null),('${id(22)}','${id(20)}','subskill','active','${id(21)}');
insert into academic_skill_evidence_focuses(id,registry_version_id,atomic_subskill_node_id,status) values('${id(23)}','${id(20)}','${id(22)}','active');
insert into curriculum_framework_versions(id,status,content_hash) values('${id(30)}','published','versionhash');
`);
for(const n of [1,2]) await db.exec(`
insert into users(id,username,school_id) values('${id(n)}','Teacher ${n}','${id(n+1000)}');
insert into teachers(id,user_id) values('${id(n+10)}','${id(n)}');
insert into school_members(id,user_id,school_id,status,joined_at) values('${id(n+50)}','${id(n)}','${id(n+1000)}','active',now());
insert into school_subjects(id,school_id,name,is_active,academic_subject_id) values('${id(n+60)}','${id(n+1000)}','English',true,'${id(10)}');
insert into school_subject_offerings(id,school_id,school_subject_id,academic_year_id,grade_level,curriculum_scope_id,status) values('${id(n+70)}','${id(n+1000)}','${id(n+60)}','${id(100)}','7','${id(31)}','active');
insert into school_subject_groups(id,school_id,school_subject_offering_id,status) values('${id(n+80)}','${id(n+1000)}','${id(n+70)}','active');
insert into school_subject_group_teachers(id,teacher_user_id,school_id,group_id,active) values('${id(n+90)}','${id(n)}','${id(n+1000)}','${id(n+80)}',true);
`);
for(let n=1;n<=10;n++) {
 const pool=n===3||n===4?'school':n===5||n===6?'teacher':'global';
 const owner=n===3?id(1001):n===4?id(1002):null;
 await db.query(`insert into questions(id,teacher_id,academic_subject_id,subject,topic,question_text,question_type,difficulty,points,created_at,current_content_hash,verified_content_hash,is_active,verification_status,analytics_eligible,pool_scope,content_origin,owner_school_id,is_public,eligible_grade_levels)
 values($1,$2,$3,'English','Questions','Does he play?','multiple_choice','easy',10,now(),$4,'hash',true,$5,$6,$7,$8,$9,$10,$11)`,[id(200+n),id(n===6?12:11),id(10),n===8?'edited':'hash',n===10?'in_review':'verified',pool!=='teacher',pool,pool==='global'?'brain_heist':'teacher',owner,pool==='global',[n===7?8:7]]);
 if(n!==2) await db.query(`insert into verified_question_registry_taxonomy(question_id,question_content_hash,review_status,human_review_required,registry_version_id,primary_skill_node_id,atomic_subskill_node_id,evidence_focus_id) values($1,'hash','approved',false,$2,$3,$4,$5)`,[id(200+n),id(20),id(21),id(22),id(23)]);
}
await db.exec(`insert into curriculum_assessment_items(id,source_type,source_record_id,source_item_key,is_active,content_hash) values('${id(40)}','question_bank','${id(202)}','question',true,'hash');
insert into curriculum_item_objective_mappings(id,assessment_item_id,curriculum_scope_id,framework_version_id,academic_subject_id,status,mapping_role,item_content_hash,curriculum_version_content_hash) values('${id(41)}','${id(40)}','${id(31)}','${id(30)}','${id(10)}','approved','primary','hash','versionhash');`);
await db.exec(`update questions set is_active=false where id='${id(209)}'`);
await db.exec(migration);
await db.exec(`create table public.assignments(id uuid primary key,publish_status text);create table public.assignment_questions(assignment_id uuid,question_id uuid);`);
const holdMigration=readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(p=>p.endsWith('_hold_context_incomplete_question_selection.sql')),'utf8');
// Source-specific seed is exercised in a live rollback; local fixtures use synthetic content hashes.
await db.exec(holdMigration.replace(/do \$seed\$[\s\S]*?end;\$seed\$;/,''));
const actor=n=>db.query("select set_config('test.actor',$1,false)",[n?id(n):'']);
const page=async(filters={})=>(await db.query('select rpc_teacher_question_browser($1) result',[{metadata:false,...filters}])).rows[0].result;
const facets=async()=>(await db.query('select rpc_teacher_question_facets(null,null) result')).rows[0].result;
const ids=r=>r.questions.map(q=>q.id).sort();
const refresh=()=>db.query('select private.refresh_question_learning_catalogue()');

test('shared catalogue preserves global/school/teacher pools, grades, content hashes, facets and paging across schools',async()=>{
 await actor(1);assert.deepEqual(ids(await page()),[201,202,203,205].map(id));
 assert.equal((await facets()).reduce((sum,f)=>sum+f.count,0),4);
 const first=await page({limit:2});assert.equal(first.hasMore,true);const second=await page({limit:2,cursor:first.nextCursor});assert.equal(second.hasMore,false);
 assert.deepEqual([...ids(first),...ids(second)].sort(),ids(await page()));
 assert.equal((await page({pool:'school'})).questions.length,1);
 assert.equal((await page({search:'not present'})).questions.length,0);
 assert.equal((await page({difficulty:'hard'})).questions.length,0);
 await actor(2);assert.deepEqual(ids(await page()),[201,202,204,206].map(id));
});
test('dirty cache uses authoritative checks immediately; rebuilt results are identical',async()=>{
 await actor(1);const clean=await page();
 await db.exec('update academic_skill_registry_nodes set status=status');
 assert.deepEqual(await page(),clean);await refresh();assert.deepEqual(await page(),clean);
 await db.exec("update academic_skill_evidence_focuses set status='retired'");
 assert.deepEqual(ids(await page()),[202,205].map(id));await refresh();assert.deepEqual(ids(await page()),[202,205].map(id));
 await db.exec("update academic_skill_evidence_focuses set status='active'");await refresh();
});
test('revoking allocations is immediate without a rebuild; own drafts remain private',async()=>{
 await actor(1);await db.exec(`update school_subject_group_teachers set active=false where teacher_user_id='${id(1)}'`);
 assert.deepEqual(ids(await page()),[id(205)]);
 await db.exec(`update school_subject_group_teachers set active=true where teacher_user_id='${id(1)}'`);
 assert.equal((await page()).questions.length,4);
});
test('curriculum approval revocation, stale hashes, subject aliases and school ownership changes cannot leave stale access',async()=>{
 await actor(1);
 for(const [change,restore,expected] of [
 ["update curriculum_item_objective_mappings set status='rejected'","update curriculum_item_objective_mappings set status='approved'",[201,203,205]],
 [`update questions set current_content_hash='edited' where id='${id(201)}'`,`update questions set current_content_hash='hash' where id='${id(201)}'`,[202,203,205]],
 [`update questions set owner_school_id='${id(1002)}' where id='${id(203)}'`,`update questions set owner_school_id='${id(1001)}' where id='${id(203)}'`,[201,202,205]],
 ["update academic_skill_registry_versions set subject_key='different'","update academic_skill_registry_versions set subject_key='english'",[202,205]],
 ]) {await db.exec(change);assert.deepEqual(ids(await page()),expected.map(id),change);await refresh();assert.deepEqual(ids(await page()),expected.map(id),change+' after rebuild');await db.exec(restore);await refresh();}
 await db.exec("update academic_skill_registry_versions set subject_key='different'");
 await db.exec(`insert into academic_skill_registry_subject_aliases(registry_version_id,alias_normalized,status) values('${id(20)}','english','active')`);
 assert.deepEqual(ids(await page()),[201,202,203,205].map(id));await refresh();
 await db.exec("update academic_skill_registry_subject_aliases set status='retired'");assert.deepEqual(ids(await page()),[202,205].map(id));
 await db.exec("delete from academic_skill_registry_subject_aliases;update academic_skill_registry_versions set subject_key='english'");await refresh();
});
test('answer counters do not invalidate or rebuild the shared catalogue',async()=>{
 const before=(await db.query('select * from private.question_learning_catalogue_state')).rows;
 await db.exec('update questions set times_answered=coalesce(times_answered,0)+1,times_correct=coalesce(times_correct,0)+1');
 assert.deepEqual((await db.query('select * from private.question_learning_catalogue_state')).rows,before);
 assert.equal((await refresh()).rows[0].refresh_question_learning_catalogue,0);
});
test('anonymous/nonteacher access and direct access to catalogue storage remain closed',async()=>{
 await actor(null);await assert.rejects(page(),/authentication_required/);await assert.rejects(facets(),/authentication_required/);
 await actor(999);await assert.rejects(page(),/teacher_required/);
 for(const role of ['anon','authenticated','service_role']) for(const table of ['question_learning_catalogue','question_learning_catalogue_state']) assert.equal((await db.query('select has_table_privilege($1,$2,\'SELECT\') allowed',[role,'private.'+table])).rows[0].allowed,false);
 for(const fn of ['private.refresh_question_learning_catalogue()','private.invalidate_question_learning_catalogue()']) assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed",[fn])).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.rpc_teacher_question_browser(jsonb)','execute') allowed")).rows[0].allowed,false);
});
test('English repair preparation is global, partial, draft-only and idempotent; it never adopts courses or rewrites evidence',async()=>{
 await db.exec(`alter table public.academic_skill_evidence_focuses add primary key(id);
 create table public.curriculum_frameworks(id uuid primary key,code text,name text,provider_name text,programme_name text,authority_type text,visibility text);
 create table public.curriculum_framework_subjects(id uuid primary key,framework_version_id uuid,academic_subject_id uuid,code text,name text);
 create table public.curriculum_stages(id uuid primary key,framework_version_id uuid,code text,name text,sequence_number integer);
 create table public.curriculum_scopes(id uuid primary key,framework_version_id uuid,framework_subject_id uuid,stage_id uuid,academic_subject_id uuid,code text,name text,sequence_number integer);
 create table public.curriculum_nodes(id uuid primary key,framework_version_id uuid,curriculum_scope_id uuid,parent_node_id uuid,node_type text,code text,name text,depth integer,sequence_number integer);
 create table public.curriculum_objectives(id uuid primary key,framework_version_id uuid,curriculum_scope_id uuid,curriculum_node_id uuid,code text,statement text,objective_type text,is_assessable boolean,sequence_number integer,source_reference text);
 update public.academic_skill_registry_versions set code='bh-english-core-v1';
 update public.academic_skill_registry_nodes set name='Question formation';
 insert into public.academic_skill_registry_nodes(id,registry_version_id,node_type,status,name) values('${id(24)}','${id(20)}','strand','active','Use of English');
 update public.academic_skill_registry_nodes set parent_id='${id(24)}' where id='${id(21)}';
 update public.academic_skill_evidence_focuses set name='Form present-simple questions using does',code='eng.question-formation.does';`);
 const governance=readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(p=>p.endsWith('_curriculum_objective_precision_governance.sql')),'utf8');
 await db.exec(governance);
 const before=(await db.query('select * from public.school_subject_offerings order by id')).rows;
 const mappings=(await db.query('select * from public.curriculum_item_objective_mappings order by id')).rows;
 const draft=readFileSync('content/english-curriculum-repair/prepare-draft.sql','utf8');
 await db.exec(draft);await db.exec(draft);
 assert.equal((await db.query("select count(*)::int n from public.curriculum_framework_versions where version_code='2026-precision-1' and status='draft'")).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from public.curriculum_scopes where coverage_status='partial'")).rows[0].n,2);
 assert.equal((await db.query("select count(*)::int n from public.curriculum_objectives where registry_evidence_focus_id is not null")).rows[0].n,2);
 assert.deepEqual((await db.query('select * from public.school_subject_offerings order by id')).rows,before);
 assert.deepEqual((await db.query('select * from public.curriculum_item_objective_mappings order by id')).rows,mappings);
});
test.after(async()=>db.close());


test('content-bound holds gate all authoring reads and new assignments while grandfathering published work',async()=>{
 const q=id(201),hash='a'.repeat(64);
 await db.query('update questions set current_content_hash=$1,verified_content_hash=$1 where id=$2',[hash,q]);
 await db.query('update verified_question_registry_taxonomy set question_content_hash=$1 where question_id=$2',[hash,q]);
 await refresh();await actor(1);
 const before=ids(await page());assert.ok(before.includes(q));
 await db.query(`insert into private.question_selection_holds(question_id,question_content_hash,reason,source_reference,created_by_authority) values($1,$2,'missing_reading_context','test','test')`,[q,hash]);
 for(const n of [1,2]){
  await actor(n);assert.ok(!ids(await page()).includes(q));
  assert.ok(!(await db.query('select id from get_all_active_questions()')).rows.some(r=>r.id===q));
  assert.equal((await db.query('select id from rpc_teacher_questions_by_ids($1)',[[q]])).rows.length,0);
 }
 await actor(1);assert.deepEqual(ids(await page()),before.filter(i=>i!==q));
 const heldFacets=await facets();
 await db.query('update private.question_selection_holds set released_at=now() where question_id=$1',[q]);
 assert.deepEqual(ids(await page()),before);assert.notDeepEqual(await facets(),heldFacets);
 await db.query('update private.question_selection_holds set released_at=null where question_id=$1',[q]);
 await db.query("insert into public.assignments values($1,'published')",[id(901)]);
 await db.query('insert into public.assignment_questions values($1,$2)',[id(901),id(202)]);
 await db.query('update questions set current_content_hash=$1 where id=$2',['b'.repeat(64),id(202)]);
 await db.exec('begin;'+readFileSync('scripts/test-question-selection-holds.sql','utf8')+'rollback;');
});
