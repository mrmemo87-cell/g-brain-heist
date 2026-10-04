import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { academicProfileSubjectName, isAcademicAssignmentSource } from '../services/studentAcademicProfileService';

const name = readdirSync('supabase/migrations').find((name) => name.endsWith('_academic_profile_canonical_evidence_coverage.sql'))!;
const migration = readFileSync(`supabase/migrations/${name}`, 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('school-governed aliases unify profile labels without inventing cross-subject matches', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create role anon; create role authenticated; create role service_role;
      create table public.academic_subjects(id uuid, name text, is_active boolean);
      create table public.school_subjects(school_id uuid,name text,academic_subject_id uuid);
      create function public.academic_normalize_subject_key(text) returns text language sql immutable as $$ select lower(trim($1)) $$;
      create function public.academic_resolve_subject_id(text,uuid) returns uuid language sql stable as $$ select id from public.academic_subjects where lower(name)=lower(trim($1)) $$;
      insert into public.academic_subjects values ('${id(1)}','English',true),('${id(2)}','Mathematics',true),('${id(3)}','Economics',true);
      insert into public.school_subjects values ('${id(10)}','ESL','${id(1)}'),('${id(10)}','Grade 8 ESL','${id(1)}'),('${id(10)}','Maths','${id(2)}');`);
    await db.exec(migration.slice(0, migration.indexOf('CREATE OR REPLACE FUNCTION public.rpc_student_academic_profile')));
    const result = await db.query<{label: string; name: string}>(`select label,private.academic_profile_subject_name(label,'${id(10)}') name from unnest(array['ESL','Grade 8 ESL','English','Maths','Economics','Unknown']) label`);
    assert.deepEqual(result.rows.map((row) => row.name), ['English','English','English','Mathematics','Economics','Unknown']);
    const foreign = await db.query<{name: string}>(`select private.academic_profile_subject_name('Grade 8 ESL','${id(11)}') name`);
    assert.equal(foreign.rows[0].name, 'Grade 8 ESL');
  } finally { await db.close(); }
});

test('registry-only assignment totals require graded, intact, independent same-school evidence', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create table student_assignment_results(assignment_id uuid,student_id uuid,time_taken_seconds integer,completed_at timestamptz);
      create table assignments(id uuid,school_id uuid,class_id uuid,grade_level_snapshot text,academic_year_id uuid,academic_subject_id uuid);
      create table users(id uuid,grade text);
      create table classes(id uuid,grade_level text);
      create table student_assignment_answers(id uuid,assignment_id uuid,student_id uuid,question_id uuid,is_correct boolean,grading_status text);
      create table assignment_questions(assignment_id uuid,question_id uuid,pool_scope_snapshot text,verification_status_snapshot text,analytics_eligible_snapshot boolean,owner_school_id_snapshot uuid,question_content_hash text);
      create table questions(id uuid,pool_scope text,owner_school_id uuid,verification_status text,analytics_eligible boolean,is_active boolean,current_content_hash text,verified_content_hash text,content_origin text,is_public boolean,eligible_grade_levels smallint[]);
      create table student_learning_item_evidence(assignment_id uuid,student_id uuid,answer_id uuid,question_id uuid,question_content_hash text,grade_level text,academic_year_id uuid,academic_subject_id uuid,is_independent_assessment boolean,evidence_authority text);
      create table student_learning_registry_item_evidence(assignment_id uuid,student_id uuid,school_id uuid,answer_id uuid,question_id uuid,question_content_hash text,grade_level text,academic_year_id uuid,academic_subject_id uuid,is_independent_assessment boolean,evidence_authority text);
      create table student_learning_intervention_practice_assignments(assignment_id uuid,student_id uuid);
      create function private.verified_question_has_curriculum_mapping(uuid,uuid,uuid,text,uuid) returns boolean language sql as $$ select false $$;
      insert into users values ('${id(1)}','7');
      insert into assignments values ('${id(2)}','${id(3)}',null,'7','${id(4)}','${id(5)}');
      insert into student_assignment_results values ('${id(2)}','${id(1)}',60,now());
      insert into questions values ('${id(6)}','global',null,'verified',true,true,'hash','hash','brain_heist',true,array[7]::smallint[]);
      insert into assignment_questions values ('${id(2)}','${id(6)}','global','verified',true,null,'hash');
      insert into student_assignment_answers values ('${id(7)}','${id(2)}','${id(1)}','${id(6)}',true,'graded');
      insert into student_learning_registry_item_evidence values ('${id(2)}','${id(1)}','${id(3)}','${id(7)}','${id(6)}','hash','7','${id(4)}','${id(5)}',true,'brains_heist_verified_registry_question');`);
    const view = migration.slice(migration.indexOf('create or replace view private.student_verified_assignment_summaries'), migration.indexOf('revoke all on private.student_verified_assignment_summaries'));
    await db.exec(view);
    const count = async () => Number((await db.query<{n: number}>('select count(*) n from private.student_verified_assignment_summaries')).rows[0].n);
    assert.equal(await count(), 1, 'registry-only outcome is counted');
    for (const mutation of [
      `update student_assignment_answers set grading_status='pending_review'`,
      `update questions set current_content_hash='changed'`,
      `update assignment_questions set pool_scope_snapshot='teacher'`,
      `update student_learning_registry_item_evidence set school_id='${id(99)}'`,
      `update student_learning_registry_item_evidence set is_independent_assessment=false`,
      `insert into student_learning_intervention_practice_assignments values ('${id(2)}','${id(1)}')`,
    ]) {
      await db.exec('begin');
      await db.exec(mutation);
      assert.equal(await count(), 0, mutation);
      await db.exec('rollback');
    }
  } finally { await db.close(); }
});

test('screen and print source selection recognize both official assignment streams', () => {
  assert.equal(isAcademicAssignmentSource('registry_verified_assignment'), true);
  assert.equal(isAcademicAssignmentSource('assignment_result'), true);
  assert.equal(isAcademicAssignmentSource('writing_assessment_review'), false);
  assert.equal(academicProfileSubjectName(' ESL ', { esl: 'English' }), 'English');
  assert.equal(academicProfileSubjectName('Economics', { esl: 'English' }), 'Economics');
});
