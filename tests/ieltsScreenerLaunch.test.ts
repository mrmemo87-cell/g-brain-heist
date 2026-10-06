import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIeltsScreenerCatalog } from '../services/ieltsScreenerLaunchService';

const entry = { title: 'Synthetic screener', code: 'test-only', exam_event_id: '00000000-0000-0000-0000-000000000001',
  assignment_id: null, attempt_id: null, status: 'ready', duration_minutes: 15, starts_at: '2026-10-06T00:00:00Z' };
test('launch catalog accepts only safe states and identifiers and discards hidden metadata', () => {
  assert.deepEqual(parseIeltsScreenerCatalog([{ ...entry, answer_key: 'must not reach the UI' }]), [entry]);
  for (const value of [null, {}, [{ ...entry, status: 'published' }], [{ ...entry, exam_event_id: '../other' }],
    [{ ...entry, duration_minutes: 0 }], [{ ...entry, attempt_id: 'bad' }]]) {
    assert.throws(() => parseIeltsScreenerCatalog(value), /could not check/);
  }
});
