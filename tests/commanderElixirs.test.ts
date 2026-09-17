import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260916195758_commander_elixirs_v1.sql',
  'utf8',
);
const pvpMigration = readFileSync(
  'supabase/migrations/20260916195926_commander_elixirs_pvp_visibility.sql',
  'utf8',
);
const service = readFileSync('services/commanderElixirService.ts', 'utf8');
const panel = readFileSync('src/features/cursedCommander/CommanderElixirsPanel.tsx', 'utf8');
const assetMap = readFileSync('src/features/cursedCommander/commanderElixirAssets.ts', 'utf8');
const materializer = readFileSync('scripts/materialize_commander_elixirs.mjs', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

test('Commander elixirs are Gemstone-only and use the locked balance', () => {
  assert.match(migration, /'force_30','Force Elixir','force',1,30,2/i);
  assert.match(migration, /'force_60','Greater Force Elixir','force',2,60,5/i);
  assert.match(migration, /'omni_30','Commander Elixir','omni',1,30,8/i);
  assert.match(migration, /set gemstones = gemstones - v_cost/i);
  assert.doesNotMatch(migration, /set coins = coins - v_cost/i);
});

test('Commander elixirs never rewrite permanent training ranks', () => {
  assert.doesNotMatch(migration, /set force_rank\s*=/i);
  assert.doesNotMatch(migration, /set defense_rank\s*=/i);
  assert.doesNotMatch(migration, /set dexterity_rank\s*=/i);
  assert.doesNotMatch(migration, /set stamina_rank\s*=/i);
  assert.match(migration, /commander_private\.combat_loadout/i);
  assert.match(migration, /v_base := commander_private\.loadout\(p_user, p_campaign\)/i);
});

test('combat elixir formulas mirror Commander training effects', () => {
  assert.match(migration, /\{bolt\}.*\+ 2 \* v_boost/i);
  assert.match(migration, /\{focus\}.*\+ v_boost/i);
  assert.match(migration, /\{shield\}.*\+ 2 \* v_boost/i);
  assert.match(migration, /\{guard\}.*\+ 2 \* v_boost/i);
  assert.match(migration, /\{shieldCap\}.*\+ 2 \* v_boost/i);
  assert.match(migration, /\{hp\}.*\+ 6 \* v_boost/i);
  assert.match(migration, /\{attack\}.*\+ v_boost/i);
});

test('only one active elixir is allowed and identical elixirs extend duration', () => {
  assert.match(migration, /primary key \(user_id\)/i);
  assert.match(migration, /v_active\.elixir_id <> p_elixir_id/i);
  assert.match(migration, /commander_elixir_other_active/i);
  assert.match(migration, /greatest\(v_active\.expires_at, now\(\)\)/i);
  assert.match(migration, /v_expiry := v_start \+ make_interval\(mins => v_item\.duration_minutes\)/i);
});

test('elixir tables are private and RPCs are scoped', () => {
  assert.match(migration, /alter table public\.commander_elixir_catalog enable row level security/i);
  assert.match(migration, /revoke all on table public\.commander_elixir_inventory from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.rpc_commander_elixirs\(\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.rpc_commander_owned_loadout\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.rpc_commander_owned_loadout\(uuid\) to service_role/i);
});

test('Commander Supplies client exposes purchase, activation, inventory and timer UX', () => {
  assert.match(service, /rpc_commander_elixirs/);
  assert.match(service, /rpc_commander_elixir_purchase/);
  assert.match(service, /rpc_commander_elixir_activate/);
  assert.match(panel, /Gemstones only/i);
  assert.match(panel, /ONE ACTIVE/i);
  assert.match(panel, /EXTEND \+\$\{item\.durationMinutes\} MIN/);
  assert.match(panel, /ANOTHER ELIXIR ACTIVE/);
  assert.match(panel, /formatDuration\(activeRemaining\)/);
});

test('all live Commander elixir catalog IDs have explicit Vite artwork mappings', () => {
  const ids = [
    'force_30',
    'force_60',
    'defense_30',
    'defense_60',
    'dexterity_30',
    'dexterity_60',
    'stamina_30',
    'stamina_60',
    'omni_30',
  ];

  for (const id of ids) {
    assert.match(assetMap, new RegExp(`\\b${id}:`));
  }

  assert.match(assetMap, /Force Elixir — 30 min\.png/);
  assert.match(assetMap, /Greater Force — 60 min\.png/);
  assert.match(assetMap, /Bastion Elixir — 30 min\.png/);
  assert.match(assetMap, /Greater Bastion — 60 min\.png/);
  assert.match(assetMap, /Reflex Elixir — 30 min\.png/);
  assert.match(assetMap, /Greater Reflex — 60 min\.png/);
  assert.match(assetMap, /Vitality Elixir — 30 min\.png/);
  assert.match(assetMap, /Greater Vitality — 60 min\.png/);
  assert.match(assetMap, /Commander : Omni Elixir — 30 min\.png/);
  assert.match(panel, /loading="lazy"/);
  assert.match(panel, /decoding="async"/);
  assert.match(panel, /getCommanderElixirArt\(snapshot\.active\.id\)/);
  assert.doesNotMatch(panel, /const Flask/);
});

test('PvP lobby exposes visible current and frozen elixir state', () => {
  assert.match(pvpMigration, /active_elixir/i);
  assert.match(pvpMigration, /b\.defender_snapshot->'elixir' as opponent_elixir/i);
  assert.match(materializer, /ACTIVE COMBAT ELIXIR/);
  assert.match(materializer, /Frozen boost/);
  assert.match(materializer, /active_elixir: CommanderPvpElixir \| null/);
  assert.match(materializer, /opponent_elixir: CommanderPvpElixir \| null/);
});

test('Supplies is materialized in all normal development and validation flows', () => {
  assert.match(materializer, /\["supplies", "Supplies"\]/);
  assert.match(materializer, /CommanderElixirsPanel/);
  assert.match(packageJson, /materialize_commander_elixirs\.mjs && vite/);
  assert.match(packageJson, /materialize_commander_elixirs\.mjs && python3 scripts\/materialize_assignment_edit_feature\.py && tsc/);
  assert.match(packageJson, /materialize_commander_elixirs\.mjs && python3 scripts\/materialize_assignment_edit_feature\.py && npm run test:clean/);
});
