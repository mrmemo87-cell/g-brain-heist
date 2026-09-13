import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260913183000_commander_factions_roster.sql',
  'utf8',
);
const styles = readFileSync(
  'src/features/cursedCommander/commanderHeadquarters.css',
  'utf8',
);

test('Commander catalog adds the four elite faction recruits without changing combat slots', () => {
  for (const id of ['grave_bastion', 'plague_scribe', 'rift_reaver', 'volt_seer']) {
    assert.match(migration, new RegExp(`'${id}'`));
  }

  assert.match(migration, /'grave_bastion','Grave Bastion','unit','guard',210/);
  assert.match(migration, /'plague_scribe','Plague Scribe','unit','archer',220/);
  assert.match(migration, /'rift_reaver','Rift Reaver','unit','guard',225/);
  assert.match(migration, /'volt_seer','Volt Seer','unit','archer',240/);
});

test('Commander schools are metadata-only and constrained to the planned faction set', () => {
  assert.match(migration, /school in \('neutral','void','storm','rot','grave'\)/);
  assert.match(migration, /rarity in \('common','rare','epic','legendary'\)/);
  assert.doesNotMatch(migration, /alter table public\.commander_profiles/);
  assert.doesNotMatch(migration, /rpc_commander_command/);
});

test('elite recruits receive distinct premium school treatments in the barracks', () => {
  for (const badge of ['GRAVE · EPIC', 'ROT · EPIC', 'VOID · EPIC', 'STORM · EPIC']) {
    assert.match(styles, new RegExp(badge));
  }
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /backdrop-filter: blur\(10px\)/);
});
