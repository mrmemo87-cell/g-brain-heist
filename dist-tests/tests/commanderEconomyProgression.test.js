import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260916123703_commander_economy_level_gates_v2.sql', 'utf8');
const service = readFileSync('services/commanderHeadquartersService.ts', 'utf8');
test('Commander shared-wallet prices are intentionally long-horizon', () => {
    assert.match(migration, /when 'rift_blade' then 1000/i);
    assert.match(migration, /when 'bastion_plate' then 1250/i);
    assert.match(migration, /when 'neon_bulwark' then 1500/i);
    assert.match(migration, /when 'shade_deadeye' then 1500/i);
    assert.match(migration, /when 'grave_bastion' then 2500/i);
    assert.match(migration, /when 'plague_scribe' then 2750/i);
    assert.match(migration, /when 'rift_reaver' then 3000/i);
    assert.match(migration, /when 'volt_seer' then 3500/i);
    assert.match(migration, /'trainingBase',\s*250/i);
    assert.match(migration, /'trainingGrowth',\s*1\.40/i);
});
test('Commander XP gates purchases and basic stat ranks', () => {
    assert.match(migration, /when 'rift_blade' then 3/i);
    assert.match(migration, /when 'neon_bulwark' then 5/i);
    assert.match(migration, /when 'grave_bastion' then 7/i);
    assert.match(migration, /when 'rift_reaver' then 9/i);
    assert.match(migration, /when 'volt_seer' then 11/i);
    assert.match(migration, /'statTrainingLevelStep',\s*2/i);
    assert.match(migration, /commander_private\.stat_rank_cap/i);
    assert.match(migration, /commander_item_level_locked/i);
    assert.match(migration, /commander_economy_progression_guard/i);
});
test('economy rebalance grandfathering preserves existing ownership and trained ranks', () => {
    assert.match(migration, /Existing owners are grandfathered/i);
    assert.match(migration, /greatest\(progression_cap, p\.force_rank, p\.defense_rank, p\.dexterity_rank, p\.stamina_rank\)/i);
    assert.doesNotMatch(migration, /delete\s+from\s+public\.commander_owned_items/i);
    assert.doesNotMatch(migration, /set\s+force_rank\s*=\s*1/i);
});
test('Commander client understands catalog unlock metadata and lock errors', () => {
    assert.match(service, /unlock_level\?:\s*number/);
    assert.match(service, /commander_item_level_locked/);
    assert.match(service, /Reach the required Commander level before purchasing this item/);
});
