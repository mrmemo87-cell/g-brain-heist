import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyseClassProgress, bandFor, skillArea, suggestTests, type CprData } from '../src/lib/classProgressReport.js';
import { buildClassProgressPrint, SUPPORT_ROWS_PAGE_2 } from '../src/lib/classProgressReportPrint.js';
import { DEFAULT_BOOKLET_PRINT_SETTINGS } from '../src/lib/paperScan/printBooklets.js';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const day = (d: string) => `${d}T08:00:00Z`;

function fixture(students = 6): CprData {
  const ids = Array.from({ length: students }, (_, i) => `s${i + 1}`);
  const assignments = [
    { id: 'trial', title: 'TEST Diagnostic · Grade 7', topic: 'Quick diagnostic', category: 'quiz', delivery_mode: 'online', assigned_at: day('2026-10-05'), due_at: null, from_archived_group: false },
    { id: 'start', title: 'Deep Diagnostic · Grade 7', topic: 'Quick diagnostic', category: 'quiz', delivery_mode: 'paper', assigned_at: day('2026-10-12'), due_at: null, from_archived_group: false },
    { id: 'old', title: 'Past simple', topic: 'General', category: 'classwork', delivery_mode: 'online', assigned_at: day('2026-10-19'), due_at: null, from_archived_group: true },
    { id: 'hw', title: 'Reported speech HW', topic: 'General', category: 'homework', delivery_mode: 'online', assigned_at: day('2026-11-11'), due_at: null, from_archived_group: false },
    { id: 'end', title: 'ESL Diagnostic · 26/11', topic: 'Quick diagnostic', category: 'quiz', delivery_mode: 'paper', assigned_at: day('2026-11-26'), due_at: null, from_archived_group: false },
  ];
  const starts = [30, 55, 68, 13, 48, 60];
  const ends = [25, 50, 55, 60, 75, null];
  const results = ids.flatMap((id, i) => [
    { assignment_id: 'trial', student_id: id, accuracy: 50, completed_at: day('2026-10-05'), late: false },
    { assignment_id: 'start', student_id: id, accuracy: starts[i % starts.length], completed_at: day('2026-10-12'), late: false },
    { assignment_id: 'old', student_id: id, accuracy: 70, completed_at: day('2026-10-20'), late: false },
    { assignment_id: 'hw', student_id: id, accuracy: i % 2 ? null : 80, completed_at: i % 2 ? null : day('2026-11-12'), late: false },
    { assignment_id: 'end', student_id: id, accuracy: ends[i % ends.length], completed_at: ends[i % ends.length] === null ? null : day('2026-11-26'), late: false },
  ]);
  return {
    generated_at: new Date(NOW).toISOString(),
    school: { id: 'school', name: 'Silk Road International School', logo_url: 'https://example.supabase.co/storage/v1/object/public/school-logos/logo.jpg', expected_level: 70, expected_level_set: false },
    group: { id: 'group', name: 'Grade 7 ESL', subject: 'ESL', archived: false, teachers: ['Jess'] },
    viewer: { is_school_admin: false, is_teacher: true },
    students: ids.map((id, i) => ({ id, name: `Student ${String.fromCharCode(65 + i)} Test`, class_code: '7A' })),
    assignments,
    results,
    skills: [
      { assignment_id: 'start', skill: 'Verb tense and time reference', total: 200, correct: 90 },
      { assignment_id: 'end', skill: 'Verb tense and time reference', total: 100, correct: 55 },
      { assignment_id: 'start', skill: 'Explicit information', total: 120, correct: 42 },
      { assignment_id: 'end', skill: 'Explicit information', total: 10, correct: 7 },
      { assignment_id: 'old', skill: null, total: 300, correct: 200 },
    ],
    interventions: [
      { id: 'p1', student_id: 's1', status: 'active', skill: 'Verb tense and time reference', action: 'Targeted practice', created_at: day('2026-11-01'), target_date: null },
      { id: 'p2', student_id: 's2', status: 'cancelled', skill: 'Modality', action: null, created_at: day('2026-11-01'), target_date: null },
    ],
  };
}

test('suggests the earliest and latest diagnostic most of the class sat, never a trial run', () => {
  assert.deepEqual(suggestTests(fixture()), { baselineId: 'start', latestId: 'end' });
});

test('averages and improvement count only students who sat both tests', () => {
  const model = analyseClassProgress(fixture(), { now: NOW });
  assert.equal(model.mode, 'tests');
  assert.equal(model.matched, 5);
  assert.equal(model.averageStart, Math.round((30 + 55 + 68 + 13 + 48) / 5));
  assert.equal(model.averageNow, Math.round((25 + 50 + 55 + 60 + 75) / 5));
  assert.equal(model.improving, 2);
  assert.equal(model.dropped, 3);
  assert.equal(model.status.label, 'Below expected · improving');
});

test('archived-group work and homework count towards completion', () => {
  const model = analyseClassProgress(fixture(), { now: NOW });
  assert.equal(model.assignedTotal, 30);
  assert.equal(model.homeworkAssigned, 6);
  assert.equal(model.homeworkDone, 3);
});

test('skill areas need enough tagged answers on both tests to be reliable', () => {
  const model = analyseClassProgress(fixture(), { now: NOW });
  const grammar = model.skills.find((s) => s.name === 'Grammar & vocabulary')!;
  const reading = model.skills.find((s) => s.name === 'Reading')!;
  assert.equal(grammar.reliable, true);
  assert.equal(grammar.start, 45);
  assert.equal(grammar.now, 55);
  assert.equal(reading.reliable, false);
  assert.equal(model.taggedShare, Math.round((430 / 730) * 100));
  assert.equal(skillArea('Inference and implied meaning'), 'Reading');
  assert.equal(skillArea('Writing mechanics'), 'Writing');
  assert.equal(skillArea('Modality'), 'Grammar & vocabulary');
});

test('bands sit 15 points either side of the school expected level', () => {
  assert.equal(bandFor(54, 70), 'below');
  assert.equal(bandFor(55, 70), 'working');
  assert.equal(bandFor(70, 70), 'at');
  assert.equal(bandFor(85, 70), 'above');
  const model = analyseClassProgress(fixture(), { now: NOW, expectedLevel: 50 });
  assert.equal(model.expectedLevel, 50);
  assert.equal(model.bandsNow.at + model.bandsNow.above, 4);
});

test('students who need support show their plans; cancelled plans are ignored', () => {
  const model = analyseClassProgress(fixture(), { now: NOW });
  const first = model.support.find((r) => r.student.id === 's1')!;
  assert.equal(first.status, 'plan_active');
  assert.match(first.plan, /verb tense/);
  const second = model.support.find((r) => r.student.id === 's2');
  assert.equal(second?.status, 'needs_plan');
  assert.equal(model.support[0].status, 'needs_plan');
});

test('with no two tests the report compares earlier and recent work and says so', () => {
  const model = analyseClassProgress(fixture(), { now: NOW, baselineId: null, latestId: null });
  assert.equal(model.mode, 'work');
  assert.equal(model.startLabel, 'Earlier work');
  assert.ok(model.focus.some((f) => /end-of-term test/.test(f)));
});

test('prints two fixed A4 pages with the school logo and the smart print reminder', () => {
  const model = analyseClassProgress(fixture(), { now: NOW });
  const doc = buildClassProgressPrint(model, { settings: DEFAULT_BOOKLET_PRINT_SETTINGS, teacherNote: 'Edited <note>', focus: ['One', '', 'Two'], documentId: 'CLS-TEST' });
  assert.equal(doc.pages, 2);
  assert.equal(doc.plan.physicalSheets, 1);
  assert.match(doc.html, /school-logos\/logo\.jpg/);
  assert.match(doc.html, /Double-sided · 1 page per side · A4 · Portrait/);
  assert.match(doc.html, /Edited &lt;note&gt;/);
  assert.equal((doc.html.match(/class="print-page cp-page"/g) ?? []).length, 2);
  assert.doesNotMatch(doc.html, /<li><\/li>/);
});

test('a long support list continues on extra pages instead of overflowing', () => {
  const data = fixture(30);
  const model = analyseClassProgress(data, { now: NOW });
  assert.ok(model.support.length > SUPPORT_ROWS_PAGE_2);
  const doc = buildClassProgressPrint(model, { settings: DEFAULT_BOOKLET_PRINT_SETTINGS, teacherNote: '', focus: [] });
  assert.equal(doc.pages, 3);
  assert.match(doc.html, /Students who need support · continued/);
});

test('the migration keeps the report read-only and authorised', () => {
  const sql = readFileSync('supabase/migrations/20261127200000_class_progress_report.sql', 'utf8');
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /not_authorized/);
  assert.match(sql, /revoke all on function public\.rpc_class_progress_report\(uuid\) from public, anon/);
  assert.doesNotMatch(sql.split('rpc_school_admin_set_progress_expected_level')[0], /\b(insert|update|delete)\s+(into\s+)?public\./i);
});
