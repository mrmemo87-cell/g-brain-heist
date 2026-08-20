import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('student report controls use dark text on their light panel', () => {
  const css = read('components/student-progress/StudentAcademicProfile.css');
  assert.match(css, /Academic report light-control contrast guard/);
  assert.match(css, /sap-report-controls label[\s\S]*#334155 !important/);
  assert.match(css, /sap-report-controls input[\s\S]*#0f172a !important/);
  assert.match(css, /textarea::placeholder[\s\S]*#94a3b8 !important/);
});

test('selected programme seat card is white-on-dark while commitment chip stays readable', () => {
  const css = read('components/school-admin/BillingContrast.css');
  assert.match(css, /button\[aria-pressed="true"\][\s\S]*background: #1e4b82 !important/);
  assert.match(css, /button\[aria-pressed="true"\][\s\S]*color: #ffffff !important/);
  assert.match(css, /span\.bg-emerald-100[\s\S]*#065f46 !important/);
});

test('teacher My Classes exposes roster printing only', () => {
  const source = read('components/TeacherPortal.tsx');
  assert.doesNotMatch(source, /Attendance register/i);
  assert.doesNotMatch(source, /Class Attendance Register/i);
  assert.doesNotMatch(source, /printClassDocuments\([^\n]*'register'/);
  assert.match(source, /const printClassDocuments = \(groups: typeof classGroups\) =>/);
  assert.match(source, /title: 'Class Roster'/);
});
