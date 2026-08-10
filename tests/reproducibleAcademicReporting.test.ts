import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260811133000_reproducible_academic_reporting.sql', 'utf8');
const roadmap = readFileSync('docs/academic-intelligence-roadmap.md', 'utf8');
const service = readFileSync('services/academicReportingService.ts', 'utf8');
const builder = readFileSync('components/student-progress/AcademicReportBuilder.tsx', 'utf8');
const studentEntry = readFileSync('components/student-progress/IndividualStudentAcademicReport.tsx', 'utf8');
const schoolHead = readFileSync('components/school-head/SchoolHeadLearningIntelligence.tsx', 'utf8');

const tables = ['academic_report_snapshots', 'academic_report_source_snapshots', 'academic_report_events'];

test('phase 8 report records are fail closed and service managed', () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, 'i'));
  }
});

test('reports cover student class grade subject and school targets', () => {
  for (const type of ['student', 'class', 'grade', 'subject', 'school']) assert.match(migration, new RegExp(`'${type}'`, 'i'));
  assert.match(migration, /Report target does not match report type/i);
  assert.match(builder, /Student.+Class.+Grade.+Subject.+Whole school/i);
});

test('student and family audiences cannot widen beyond one learner', () => {
  assert.match(migration, /audience not in \('student','family'\) or report_type = 'student'/i);
  assert.match(migration, /Student and family reports must be scoped to one student/i);
  assert.match(migration, /studentAccessRequiresFinalStudentAudience/i);
});

test('scope uses year term cutoff and effective dated enrolment', () => {
  assert.match(migration, /student_academic_enrolments/i);
  assert.match(migration, /e\.starts_on <= p_period_end/i);
  assert.match(migration, /coalesce\(e\.ends_on, p_period_end\) >= p_period_start/i);
  assert.match(migration, /o\.academic_year_id = v_year\.id/i);
  assert.match(migration, /o\.academic_term_id = p_academic_term_id/i);
  assert.match(migration, /o\.observed_at < v_cutoff/i);
});

test('teacher generation remains assigned class and canonical subject scoped', () => {
  assert.match(migration, /class_teacher_assignments/i);
  assert.match(migration, /cta\.active is true/i);
  assert.match(migration, /academic_normalize_subject_key\(cta\.subject\)/i);
  assert.match(migration, /academic_resolve_subject_id\(cta\.subject, p_school_id\)/i);
  assert.match(migration, /p_report_type = 'class'.+p_academic_subject_id is not null/s);
});

test('reports freeze exact sources and payload hashes', () => {
  assert.match(migration, /source_snapshot_hash text not null/i);
  assert.match(migration, /payload_hash text not null/i);
  assert.match(migration, /extensions\.digest[\s\S]+sha256/i);
  assert.match(migration, /academic_report_source_snapshots/i);
  assert.match(migration, /snapshotHash/i);
});

test('identical evidence reuses a report and changed evidence creates a version', () => {
  assert.match(migration, /source_snapshot_hash = v_source_hash/i);
  assert.match(migration, /payload_hash = v_payload_hash/i);
  assert.match(migration, /'reused', true/i);
  assert.match(migration, /v_version := coalesce\(v_version, 0\) \+ 1/i);
  assert.match(migration, /supersedes_report_id/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
});

test('draft to final is the only permitted snapshot update', () => {
  assert.match(migration, /old\.status = 'draft' and new\.status = 'final'/i);
  assert.match(migration, /academic_report_snapshot_is_immutable/i);
  assert.match(migration, /academic_report_record_is_append_only/i);
  assert.match(migration, /reportAutomaticallyFinalized', false/i);
  assert.match(builder, /Approve & Finalize/i);
});

test('export is disabled until explicit final approval', () => {
  assert.match(builder, /disabled=\{!snapshot \|\| snapshot\.status !== 'final'\}/i);
  assert.match(builder, /Print \/ Save PDF/i);
  assert.match(builder, /Finalizing locks this exact evidence snapshot/i);
});

test('missing evidence never becomes a weakness or zero', () => {
  assert.match(migration, /when q\.observation_count = 0 then 'not_assessed'/i);
  assert.match(migration, /unassessedObjectivesAreNotWeaknesses', true/i);
  assert.match(migration, /missingWorkIsNotZero', true/i);
  assert.match(builder, /not assessed.+not as low attainment or weakness/is);
});

test('expected standards are never invented', () => {
  assert.match(migration, /'expectedStandard', null/i);
  assert.match(migration, /'expectationStatus', 'not_configured'/i);
  assert.match(migration, /expectedStandardNotInferredWhenUnconfigured', true/i);
  assert.match(builder, /Not configured/i);
});

test('confidence and coverage disclose their limits', () => {
  assert.match(migration, /confidenceIsNotAttainment', true/i);
  assert.match(migration, /coverageIsNotMastery', true/i);
  assert.match(migration, /coverageScope', 'academic_year_to_cutoff'/i);
  assert.match(builder, /Coverage is academic-year-to-cutoff and is not mastery/i);
});

test('historical projections are not back-cast across later evidence', () => {
  assert.match(migration, /historicalProjectionUnavailable/i);
  assert.match(migration, /later\.observed_at >= v_cutoff/i);
  assert.match(migration, /historicalProjectionWithheldAfterLaterEvidence', true/i);
  assert.match(builder, /historical state.+withheld because later evidence exists/is);
});

test('intervention reporting separates activity from measured outcome', () => {
  assert.match(migration, /outcomeStatus/i);
  assert.match(migration, /systemOutcomeStatus/i);
  assert.match(migration, /activityVolumeIsNotAnInterventionOutcome', true/i);
  assert.match(builder, /Activity volume is never presented as evidence that an intervention worked/i);
});

test('family output excludes confidential working data', () => {
  assert.match(migration, /privateTeacherNotesExcluded', true/i);
  assert.match(migration, /rawEvidenceJsonExcluded', true/i);
  assert.doesNotMatch(migration.match(/v_payload := jsonb_build_object[\s\S]+?v_payload_hash :=/)?.[0] || '', /'rationale'|'teacherGoal'|'teacher_goal'|'note'/i);
  assert.match(builder, /Professional rationale and private notes are excluded/i);
});

test('one service contract powers both reporting entry points', () => {
  for (const fn of ['rpc_academic_reporting_context', 'rpc_generate_academic_report_snapshot', 'rpc_get_academic_report_snapshot', 'rpc_finalize_academic_report_snapshot']) assert.match(service, new RegExp(fn, 'i'));
  assert.match(studentEntry, /AcademicReportBuilder/i);
  assert.match(schoolHead, /AcademicReportBuilder/i);
  assert.match(schoolHead, /Build term \/ annual report/i);
});

test('report UI exposes year term class grade subject and audience controls', () => {
  for (const label of ['School year', 'Reporting period', 'Class', 'Grade', 'Subject', 'Audience']) assert.match(builder, new RegExp(label, 'i'));
  assert.match(builder, /Full academic year/i);
  assert.match(builder, /Draft → Final approval/i);
  assert.doesNotMatch(builder, /teacherComment/i);
  assert.match(builder, /Request governed correction/i);
});

test('phase 8 rollout requires database and historical reproducibility gates', () => {
  assert.match(roadmap, /## Phase 8 contract/i);
  assert.match(roadmap, /### Phase 8 rollout gate/i);
  assert.match(roadmap, /same report ID, source hash, payload[\s\S]+and version/i);
  assert.match(roadmap, /Draft cannot be[\s\S]+printed/i);
  assert.match(roadmap, /Begin Phase 9 only after schools can reproduce/i);
});
