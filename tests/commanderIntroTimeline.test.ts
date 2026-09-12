import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommanderIntroTimeline } from '../src/features/cursedCommander/commanderIntroTimeline';

for (const counts of [[3, 3], [1], [2, 5, 1], [0], [30, 30]]) {
  test(`intro introduces all teams and units before battle: ${counts}`, () => {
    const units = counts.flatMap((count, team) => Array.from({ length: count }, (_, i) => ({ id: `${team}-${i}`, side: `team-${team}` })));
    const before = JSON.stringify(units);
    const events = buildCommanderIntroTimeline(units);
    assert.deepEqual(events.filter(e => e.unitId).map(e => e.unitId).sort(), units.map(u => u.id).sort());
    assert.equal(events.filter(e => e.cue === 'team').length, counts.filter(Boolean).length);
    const battle = events.find(e => e.label === 'BATTLE!')!;
    assert.ok(events.filter(e => e.unitId).every(e => e.at < battle.at));
    assert.ok(events.every((e, i) => !i || e.at >= events[i - 1].at));
    assert.equal(events.filter(e => e.done).length, 1);
    assert.ok(events.at(-1)!.done);
    assert.equal(JSON.stringify(units), before);
    assert.ok(buildCommanderIntroTimeline(units, true).at(-1)!.at < events.at(-1)!.at);
  });
}
