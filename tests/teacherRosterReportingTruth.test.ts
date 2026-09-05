import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync('supabase/migrations/20260901113000_teacher_roster_reporting_truth.sql', 'utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const collective = readFileSync('components/CollectiveAssignmentReport.tsx', 'utf8');
const materializer = readFileSync('scripts/materialize_assignment_edit_feature.py', 'utf8');
const patcher = readFileSync('scripts/patch_teacher_roster_reporting_truth.py', 'utf8');

test('teacher roster remains visible while assignment eligibility stays fail closed', () => {
  assert.match(migration, /assignment_eligible boolean/);
  assert.match(migration, /access_status text/);
  assert.match(migration, /when r\.is_banned then 'banned'/);
  assert.match(migration, /r\.banned_until is not null and r\.banned_until > now\(\)/);
  assert.match(migration, /not coalesce\(u\.is_banned, false\)/);
  assert.match(migration, /not \(u\.banned_until is not null and u\.banned_until > now\(\)\)/);
});

test('teacher class roster materializer is independent of Pilot and binds to resolved teacher identity', () => {
  const materializerCalls = materializer.match(/patch_teacher_roster_reporting_truth\.py/g) || [];
  assert.ok(materializerCalls.length >= 2, 'roster invariant must be reasserted after later materializers');

  assert.match(patcher, /schools that have never started a Pilot/);
  assert.match(patcher, /if \(!teacher\?\.id\) return;/);
  assert.match(patcher, /GameService\.get_students_for_assignment\(teacher\.id\)/);
  assert.match(patcher, /\}, \[teacher\?\.id\]\);/);
  assert.match(patcher, /GameService\.get_teacher_assignments\(teacher\.id\)/);

  const resolvedBlockStart = patcher.indexOf('resolved_teacher_roster_effects =');
  const replaceStart = patcher.indexOf('replace_first_of(', resolvedBlockStart);
  assert.ok(resolvedBlockStart >= 0 && replaceStart > resolvedBlockStart);
  const resolvedBlock = patcher.slice(resolvedBlockStart, replaceStart);

  const rosterCall = resolvedBlock.indexOf('GameService.get_students_for_assignment(teacher.id)');
  const assignmentGate = resolvedBlock.indexOf('if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS))');
  assert.ok(rosterCall >= 0, 'resolved teacher roster call must exist');
  assert.ok(assignmentGate > rosterCall, 'billing gate must come after the roster lifecycle');

  const rosterLifecycle = resolvedBlock.slice(0, assignmentGate);
  assert.doesNotMatch(rosterLifecycle, /effectiveEntitlements/);
  assert.doesNotMatch(rosterLifecycle, /FEATURE_KEYS\.ASSIGNMENTS/);
  assert.doesNotMatch(rosterLifecycle, /setAssignments/);
});

test('legacy source still contains a patchable roster block until build materialization', () => {
  assert.match(portal, /GameService\.get_students_for_assignment\(\)/);
  assert.match(materializer, /patch_teacher_roster_reporting_truth\.py/);
});

test('historical assignment report keeps official names and assignment-time provenance', () => {
  assert.match(migration, /coalesce\(nullif\(trim\(u\.full_name\), ''\), nullif\(trim\(u\.username\), ''\), 'Student'\)/);
  assert.match(migration, /left join public\.student_assignments sa/);
  assert.match(migration, /coalesce\(sa\.batch, a\.class_code_snapshot, a\.batch\)/);
  assert.match(migration, /legacy_quarantined_assignment_students/);
});

test('assignment wizard excludes unavailable roster students from new assignment audiences', () => {
  assert.match(wizard, /assignableStudents/);
  assert.match(wizard, /assignment_eligible/);
  assert.match(wizard, /currently unavailable for new assignments/);
  assert.match(wizard, /setSelectedStudentIds\(assignableStudents\.map/);
});

test('teacher report keeps the RPC official name when a student is absent from the current roster', () => {
  assert.match(materializer, /patch_teacher_roster_reporting_truth\.py/);
  assert.match(patcher, /officialNames\.get\(row\.student_id\) \|\| row\.student_name/);
  assert.match(portal, /officialNames\.get\(row\.student_id\) \|\| row\.student_name \|\| 'Student name unavailable'/);
});

test('collective report waits for historical result rows before taking its initial student selection', () => {
  assert.match(patcher, /if \(loading \|\| !studentRows\.length \|\| studentSelectionReady\) return;/);
  assert.match(collective, /if \(loading \|\| !studentRows\.length \|\| studentSelectionReady\) return;/);
  assert.match(collective, /\[loading, studentRows, studentSelectionReady\]/);
});
