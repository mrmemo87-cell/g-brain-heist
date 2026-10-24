import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const dir = 'content/physics-0654/';
const pkg = JSON.parse(readFileSync(dir + 'candidate-package.json', 'utf8'));
const migrationName = readdirSync('supabase/migrations').find((p) => p.endsWith('_physics_0654_assessment_profiles.sql'));
const migration = readFileSync('supabase/migrations/' + migrationName, 'utf8');
const manifestHash = createHash('sha256').update(readFileSync(dir + 'review-manifest.json')).digest('hex');

async function setup() {
  const db = new PGlite();
  await db.exec('create schema private; create schema extensions; create schema auth; create role anon; create role authenticated; create role service_role;');
  for (const t of JSON.parse(readFileSync(dir + 'test-schema.json', 'utf8'))) {
    await db.exec(`create table public.${t.table_name}(${t.ddl})`);
  }
  // Fixture-only digest stand-in: tests exercise governance/transactions, not pgcrypto.
  await db.exec(`
    create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1)||md5($1),'hex')$$;
    create function public.academic_normalize_subject_key(text) returns text language sql immutable as $$select lower(trim($1))$$;
    create function private.academic_registry_subject_matches(uuid,text) returns boolean language sql stable as $$select exists(select 1 from public.academic_skill_registry_subject_aliases where registry_version_id=$1 and alias_normalized=lower($2) and status='active')$$;
    create function private.question_content_fingerprint(text,text,text,jsonb,text,text) returns text language sql immutable as $$select md5(concat($1,$2,$3,$4,$5,$6))$$;
    create function private.question_content_hash(uuid,text,jsonb,text,text,text,text) returns text language sql immutable as $$select md5(concat($1,$2,$3,$4,$5,$6,$7))$$;
    create function private.physics_test_hash() returns trigger language plpgsql as $$begin new.current_content_hash=private.question_content_hash(new.id,new.question_text,new.options,new.correct_answer,new.explanation,new.image_url,new.question_type);return new;end$$;
    create trigger fixture_hash before insert on questions for each row execute function private.physics_test_hash();
    create unique index on academic_skill_registry_nodes(code);
    create unique index on academic_skill_evidence_focuses(code);
    create unique index on verified_question_assessment_profiles(question_id,question_content_hash,provider_name,programme_code,source_version) where status='active';
    create table academic_skill_framework_crosswalks(id uuid default gen_random_uuid(),registry_version_id uuid,node_id uuid,provider_name text,programme_code text,programme_name text,phase text,external_strand text,external_reference_code text,alignment_level text,alignment_note text,source_url text,source_version text,status text);
    create unique index on academic_skill_framework_crosswalks(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level);
    insert into academic_subjects(code,name) values('physics','Physics'),('economics','Economics');
    insert into academic_skill_registry_versions(code,subject_key,status) values('bh-science-core-v1','science','published');
    insert into academic_skill_registry_subject_aliases(alias_normalized,registry_version_id,status,allowed_programme_codes)
      select 'physics',id,'active',array['0625'] from academic_skill_registry_versions;
    insert into academic_skill_registry_nodes(registry_version_id,code,name,node_type,applicable_phases)
      select id,'science.physics','Physics','strand',array['upper_secondary'] from academic_skill_registry_versions;
  `);
  const proposal = JSON.parse(readFileSync(dir + 'registry-proposal.json', 'utf8'));
  const newCodes = new Set(proposal.nodes.map((n) => n.code));
  for (const tax of pkg.questions.map((q) => q.taxonomies[0])) {
    for (const [code, parent, type] of [[tax.primarySkillCode, 'science.physics', 'skill'], [tax.atomicSubskillCode, tax.primarySkillCode, 'subskill']]) {
      if (newCodes.has(code)) continue;
      await db.query(`insert into academic_skill_registry_nodes(registry_version_id,parent_id,code,name,node_type,applicable_phases)
        select v.id,p.id,$1,$1,$3,array['upper_secondary'] from academic_skill_registry_versions v
        join academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code=$2
        on conflict(code) do nothing`, [code,parent,type]);
    }
    if (!proposal.evidenceFocuses.some((f) => f.code === tax.evidenceFocusCode)) {
      await db.query(`insert into academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name)
        select registry_version_id,id,$1,$1 from academic_skill_registry_nodes where code=$2 on conflict(code) do nothing`, [tax.evidenceFocusCode,tax.atomicSubskillCode]);
    }
  }
  await db.exec('create table school_subject_offerings(id uuid primary key,school_id uuid,school_subject_id uuid,status text)');
  await db.exec(migration);
  await db.exec(`
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    create table assignments(id uuid,teacher_id uuid,school_id uuid,class_id uuid,class_code_snapshot text,academic_year_id uuid,academic_term_id uuid,academic_subject_id uuid,grade_level_snapshot text,subject_name text,subject text,subject_id text,subject_group_id uuid);
    create table student_assignments(assignment_id uuid,student_id uuid,batch text,status text);
    create table student_assignment_results(assignment_id uuid,student_id uuid,completed_at timestamptz);
    create table users(id uuid,school_id uuid);
    create table classes(id uuid,school_id uuid,grade_level text,class_code text,is_active boolean);
    create table student_assignment_answers(id uuid,assignment_id uuid,student_id uuid,question_id uuid,is_correct boolean,answered_at timestamptz,grading_status text);
    create table assignment_questions(assignment_id uuid,question_id uuid,analytics_eligible_snapshot boolean,pool_scope_snapshot text,verification_status_snapshot text,owner_school_id_snapshot uuid,question_content_hash text);
    create table student_learning_intervention_practice_assignments(assignment_id uuid,student_id uuid);
    create table student_learning_registry_item_evidence(id uuid default gen_random_uuid(),school_id uuid,student_id uuid,assignment_id uuid,answer_id uuid,question_id uuid,academic_year_id uuid,academic_term_id uuid,academic_subject_id uuid,registry_version_id uuid,primary_skill_node_id uuid,atomic_subskill_node_id uuid,evidence_focus_id uuid,registry_taxonomy_id uuid,grade_level text,question_content_hash text,is_correct boolean,is_independent_assessment boolean,answered_at timestamptz,evidence_authority text,taxonomy_snapshot jsonb,taxonomy_snapshot_hash text,unique(answer_id,registry_taxonomy_id));
    create table school_members(school_id uuid,user_id uuid,status text);
    create table school_subject_group_teachers(school_id uuid,group_id uuid,teacher_user_id uuid,active boolean);
    create table school_subject_groups(id uuid,school_id uuid,school_subject_offering_id uuid,status text);
    create table school_subjects(id uuid,school_id uuid,academic_subject_id uuid,is_active boolean);
    create table school_subject_group_students(school_id uuid,group_id uuid,student_id uuid,status text);
    create function private.registry_question_answer_is_fresh(uuid,uuid,uuid,timestamptz) returns boolean language sql stable as $$select not exists(select 1 from public.student_learning_registry_item_evidence where student_id=$1 and question_id=$3 and answered_at<$4)$$;
  `);
  return db;
}
async function reviewedRegistry(db) {
  await db.query("select set_config('brains_heist.physics_review_authority','TEST FIXTURE REVIEWER',false)");
  await db.query("select set_config('brains_heist.physics_review_manifest_sha256',$1,false)", [manifestHash]);
  await db.exec(readFileSync(dir + 'reviewed-registry-release.sql', 'utf8'));
}
async function validate(db, profile, subject = 'Physics', mcq = true) {
  return db.query('select private.validate_external_question_assessment_profile($1,$2::jsonb,$3)', [subject,JSON.stringify(profile),mcq]);
}
const profile = pkg.questions[0].assessmentProfile;

test('release manifest verifies the exact Git-stored files, including CSV line endings', () => {
  const manifest=JSON.parse(readFileSync(dir+'review-manifest.json','utf8'));
  for(const [name,expected] of Object.entries(manifest.sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(dir+name)).digest('hex'),expected,name);
  }
});

test('0654 accepts Core and Supplement MCQ profiles; rejects AO3, wrong tier, wrong version, subject and missing fields', async () => {
  const db = await setup();
  try {
    await validate(db, profile);
    await validate(db, {...profile,paperComponent:'paper_2',syllabusTier:'supplement'});
    for (const patch of [
      {primaryAssessmentObjective:'AO3',assessmentObjectives:['AO3']},
      {paperComponent:'paper_1',syllabusTier:'supplement'}, {sourceVersion:'2027-2029'},
      {programmeCode:'0625'}, {objectiveComponents:['BH-CIE0654-AO2-numerical-data']},
      {assessmentObjectives:['AO1','AO1']}, {syllabusReference:'P99.2'},
    ]) await assert.rejects(validate(db, {...profile,...patch}));
    await assert.rejects(validate(db, profile, 'Economics'));
    for (const key of ['providerName','programmeCode','sourceVersion','paperComponent','evidenceMode','primaryAssessmentObjective','assessmentObjectives','syllabusTier','syllabusReference','objectiveComponents']) {
      const invalid = {...profile}; delete invalid[key]; await assert.rejects(validate(db, invalid), key);
    }
    await db.exec('grant usage on schema private to authenticated; set role authenticated');
    await assert.rejects(validate(db, profile), /permission denied/);
  } finally { await db.close(); }
});

test('0455 supported Economics profiles remain valid; malformed and cross-subject profiles fail', async () => {
  const db = await setup();
  try {
    const economics = {providerName:'Cambridge International Education',programmeCode:'0455',sourceVersion:'2027-2029',paperComponent:'paper_1',evidenceMode:'mcq',primaryAssessmentObjective:'AO1',assessmentObjectives:['AO1']};
    await validate(db, economics, 'Economics');
    await validate(db, {...economics,paperComponent:'paper_2',paperSection:'section_b',evidenceMode:'structured_response',primaryAssessmentObjective:'AO3',assessmentObjectives:['AO3']}, 'Economics', false);
    await assert.rejects(validate(db, economics));
    await assert.rejects(validate(db, {...economics,primaryAssessmentObjective:'AO2'}, 'Economics'));
    await assert.rejects(validate(db, {...economics,paperComponent:'paper_2'}, 'Economics', false));
  } finally { await db.close(); }
});

test('registry proposals require exact-version review; full package dry-run writes zero, publication is atomic and repeatable', async () => {
  const db = await setup();
  try {
    await assert.rejects(db.exec(readFileSync(dir+'reviewed-registry-release.sql','utf8')), /human_taxonomy_review_required/);
    await reviewedRegistry(db);
    const reviewed = {...pkg,authority:'TEST FIXTURE REVIEWER'};
    const run = (p, dry=true) => db.query('select rpc_import_registry_verified_mcq_package($1::jsonb,$2) result',[JSON.stringify(p),dry]);
    const dry = (await run(reviewed)).rows[0].result;
    assert.equal(dry.questionCount,62); assert.equal(dry.assessmentProfileCount,62);
    const noPhase=structuredClone(reviewed); noPhase.questions.forEach((q)=>delete q.curriculumPhase);
    await assert.rejects(run(noPhase),/registry_subskill_not_applicable_to_grade/);
    const badPhase=structuredClone(reviewed); badPhase.questions[0].curriculumPhase='lower_secondary';
    await assert.rejects(run(badPhase),/unsupported_registry_package_phase_override/);
    assert.equal((await db.query('select count(*)::int n from questions')).rows[0].n,0);
    const invalid=structuredClone(reviewed); invalid.questions[61].assessmentProfile.primaryAssessmentObjective='AO3';
    await assert.rejects(run(invalid,false));
    assert.equal((await db.query('select count(*)::int n from questions')).rows[0].n,0);
    await run(reviewed,false);
    assert.equal((await db.query("select count(*)::int n from questions q where private.question_browse_matches_search(q,'P5.2.4.1')")).rows[0].n,4);
    for (const table of ['questions','verified_question_registry_taxonomy','verified_question_assessment_profiles']) {
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,62);
    }
    assert.equal((await run(reviewed,false)).rows[0].result.alreadyImported,true);
    assert.equal((await db.query("select count(*)::int n from verified_question_assessment_profiles where syllabus_tier='core'")).rows[0].n,42);
  } finally { await db.close(); }
});

test('review bundle retains all source IDs and isolates extension items with no official profile', () => {
  const held=JSON.parse(readFileSync(dir+'held-questions.json','utf8'));
  assert.equal(held.length,28);
  assert.equal(new Set([...pkg.questions.map((q)=>q.externalId),...held.map((h)=>h.question.externalId)]).size,90);
  assert.ok(held.every((h)=>!h.question.assessmentProfile));
  for (const q of pkg.questions) {
    assert.ok(q.options.includes(q.correctAnswer)); assert.equal(new Set(q.options).size,4);
    assert.equal(q.taxonomies.length,1,'Do not multiply one MCQ mark into evidence for unobserved intermediate steps');
  }
});

test('real materializer snapshots Physics AO evidence; teacher report enforces allocation and separates repeated practice', async () => {
  const db = await setup();
  const school='00000000-0000-0000-0000-000000000001',group='00000000-0000-0000-0000-000000000002';
  const student='00000000-0000-0000-0000-000000000003',teacher='00000000-0000-0000-0000-000000000004';
  const assignment='00000000-0000-0000-0000-000000000005',practice='00000000-0000-0000-0000-000000000006';
  try {
    await reviewedRegistry(db);
    await db.query('select rpc_import_registry_verified_mcq_package($1::jsonb,false)',[JSON.stringify({...pkg,authority:'TEST FIXTURE REVIEWER'})]);
    const {rows:[question]}=await db.query("select * from questions where verified_external_id like '%-001'");
    await db.exec(`
      insert into users values('${student}','${school}');
      insert into school_members values('${school}','${teacher}','active');
      insert into school_subject_groups values('${group}','${school}','${group}','active');
      insert into school_subject_offerings values('${group}','${school}','${group}','active');
      insert into school_subjects values('${group}','${school}','${question.academic_subject_id}',true);
      insert into school_subject_group_teachers values('${school}','${group}','${teacher}',true);
      insert into school_subject_group_students values('${school}','${group}','${student}','active');
    `);
    const report=()=>db.query('select rpc_teacher_physics_assessment_breakdown($1,$2) result',[school,group]);
    await assert.rejects(report(),/physics_teaching_group_access_required/);
    await db.query("select set_config('test.actor',$1,false)",[teacher]);
    assert.deepEqual((await report()).rows[0].result.components,[]);
    assert.equal((await report()).rows[0].result.programmeConfigured,false);
    await db.query("select set_config('brains_heist.physics_offering_id',$1,false)",[group]);
    await db.exec(readFileSync(dir+'reviewed-offering-release.sql','utf8'));
    assert.equal((await report()).rows[0].result.registryPhase,'upper_secondary');
    const focusResult=await db.query("select rpc_academic_evidence_focuses_for_subskill('physics',9,$1,'upper_secondary') result",[pkg.questions[0].taxonomies[0].atomicSubskillCode]);
    assert.ok(focusResult.rows[0].result.focuses.length>0);
    for (const [a,time,isPractice] of [[assignment,'2026-10-24T09:00:00Z',false],[practice,'2026-10-25T09:00:00Z',true]]) {
      await db.query(`insert into assignments(id,school_id,academic_year_id,academic_subject_id,grade_level_snapshot,subject_name,subject_group_id) values($1,$2,$2,$3,'10','Physics',$4)`,[a,school,question.academic_subject_id,group]);
      await db.query("insert into student_assignments values($1,$2,'10A','completed')",[a,student]);
      await db.query('insert into student_assignment_results values($1,$2,$3)',[a,student,time]);
      await db.query("insert into assignment_questions values($1,$2,true,'global','verified',null,$3)",[a,question.id,question.current_content_hash]);
      await db.query("insert into student_assignment_answers values(gen_random_uuid(),$1,$2,$3,true,$4,'graded')",[a,student,question.id,time]);
      if(isPractice) await db.query('insert into student_learning_intervention_practice_assignments values($1,$2)',[a,student]);
      assert.equal((await db.query('select private.materialize_verified_assignment_registry_evidence($1,$2) n',[a,student])).rows[0].n,1);
      assert.equal((await db.query('select private.materialize_verified_assignment_registry_evidence($1,$2) n',[a,student])).rows[0].n,0);
    }
    const [row]=(await report()).rows[0].result.components;
    assert.equal(row.itemCount,2); assert.equal(row.independentFreshCount,1);
    assert.equal(row.practiceOrRepeatedCount,1); assert.equal(row.independentFreshCorrectCount,1);
    const evidence=(await db.query('select taxonomy_snapshot from student_learning_registry_item_evidence limit 1')).rows[0];
    assert.equal(evidence.taxonomy_snapshot.externalAssessmentProfiles[0].programmeCode,'0654');
    await db.exec("update verified_question_assessment_profiles set status='retired'");
    assert.equal((await report()).rows[0].result.components[0].itemCount,2,'historical report uses immutable evidence snapshots');
    await db.exec('update school_subject_group_teachers set active=false');
    await assert.rejects(report(),/physics_teaching_group_access_required/);
  } finally { await db.close(); }
});
