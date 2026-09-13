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
    { id: "player_guard", catalogId: "neon_bulwark", school: "storm", name: "Neon Bulwark", hp: 82, shield: 10, attack: 6 },
    {
      id: "player_archer",
      catalogId: "shade_deadeye",
      school: "void",
      name: "Shade Deadeye",
      hp: 40,
      shield: 0,
      attack: 15,
    },
  ],
});

const graveRotLoadout = () => ({
  ...loadout(),
  units: [
    { id: "player_guard", catalogId: "grave_bastion", school: "grave", name: "Grave Bastion", hp: 92, shield: 14, attack: 5 },
    { id: "player_archer", catalogId: "plague_scribe", school: "rot", name: "Plague Scribe", hp: 58, shield: 0, attack: 9 },
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
  assert.equal(owned.combatants[1].school, "storm");
  assert.equal(owned.combatants[1].catalogId, "neon_bulwark");
  assert.equal(owned.combatants[2].attack, 15);
  assert.equal(owned.loadoutVersion, 4);
  assert.deepEqual(owned.playerPowers, ["death_bolt", "chain_surge"]);
  assert.equal(fixed.playerTactics, undefined);
  assert.deepEqual(fixed.playerPowers, ["death_bolt"]);
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

test("school powers unlock from equipped recruits and share the Commander power core", () => {
  const storm = buildOwnedPracticeBattle(21, loadout());
  const surged = applyPracticeTurn(storm, { move: "chain_surge", targetId: "enemy_commander" });
  const surgeEvents = surged.events.filter((event) => event.side === "player" && event.code === "chain_surge");
  assert.equal(surgeEvents.length, 2, "Storm should hit the selected enemy and arc once");
  assert.equal(surgeEvents[0]?.targetName, "Warden Null");
  assert.equal(surged.playerDeathBoltCooldown, 3);
  assert.throws(
    () => applyPracticeTurn(storm, { move: "rot_miasma", targetId: "enemy_commander" }),
    /commander_power_locked/,
  );

  const rotGrave = buildOwnedPracticeBattle(27, graveRotLoadout());
  assert.deepEqual(rotGrave.playerPowers, ["death_bolt", "rot_miasma", "raise_dead"]);
  const miasma = applyPracticeTurn(rotGrave, { move: "rot_miasma", targetId: "enemy_commander" });
  assert.equal(
    miasma.events.filter((event) => event.side === "player" && event.code === "rot_miasma").length,
    3,
    "Rot should pressure every living enemy",
  );
  assert.equal(miasma.playerDeathBoltCooldown, 3);
});

test("Grave power revives a fallen equipped unit and fails closed when nobody needs recovery", () => {
  const healthy = buildOwnedPracticeBattle(31, graveRotLoadout());
  assert.throws(() => applyPracticeTurn(healthy, { move: "raise_dead" }), /raise_dead_no_valid_target/);

  const fallen = buildOwnedPracticeBattle(31, graveRotLoadout());
  const archer = fallen.combatants.find((unit) => unit.id === "player_archer");
  assert.ok(archer);
  archer.hp = 0;
  const restored = applyPracticeTurn(fallen, { move: "raise_dead" });
  const event = restored.events.find((candidate) => candidate.side === "player" && candidate.code === "raise_dead");
  assert.equal(event?.targetName, "Plague Scribe");
  assert.equal(event?.amount, 20);
  assert.equal(restored.playerDeathBoltCooldown, 3);
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
    {
      ...loadout(),
      units: [{ ...loadout().units[0], school: "sun" }, loadout().units[1]],
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