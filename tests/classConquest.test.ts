import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { apportion, assignOblasts, buildConquest, dayPower, OBLASTS, type ConquestClass } from '../src/lib/classConquest.js';

const team = (id: string, size: number, done: number[], mine = false): ConquestClass => ({
  class_id: id, label: id, size, is_mine: mine,
  days: done.map((n, i) => ({ date: `2026-10-${String(19 + i).padStart(2, '0')}`, done: n })),
});

test('power is the share of the class that finished, so class size does not matter', () => {
  assert.equal(dayPower(2, 2), 100);
  assert.equal(dayPower(8, 8), 100);
  assert.equal(dayPower(4, 8), 50);
  assert.equal(dayPower(9, 8), 100, 'never above 100');
  assert.equal(dayPower(0, 0), 0);
});

test('all 7 oblasts are shared out, and none when nobody has power', () => {
  const seats = apportion({ a: 300, b: 200, c: 100 });
  assert.equal(Object.values(seats).reduce((s, n) => s + n, 0), 7);
  assert.ok(seats['a']! >= seats['b']! && seats['b']! >= seats['c']!);
  assert.deepEqual(Object.values(apportion({ a: 0, b: 0 })), [0, 0]);
  assert.ok(Object.values(assignOblasts({ a: 0, b: 0 })).every((owner) => owner === null));
});

test('the strongest class holds the most valuable oblasts', () => {
  const owners = assignOblasts({ a: 100, b: 600 });
  assert.equal(owners[OBLASTS[0].zoneId], 'b', 'Chüy goes to the leader');
  assert.equal(owners[OBLASTS[6].zoneId], 'a');
});

test('a small class where everyone shows up beats a big class where few do', () => {
  const small = team('7B', 2, [2, 2, 2]);
  const big = team('7C', 8, [2, 2, 2]);
  const view = buildConquest([small, big], '2026-10-21');
  assert.equal(view.powers['7B'], 300);
  assert.equal(view.powers['7C'], 75);
  assert.equal(view.ranking[0], '7B');
  assert.ok(view.held['7B'] > view.held['7C']);
});

test('today’s captures and the missions needed to take the next oblast', () => {
  // Before today 7A leads; today 7C finishes many missions.
  const a = team('7A', 5, [5, 5, 0]);
  const c = team('7C', 8, [2, 2, 8], true);
  const view = buildConquest([a, c], '2026-10-21');
  assert.ok(view.captures.length > 0, 'something changed hands today');
  assert.ok(view.captures.every((cap) => cap.by === '7C'));
  assert.equal(view.myDoneToday, 8);
  assert.equal(view.missionsToNext, null, 'whole class already finished today');

  const c2 = team('7C', 8, [2, 2, 1], true);
  const view2 = buildConquest([a, c2], '2026-10-21');
  assert.equal(view2.powerPerMission, 12, 'one more of 8 students adds about 12 power');
  assert.ok(view2.missionsToNext !== null && view2.missionsToNext >= 1 && view2.missionsToNext <= 7);
});

test('territory is stable: only the oblasts that must change hands do', () => {
  // Mon/Tue 7A strong; Wed 7C pulls ahead a little.
  const a = team('7A', 5, [5, 5, 2]);
  const c = team('7C', 8, [2, 2, 8], true);
  const view = buildConquest([a, c], '2026-10-21');
  assert.ok(view.captures.length >= 1 && view.captures.length <= 2, `expected 1-2 captures, got ${view.captures.length}`);
  for (const cap of view.captures) {
    assert.equal(cap.by, '7C');
    assert.equal(cap.from, '7A', 'captured from the class that lost ground, not reshuffled');
  }
  assert.equal(Object.values(view.held).reduce((s, n) => s + n, 0), 7);
});

test('the database returns class totals only, never student names', () => {
  const sql = readFileSync('supabase/migrations/20261021160000_class_conquest.sql', 'utf8');
  const output = sql.slice(sql.indexOf("'class_id', t.class_id"), sql.indexOf('into v_classes'));
  assert.doesNotMatch(output, /username|full_name|student_id/);
  assert.match(sql, /revoke all on function public\.rpc_get_class_conquest\(text\) from public, anon/i);
  assert.match(sql, /c\.school_id = v_school and c\.grade_level = v_grade/);
});
