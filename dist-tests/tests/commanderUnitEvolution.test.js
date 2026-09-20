import assert from "node:assert/strict";
import test from "node:test";
import { commanderUnitEvolutionBonus, commanderUnitEvolutionCost, commanderUnitEvolutionNextLevel, commanderUnitEvolutionTierCap, } from "../src/features/cursedCommander/commanderHeadquartersModel.js";
const rules = {
    unitEvolutionUnlockLevel: 21,
    unitEvolutionMaxTier: 3,
    unitEvolutionBase: 250,
    unitEvolutionGrowth: 1.6,
    unitEvolutionTier2Level: 25,
    unitEvolutionTier3Level: 30,
    unitEvolutionGuardHpPerTier: 8,
    unitEvolutionGuardShieldPerTier: 2,
    unitEvolutionGuardAttackPerTier: 1,
    unitEvolutionArcherHpPerTier: 4,
    unitEvolutionArcherAttackPerTier: 2,
};
const guard = {
    id: "test_guard",
    name: "Test Guard",
    kind: "unit",
    slot: "guard",
    price: 0,
    description: "",
    stats: { hp: 60, shield: 5, attack: 8 },
};
const archer = {
    id: "test_archer",
    name: "Test Archer",
    kind: "unit",
    slot: "archer",
    price: 0,
    description: "",
    stats: { hp: 50, shield: 0, attack: 10 },
};
test("Commander evolution tier cap follows Levels 21, 25, and 30", () => {
    assert.equal(commanderUnitEvolutionTierCap(20, rules), 0);
    assert.equal(commanderUnitEvolutionTierCap(21, rules), 1);
    assert.equal(commanderUnitEvolutionTierCap(24, rules), 1);
    assert.equal(commanderUnitEvolutionTierCap(25, rules), 2);
    assert.equal(commanderUnitEvolutionTierCap(29, rules), 2);
    assert.equal(commanderUnitEvolutionTierCap(30, rules), 3);
    assert.equal(commanderUnitEvolutionTierCap(100, rules), 3);
});
test("Commander evolution costs grow from the current tier", () => {
    assert.equal(commanderUnitEvolutionCost(0, rules), 250);
    assert.equal(commanderUnitEvolutionCost(1, rules), 400);
    assert.equal(commanderUnitEvolutionCost(2, rules), 640);
});
test("frontline and ranged evolution bonuses preserve distinct roles", () => {
    assert.deepEqual(commanderUnitEvolutionBonus(guard, 3, rules), {
        hp: 24,
        shield: 6,
        attack: 3,
    });
    assert.deepEqual(commanderUnitEvolutionBonus(archer, 3, rules), {
        hp: 12,
        shield: 0,
        attack: 6,
    });
});
test("Commander evolution reports the next milestone level", () => {
    assert.equal(commanderUnitEvolutionNextLevel(0, rules), 21);
    assert.equal(commanderUnitEvolutionNextLevel(1, rules), 25);
    assert.equal(commanderUnitEvolutionNextLevel(2, rules), 30);
    assert.equal(commanderUnitEvolutionNextLevel(3, rules), null);
});
