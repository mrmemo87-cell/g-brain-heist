import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  allTimeMasterminds, apportion, assignOblasts, buildConquest, CHEER_CODES, CHEER_TEXT, CONQUEST_SEASON, countdownLabel, dayPower,
  mapForWeek, OBLASTS, phaseFor, revealAtIso, roleForRank, sealsAtIso, UNITED_KINGDOM, weekStartOf, winStreak,
  type ConquestClass, type ConquestResult,
} from '../src/lib/classConquest.js';
import { CONQUEST_RULES, TERRITORY_INTEL } from '../src/lib/conquestIntel.js';
import { buildCertificateDocument, certificateId, conquestBadgeSvg, weekLabel } from '../src/lib/conquestCertificates.js';

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

// ───────────────────────────── seasons ─────────────────────────────

test('every week is a different map, Kyrgyzstan first and the UK right after', () => {
  assert.equal(weekStartOf('2026-10-30'), '2026-10-26', 'Friday belongs to the week that started Monday');
  assert.equal(weekStartOf('2026-11-01'), '2026-10-26', 'Sunday too');
  assert.equal(mapForWeek('2026-10-30').mapId, 'kyrgyzstan');
  assert.equal(mapForWeek('2026-11-02').mapId, 'unitedkingdom');
  assert.equal(mapForWeek('2026-11-05').mapId, 'unitedkingdom');
  assert.equal(mapForWeek('2026-11-09').mapId, 'kazakhstan');
  assert.equal(mapForWeek('2026-10-19').mapId, 'kyrgyzstan', 'weeks before the season were all Kyrgyzstan');
  const ids = CONQUEST_SEASON.map((m) => m.mapId);
  assert.equal(new Set(ids).size, ids.length, 'no map repeats inside one rotation');
  assert.equal(mapForWeek('2026-12-07').mapId, 'kyrgyzstan', 'rotation wraps after six weeks');
});

test('the SQL map rotation is identical to the TypeScript one', () => {
  const sql = readFileSync('supabase/migrations/20261030120000_class_conquest_seasons.sql', 'utf8');
  const match = sql.match(/array\[([^\]]+)\]/);
  assert.ok(match, 'rotation array present in SQL');
  const sqlIds = match![1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(sqlIds, CONQUEST_SEASON.map((m) => m.mapId));
  assert.match(sql, /date '2026-10-26'/, 'same anchor Monday');
});

test('the UK map shares out all twelve regions and the leader takes Greater London', () => {
  const a = team('7A', 5, [5, 5, 5], true);
  const c = team('7C', 8, [2, 2, 2]);
  const view = buildConquest([a, c], '2026-11-04', UNITED_KINGDOM);
  assert.equal(view.map.mapId, 'unitedkingdom');
  assert.equal(Object.values(view.held).reduce((s, n) => s + n, 0), 12);
  assert.equal(view.owners['zone-10'], '7A', 'Greater London goes to the leader');
  assert.ok(view.held['7A'] > view.held['7C']);
  assert.ok(Object.keys(view.owners).every((zone) => UNITED_KINGDOM.territories.some((t) => t.zoneId === zone)), 'only UK zones are coloured');
});

const result = (week: string, winner: string, top: Array<[string, string]>, mapId = 'kyrgyzstan'): ConquestResult => ({
  week_start: week, map_id: mapId, grade: '7', winner_class_id: winner, winner_label: winner,
  standings: [
    { class_id: winner, label: winner, size: 5, power: 400, missions: 20, rank: 1 },
    { class_id: 'x', label: '7X', size: 6, power: 100, missions: 6, rank: 2 },
  ],
  top_students: top.map(([id, name], i) => ({ student_id: id, name, avatar_url: null, missions: 5 - i, correct: 20 - i, rank: i + 1 })),
});

test('hall of fame: win streaks and all-time masterminds', () => {
  const history = [
    result('2026-11-02', '7A', [['s1', 'Aida'], ['s2', 'Bek']], 'unitedkingdom'),
    result('2026-10-26', '7A', [['s2', 'Bek'], ['s1', 'Aida']]),
    result('2026-10-19', '7B', [['s9', 'Nur']]),
  ];
  assert.deepEqual(winStreak(history), { class_id: '7A', label: '7A', weeks: 2 });
  const stars = allTimeMasterminds(history);
  assert.equal(stars[0].student_id, 's1', 'two podiums each; Aida has a Mastermind finish in the latest week — tie broken by firsts (both 1) then name');
  assert.equal(stars[0].podiums, 2);
  assert.equal(stars[2].student_id, 's9');
  assert.equal(winStreak([]), null);
  assert.equal(roleForRank(1), 'Mastermind');
  assert.equal(roleForRank(5), 'Getaway Driver');
  assert.equal(roleForRank(9), 'Getaway Driver', 'never out of range');
});

test('certificates: one page per winner plus the class page, names escaped, badge carries the rank', () => {
  const r = result('2026-10-26', '7B', [['s1', 'Aigerim <Z>'], ['s2', 'Бек'], ['s3', 'Dan'], ['s4', 'Eli'], ['s5', 'Fin']]);
  const html = buildCertificateDocument({ result: r, issuer: 'Test School' });
  assert.equal((html.match(/<section class="cert"/g) ?? []).length, 6);
  assert.match(html, /Aigerim &lt;Z&gt;/);
  assert.doesNotMatch(html, /Aigerim <Z>/);
  assert.match(html, /Бек/);
  assert.match(html, /Mastermind of Grade 7/);
  assert.match(html, /Getaway Driver/);
  assert.match(html, /Operation Kyrgyzstan/);
  assert.match(html, /size: A4 landscape/);
  assert.match(html, /Test School/);
  assert.equal(weekLabel('2026-10-26'), '26 Oct – 30 Oct 2026', 'Monday to Friday');
  assert.match(buildCertificateDocument({ result: r, theme: 'light' }), /<body class="theme-light">/);
  const branded = buildCertificateDocument({ result: r, issuer: 'Bishkek International School', schoolLogoUrl: 'https://cdn.example/crest.png', brandLogoUrl: 'https://app.example/logo.png' });
  assert.match(branded, /<img src="https:\/\/cdn\.example\/crest\.png" alt="">/, 'school crest in the header');
  assert.match(branded, /<img src="https:\/\/app\.example\/logo\.png" alt="Brains Heist">/, 'Brains Heist logo in the header');
  assert.match(branded, /Class Teacher[\s\S]*Head of School/, 'two signature lines');
  assert.match(html, /class="monogram"/, 'no crest → monogram fallback');
  assert.equal(certificateId(r, 's1'), certificateId(r, 's1'), 'certificate numbers are stable');
  assert.notEqual(certificateId(r, 's1'), certificateId(r, 's2'));
  assert.match(certificateId(r, 's1'), /^BH-261026-[0-9A-Z]{7}$/);
  assert.match(html, /<body class="theme-dark">/);
  const gold = conquestBadgeSvg({ kind: 'gold', mapId: 'unitedkingdom', rank: 3 });
  assert.match(gold, /#3/);
  assert.match(gold, /🇬🇧/);
  assert.match(gold, /Safecracker · United Kingdom/);
  assert.doesNotMatch(conquestBadgeSvg({ kind: 'silver', mapId: 'kyrgyzstan' }), />#\d<\/text>/, 'silver badges carry no rank');
});

test('the week closes Friday night and the vault opens Monday morning', () => {
  assert.equal(phaseFor('2026-10-30'), 'battle', 'Friday still scores');
  assert.equal(phaseFor('2026-10-31'), 'sealed', 'Saturday is sealed');
  assert.equal(phaseFor('2026-11-01'), 'sealed', 'Sunday is sealed');
  assert.equal(phaseFor('2026-11-02'), 'battle', 'Monday: new map');
  assert.equal(sealsAtIso('2026-10-26'), '2026-10-30T23:59:59+06:00');
  assert.equal(revealAtIso('2026-10-26'), '2026-11-02T07:00:00+06:00');
  assert.equal(countdownLabel(0), '00:00:00');
  assert.equal(countdownLabel(3_724_000), '01:02:04');
  assert.equal(countdownLabel((26 * 3600 + 5 * 60) * 1000), '1d 02h 05m');
});

test('weekend content is preset and every map has intel for every territory', () => {
  const sql = readFileSync('supabase/migrations/20261030120000_class_conquest_seasons.sql', 'utf8');
  for (const code of CHEER_CODES) {
    assert.match(sql, new RegExp(`'${code}'`), `SQL accepts the ${code} chant`);
    assert.match(CHEER_TEXT[code], /\{class\}/, 'every chant names the class');
  }
  assert.doesNotMatch(sql, /p_text|p_message|free_text/, 'no free-text channel for students');
  for (const map of CONQUEST_SEASON) {
    for (const ter of map.territories) assert.ok(TERRITORY_INTEL[map.mapId]?.[ter.zoneId], `${map.name} · ${ter.name} has intel`);
  }
  assert.ok(CONQUEST_RULES.length >= 5);
  // Students never receive an unrevealed result or sealed standings.
  assert.match(sql, /v_viewer\.role = 'teacher' or v_today >= v_result_week \+ 7/);
  assert.match(sql, /case when v_sealed and v_viewer\.role = 'student' then '\[\]'::jsonb else v_classes end/);
  // Pushes are held until Monday morning and the Saturday job freezes Friday's scores.
  assert.match(sql, /\(\(p_week_start \+ 7\) \+ time '00:30'\) at time zone 'Asia\/Bishkek'\);/);
  assert.match(sql, /'15 18 \* \* 5'/);
  assert.match(sql, /v_week_end date := p_week_start \+ 4/);
});

test('frozen results come from the server and name only the winning class’s top five', () => {
  const sql = readFileSync('supabase/migrations/20261030120000_class_conquest_seasons.sql', 'utf8');
  assert.match(sql, /alter table public\.class_conquest_results enable row level security/);
  assert.match(sql, /where dm\.user_id = any \(v_members\)/, 'top five are drawn from the winning class only');
  assert.match(sql, /v_today < p_week_start \+ 5 then\n\s*return null; -- never freeze a week before its Friday is over/);
  assert.match(sql, /on conflict \(school_id, grade, week_start\) do nothing/, 'a frozen week is never rewritten');
  for (const fn of ['rpc_finalize_class_conquest\\(date\\)', 'rpc_get_class_conquest\\(text\\)', 'rpc_get_class_conquest_history\\(text, integer\\)', 'rpc_get_class_conquest_weekend\\(text\\)', 'rpc_class_conquest_predict\\(uuid\\)', 'rpc_class_conquest_cheer\\(uuid, text\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn} from public, anon`));
  }
  // The live standings block still exposes aggregate counts only.
  const live = sql.slice(sql.indexOf("'is_mine', t.class_id = v_viewer.my_class"), sql.indexOf('into v_classes'));
  assert.doesNotMatch(live, /username|full_name|student_id/);
});
