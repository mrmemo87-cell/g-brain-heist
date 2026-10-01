import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const page = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx', 'utf8');
const service = readFileSync('services/teacherCurriculumIntelligenceService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260930172000_optimize_teacher_curriculum_intelligence.sql', 'utf8');

test('teacher portal exposes Curriculum Intelligence as a governed reporting workspace', () => {
  assert.match(portal, /curriculum-intelligence/);
  assert.match(portal, /Curriculum Intelligence/);
  assert.match(portal, /TeacherCurriculumIntelligencePage/);
  assert.match(portal, /'curriculum-intelligence': FEATURE_KEYS\.REPORTS/);
});

test('curriculum intelligence is teaching-group scoped and remembers the teacher\'s own subject choice', () => {
  assert.match(service, /fetchTeacherTeachingGroups/);
  assert.match(service, /rpc_teacher_curriculum_group_evidence/);
  assert.match(page, /curriculumGroupStorageKey/);
  assert.match(page, /window\.localStorage\.getItem/);
  assert.match(page, /window\.localStorage\.setItem/);
  assert.doesNotMatch(page, /const economics = rows\.find/);
  assert.match(page, /Teaching group/);
});

test('curriculum intelligence consumes the canonical registry and external framework metadata', () => {
  assert.match(service, /get_teacher_academic_skill_registry/);
  assert.match(page, /frameworkAlignments/);
  assert.match(page, /Programme & curriculum alignment/);
  assert.match(page, /Strand → skill → subskill/);
  assert.match(page, /Evidence Focus catalogue/);
});

test('class intelligence treats confidence as evidence readiness rather than attainment', () => {
  assert.match(migration, /assessment_state='assessed'/);
  assert.match(migration, /assessment_state in \('not_assessed','low_data'\)/);
  assert.match(migration, /assessment_state='contradictory'/);
  assert.match(page, /These are evidence-quality signals, not attainment scores/);
  assert.match(page, /does not yet have enough governed evidence; it does not mean a student is weak/);
  assert.doesNotMatch(service, /mastery|weakness/i);
});

test('class evidence is aggregated in one database call instead of per-student RPCs', () => {
  assert.match(service, /rpc_teacher_curriculum_group_evidence/);
  assert.doesNotMatch(service, /fetchStudentAcademicConfidence|loadConfidencePool|concurrency = 6/);
  assert.doesNotMatch(service, /fetchTeacherTeachingGroupRoster/);
  assert.match(migration, /private\.subject_group_roster\(p_group_id\)/);
  assert.match(migration, /group by subskill_code/);
});

test('aggregate RPC preserves teaching-group authorization and explicit execute grants', () => {
  assert.match(migration, /school_subject_group_teachers/);
  assert.match(migration, /teacher_user_id=v_actor/);
  assert.match(migration, /teaching_group_allocation_required/);
  assert.match(migration, /revoke all on function public\.rpc_teacher_curriculum_group_evidence/);
  assert.match(migration, /to authenticated,service_role/);
});

test('curriculum intelligence is read-only and does not mutate academic evidence', () => {
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(migration, /insert into public\.student_learning|update public\.student_learning|delete from public\.student_learning/i);
});
