import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  applyPracticeTurn,
  buildOwnedPracticeBattle,
} from "../supabase/functions/commander_practice/engine";
import * as practiceEngine from "../supabase/functions/commander_practice/engine";
import {
  commanderSchoolMasteryCost,
  commanderSchoolMasteryDoctrine,
  commanderSchoolMasteryNextLevel,
  commanderSchoolMasteryRankCap,
} from "../src/features/cursedCommander/commanderHeadquartersModel";

const pvpSource = readFileSync("supabase/functions/commander_pvp/engine.ts", "utf8");
const pvpCompiled = ts.transpileModule(pvpSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pvpExports: Record<string, unknown> = {};
new Function("require", "exports", pvpCompiled)(
  (specifier: string) => {
    if (specifier === "../commander_practice/engine.ts") return practiceEngine;
    throw new Error(`Unexpected Commander PvP engine import: ${specifier}`);
  },
  pvpExports,
);
const { buildCommanderPvpBattle } = pvpExports as {
  buildCommanderPvpBattle: (seed: number, attacker: unknown, defender: unknown, username?: string) => any;
};

const stormVoidLoadout = () => ({
  version: 1,
  profileVersion: 17,
  hp: 120,
  shield: 26,
  bolt: 34,
  focus: 11,
  guard: 28,
  shieldCap: 48,
  weaponName: "Rift Blade",
  shieldName: "Bastion Plate",
  schoolMastery: { void: 2, storm: 3, rot: 0, grave: 0 },
  units: [
    { id: "player_guard", catalogId: "neon_bulwark", school: "storm", name: "Neon Bulwark", hp: 106, shield: 19, attack: 12 },
    { id: "player_archer", catalogId: "shade_deadeye", school: "void", name: "Shade Deadeye", hp: 61, shield: 0, attack: 24 },
  ],
});

const graveRotLoadout = () => ({
  version: 1,
  profileVersion: 22,
  hp: 132,
  shield: 34,
  bolt: 30,
  focus: 10,
  guard: 32,
  shieldCap: 54,
  weaponName: "Void Saber",
  shieldName: "Bastion Plate",
  schoolMastery: { void: 0, storm: 0, rot: 2, grave: 3 },
  units: [
    { id: "player_guard", catalogId: "grave_bastion", school: "grave", name: "Grave Bastion", hp: 134, shield: 23, attack: 11 },
    { id: "player_archer", catalogId: "plague_scribe", school: "rot", name: "Plague Scribe", hp: 79, shield: 0, attack: 19 },
  ],
});

test("School Mastery opens at 31 and advances at 35 and 40", () => {
  const rules = {
    schoolMasteryUnlockLevel: 31,
    schoolMasteryMaxRank: 3,
    schoolMasteryRank2Level: 35,
    schoolMasteryRank3Level: 40,
    schoolMasteryBase: 450,
    schoolMasteryGrowth: 1.55,
  };
  assert.equal(commanderSchoolMasteryRankCap(30, rules), 0);
  assert.equal(commanderSchoolMasteryRankCap(31, rules), 1);
  assert.equal(commanderSchoolMasteryRankCap(34, rules), 1);
  assert.equal(commanderSchoolMasteryRankCap(35, rules), 2);
  assert.equal(commanderSchoolMasteryRankCap(39, rules), 2);
  assert.equal(commanderSchoolMasteryRankCap(40, rules), 3);
  assert.equal(commanderSchoolMasteryRankCap(100, rules), 3);
  assert.equal(commanderSchoolMasteryNextLevel(0, rules), 31);
  assert.equal(commanderSchoolMasteryNextLevel(1, rules), 35);
  assert.equal(commanderSchoolMasteryNextLevel(2, rules), 40);
  assert.equal(commanderSchoolMasteryNextLevel(3, rules), null);
  assert.equal(commanderSchoolMasteryCost(0, rules), 450);
  assert.equal(commanderSchoolMasteryCost(1, rules), 698);
  assert.equal(commanderSchoolMasteryCost(2, rules), 1081);
});

test("School doctrines describe the four existing Commander powers", () => {
  assert.equal(commanderSchoolMasteryDoctrine("void").power, "Death Bolt");
  assert.equal(commanderSchoolMasteryDoctrine("storm").power, "Chain Surge");
  assert.equal(commanderSchoolMasteryDoctrine("rot").power, "Rot Miasma");
  assert.equal(commanderSchoolMasteryDoctrine("grave").power, "Raise Dead");
});

test("trusted practice loadouts apply Void and Storm Mastery without changing power ownership", () => {
  const mastered = buildOwnedPracticeBattle(17, stormVoidLoadout());
  assert.deepEqual(mastered.playerSchoolMastery, { void: 2, storm: 3, rot: 0, grave: 0 });
  assert.deepEqual(mastered.playerPowers, ["death_bolt", "chain_surge"]);

  const bolt = applyPracticeTurn(mastered, { move: "death_bolt", targetId: "enemy_commander" });
  assert.equal(
    bolt.events.find((event) => event.side === "player" && event.code === "death_bolt")?.amount,
    40,
    "Void Rank 2 adds 6 to a 34-damage Death Bolt",
  );

  const surge = applyPracticeTurn(mastered, { move: "chain_surge", targetId: "enemy_commander" });
  const surgeEvents = surge.events.filter((event) => event.side === "player" && event.code === "chain_surge");
  assert.equal(surgeEvents[0]?.amount, 29, "Storm Rank 3 adds 6 to the primary discharge");
  assert.equal(surgeEvents.length, 2);
  assert.throws(
    () => applyPracticeTurn(mastered, { move: "rot_miasma", targetId: "enemy_commander" }),
    /commander_power_locked/,
  );
});

test("Rot and Grave Mastery strengthen field pressure and resurrection", () => {
  const mastered = buildOwnedPracticeBattle(23, graveRotLoadout());
  const miasma = applyPracticeTurn(mastered, { move: "rot_miasma", targetId: "enemy_commander" });
  const miasmaEvents = miasma.events.filter((event) => event.side === "player" && event.code === "rot_miasma");
  assert.equal(miasmaEvents.length, 3);
  assert.equal(miasmaEvents[0]?.amount, 17, "selected target includes base, selection bonus, and Rot Rank 2");

  const fallen = buildOwnedPracticeBattle(23, graveRotLoadout());
  const archer = fallen.combatants.find((unit) => unit.id === "player_archer");
  assert.ok(archer);
  archer.hp = 0;
  const revived = applyPracticeTurn(fallen, { move: "raise_dead" });
  const event = revived.events.find((candidate) => candidate.side === "player" && candidate.code === "raise_dead");
  assert.equal(event?.amount, 35, "Grave Rank 3 revives 44% of the 79 HP evolved ranged unit");
});

test("School Mastery travels with both trusted PvP snapshots", () => {
  const battle = buildCommanderPvpBattle(91, stormVoidLoadout(), graveRotLoadout(), "Nova");
  assert.deepEqual(battle.playerSchoolMastery, { void: 2, storm: 3, rot: 0, grave: 0 });
  assert.deepEqual(battle.enemySchoolMastery, { void: 0, storm: 0, rot: 2, grave: 3 });
  assert.deepEqual(battle.playerPowers, ["death_bolt", "chain_surge"]);
  assert.deepEqual(battle.enemyPowers, ["death_bolt", "rot_miasma", "raise_dead"]);
});

test("malformed Mastery payloads fail closed", () => {
  for (const input of [
    { ...stormVoidLoadout(), schoolMastery: { void: 4 } },
    { ...stormVoidLoadout(), schoolMastery: { sun: 1 } },
    { ...stormVoidLoadout(), schoolMastery: { storm: 1.5 } },
    { ...stormVoidLoadout(), schoolMastery: [1, 2, 3] },
  ]) {
    assert.throws(() => buildOwnedPracticeBattle(1, input), /invalid_owned_loadout/);
  }
});

test("School Mastery migration keeps progression private and reuses the idempotent unit-development command", () => {
  const sql = readFileSync("supabase/migrations/20260915213000_commander_school_mastery_v1.sql", "utf8");
  assert.match(sql, /create table public\.commander_school_mastery/);
  assert.match(sql, /alter table public\.commander_school_mastery enable row level security/);
  assert.match(sql, /revoke all on public\.commander_school_mastery from public, anon, authenticated/);
  assert.match(sql, /schoolMastery.*jsonb_build_object/s);
  assert.match(sql, /elsif p_operation = 'unit_train'/);
  assert.match(sql, /up\.evolution_tier < max_evolution_tier/);
  assert.match(sql, /commander_private\.school_mastery_rank_cap/);
  assert.match(sql, /commander_private\.school_mastery_cost/);
  assert.match(sql, /commander_school_mastery_locked/);
  assert.match(sql, /commander_school_mastery_cap/);
});
