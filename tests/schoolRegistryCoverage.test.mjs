import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const migration=readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(p=>p.endsWith('_school_registry_coverage.sql')),'utf8');
async function database(){
 const db=new PGlite();
 await db.exec(`create schema auth; create schema private; create role anon; create role authenticated; create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function public.can_administer_school(uuid) returns boolean language sql stable as $$select $1='00000000-0000-0000-0000-000000000001'::uuid and auth.uid()='00000000-0000-0000-0000-000000000001'::uuid$$;
 create function public.is_school_owner(uuid) returns boolean language sql stable as $$select false$$;
 create function private.academic_registry_subject_matches(uuid,text) returns boolean language sql stable as $$select $2='Physics'$$;
 create table academic_subjects(id uuid,code text,name text,is_active boolean);
 create table questions(id uuid,academic_subject_id uuid,eligible_grade_levels smallint[],verified_content_hash text,current_content_hash text,is_active boolean,analytics_eligible boolean,verification_status text,pool_scope text,content_origin text,owner_school_id uuid,is_public boolean);
 create table verified_question_registry_taxonomy(question_id uuid,question_content_hash text,review_status text,human_review_required boolean,registry_version_id uuid,primary_skill_node_id uuid,atomic_subskill_node_id uuid,evidence_focus_id uuid);
 create table academic_skill_registry_versions(id uuid,status text);
 create table academic_skill_registry_nodes(id uuid,registry_version_id uuid,node_type text,status text,parent_id uuid);
 create table academic_skill_evidence_focuses(id uuid,registry_version_id uuid,atomic_subskill_node_id uuid,status text);
 create table curriculum_objectives(curriculum_scope_id uuid);
 create table curriculum_item_objective_mappings(curriculum_scope_id uuid,framework_version_id uuid,assessment_item_id uuid,item_content_hash text,curriculum_version_content_hash text,status text,mapping_role text,superseded_at timestamptz);
 create table curriculum_assessment_items(id uuid,source_type text,source_item_key text,source_record_id text,is_active boolean,content_hash text,school_id uuid);
 create table curriculum_framework_versions(id uuid,framework_id uuid,content_hash text,status text,version_code text,display_name text,effective_from date);
 create table curriculum_scopes(id uuid,framework_subject_id uuid,framework_version_id uuid,stage_id uuid,academic_subject_id uuid,code text,name text);
 create table curriculum_stages(id uuid,code text,name text,sequence_number integer);
 create table curriculum_framework_subjects(id uuid,framework_version_id uuid,academic_subject_id uuid,sequence_number integer);
 create table curriculum_frameworks(id uuid,code text,name text,provider_name text,authority_type text,is_active boolean,school_id uuid);
 create table school_academic_years(id uuid,name text,starts_on date,ends_on date,status text,school_id uuid);
 create table school_academic_terms(id uuid,academic_year_id uuid,name text,sequence_number integer,starts_on date,ends_on date,school_id uuid);
 create table school_curriculum_scope_mappings(id uuid,academic_year_id uuid,grade_level text,academic_subject_id uuid,curriculum_scope_id uuid,subject_requirement text,status text,mapping_quality text,school_id uuid);
 create table student_subject_enrolments(id uuid,student_id uuid,academic_year_id uuid,academic_subject_id uuid,status text,school_id uuid);`);
 await db.exec(migration);
 return db;
}
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function seed(db){
 await db.exec(`insert into academic_subjects values('${id(2)}','physics','Physics',true);
 insert into academic_skill_registry_versions values('${id(3)}','published');
 insert into academic_skill_registry_nodes values('${id(4)}','${id(3)}','skill','active',null),('${id(5)}','${id(3)}','subskill','active','${id(4)}');
 insert into academic_skill_evidence_focuses values('${id(6)}','${id(3)}','${id(5)}','active');
 insert into curriculum_frameworks values('${id(7)}','brain-heist-international','BH','BH','platform',true,null);
 insert into curriculum_framework_versions values('${id(8)}','${id(7)}','versionhash','published','1','v1',null);
 insert into curriculum_framework_subjects values('${id(9)}','${id(8)}','${id(2)}',1);
 insert into curriculum_stages values('${id(10)}','grade-10','Grade 10',10),('${id(11)}','grade-8','Grade 8',8);
 insert into curriculum_scopes values('${id(12)}','${id(9)}','${id(8)}','${id(10)}','${id(2)}','physics-grade-10','Physics 10'),('${id(13)}','${id(9)}','${id(8)}','${id(11)}','${id(2)}','physics-grade-8','Physics 8');
 insert into questions values('${id(14)}','${id(2)}',array[9,10,11],'hash','hash',true,true,'verified','global','brain_heist',null,true);
 insert into verified_question_registry_taxonomy values('${id(14)}','hash','approved',false,'${id(3)}','${id(4)}','${id(5)}','${id(6)}');
 select set_config('test.actor','${id(1)}',false);`);
}
async function scopes(db,school=id(1)){
 const r=await db.query('select public.rpc_school_admin_academic_setup($1) payload',[school]);
 return r.rows[0].payload.frameworks[0].subjects[0].scopes;
}
test('coverage counts registry-native grade-eligible questions and Evidence Focus targets without requiring an existing school roster',async()=>{
 const db=await database();try{await seed(db);const s=await scopes(db);assert.equal(s[1].approvedQuestionCount,1);assert.equal(s[1].evidenceFocusCount,1);assert.equal(s[1].objectiveCount,0);assert.equal(s[0].approvedQuestionCount,0);
 await db.exec(`insert into curriculum_assessment_items values('${id(15)}','question_bank','question','${id(14)}',true,'hash',null);insert into curriculum_item_objective_mappings values('${id(12)}','${id(8)}','${id(15)}','hash','versionhash','approved','primary',null);`);
 assert.equal((await scopes(db))[1].approvedQuestionCount,1,'dual mapping must not double-count');
 }finally{await db.close();}
});
test('coverage excludes stale hashes, retired registry targets, drafts and private content from other schools; administrator boundary remains closed',async()=>{
 const db=await database();try{await seed(db);
 for(const [sql,restore] of [
 ["update questions set current_content_hash='edited'","update questions set current_content_hash='hash'"],
 ["update questions set verification_status='draft'","update questions set verification_status='verified'"],
 ["update academic_skill_registry_versions set status='retired'","update academic_skill_registry_versions set status='published'"],
 ["update academic_skill_evidence_focuses set status='retired'","update academic_skill_evidence_focuses set status='active'"],
 ["update verified_question_registry_taxonomy set human_review_required=true","update verified_question_registry_taxonomy set human_review_required=false"],
 [`update questions set pool_scope='school',content_origin='teacher',owner_school_id='${id(99)}',is_public=false`,"update questions set pool_scope='global',content_origin='brain_heist',owner_school_id=null,is_public=true"]]){
 await db.exec(sql);assert.equal((await scopes(db))[1].approvedQuestionCount,0,sql);await db.exec(restore);
 }
 await assert.rejects(scopes(db,id(99)),/school_administrator_access_required/);
 await db.exec("select set_config('test.actor','',false)");await assert.rejects(scopes(db),/school_administrator_access_required/);
 }finally{await db.close();}
});
async function renderEditor(values={}){
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Manager from './components/school-admin/SchoolSubjectsManager';createRoot(document.getElementById('root')).render(<Manager/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent',plugins:[{name:'fixtures',setup(b){
 b.onLoad({filter:/schoolSubjectCatalogService\.ts$/},()=>({contents:`export const fetchSchoolSubjectCatalog=async()=>window.catalog; export const saveSchoolSubject=async input=>{window.saved=input;return {success:true,name:input.name}};export const deleteSchoolSubject=async()=>({success:true});`}));
 b.onLoad({filter:/schoolAcademicSetupService\.ts$/},()=>({contents:`export const fetchSchoolAcademicSetup=async()=>window.setup;`}));
 b.onLoad({filter:/SchoolAdminContext\.tsx$/},()=>({contents:`export const useSchoolAdmin=()=>({school:{id:'school',name:'New School'},students:[],classes:[],teachers:[],addToast:()=>{},loadAdminTools:async()=>{}});`}));
 b.onLoad({filter:/SubjectTeachingGroupsPanel\.tsx$/},()=>({contents:'export default ()=>null;'}));
 }}]});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.catalog={subjects:[{id:'local',name:'Physics-0654',code:'PHYSICS-0654',isActive:true,academicSubjectId:'old-map',academicSubjectName:'Old mapping',mappingStatus:'mapped',offerings:[]}],academicYearName:'2026/2027'};
 dom.window.setup={years:[{id:'year',status:'current'}],frameworks:[{subjects:[{academicSubjectId:'physics',name:'Physics',code:'physics',scopes:[{scopeId:'scope10',gradeLevel:10}]}]}]};
 Object.assign(dom.window,values);
 dom.window.eval(bundle.outputFiles[0].text);
 return dom;
}
async function until(fn){for(let i=0;i<80;i++){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not settle');}
test('empty schools can select Grade 10 and persist an explicitly changed academic mapping',async()=>{
 const dom=await renderEditor();try{
 const doc=dom.window.document;const button=label=>[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
 (await until(()=>button('Edit'))).click();await until(()=>doc.querySelector('[role="dialog"]'));
 const selects=[...doc.querySelectorAll('[role="dialog"] select')];
 const academic=selects.find(s=>s.textContent.includes('No academic mapping yet'));academic.value='physics';academic.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 const grade=selects.find(s=>s.textContent.includes('No grade offering yet'));assert.ok([...grade.options].some(o=>o.value==='10'));assert.equal(grade.options.length,13);
 grade.value='10';grade.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,20));button('Save changes').click();
 const saved=await until(()=>dom.window.saved);assert.equal(saved.academicSubjectId,'physics');assert.equal(saved.gradeLevel,'10');assert.equal(saved.curriculumScopeId,'scope10');assert.equal(saved.teacherUserId,null);assert.equal(saved.replaceTeacherAllocations,false);
 }finally{dom.window.close();}
});

test('standard class teaching hides optional group setup; existing custom teaching stays visible',async()=>{
 for(const mode of ['by_class','custom_groups']) {
 const dom=await renderEditor({catalog:{subjects:[{id:'local',name:'Physics-0654',code:'PHYSICS-0654',isActive:true,academicSubjectId:'physics',academicSubjectName:'Physics',mappingStatus:'mapped',offerings:[{id:'offering',academicYearId:'year',gradeLevel:'10',status:'active',deliveryMode:mode,accessMode:'all_grade',selectedStudentIds:[]}]}]}});
 try {const doc=dom.window.document;(await until(()=>[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()==='Edit'))).click();await until(()=>doc.querySelector('details'));
 assert.equal(doc.querySelector('details').open,mode!=='by_class');
 assert.match(doc.body.textContent,/School classes link automatically/);
 }finally{dom.window.close();}
 }
});
