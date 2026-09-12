import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {
  applyPracticeTurn,
  startPracticeBattle,
} from '../supabase/functions/commander_practice/engine';

test('practice combat is deterministic for identical seed and intent', () => {
  const first = applyPracticeTurn(startPracticeBattle(424242), {
    move: 'focus_target',
    targetId: 'enemy_commander',
  });
  const second = applyPracticeTurn(startPracticeBattle(424242), {
    move: 'focus_target',
    targetId: 'enemy_commander',
  });

  assert.deepEqual(first, second);
  assert.equal(first.turn, 2);
});

test('practice combat rejects forged target ids and preserves source state', () => {
  const original = startPracticeBattle(7);
  const snapshot = structuredClone(original);

  assert.throws(
    () => applyPracticeTurn(original, { move: 'death_bolt', targetId: 'player_commander' }),
    /invalid_target/,
  );
  assert.deepEqual(original, snapshot);
});

test('death bolt has a server-enforced cooldown', () => {
  const afterBolt = applyPracticeTurn(startPracticeBattle(99), {
    move: 'death_bolt',
    targetId: 'enemy_commander',
  });

  assert.equal(afterBolt.playerDeathBoltCooldown, 2);
  assert.throws(
    () => applyPracticeTurn(afterBolt, { move: 'death_bolt', targetId: 'enemy_commander' }),
    /death_bolt_on_cooldown/,
  );
});

test('preview API is authenticated, student-gated, signed, and write-free', () => {
  const api = readFileSync('supabase/functions/commander_practice/index.ts', 'utf8');
  const config = readFileSync('supabase/config.toml', 'utf8');

  assert.match(api, /admin\.auth\.getUser\(token\)/);
  assert.match(api, /admin[\s\S]*?\.from\("users"\)[\s\S]*?\.select\("role"\)[\s\S]*?\.eq\("id", userId\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(api, /data\?\.role === "student"/);
  assert.match(api, /commander_preview_students_only/);
  assert.doesNotMatch(api, /COMMANDER_PREVIEW_TESTER_IDS/);
  assert.doesNotMatch(api, /COMMANDER_PREVIEW_TESTER_EMAILS/);
  assert.match(api, /COMMANDER_PREVIEW_SIGNING_SECRET/);
  assert.match(api, /crypto\.subtle\.sign/);
  assert.match(api, /crypto\.subtle\.verify/);

  const ast = ts.createSourceFile('index.ts', api, ts.ScriptTarget.Latest, true);
  let profileReads = 0;
  const inspect = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'from') {
      const owner = node.expression.expression.getText(ast);
      if (owner === 'Uint8Array') {
        ts.forEachChild(node, inspect);
        return;
      }

      assert.equal(owner, 'admin', 'Only the authenticated admin client may read a table');
      assert.equal(node.arguments.length, 1, 'Commander preview must use exactly one table argument');
      assert.equal(node.arguments[0]?.getText(ast), '"users"', 'Commander preview may only read the users role table');
      profileReads += 1;
    }
    ts.forEachChild(node, inspect);
  };
  inspect(ast);
  assert.equal(profileReads, 1, 'Commander preview should perform one role-table read');

  for (const method of ['insert', 'update', 'upsert', 'delete', 'rpc']) {
    assert.doesNotMatch(api, new RegExp(`\\.${method}\\s*\\(`), `${method} must remain unavailable in practice preview`);
  }
  assert.doesNotMatch(api, /\bfetch\s*\(/);
  assert.match(config, /\[functions\.commander_practice\][\s\S]*?verify_jwt\s*=\s*true/);
});

test('Game tab adds Commander Preview without replacing legacy Attack', () => {
  const mainActions = readFileSync('components/MainActions.tsx', 'utf8');

  assert.match(mainActions, /CommanderPracticeArena/);
  assert.match(mainActions, /setShowCommanderPreview\(true\)/);
  assert.match(mainActions, /handlePilotClick\('Launch Attack', onStartPvp\)/);
  assert.match(mainActions, /mission-console-images\/attack\.webp/);
  assert.match(mainActions, /onOpenLockdown[\s\S]*?Lockdown Mode/);
});

test('the cooldown sent to the arena rejects Death Bolt until it reaches zero', () => {
  const state = startPracticeBattle(99);
  state.playerDeathBoltCooldown = 1;
  assert.throws(() => applyPracticeTurn(state, { move: 'death_bolt', targetId: 'enemy_commander' }), /death_bolt_on_cooldown/);
  const ready = applyPracticeTurn(state, { move: 'guard' });
  assert.equal(ready.playerDeathBoltCooldown, 0);
  assert.doesNotThrow(() => applyPracticeTurn(ready, { move: 'death_bolt', targetId: 'enemy_commander' }));
});

test('Commander arena uses server-confirmed tactical playback without persistence writes', () => {
  const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');
  const battlefield = readFileSync('src/features/cursedCommander/CommanderCinematicBattlefield.tsx', 'utf8');
  const playback = readFileSync('src/features/cursedCommander/commanderCinematicPlayback.ts', 'utf8');
  const portraits = readFileSync('src/features/cursedCommander/CommanderUnitPortrait.tsx', 'utf8');
  const sprites = readFileSync('src/features/cursedCommander/CommanderBattleSprite.tsx', 'utf8');
  const spriteAssets = readFileSync('src/features/cursedCommander/commanderSpriteAssets.ts', 'utf8');
  const formation = readFileSync('src/features/cursedCommander/commanderFormationLayout.ts', 'utf8');
  const dock = readFileSync('src/features/cursedCommander/CommanderCommandDock.tsx', 'utf8');
  const sound = readFileSync('src/features/cursedCommander/commanderBattleSound.ts', 'utf8');

  assert.match(arena, /CommanderCinematicBattlefield/);
  assert.match(arena, /buildCommanderCinematicSteps\(confirmedEvents\)/);
  assert.match(arena, /applyCommanderCinematicStep/);
  assert.match(arena, /prefers-reduced-motion/);
  assert.match(arena, /speed.*1 \| 2/s);
  assert.match(battlefield, /TacticalBackdrop/);
  assert.match(battlefield, /ProjectilePath/);
  assert.match(battlefield, /resolveSpritePose/);
  assert.match(battlefield, /cc-combat-float/);
  assert.match(battlefield, /ImpactBurst/);
  assert.match(battlefield, /EventBanner/);
  assert.match(battlefield, /cc-stage-shield-bloom/);
  assert.match(battlefield, /CommanderBattleSprite/);
  assert.match(battlefield, /CommanderCommandDock/);
  assert.match(battlefield, /TacticalTargetReticle/);
  assert.match(battlefield, /DeathBoltCharge/);
  assert.match(battlefield, /playCommanderSfx/);
  assert.match(formation, /player_guard.*x: 38.*lane: 'front'/s);
  assert.match(formation, /player_archer.*x: 13.*lane: 'rear'/s);
  assert.match(formation, /enemy_guard.*x: 62.*lane: 'front'/s);
  assert.match(playback, /pendingShieldByTarget/);
  assert.match(portraits, /CipherCommander/);
  assert.match(sprites, /data-commander-pose/);
  assert.match(sprites, /getCommanderSpriteUrl/);
  assert.match(spriteAssets, /Cipher Commander standing\.png/);
  assert.match(spriteAssets, /Neon Guard attacking\.png/);
  assert.match(spriteAssets, /Shade Archer just shot\.png/);
  assert.match(spriteAssets, /Shade Archer arrow\.png/);
  assert.match(spriteAssets, /Warden Null defeated\.png/);
  assert.match(spriteAssets, /Iron Revenant attacked\.png/);
  assert.match(spriteAssets, /Hollow Ranger just shot\.png/);
  assert.match(spriteAssets, /Hollow Ranger arrow\.png/);
  assert.match(dock, /focus_target/);
  assert.match(dock, /death_bolt/);
  assert.match(dock, /guard/);
  assert.match(sound, /AudioContext/);
  assert.match(sound, /deathBoltCharge/);
  assert.match(sound, /shieldHit/);
  assert.match(sound, /victory/);

  for (const source of [arena, battlefield, playback, portraits, sprites, spriteAssets, formation, dock, sound]) {
    assert.doesNotMatch(source, /supabase\.from|supabase\.rpc|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
  }
});

test('authored Commander sprites expose combat poses and real archer projectiles', () => {
  const battlefield = readFileSync('src/features/cursedCommander/CommanderCinematicBattlefield.tsx', 'utf8');
  const spriteAssets = readFileSync('src/features/cursedCommander/commanderSpriteAssets.ts', 'utf8');

  for (const id of ['player_commander', 'player_guard', 'player_archer', 'enemy_commander', 'enemy_guard', 'enemy_archer']) {
    assert.match(spriteAssets, new RegExp(`${id}:`));
  }
  assert.match(spriteAssets, /standing: string/);
  assert.match(spriteAssets, /attacking: string/);
  assert.match(spriteAssets, /attacked: string/);
  assert.match(spriteAssets, /defeated: string/);
  assert.match(spriteAssets, /justShot\?: string/);
  assert.match(battlefield, /getCommanderProjectileUrl/);
  assert.match(battlefield, /cc-authored-projectile/);
  assert.match(battlefield, /rotate="0"/);
  assert.match(battlefield, /return 'attacked'/);
  assert.match(battlefield, /return 'justShot'/);
});

test('combat feedback rises, fades, and uses distinct damage/shield colors', () => {
  const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');
  const battlefield = readFileSync('src/features/cursedCommander/CommanderCinematicBattlefield.tsx', 'utf8');

  assert.match(battlefield, /damage:.*text-red-300/s);
  assert.match(battlefield, /shieldDamage:.*text-amber-200/s);
  assert.match(battlefield, /shieldGain:.*text-cyan-200/s);
  assert.match(battlefield, /ccStageFloat[\s\S]*translate3d\(0,-90px,0\)/);
  assert.match(battlefield, /animation:ccStageFloat 1450ms/);
  assert.match(arena, /ccReadableCombatFloat[\s\S]*translate3d\(0,-82px,0\)/);
  assert.match(arena, /animation:ccReadableCombatFloat 1200ms/);
  assert.match(battlefield, /-\{activeStep\.hpDamage\}/);
  assert.match(battlefield, /\+\{activeStep\?\.event\.amount \?\? 0\} \{copy\.shield\}/);
});

test('battlefield hover keeps world coordinates fixed while targeting is unit-anchored', () => {
  const battlefield = readFileSync('src/features/cursedCommander/CommanderCinematicBattlefield.tsx', 'utf8');

  assert.match(battlefield, /transform: 'translate\(-50%, -82%\)'/);
  assert.match(battlefield, /cc-stage-scale-shell/);
  assert.match(battlefield, /\.cc-stage-unit:hover,.cc-stage-unit:focus-visible\{transform:translate\(-50%,-82%\)!important\}/);
  assert.match(battlefield, /TacticalTargetReticle selected=\{selected\}/);
  assert.match(battlefield, /cc-target-reticle-spin/);
  assert.match(battlefield, /cc-focus-reticle-spin/);
});

test('default Commander playback leaves enough time to read each combat event', () => {
  const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');

  assert.match(arena, /attackWindup: 650/);
  assert.match(arena, /attackImpact: 1450/);
  assert.match(arena, /deathBoltImpact: 1650/);
  assert.match(arena, /guardImpact: 1400/);
  assert.match(arena, /outcomeImpact: 1700/);
  assert.match(arena, /const multiplier = speed === 2 \? 0\.6 : 1/);
});

test('battlefield is formation-first instead of rendering duplicated squad cards', () => {
  const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');
  const battlefield = readFileSync('src/features/cursedCommander/CommanderCinematicBattlefield.tsx', 'utf8');
  const formation = readFileSync('src/features/cursedCommander/commanderFormationLayout.ts', 'utf8');

  assert.doesNotMatch(arena, /CombatantCard/);
  assert.doesNotMatch(arena, /playerCombatants\.map/);
  assert.doesNotMatch(arena, /enemyCombatants\.map/);
  assert.match(battlefield, /combatants\.map\(unit\)/);
  assert.match(battlefield, /getCommanderFormationPoint\(combatant\)/);
  assert.match(battlefield, /className={`cc-stage-unit absolute/);
  assert.match(battlefield, /onSelectTarget/);
  assert.match(battlefield, /combatant\.hp\/combatant\.maxHp/);
  assert.match(battlefield, /combatant\.shield/);
  assert.match(formation, /lane: 'front'/);
  assert.match(formation, /lane: 'rear'/);
});
