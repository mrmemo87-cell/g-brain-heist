import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260915195000_commander_unit_evolution_v1.sql",
  "utf8",
);
const service = readFileSync("services/commanderHeadquartersService.ts", "utf8");
const headquarters = readFileSync(
  "src/features/cursedCommander/CommanderHeadquarters.tsx",
  "utf8",
);
const panel = readFileSync(
  "src/features/cursedCommander/CommanderUnitEvolutionPanel.tsx",
  "utf8",
);

test("unit evolution is Rank-10 gated, level-gated, wallet-backed and idempotent", () => {
  assert.match(migration, /unitEvolutionUnlockLevel[^\n]*21|unitEvolutionUnlockLevel'\)::integer, 21/);
  assert.match(migration, /create or replace function public\.rpc_commander_evolve_unit/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where user_id = u and campaign_id = c\.id and item_id = i\.id\s+for update/);
  assert.match(migration, /up\.unit_rank < max_rank/);
  assert.match(migration, /target_tier := up\.evolution_tier \+ 1/);
  assert.match(migration, /commander_private\.unit_evolution_tier_cap/);
  assert.match(migration, /commander_private\.unit_evolution_cost/);
  assert.match(migration, /update public\.users\s+set coins = coins - cost/);
  assert.match(migration, /set evolution_tier = target_tier/);
  assert.match(migration, /old\.operation <> 'evolve_unit'/);
  assert.match(migration, /p_expected_version <> p\.version/);
  assert.doesNotMatch(migration, /xp\s*=\s*xp\s*\+/i, "evolution must not mint Commander XP");
});

test("evolution combat bonuses stay server-authoritative for Practice and PvP snapshots", () => {
  assert.match(migration, /commander_private\.unit_evolution_bonus/);
  assert.match(migration, /'evolutionTier', g_evolution_tier/);
  assert.match(migration, /'evolutionTier', a_evolution_tier/);
  assert.match(migration, /'evolutionPassive', commander_private\.unit_evolution_passive/);
  assert.match(migration, /coalesce\(\(g_evolution->>'hp'\)::integer, 0\)/);
  assert.match(migration, /coalesce\(\(a_evolution->>'attack'\)::integer, 0\)/);
  assert.doesNotMatch(migration, /insert into public\.commander_pvp_battles/i, "evolving a unit must not rewrite active PvP battles");
});

test("unit evolution is exposed through the typed service and Army UI", () => {
  assert.match(service, /"evolve_unit"/);
  assert.match(service, /rpc_commander_evolve_unit/);
  assert.match(service, /evolutionTier\?: number/);
  assert.match(service, /evolutionPassive\?: CommanderEvolutionPassive \| null/);

  assert.match(headquarters, /CommanderUnitEvolutionPanel/);
  assert.match(headquarters, /operation: "evolve_unit"/);
  assert.match(headquarters, /Unit evolution complete/);
  assert.match(headquarters, /Unit evolution completed/);

  assert.match(panel, /LEVELS 21–30/);
  assert.match(panel, /Rank 10 units can evolve/);
  assert.match(panel, /Ascended/);
  assert.match(panel, /Exalted/);
  assert.match(panel, /Mythic/);
  assert.match(panel, /Practice and Player Battles/);
  assert.match(panel, /never converts one catalog recruit into another/);
});
