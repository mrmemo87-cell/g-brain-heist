import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canEnterClanTerritoryOfficialRoom,
  normalizeClanTerritoryClassCode,
  normalizeClanTerritoryClassCodes,
} from '../src/features/clanTerritory/clanTerritoryEligibility.js';

const migration = readFileSync(
  'supabase/migrations/20260726014520_clan_territory_canonical_student_context.sql',
  'utf8',
);
const manager = readFileSync('src/features/clanTerritory/ClanTerritoryManager.tsx', 'utf8');
const engine = readFileSync('src/features/clanTerritory/clanTerritoryEngine.ts', 'utf8');
const transport = readFileSync('src/features/clanTerritory/clanTerritorySupabaseTransport.ts', 'utf8');

test('class eligibility normalizes case and whitespace and supports multiple classes', () => {
  assert.equal(normalizeClanTerritoryClassCode(' 8 a '), '8A');
  assert.deepEqual(normalizeClanTerritoryClassCodes(['8 A', '8a', ' 9B ']), ['8A', '9B']);
  assert.equal(canEnterClanTerritoryOfficialRoom(['8A'], ['7B', '8 a']), true);
  assert.equal(canEnterClanTerritoryOfficialRoom(['8A'], ['7B', '9A']), false);
  assert.equal(canEnterClanTerritoryOfficialRoom([], []), true);
});

test('official arena engine accepts canonical class arrays and keeps legacy batch compatibility', () => {
  assert.match(
    engine,
    /canEnterClanTerritoryOfficialRoom\(\s*state\.officialClassCodes,\s*player\.classCodes,\s*player\.batch,/,
  );
  assert.match(transport, /classCodes: options\?\.classCodes \?\? \[\]/);
  assert.match(engine, /player\.schoolId !== state\.officialSchoolId/);
});

test('student context RPC uses canonical school enrollment without legacy profiles', () => {
  const executableSql = migration.replace(/--.*$/gm, '');
  assert.match(migration, /security invoker/i);
  assert.match(migration, /join public\.class_students cs on cs\.student_id = rs\.id/i);
  assert.match(migration, /join public\.classes c on c\.id = cs\.class_id/i);
  assert.match(migration, /c\.school_id = rs\.resolved_school_id/i);
  assert.match(migration, /coalesce\(c\.is_active, true\)/i);
  assert.match(migration, /grant execute on function public\.rpc_clan_territory_my_context\(\) to authenticated/i);
  assert.doesNotMatch(executableSql, /public\.profiles/i);
});

test('Clan Territory refreshes canonical context before every official join', () => {
  assert.match(manager, /\.rpc\('rpc_clan_territory_my_context'\)/);
  assert.match(manager, /const refreshedContext = await fetchUserProfile\(\)/);
  assert.match(manager, /classCodes: joiningClassCodes/);
  assert.doesNotMatch(manager, /\.from\('profiles'\)/);
});
