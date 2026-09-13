import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPracticeTurn,
  buildOwnedPracticeBattle,
  startPracticeBattle,
} from "../supabase/functions/commander_practice/engine";
import {
  commanderLevelXp,
  commanderMissingCoins,
  commanderTrainingCost,
} from "../src/features/cursedCommander/commanderHeadquartersModel";
const loadout = () => ({
  version: 1,
  profileVersion: 4,
  hp: 92,
  shield: 20,
  bolt: 34,
  focus: 11,
  guard: 24,
  shieldCap: 40,
  weaponName: "Rift Blade",
  shieldName: "Bastion Plate",
  units: [
    { id: "player_guard", name: "Neon Bulwark", hp: 82, shield: 10, attack: 6 },
    {
      id: "player_archer",
      name: "Shade Deadeye",
      hp: 40,
      shield: 0,
      attack: 15,
    },
  ],
});

test("owned loadout changes only player army while preserving canonical slots and opponent", () => {
  const input = loadout(),
    before = structuredClone(input),
    fixed = startPracticeBattle(7),
    owned = buildOwnedPracticeBattle(7, input);
  assert.deepEqual(input, before);
  assert.deepEqual(
    owned.combatants.map((u) => u.id),
    fixed.combatants.map((u) => u.id),
  );
  assert.deepEqual(
    owned.combatants.filter((u) => u.side === "enemy"),
    fixed.combatants.filter((u) => u.side === "enemy"),
  );
  assert.equal(owned.combatants[0].hp, 92);
  assert.equal(owned.combatants[1].name, "Neon Bulwark");
  assert.equal(owned.combatants[2].attack, 15);
  assert.equal(owned.loadoutVersion, 4);
  assert.equal(fixed.playerTactics, undefined);
});
test("owned battle resolves configured spells and guard while fixed practice retains baseline", () => {
  const owned = buildOwnedPracticeBattle(9, loadout());
  const bolt = applyPracticeTurn(owned, {
    move: "death_bolt",
    targetId: "enemy_commander",
  });
  assert.equal(
    bolt.events.find((e) => e.side === "player" && e.code === "death_bolt")
      ?.amount,
    34,
  );
  const guard = applyPracticeTurn(owned, { move: "guard" });
  assert.equal(
    guard.events.find((e) => e.side === "player" && e.code === "guard")?.amount,
    20,
  ); // 40 capacity - 20 existing
  const focus = applyPracticeTurn(owned, {
    move: "focus_target",
    targetId: "enemy_commander",
  });
  assert.equal(
    focus.events.find(
      (e) => e.side === "player" && e.code === "focus_target" && e.amount,
    )?.amount,
    11,
  );
  assert.equal(
    applyPracticeTurn(startPracticeBattle(9), {
      move: "death_bolt",
      targetId: "enemy_commander",
    }).events.find((e) => e.code === "death_bolt")?.amount,
    26,
  );
  assert.equal(
    owned.combatants[0].hp,
    92,
    "turn calculation must not mutate the snapshot",
  );
});
test("invalid owned loadouts fail closed instead of silently starting a different army", () => {
  for (const input of [
    null,
    {},
    { ...loadout(), hp: 999999 },
    { ...loadout(), bolt: NaN },
    { ...loadout(), version: 2 },
    { ...loadout(), units: [loadout().units[0], loadout().units[0]] },
    {
      ...loadout(),
      units: [{ ...loadout().units[0], id: "enemy_guard" }, loadout().units[1]],
    },
  ])
    assert.throws(
      () => buildOwnedPracticeBattle(1, input),
      /invalid_owned_loadout/,
    );
});
test("goal prices show only missing Coins and training follows the configured curve", () => {
  assert.equal(commanderMissingCoins(450, 290), 160);
  assert.equal(commanderMissingCoins(100, 150), 0);
  assert.equal(
    commanderTrainingCost(1, { trainingBase: 25, trainingGrowth: 1.15 }),
    25,
  );
  assert.equal(
    commanderTrainingCost(3, { trainingBase: 25, trainingGrowth: 1.15 }),
    33,
  );
  assert.equal(commanderLevelXp(2), 100);
  assert.equal(commanderLevelXp(100), 106920);
});
