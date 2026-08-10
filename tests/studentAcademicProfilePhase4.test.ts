import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rpc = readFileSync('supabase/migrations/20260809174000_student_academic_profile_rpc.sql', 'utf8');
const profile = readFileSync('components/student-progress/StudentAcademicProfile.tsx', 'utf8');
const report = readFileSync('components/student-progress/AcademicReportBuilder.tsx', 'utf8');
const service = readFileSync('services/studentAcademicProfileService.ts', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');

test('academic profile RPC scopes teacher access by active subject assignments', () => {
  assert.match(rpc, /class_teacher_assignments/i);
  assert.match(rpc, /cta\.active is true/i);
  assert.match(rpc, /v_allowed_subjects/i);
  assert.match(rpc, /not authorized for requested subject/i);
  assert.match(rpc, /lower\(trim\(s\.subject\)\) = any\(v_allowed_subjects\)/i);
});

test('academic profile returns one report-safe contract for subjects, assignments, focus and timeline', () => {
  for (const key of ['subjects', 'assignments', 'focus_areas', 'timeline', 'assignment_average', 'persistent_focus_count', 'resolved_count']) {
    assert.match(rpc, new RegExp(`'${key}'`, 'i'));
  }
  assert.match(service, /rpc_student_academic_profile/i);
  assert.match(service, /StudentAcademicProfile/i);
});

test('teacher and student profile UI contains the longitudinal academic sections', () => {
  assert.match(profile, /Subject breakdown/i);
  assert.match(profile, /Persistent and recurring focus/i);
  assert.match(profile, /Strengths and improvement/i);
  assert.match(profile, /Assignment marks and grades/i);
  assert.match(profile, /Progress timeline/i);
  assert.match(profile, /Generate individual report/i);
  assert.match(profile, /one low result does not automatically become a persistent weakness/i);
});

test('individual report is explicit about evidence accuracy and missing work', () => {
  assert.match(report, /Missing evidence will be disclosed as “not assessed,” never/i);
  assert.match(report, /Missing work is not zero/i);
  assert.match(report, /Attainment, progress and evidence confidence/i);
  assert.match(report, /exact references/i);
  assert.match(report, /Confidential/i);
  assert.match(report, /Print \/ Save PDF/i);
});

test('academic profile has a production build entry point', () => {
  assert.match(vite, /academicProfile:\s*path\.resolve\(__dirname, 'academic-profile\.html'\)/i);
});
