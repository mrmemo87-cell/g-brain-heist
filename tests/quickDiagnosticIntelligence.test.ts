import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const panel = readFileSync('components/teacher/DiagnosticIntelligencePanel.tsx', 'utf8');
const shell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');
const interventions = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260928093000_teacher_quick_diagnostic_intelligence.sql', 'utf8');

test('quick diagnostic report exposes governed evidence focus intelligence', () => {
  assert.match(portal, /fetchTeacherAssignmentDiagnosticIntelligence/);
  assert.match(portal, /DiagnosticIntelligencePanel/);
  assert.match(portal, /DiagnosticStudentSkillMap/);
  assert.match(panel, /Brains Heist · \{data\.assignment\.subjectName\} Diagnostic Intelligence/);
  assert.match(panel, /What should I teach next\?/);
  assert.match(panel, /Class focus map/);
  assert.match(panel, /Screening rule:/);
});

test('diagnostic support handoff keeps student and exact focus context', () => {
  assert.match(panel, /data-student-id/);
  assert.match(panel, /data-focus-code/);
  assert.match(shell, /params\.set\('student'/);
  assert.match(shell, /params\.set\('focus'/);
  assert.match(interventions, /requestedFocusCode/);
  assert.match(interventions, /Opened from Quick diagnostic:/);
});

test('diagnostic RPC is teacher-owned and uses immutable taxonomy snapshots', () => {
  assert.match(migration, /v_teacher_user_id is distinct from v_actor/);
  assert.match(migration, /aq\.diagnostic_taxonomy_id/);
  assert.match(migration, /dt\.taxonomy_hash = aq\.diagnostic_taxonomy_hash/);
  assert.match(migration, /aq\.question_content_hash/);
  assert.match(migration, /join public\.student_assignment_results sr/);
  assert.match(migration, /screening signal, not proof of mastery/i);
  assert.match(migration, /grant execute on function public\.rpc_teacher_assignment_diagnostic_intelligence\(uuid, uuid\)\s+to authenticated/i);
});
