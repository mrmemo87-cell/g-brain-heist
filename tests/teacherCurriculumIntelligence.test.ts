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

test('curriculum intelligence consumes the canonical registry while progressively disclosing technical detail', () => {
  assert.match(service, /get_teacher_academic_skill_registry/);
  assert.match(page, /frameworkAlignments/);
  assert.match(page, /Programme & curriculum alignment/);
  assert.match(page, /Curriculum overview/);
  assert.match(page, /Explore full curriculum/);
  assert.match(page, /About this evidence/);
  assert.match(page, /Registry code/);
});

test('class intelligence treats confidence as evidence readiness rather than attainment', () => {
  assert.match(migration, /assessment_state='assessed'/);
  assert.match(migration, /assessment_state in \('not_assessed','low_data'\)/);
  assert.match(migration, /assessment_state='contradictory'/);
  assert.match(page, /These are evidence-quality signals, not attainment scores/);
  assert.match(page, /never means a student is weak/);
  assert.match(page, /Decision-ready/);
  assert.match(page, /Building evidence/);
  assert.doesNotMatch(service, /mastery|weakness/i);
});


test('curriculum intelligence follows the teacher-first Academic Profile hierarchy', () => {
  assert.match(page, /AcademicProfilePremium/);
  assert.match(page, /className="ap-overview"/);
  assert.equal((page.match(/<ProfileStat/g) || []).length, 4);
  for (const title of ['Class snapshot', 'What needs attention?', 'Class learning picture', 'Skills to check next', 'Curriculum overview', 'About this evidence']) {
    assert.ok(page.includes(title), `missing teacher-facing section: ${title}`);
  }
  assert.match(page, /Students needing action/);
  assert.match(page, /Check again/);
  assert.doesNotMatch(page, /Dimension A|Dimension B|Governed atomic subskills|higher-readiness pairs/);
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
