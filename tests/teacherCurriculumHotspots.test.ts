import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx', 'utf8');
const service = readFileSync('services/teacherCurriculumIntelligenceService.ts', 'utf8');
const actions = readFileSync('services/teacherCurriculumActionService.ts', 'utf8');
const subjectExperience = readFileSync('services/curriculumSubjectExperienceService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260930174500_add_curriculum_class_hotspots.sql', 'utf8');

test('class hotspots stay inside the single curriculum intelligence RPC', () => {
  assert.match(migration, /'hotspots',v_hotspots/);
  assert.match(service, /hotspots\?: CurriculumHotspotEvidence\[]/);
  assert.doesNotMatch(service, /getInterventionIntelligence\(/);
  assert.doesNotMatch(service, /fetchStudentAcademicConfidence/);
});

test('hotspots use longitudinal governed focus states and preserve progress states', () => {
  assert.match(migration, /student_learning_focus_states/);
  for (const state of ['new_focus','recurring','persistent','improving','resolved']) {
    assert.match(migration, new RegExp(state));
  }
  assert.match(migration, /academic_year_id=v_academic_year_id/);
  assert.match(migration, /private\.subject_group_roster\(p_group_id\)/);
});

test('reteach dimensions are subject-native rather than Economics-only', () => {
  assert.match(actions, /CurriculumTeachingDimension = 'content' \| 'reasoning'/);
  assert.match(actions, /curriculumDimensionForSubject/);
  assert.match(subjectExperience, /Economics content/);
  assert.match(subjectExperience, /Thinking & working mathematically/);
  assert.match(subjectExperience, /Scientific practice & reasoning/);
  assert.match(subjectExperience, /Communication & comprehension/);
  assert.match(page, /experience\?\.contentDimension\.title/);
  assert.match(page, /experience\?\.reasoningDimension\.title/);
});

test('teacher actions are deterministic and evidence-grounded', () => {
  assert.match(actions, /buildReteachRecommendations/);
  assert.match(actions, /persistentStudents \* 10/);
  assert.match(actions, /recurringStudents \* 6/);
  assert.match(actions, /whyNow/);
  assert.match(page, /Why now/);
  assert.match(page, /experience\?\.barrierLabel/);
  assert.match(page, /experience\?\.reteachLabel/);
  assert.match(page, /experience\?\.reassessmentLabel/);
  assert.match(page, /experience\?\.assessmentLensLabel/);
});

test('economics playbook covers priority syllabus and reasoning patterns', () => {
  for (const pattern of [
    'demand', 'supply', 'equilibrium', 'ped', 'externalit', 'fiscal',
    'monetary', 'supply-side', 'unemployment', 'inflation',
    'living-standards', 'exchange-rate', 'current-account',
    'data-evidence', 'diagram', 'chain-development',
    'application', 'depends-on', 'time-horizon', 'judgement',
  ]) {
    assert.match(actions, new RegExp(pattern));
  }
});

test('targeted practice is never presented as proof of mastery', () => {
  assert.match(migration, /targetedPracticeDoesNotProveMastery/);
  assert.match(page, /Targeted practice can support learning, but it does not prove mastery/);
  assert.match(page, /later independent assessment is still required/);
});

test('hotspot RPC keeps exact teaching-group authorization and safe grants', () => {
  assert.match(migration, /school_subject_group_teachers/);
  assert.match(migration, /teacher_user_id=v_actor/);
  assert.match(migration, /teaching_group_allocation_required/);
  assert.match(migration, /revoke all on function public\.rpc_teacher_curriculum_group_evidence/);
  assert.match(migration, /to authenticated,service_role/);
});
