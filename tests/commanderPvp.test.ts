import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as practiceEngine from '../supabase/functions/commander_practice/engine';

// Execute the actual Deno PvP engine source while resolving its explicit .ts Edge import
// to the same practice engine used by production. This keeps tsconfig.tests emit portable.
const source = readFileSync('supabase/functions/commander_pvp/engine.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports: Record<string, unknown> = {};
const requireDependency = (specifier: string) => {
  if (specifier === '../commander_practice/engine.ts') return practiceEngine;
  throw new Error(`Unexpected Commander PvP engine import: ${specifier}`);
};
new Function('require', 'exports', compiled)(requireDependency, moduleExports);
const {
  applyCommanderPvpTurn,
  buildCommanderPvpBattle,
} = moduleExports as {
  applyCommanderPvpTurn: (state: any, intent: { move: string; targetId?: string | null }) => any;
  buildCommanderPvpBattle: (seed: number, attacker: unknown, defender: unknown, username?: string) => any;
};

const attackerLoadout = () => ({
  version: 1,
  profileVersion: 7,
  hp: 118,
  shield: 28,
  bolt: 38,
  focus: 13,
  guard: 30,
  shieldCap: 48,
  weaponName: 'Rift Blade',
  shieldName: 'Bastion Plate',
  units: [
    { id: 'player_guard', catalogId: 'rift_reaver', school: 'void', name: 'Rift Reaver', hp: 68, shield: 3, attack: 17 },
    { id: 'player_archer', catalogId: 'volt_seer', school: 'storm', name: 'Volt Seer', hp: 42, shield: 0, attack: 21 },
  ],
});

const defenderLoadout = () => ({
  version: 1,
  profileVersion: 11,
  hp: 136,
  shield: 36,
  bolt: 30,
  focus: 9,
  guard: 34,
  shieldCap: 56,
  weaponName: 'Void Saber',
  shieldName: 'Bastion Plate',
  units: [
    { id: 'player_guard', catalogId: 'grave_bastion', school: 'grave', name: 'Grave Bastion', hp: 92, shield: 14, attack: 10 },
    { id: 'player_archer', catalogId: 'plague_scribe', school: 'rot', name: 'Plague Scribe', hp: 58, shield: 0, attack: 14 },
  ],
});

test('Commander PvP freezes both real player loadouts into canonical battle slots', () => {
  const attacker = attackerLoadout();
  const defender = defenderLoadout();
  const attackerBefore = structuredClone(attacker);
  const defenderBefore = structuredClone(defender);
  const battle = buildCommanderPvpBattle(101, attacker, defender, 'Nova');

  assert.deepEqual(attacker, attackerBefore);
  assert.deepEqual(defender, defenderBefore);
  assert.equal(battle.combatants.length, 6);
  assert.equal(battle.combatants.find((unit: any) => unit.id === 'player_commander')?.maxHp, 118);
  assert.equal(battle.combatants.find((unit: any) => unit.id === 'player_guard')?.catalogId, 'rift_reaver');
  assert.equal(battle.combatants.find((unit: any) => unit.id === 'player_archer')?.attack, 21);

  const enemyCommander = battle.combatants.find((unit: any) => unit.id === 'enemy_commander');
  const enemyGuard = battle.combatants.find((unit: any) => unit.id === 'enemy_guard');
  const enemyArcher = battle.combatants.find((unit: any) => unit.id === 'enemy_archer');
  assert.equal(enemyCommander?.name, "Nova's Commander");
  assert.equal(enemyCommander?.maxHp, 136);
  assert.equal(enemyCommander?.shield, 36);
  assert.equal(enemyGuard?.name, 'Rival Grave Bastion');
  assert.equal(enemyGuard?.catalogId, 'grave_bastion');
  assert.equal(enemyGuard?.hp, 92);
  assert.equal(enemyArcher?.catalogId, 'plague_scribe');
  assert.equal(enemyArcher?.attack, 14);

  assert.deepEqual(battle.playerTactics, { bolt: 38, focus: 13, guard: 30, shieldCap: 48 });
  assert.deepEqual(battle.enemyTactics, { bolt: 30, focus: 9, guard: 34, shieldCap: 56 });
  assert.deepEqual(battle.playerPowers, ['death_bolt', 'chain_surge']);
  assert.deepEqual(battle.enemyPowers, ['death_bolt', 'rot_miasma', 'raise_dead']);
  assert.equal(battle.loadoutVersion, 7);
  assert.equal(battle.enemyLoadoutVersion, 11);
});

test('Commander PvP is deterministic and never mutates the stored turn snapshot', () => {
  const state = buildCommanderPvpBattle(424242, attackerLoadout(), defenderLoadout(), 'Nova');
  const before = structuredClone(state);
  const first = applyCommanderPvpTurn(state, { move: 'focus_target', targetId: 'enemy_commander' });
  const second = applyCommanderPvpTurn(state, { move: 'focus_target', targetId: 'enemy_commander' });

  assert.deepEqual(state, before);
  assert.deepEqual(first, second);
  assert.equal(first.turn, 2);
  assert.ok(first.events.some((event: any) => event.side === 'player' && event.code === 'focus_target'));
  assert.ok(first.events.some((event: any) => event.side === 'enemy'));
});

test('Commander PvP keeps player school powers authoritative', () => {
  const state = buildCommanderPvpBattle(77, attackerLoadout(), defenderLoadout(), 'Nova');
  const surge = applyCommanderPvpTurn(state, { move: 'chain_surge', targetId: 'enemy_commander' });
  assert.equal(
    surge.events.filter((event: any) => event.side === 'player' && event.code === 'chain_surge').length,
    2,
  );

  assert.throws(
    () => applyCommanderPvpTurn(state, { move: 'rot_miasma', targetId: 'enemy_commander' }),
    /commander_power_locked/,
  );
});

test('Commander PvP fails closed for malformed attacker or defender loadouts', () => {
  for (const [attacker, defender] of [
    [null, defenderLoadout()],
    [attackerLoadout(), null],
    [{ ...attackerLoadout(), hp: 5000 }, defenderLoadout()],
    [attackerLoadout(), { ...defenderLoadout(), units: [defenderLoadout().units[0]] }],
    [attackerLoadout(), { ...defenderLoadout(), units: [{ ...defenderLoadout().units[0], school: 'sun' }, defenderLoadout().units[1]] }],
  ]) {
    assert.throws(
      () => buildCommanderPvpBattle(1, attacker, defender, 'Rival'),
      /invalid_owned_loadout/,
    );
  }
});
