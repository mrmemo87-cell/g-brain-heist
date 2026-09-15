import assert from "node:assert/strict";
import test from "node:test";
import {
  commanderUnitEvolutionBonus,
  commanderUnitEvolutionCost,
  commanderUnitEvolutionPassive,
  commanderUnitEvolutionRequiredLevel,
  commanderUnitEvolutionStage,
  commanderUnitEvolutionTierCap,
  commanderUnitNextEvolutionGain,
} from "../src/features/cursedCommander/commanderHeadquartersModel";
import type { CommanderCatalogItem } from "../services/commanderHeadquartersService";

const rules = {
  unitEvolutionUnlockLevel: 21,
  unitEvolutionTier2Level: 25,
  unitEvolutionTier3Level: 30,
  unitEvolutionMaxTier: 3,
  unitEvolutionTier1Cost: 200,
  unitEvolutionTier2Cost: 350,
  unitEvolutionTier3Cost: 550,
  unitEvolutionRareMultiplier: 1.15,
  unitEvolutionEpicMultiplier: 1.3,
  unitEvolutionLegendaryMultiplier: 1.5,
};

const unit = (
  id: string,
  slot: "guard" | "archer",
  school: "void" | "storm" | "rot" | "grave",
  rarity: "common" | "rare" | "epic" | "legendary" = "common",
): CommanderCatalogItem => ({
  id,
  name: id,
  kind: "unit",
  slot,
  price: 0,
  description: "",
  stats: { hp: 60, shield: slot === "guard" ? 6 : 0, attack: 10 },
  school,
  rarity,
});

test("unit evolution opens across the Level 21-30 milestone band", () => {
  assert.equal(commanderUnitEvolutionTierCap(20, rules), 0);
  assert.equal(commanderUnitEvolutionTierCap(21, rules), 1);
  assert.equal(commanderUnitEvolutionTierCap(24, rules), 1);
  assert.equal(commanderUnitEvolutionTierCap(25, rules), 2);
  assert.equal(commanderUnitEvolutionTierCap(29, rules), 2);
  assert.equal(commanderUnitEvolutionTierCap(30, rules), 3);
  assert.equal(commanderUnitEvolutionTierCap(100, rules), 3);

  assert.equal(commanderUnitEvolutionRequiredLevel(1, rules), 21);
  assert.equal(commanderUnitEvolutionRequiredLevel(2, rules), 25);
  assert.equal(commanderUnitEvolutionRequiredLevel(3, rules), 30);
  assert.equal(commanderUnitEvolutionStage(0), "Base");
  assert.equal(commanderUnitEvolutionStage(1), "Ascended");
  assert.equal(commanderUnitEvolutionStage(2), "Exalted");
  assert.equal(commanderUnitEvolutionStage(3), "Mythic");
});

test("evolution Coin costs scale by target tier and recruit rarity", () => {
  const commonGuard = unit("neon_guard", "guard", "storm");
  const rareGuard = unit("neon_bulwark", "guard", "storm", "rare");
  const epicArcher = unit("volt_seer", "archer", "storm", "epic");
  const legendaryArcher = unit("future_legend", "archer", "void", "legendary");

  assert.equal(commanderUnitEvolutionCost(commonGuard, 1, rules), 200);
  assert.equal(commanderUnitEvolutionCost(rareGuard, 1, rules), 230);
  assert.equal(commanderUnitEvolutionCost(rareGuard, 2, rules), 403);
  assert.equal(commanderUnitEvolutionCost(epicArcher, 3, rules), 715);
  assert.equal(commanderUnitEvolutionCost(legendaryArcher, 3, rules), 825);
});

test("evolution preserves role identity with controlled school-aligned stat gains", () => {
  const stormGuard = unit("neon_guard", "guard", "storm");
  const voidArcher = unit("shade_archer", "archer", "void");
  const graveGuard = unit("grave_bastion", "guard", "grave", "epic");
  const rotArcher = unit("plague_scribe", "archer", "rot", "epic");

  assert.deepEqual(commanderUnitEvolutionBonus(stormGuard, 3), {
    hp: 12,
    shield: 5,
    attack: 1,
  });
  assert.deepEqual(commanderUnitNextEvolutionGain(stormGuard, 2), {
    hp: 4,
    shield: 2,
    attack: 0,
  });
  assert.deepEqual(commanderUnitEvolutionBonus(voidArcher, 3), {
    hp: 6,
    shield: 0,
    attack: 5,
  });
  assert.deepEqual(commanderUnitNextEvolutionGain(voidArcher, 0), {
    hp: 2,
    shield: 0,
    attack: 2,
  });
  assert.deepEqual(commanderUnitEvolutionBonus(graveGuard, 3), {
    hp: 18,
    shield: 3,
    attack: 1,
  });
  assert.deepEqual(commanderUnitEvolutionBonus(rotArcher, 2), {
    hp: 6,
    shield: 0,
    attack: 2,
  });
});

test("evolution passive identity is deterministic and descriptive", () => {
  const stormGuard = commanderUnitEvolutionPassive(unit("neon_guard", "guard", "storm"), 1);
  const voidArcher = commanderUnitEvolutionPassive(unit("shade_archer", "archer", "void"), 3);

  assert.equal(stormGuard?.id, "overcharge_plating");
  assert.equal(stormGuard?.label, "Overcharge Plating");
  assert.equal(stormGuard?.tier, 1);
  assert.equal(voidArcher?.id, "execution_mark");
  assert.equal(voidArcher?.tier, 3);
  assert.equal(commanderUnitEvolutionPassive(unit("shade_archer", "archer", "void"), 0), null);
});
