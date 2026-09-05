import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync('supabase/migrations/20260901113000_teacher_roster_reporting_truth.sql', 'utf8');
const workspaceMigration = readFileSync('supabase/migrations/20260905064600_teacher_class_roster_workspace.sql', 'utf8');
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

test('My Classes workspace is auth-scoped, canonical, and billing independent', () => {
  assert.match(workspaceMigration, /rpc_get_my_teacher_class_roster\(\)/);
  assert.match(workspaceMigration, /security invoker/i);
  assert.match(workspaceMigration, /cta\.teacher_user_id = auth\.uid\(\)/);
  assert.match(workspaceMigration, /public\.class_teacher_assignments/);
  assert.match(workspaceMigration, /public\.class_students/);
  assert.match(workspaceMigration, /public\.users/);
  assert.match(workspaceMigration, /grant execute on function public\.rpc_get_my_teacher_class_roster\(\) to authenticated/);
  assert.doesNotMatch(workspaceMigration, /p_teacher_id/);
  assert.doesNotMatch(workspaceMigration, /pilot/i);
});

test('teacher portal uses one canonical core roster loader and cannot clear it from assignment gating', () => {
  const materializerCalls = materializer.match(/patch_teacher_roster_reporting_truth\.py/g) || [];
  assert.ok(materializerCalls.length >= 2, 'roster invariant must be reasserted after later materializers');

  assert.match(patcher, /rpc_get_my_teacher_class_roster/);
  assert.match(patcher, /Teacher assignment effect separated from canonical roster workspace/);
  assert.match(patcher, /duplicate legacy block removed/);

  const canonicalCalls = portal.match(/supabase\.rpc\('rpc_get_my_teacher_class_roster'\)/g) || [];
  assert.equal(canonicalCalls.length, 1, 'My Classes must have exactly one canonical workspace loader');

  const compatibilityCalls = portal.match(/GameService\.get_students_for_assignment\(/g) || [];
  assert.equal(compatibilityCalls.length, 1, 'assignment roster API may exist only as the canonical loader fallback');

  assert.doesNotMatch(portal, /setAvailableStudents\(\[\]\)/);

  const assignmentGate = portal.indexOf('if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS))');
  const assignmentLoad = portal.indexOf('GameService.get_teacher_assignments(teacher.id)', assignmentGate);
  assert.ok(assignmentGate >= 0 && assignmentLoad > assignmentGate);
  const assignmentEffect = portal.slice(portal.lastIndexOf('useEffect(() => {', assignmentGate), assignmentLoad);
  assert.doesNotMatch(assignmentEffect, /setAvailableStudents/);
  assert.doesNotMatch(assignmentEffect, /rpc_get_my_teacher_class_roster/);
});

test('canonical workspace maps enrolled students into the same roster used by My Classes', () => {
  assert.match(portal, /studentsById = new Map<string, StudentForAssignment>/);
  assert.match(portal, /id: row\.student_id/);
  assert.match(portal, /display_name: row\.student_display_name/);
  assert.match(portal, /batch: row\.class_code \|\| null/);
  assert.match(portal, /setAvailableStudents\(Array\.from\(studentsById\.values\(\)\)\)/);
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
