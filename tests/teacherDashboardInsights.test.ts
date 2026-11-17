import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assignmentAlerts,
  assignmentProgressStatus,
  combinedAccuracy,
  describeTopMissingAssignment,
  describeWeakestAssignment,
  rankStudentRisks,
  studentRisk,
  type DashboardAssignmentFollowup,
  type DashboardAssignmentResult,
  type DashboardStudentFollowup,
} from '../src/lib/teacherDashboardInsights';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const portalShell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');
const service = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20261117123000_teacher_dashboard_truthful_scope_and_insights.sql',
  'utf8',
);

const now = new Date('2026-11-17T12:00:00Z');

const student = (overrides: Partial<DashboardStudentFollowup>): DashboardStudentFollowup => ({
  student_id: 's1',
  student_name: 'Student One',
  assigned_count: 10,
  completed_count: 10,
  missing_count: 0,
  low_accuracy_count: 0,
  answered_question_count: 100,
  correct_answer_count: 90,
  accuracy: 90,
  ...overrides,
});

const followup = (overrides: Partial<DashboardAssignmentFollowup>): DashboardAssignmentFollowup => ({
  assignment_id: 'a1',
  assignment_title: 'Reported Speech HW',
  assigned_at: '2026-11-11T08:00:00Z',
  due_at: null,
  student_count: 16,
  completed_count: 4,
  missing_count: 12,
  low_accuracy_count: 1,
  ...overrides,
});

const result = (overrides: Partial<DashboardAssignmentResult>): DashboardAssignmentResult => ({
  assignment_id: 'a1',
  student_count: 10,
  completed_count: 10,
  submission_count: 10,
  answered_question_count: 100,
  correct_answer_count: 80,
  ...overrides,
});

test('assignment status separates past-due work from open work', () => {
  assert.equal(assignmentProgressStatus({ id: 'a', student_count: 8, completed_count: 8, due_at: '2026-10-21T17:59:00Z' }, now), 'complete');
  assert.equal(assignmentProgressStatus({ id: 'a', student_count: 8, completed_count: 2, due_at: '2026-10-21T17:59:00Z' }, now), 'overdue');
  assert.equal(assignmentProgressStatus({ id: 'a', student_count: 8, completed_count: 2, due_at: '2026-11-20T17:59:00Z' }, now), 'open');
  assert.equal(assignmentProgressStatus({ id: 'a', student_count: 8, completed_count: 2, due_at: null }, now), 'open');
});

test('accuracy is weighted by answers, and absent when nothing was answered', () => {
  assert.equal(combinedAccuracy([]), null);
  assert.equal(combinedAccuracy([result({ answered_question_count: 0, correct_answer_count: 0 }), undefined]), null);
  assert.equal(
    combinedAccuracy([
      result({ answered_question_count: 10, correct_answer_count: 10 }),
      result({ answered_question_count: 90, correct_answer_count: 45 }),
    ]),
    55,
  );
});

test('a student is at risk on their own record, not the class record', () => {
  assert.equal(studentRisk(student({})), null);
  // One missed assignment out of ten is not a pattern.
  assert.equal(studentRisk(student({ missing_count: 1, completed_count: 9 })), null);

  const missing = studentRisk(student({ missing_count: 9, completed_count: 1, accuracy: 60, answered_question_count: 30, correct_answer_count: 18 }));
  assert.ok(missing);
  assert.equal(missing.reason, 'Missing 9 of 10 assignments');
  assert.equal(missing.detail, '60% accuracy on submitted work');

  const lowOnly = studentRisk(student({ accuracy: 35, missing_count: 1, completed_count: 9 }));
  assert.ok(lowOnly);
  assert.equal(lowOnly.reason, '35% accuracy on submitted work');
  assert.equal(lowOnly.detail, 'Missing 1 of 10 assignments');

  assert.doesNotMatch(portal, /if \(hasInsights\) \{[\s\S]{0,200}lowCompletionClasses\.forEach/);
  assert.match(portal, /rankStudentRisks\(assignmentSuccess\?\.student_followups/);
});

test('risk ranking puts the most missing work first and caps the list', () => {
  const ranked = rankStudentRisks([
    student({ student_id: 'a', student_name: 'A', missing_count: 4, completed_count: 6 }),
    student({ student_id: 'b', student_name: 'B', missing_count: 9, completed_count: 1 }),
    student({ student_id: 'c', student_name: 'C' }),
    student({ student_id: 'd', student_name: 'D', accuracy: 40 }),
  ], 2);
  assert.deepEqual(ranked.map((risk) => risk.studentId), ['b', 'a']);
});

test('alerts summarise each assignment once instead of listing every student', () => {
  const alerts = assignmentAlerts([
    followup({}),
    followup({ assignment_id: 'a2', assignment_title: '3D shapes vocabulary', due_at: '2026-10-21T17:59:00Z', student_count: 8, completed_count: 2, missing_count: 6, low_accuracy_count: 0 }),
    followup({ assignment_id: 'a3', assignment_title: 'Verb aspect · Targeted Practice', student_count: 1, completed_count: 0, missing_count: 1, low_accuracy_count: 0 }),
    followup({ assignment_id: 'a4', assignment_title: 'Passive Voice', student_count: 19, completed_count: 19, missing_count: 0, low_accuracy_count: 3 }),
  ], now);
  assert.deepEqual(alerts.map((alert) => alert.text), [
    '“Reported Speech HW”: 12 of 16 students have not submitted; 1 scored below 65%.',
    '“3D shapes vocabulary”: 6 of 8 students have not submitted — past due.',
    '“Verb aspect · Targeted Practice”: not started yet.',
    '“Passive Voice”: 3 scored below 65%.',
  ]);
  assert.deepEqual(alerts.map((alert) => alert.tone), ['warning', 'warning', 'warning', 'info']);
});

test('recommended actions name the real assignment to chase or reteach', () => {
  assert.equal(describeTopMissingAssignment([]), null);
  assert.equal(
    describeTopMissingAssignment([followup({ missing_count: 3 }), followup({ assignment_title: 'Third Conditional (if) 1', student_count: 19, missing_count: 16 })]),
    'Chase “Third Conditional (if) 1” — 16 of 19 students have not submitted.',
  );
  const results = new Map([
    ['a1', result({ assignment_id: 'a1', correct_answer_count: 80 })],
    ['a2', result({ assignment_id: 'a2', correct_answer_count: 41 })],
    ['a3', result({ assignment_id: 'a3', submission_count: 1, answered_question_count: 10, correct_answer_count: 0 })],
  ]);
  assert.equal(
    describeWeakestAssignment([{ id: 'a1', title: 'Strong' }, { id: 'a2', title: 'Weak' }, { id: 'a3', title: 'One student' }], results),
    'Reteach “Weak” — class accuracy was 41%.',
  );
  assert.equal(describeWeakestAssignment([{ id: 'a1', title: 'Strong' }], results), null);
});

test('dashboard reads the insight keys and keeps the legacy wording as a fallback', () => {
  assert.match(service, /has_insights: Array\.isArray\(row\?\.assignment_results\)/);
  assert.match(service, /overdue_assignment_count/);
  assert.match(portal, /const hasInsights = assignmentSuccess\?\.has_insights === true/);
  assert.match(portal, /assignmentAlerts\(followupAssignments, dashboardNow, 6\)/);
  assert.match(portal, /has not completed “\$\{row\.assignment_title\}”/);
  assert.match(portal, /⏰ Past due/);
  assert.match(portalShell, /past due/);
});

test('summary and list share one scope, including replaced groups and group-less practice', () => {
  assert.match(migration, /create or replace function private\.teacher_assignment_continuity_group_id/i);
  assert.match(migration, /revoke all on function private\.teacher_assignment_continuity_group_id\(uuid,uuid\)\s+from public,anon,authenticated/i);
  // Archived group replaced inside the same offering, taught by this teacher.
  assert.match(migration, /g0\.status<>'active'\s+and g0\.school_subject_offering_id=g2\.school_subject_offering_id/i);
  assert.match(migration, /gt0\.teacher_user_id=p_teacher_user_id/i);
  // Group-less work matches on the teaching group's subject, not the homeroom subject.
  assert.match(migration, /teacher_assignment_subject_key\(s2\.name\)\s+=private\.teacher_assignment_subject_key\(a\.subject_name\)/i);
  // The teacher must actively teach an active group that holds an assigned student.
  assert.match(migration, /gt\.teacher_user_id=p_teacher_user_id\s+and gt\.school_id=a\.school_id\s+and gt\.active/i);
  assert.match(migration, /overlap\.shared_students>0/i);
  const uses = migration.match(/private\.teacher_assignment_continuity_group_id\(a\.id,/g) || [];
  assert.equal(uses.length, 3, 'list, group context and summary all use the continuity scope');
});

test('summary counts logical bundles once and stays tenant- and teacher-scoped', () => {
  assert.match(migration, /lgg\.canonical_assignment_id[\s\S]*?\),a\.id\) logical_id/i);
  assert.match(migration, /where t\.user_id=auth\.uid\(\)/i);
  assert.match(migration, /join current_teacher t on t\.teacher_id=a\.teacher_id/i);
  assert.match(migration, /y\.status='current'/i);
  assert.match(migration, /legacy_quarantined_assignment_students/i);
  for (const key of ['assignment_followups', 'student_followups', 'student_followup_count', 'assignment_results', 'overdue_assignment_count']) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  for (const fn of ['rpc_teacher_assignment_success_summary\\(\\)', 'rpc_get_assignments_for_teacher\\(uuid\\)', 'rpc_teacher_assignment_group_context\\(uuid\\)']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\s+from public,anon`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\s+to authenticated,service_role`, 'i'));
  }
});
