import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const service = readFileSync('services/teacherAssignmentPrintService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260928103000_teacher_assignment_print_packet.sql', 'utf8');

test('teacher assignment workspace exposes professional paper printing', () => {
  assert.match(portal, /Print paper/);
  assert.match(portal, /handlePrintAssignmentPaper/);
  assert.match(service, /student-question-paper-v1/);
  assert.match(service, /openSchoolDocumentPreview/);
  assert.match(service, /schoolDocumentFileName/);
  assert.match(service, /Student name/);
  assert.match(service, /Questions/);
  assert.match(service, /inkSaver: true/);
});

test('print packet uses immutable snapshots and never exposes marking keys', () => {
  assert.match(migration, /aq\.question_snapshot/);
  assert.match(migration, /join public\.teachers t[\s\S]*t\.user_id = v_actor/i);
  assert.doesNotMatch(migration, /'correctAnswer'/);
  assert.doesNotMatch(migration, /->>'correct_answer'/);
  assert.doesNotMatch(migration, /->>'accepted_answers'/);
  assert.doesNotMatch(migration, /->>'explanation'/);
  assert.match(migration, /revoke all on function public\.rpc_teacher_assignment_print_packet\(uuid\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.rpc_teacher_assignment_print_packet\(uuid\)[\s\S]*to authenticated/i);
});
