import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileMigration = readFileSync('supabase/migrations/20260930182000_verified_question_assessment_profiles.sql','utf8');
const readinessMigration = readFileSync('supabase/migrations/20260930182500_teacher_economics_paper_readiness.sql','utf8');
const service = readFileSync('services/economicsPaperReadinessService.ts','utf8');
const intelligence = readFileSync('services/teacherCurriculumIntelligenceService.ts','utf8');
const page = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx','utf8');

test('verified question assessment profiles are external metadata, not canonical skill identity', () => {
  assert.match(profileMigration, /verified_question_assessment_profiles/);
  assert.match(profileMigration, /question_content_hash/);
  assert.match(profileMigration, /provider_name/);
  assert.match(profileMigration, /programme_code/);
  assert.match(profileMigration, /source_version/);
  assert.match(profileMigration, /primary_assessment_objective/);
  assert.doesNotMatch(profileMigration, /alter table public\.academic_skill_registry_nodes/);
});

test('0455 profile governance accepts only current Brains Heist Verified Economics evidence', () => {
  assert.match(profileMigration, /content_origin='brain_heist'/);
  assert.match(profileMigration, /verification_status='verified'/);
  assert.match(profileMigration, /analytics_eligible/);
  assert.match(profileMigration, /current_content_hash=q\.verified_content_hash/);
  assert.match(profileMigration, /programme.*<> '0455'/s);
  assert.match(profileMigration, /source_version <> '2027-2029'/);
  assert.match(profileMigration, /paper_1/);
  assert.match(profileMigration, /paper_2/);
  assert.match(profileMigration, /section_a/);
  assert.match(profileMigration, /section_b/);
  assert.match(profileMigration, /AO1/);
  assert.match(profileMigration, /AO2/);
  assert.match(profileMigration, /AO3/);
});

test('profile governance is service-role only and teacher readiness is exact-group scoped', () => {
  assert.match(profileMigration, /revoke all on function public\.rpc_govern_verified_question_assessment_profile/);
  assert.match(profileMigration, /grant execute on function public\.rpc_govern_verified_question_assessment_profile\(uuid,jsonb\)\s+to service_role/);
  assert.match(readinessMigration, /school_subject_group_teachers/);
  assert.match(readinessMigration, /teacher_user_id=v_actor/);
  assert.match(readinessMigration, /a\.subject_group_id=p_group_id/);
  assert.match(readinessMigration, /a\.academic_year_id=v_academic_year_id/);
  assert.match(readinessMigration, /private\.subject_group_roster\(p_group_id\)/);
  assert.match(readinessMigration, /analytics_eligible_snapshot/);
  assert.match(readinessMigration, /verification_status_snapshot='verified'/);
  assert.match(readinessMigration, /p\.question_content_hash=aq\.question_content_hash/);
});

test('Cambridge 0455 2027-2029 exam structure is represented without grade prediction', () => {
  assert.match(service, /40 questions · 40 marks · 1 hour · 30% of qualification/);
  assert.match(service, /Compulsory data response · unseen real economic situation · 20 marks/);
  assert.match(service, /answer 3 of 4 questions · 20 marks each/);
  assert.match(service, /AO1.*qualification: 43.*paper1: 50.*paper2: 40/s);
  assert.match(service, /AO2.*qualification: 47.*paper1: 50.*paper2: 45/s);
  assert.match(service, /AO3.*qualification: 10.*paper1: 0.*paper2: 15/s);
  assert.match(readinessMigration, /noGradePrediction',true/);
  assert.match(readinessMigration, /accuracyIsObservedEvidenceNotExamPrediction',true/);
  assert.match(page, /Evidence only · no predicted grade/);
  assert.match(page, /It is not an exam mark, forecast or grade boundary/);
});

test('paper reporting readiness is conservative and evidence-sufficiency based', () => {
  assert.match(service, /minimumDistinctQuestions/);
  assert.match(service, /minimumDistinctAssignments/);
  assert.match(service, /minimumStudents/);
  assert.match(service, /minimumRosterShare/);
  assert.match(service, /not_assessed/);
  assert.match(service, /low_data/);
  assert.match(service, /evidence_established/);
  assert.doesNotMatch(service, /predictedGrade|gradeBoundary|estimatedGrade/);
});

test('curriculum intelligence loads paper readiness only for Economics and tolerates unavailability', () => {
  assert.match(intelligence, /\/economics\/i\.test\(group\.subjectLabel\)/);
  assert.match(intelligence, /fetchEconomicsPaperReadiness/);
  assert.match(intelligence, /Economics paper readiness unavailable/);
  assert.match(intelligence, /paperReadiness: EconomicsPaperReadiness \| null/);
});

test('teacher UI distinguishes paper formats, AO evidence and missing evidence', () => {
  assert.match(page, /Paper Readiness/);
  assert.match(service, /Paper 1 · Multiple Choice/);
  assert.match(service, /Paper 2 · Section A/);
  assert.match(service, /Paper 2 · Section B/);
  assert.match(page, /snapshot\.paperReadiness\.paper1/);
  assert.match(page, /snapshot\.paperReadiness\.paper2SectionA/);
  assert.match(page, /snapshot\.paperReadiness\.paper2SectionB/);
  assert.match(page, /Official weighting vs evidence collected/);
  assert.match(page, /AO evidence is question-profiled, never inferred from topic alone/);
  assert.match(page, /Evidence gaps/);
  assert.match(page, /verified Economics assessment bank is the next dependency/);
});
