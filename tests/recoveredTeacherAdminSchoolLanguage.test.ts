import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (relative: string) => fs.readFileSync(relative, 'utf8');

test('teacher workspace uses teacher-specific help and no attendance register action', () => {
  const source = read('components/TeacherPortal.tsx');
  assert.match(source, /TeacherGuideHelpModal/);
  assert.doesNotMatch(source, /Attendance register/i);
  assert.doesNotMatch(source, /printClassDocuments\(classGroups, 'register'\)/);
});

test('teacher guide explains the school workflow instead of the student game', () => {
  const source = read('components/TeacherGuideHelpModal.tsx');
  assert.match(source, /My Classes/);
  assert.match(source, /Question Bank & My Pool/);
  assert.match(source, /Assignments/);
  assert.match(source, /Reports & Academic Profiles/);
  assert.match(source, /Student Support Plans/);
  assert.match(source, /Document Center/);
  assert.match(source, /Writing Hub/);
  assert.doesNotMatch(source, /PvP Raids/);
  assert.doesNotMatch(source, /Coins & Economy/);
});

test('production roster-name and question-hash permission migration is source controlled', () => {
  const source = read('supabase/migrations/20260819150049_fix_teacher_roster_names_and_question_hash_permissions.sql');
  assert.match(source, /coalesce\(nullif\(trim\(r\.full_name\), ''\), nullif\(trim\(r\.username\), ''\), 'Student'\)/);
  assert.match(source, /rpc_get_students_for_assignment\(uuid\)/);
  assert.match(source, /grant execute on function public\.rpc_get_students_for_assignment\(uuid\) to authenticated, service_role/i);
  assert.match(source, /private\.question_content_hash\(uuid, text, jsonb, text, text, text, text\)/);
  assert.match(source, /grant execute on function private\.question_content_hash[\s\S]*to authenticated, service_role/i);
  assert.doesNotMatch(source, /grant execute on function private\.question_content_hash[\s\S]*to anon/i);
});
