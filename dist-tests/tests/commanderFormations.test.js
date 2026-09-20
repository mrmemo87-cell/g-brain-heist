import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMANDER_FORMATIONS, commanderFormationModifiers, commanderFormationNextLevel, commanderFormationRankCap, commanderFormationTrainingCost, commanderFormationUnlockLevel, } from "../src/features/cursedCommander/commanderHeadquartersModel.js";
const rules = {
    formationUnlockLevel: 41,
    formationBastionUnlockLevel: 45,
    formationSpearheadUnlockLevel: 50,
    formationArcUnlockLevel: 55,
    formationMaxRank: 7,
    formationRank2Level: 50,
    formationRank3Level: 60,
    formationRank4Level: 70,
    formationRank5Level: 80,
    formationRank6Level: 90,
    formationRank7Level: 100,
    formationTrainingBase: 600,
    formationTrainingGrowth: 1.35,
};
test("Formation Command spans Commander Levels 41 through 100 with seven doctrine caps", () => {
    assert.equal(commanderFormationRankCap(40, rules), 0);
    assert.equal(commanderFormationRankCap(41, rules), 1);
    assert.equal(commanderFormationRankCap(49, rules), 1);
    assert.equal(commanderFormationRankCap(50, rules), 2);
    assert.equal(commanderFormationRankCap(59, rules), 2);
    assert.equal(commanderFormationRankCap(60, rules), 3);
    assert.equal(commanderFormationRankCap(69, rules), 3);
    assert.equal(commanderFormationRankCap(70, rules), 4);
    assert.equal(commanderFormationRankCap(79, rules), 4);
    assert.equal(commanderFormationRankCap(80, rules), 5);
    assert.equal(commanderFormationRankCap(89, rules), 5);
    assert.equal(commanderFormationRankCap(90, rules), 6);
    assert.equal(commanderFormationRankCap(99, rules), 6);
    assert.equal(commanderFormationRankCap(100, rules), 7);
});
test("Formation availability is staggered while later doctrine ranks stay on the shared 41-100 road", () => {
    assert.equal(commanderFormationUnlockLevel("command_line", rules), 41);
    assert.equal(commanderFormationUnlockLevel("bastion_wedge", rules), 45);
    assert.equal(commanderFormationUnlockLevel("spearhead", rules), 50);
    assert.equal(commanderFormationUnlockLevel("arc_lattice", rules), 55);
    assert.equal(commanderFormationNextLevel("command_line", 0, rules), 41);
    assert.equal(commanderFormationNextLevel("bastion_wedge", 0, rules), 45);
    assert.equal(commanderFormationNextLevel("spearhead", 0, rules), 50);
    assert.equal(commanderFormationNextLevel("arc_lattice", 0, rules), 55);
    assert.equal(commanderFormationNextLevel("command_line", 1, rules), 50);
    assert.equal(commanderFormationNextLevel("command_line", 2, rules), 60);
    assert.equal(commanderFormationNextLevel("command_line", 6, rules), 100);
    assert.equal(commanderFormationNextLevel("command_line", 7, rules), null);
    assert.deepEqual(COMMANDER_FORMATIONS.map((formation) => formation.id), ["command_line", "bastion_wedge", "spearhead", "arc_lattice"]);
});
test("Formation doctrine uses the shared Coin economy with deterministic costs", () => {
    assert.equal(commanderFormationTrainingCost(0, rules), 600);
    assert.equal(commanderFormationTrainingCost(1, rules), 810);
    assert.equal(commanderFormationTrainingCost(2, rules), 1094);
    assert.equal(commanderFormationTrainingCost(6, rules), 3632);
});
test("Rank VII formation identities are bounded trade-offs instead of cumulative free power", () => {
    assert.deepEqual(commanderFormationModifiers("command_line", 7), {
        commanderHp: 7,
        commanderShield: 7,
        bolt: 3,
        focus: 3,
        guard: 7,
        shieldCap: 7,
        guardHp: 7,
        guardShield: 0,
        guardAttack: 2,
        archerHp: 7,
        archerShield: 0,
        archerAttack: 2,
    });
    assert.deepEqual(commanderFormationModifiers("bastion_wedge", 7), {
        commanderHp: 14,
        commanderShield: 21,
        bolt: -7,
        focus: 0,
        guard: 14,
        shieldCap: 21,
        guardHp: 21,
        guardShield: 14,
        guardAttack: 0,
        archerHp: 7,
        archerShield: 0,
        archerAttack: -3,
    });
    assert.deepEqual(commanderFormationModifiers("spearhead", 7), {
        commanderHp: -14,
        commanderShield: -7,
        bolt: 14,
        focus: 7,
        guard: -7,
        shieldCap: -7,
        guardHp: 0,
        guardShield: 0,
        guardAttack: 4,
        archerHp: 0,
        archerShield: 0,
        archerAttack: 4,
    });
    assert.deepEqual(commanderFormationModifiers("arc_lattice", 7), {
        commanderHp: 0,
        commanderShield: -3,
        bolt: 7,
        focus: 14,
        guard: 7,
        shieldCap: 0,
        guardHp: -7,
        guardShield: 0,
        guardAttack: 0,
        archerHp: -7,
        archerShield: 0,
        archerAttack: 0,
    });
});
test("Formation migration keeps progression private, atomic, idempotent, and loadout-owned", () => {
    const sql = readFileSync("supabase/migrations/20260915233000_commander_formations_41_100.sql", "utf8");
    assert.match(sql, /create table public\.commander_formation_progress/);
    assert.match(sql, /create table public\.commander_formation_state/);
    assert.match(sql, /alter table public\.commander_formation_progress enable row level security/);
    assert.match(sql, /alter table public\.commander_formation_state enable row level security/);
    assert.match(sql, /revoke all on public\.commander_formation_progress, public\.commander_formation_state\s+from public, anon, authenticated/s);
    assert.match(sql, /create function public\.rpc_commander_formation_command/);
    assert.match(sql, /perform commander_private\.student\(u\)/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /p_expected_version <> p\.version/);
    assert.match(sql, /commander_request_conflict/);
    assert.match(sql, /from public\.users\s+where id = u\s+for update/s);
    assert.match(sql, /set coins = coins - cost/);
    assert.match(sql, /'formation_train'/);
    assert.match(sql, /'formation_set'/);
    assert.match(sql, /'formation', jsonb_build_object/);
    assert.match(sql, /'activeId', formation_id/);
    assert.match(sql, /commander_private\.formation_modifiers\(formation_id, formation_rank\)/);
    assert.match(sql, /greatest\(1,/);
    assert.match(sql, /return commander_private\.snapshot\(u\)/);
    assert.match(sql, /revoke all on function commander_private\.formation_modifiers/);
    assert.match(sql, /grant execute on function public\.rpc_commander_formation_command/);
});
test("Headquarters routes Formation commands through the dedicated RPC and professional Army UI", () => {
    const service = readFileSync("services/commanderHeadquartersService.ts", "utf8");
    const headquarters = readFileSync("src/features/cursedCommander/CommanderHeadquarters.tsx", "utf8");
    const panel = readFileSync("src/features/cursedCommander/CommanderFormationPanel.tsx", "utf8");
    assert.match(service, /"formation_train"/);
    assert.match(service, /"formation_set"/);
    assert.match(service, /rpc_commander_formation_command/);
    assert.match(service, /p_action: formationAction/);
    assert.match(service, /p_formation: target/);
    assert.match(service, /formation\?: \{/);
    assert.match(headquarters, /import CommanderFormationPanel/);
    assert.match(headquarters, /<CommanderFormationPanel/);
    assert.match(headquarters, /operation: "formation_train"/);
    assert.match(headquarters, /operation: "formation_set"/);
    assert.match(headquarters, /existing Player Battles keep their frozen snapshots/);
    assert.match(panel, /FORMATION COMMAND · LEVELS 41–100/);
    assert.match(panel, /CURRENT DOCTRINE EFFECT/);
    assert.match(panel, /NEXT RANK DELTA/);
    assert.match(panel, /LEGENDARY/);
});
