import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260915140000_commander_unit_training_v1.sql',
  'utf8',
);
const service = readFileSync('services/commanderHeadquartersService.ts', 'utf8');
const headquarters = readFileSync(
  'src/features/cursedCommander/CommanderHeadquarters.tsx',
  'utf8',
);
const panel = readFileSync(
  'src/features/cursedCommander/CommanderUnitTrainingPanel.tsx',
  'utf8',
);

test('unit training is level-gated, wallet-backed, idempotent, and server-authoritative', () => {
  assert.match(migration, /"unitTrainingUnlockLevel"\)?:{0,1}\s*11|unitTrainingUnlockLevel'\)::integer, 11/);
  assert.match(migration, /p_operation not in \('enroll', 'buy', 'equip', 'train', 'unit_train', 'goal'\)/);
  assert.match(migration, /commander_unit_progress/);
  assert.match(migration, /where user_id = u and campaign_id = c\.id and item_id = i\.id\s+for update/);
  assert.match(migration, /commander_private\.unit_rank_cap/);
  assert.match(migration, /commander_private\.unit_training_cost/);
  assert.match(migration, /update public\.users\s+set coins = coins - cost/);
  assert.match(migration, /p_expected_version <> p\.version/);
  assert.match(migration, /unique|request_id/i);
  assert.match(migration, /'unitRank', g_rank/);
  assert.match(migration, /'unitRank', a_rank/);
  assert.doesNotMatch(migration, /xp\s*=\s*xp\s*\+/i, 'unit training must not mint Commander XP');
});

test('unit training is exposed through the typed Headquarters contract and professional Army UI', () => {
  assert.match(service, /"unit_train"/);
  assert.match(service, /export type CommanderUnitProgress/);
  assert.match(service, /unitProgress\?: CommanderUnitProgress\[\]/);
  assert.match(service, /unitRankCap\?: number/);
  assert.match(headquarters, /CommanderUnitTrainingPanel/);
  assert.match(headquarters, /operation: "unit_train"/);
  assert.match(headquarters, /Unit training complete/);
  assert.match(panel, /LEVELS 11–40/);
  assert.match(panel, /Brains Heist Coins fund every upgrade/);
  assert.match(panel, /combat remains server-authoritative/);
  assert.match(panel, /Current Commander cap/);
});
