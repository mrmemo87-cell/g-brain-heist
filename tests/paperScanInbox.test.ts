import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanInbox } from '../src/lib/paperScan/inbox';
import type { ScanSession, ScanSheet } from '../src/lib/paperScan/layout';
const page = (changes: Partial<ScanSheet> = {}): ScanSheet => ({ id: 'sheet', studentId: 'student', studentName: 'Student', pageNumber: 1, pageCount: 1, layoutVersion: 'v1', questions: [], scanId: 'scan', reviewedAnswers: {}, ...changes });
const session = (id: string, sheets: ScanSheet[]): ScanSession => ({ id, assignmentId: 'assignment', assessedAt: '', formHash: '', sheets });
const students = [{ id: 'student', status: 'assigned', existingAnswerCount: 0 }];
test('saved reviews restore without a local photo tray; completed roster stays finished', () => {
  assert.equal(scanInbox([session('old', [page()])], students)[0].ready, true);
  assert.equal(scanInbox([session('old', [page()])], [{ ...students[0], status: 'completed' }]).length, 0);
});
test('missing, unreviewed, duplicate and inconsistent pages cannot finalize a booklet', () => {
  for (const pages of [[page({ pageCount: 2 })], [page({ reviewedAnswers: null })], [page({ pageCount: 2 }), page({ id: 'other', pageCount: 2 })], [page({ pageNumber: 0 })]]) assert.equal(scanInbox([session('a', pages)], students)[0].ready, false);
  assert.equal(scanInbox([session('a', [page({ pageCount: 2 }), page({ id: 'other', pageNumber: 2, pageCount: 2 })])], students)[0].ready, true);
});
test('guest identity and partial online answers require individual confirmation', () => {
  assert.equal(scanInbox([session('a', [page()])], [{ ...students[0], existingAnswerCount: 1 }])[0].ready, false);
  assert.equal(scanInbox([session('a', [page({ studentId: null, guestId: 'guest' })])], students)[0].ready, false);
});
test('newest scan wins per student, including a partial unreviewed replacement', () => {
  const old = session('old', [page({ scannedAt: '2026-01-01' }), page({ id: 'different', studentId: 'other', scannedAt: '2026-03-01' })]);
  const newer = session('new', [page({ id: 'new-sheet', reviewedAnswers: null, scannedAt: '2026-02-01' })]);
  const booklet = scanInbox([old, newer], students).find(value => value.pages[0].studentId === 'student')!;
  assert.equal(booklet.session.id, 'new'); assert.equal(booklet.ready, false);
});
test('already confirmed and held guest pages are omitted', () => {
  assert.equal(scanInbox([session('a', [page({ confirmedAt: 'now' })])], students).length, 0);
  assert.equal(scanInbox([session('a', [page({ studentId: null, guestId: 'guest', heldAt: 'now' })])], students).length, 0);
});
