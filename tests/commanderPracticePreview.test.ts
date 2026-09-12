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
  assert.match(battlefield, /cc-combat-float/);
  assert.match(battlefield, /ImpactBurst/);
  assert.match(battlefield, /EventBanner/);
  assert.match(battlefield, /cc-stage-shield-bloom/);
  assert.match(battlefield, /CommanderBattleSprite/);
  assert.match(battlefield, /CommanderCommandDock/);
  assert.match(battlefield, /TacticalTargetReticle/);
  assert.match(battlefield, /MeleeSlashFx/);
  assert.match(battlefield, /DeathBoltCharge/);
  assert.match(battlefield, /playCommanderSfx/);
  assert.match(formation, /player_guard.*x: 38.*lane: 'front'/s);
  assert.match(formation, /player_archer.*x: 13.*lane: 'rear'/s);
  assert.match(formation, /enemy_guard.*x: 62.*lane: 'front'/s);
  assert.match(playback, /pendingShieldByTarget/);
  assert.match(portraits, /CipherCommander/);
  assert.match(sprites, /CommanderBody/);
  assert.match(sprites, /GuardBody/);
  assert.match(sprites, /ArcherBody/);
  assert.match(dock, /focus_target/);
  assert.match(dock, /death_bolt/);
  assert.match(dock, /guard/);
  assert.match(sound, /AudioContext/);
  assert.match(sound, /deathBoltCharge/);
  assert.match(sound, /shieldHit/);
  assert.match(sound, /victory/);
  assert.doesNotMatch(battlefield, /unitEmoji/);

  for (const source of [arena, battlefield, playback, portraits, sprites, formation, dock, sound]) {
    assert.doesNotMatch(source, /supabase\.from|supabase\.rpc|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
  }
});

test('combat feedback floats and fades with distinct semantic colors', () => {
  const battlefield = readFileSync('src/features/cursedCommander/CommanderCinematicBattlefield.tsx', 'utf8');

  assert.match(battlefield, /damage:.*text-red-300/s);
  assert.match(battlefield, /heal:.*text-emerald-300/s);
  assert.match(battlefield, /shieldDamage:.*text-amber-200/s);
  assert.match(battlefield, /shieldGain:.*text-cyan-200/s);
  assert.match(battlefield, /ccStageFloat[\s\S]*opacity:0[\s\S]*translate3d\(0,-48px,0\)/);
  assert.match(battlefield, /animation:ccStageFloat 900ms/);
  assert.match(battlefield, /-\{activeStep\.hpDamage\}/);
  assert.match(battlefield, /\+\{activeStep\?\.event\.amount \?\? 0\} \{copy\.shield\}/);
});

test('battlefield hover keeps formation coordinates fixed while selection reticle is unit-anchored', () => {
  const battlefield = readFileSync('src/features/cursedCommander/CommanderCinematicBattlefield.tsx', 'utf8');

  assert.match(battlefield, /\.cc-stage-unit\{transform:translate\(-50%,-82%\) scale\(var\(--cc-unit-scale\)\)/);
  assert.match(battlefield, /\.cc-stage-unit:hover,.cc-stage-unit:focus-visible\{transform:translate\(-50%,-82%\) scale\(var\(--cc-unit-scale\)\)!important\}/);
  assert.match(battlefield, /left-1\/2 top-\[39%\][\s\S]*TacticalTargetReticle|TacticalTargetReticle[\s\S]*left-1\/2 top-\[39%\]/);
  assert.match(battlefield, /cc-target-reticle-spin/);
  assert.match(battlefield, /cc-focus-reticle-spin/);
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
  assert.match(battlefield, /className={`cc-stage-unit group absolute/);
  assert.match(battlefield, /onSelectTarget/);
  assert.match(battlefield, /combatant\.hp\/combatant\.maxHp/);
  assert.match(battlefield, /combatant\.shield/);
  assert.match(formation, /lane: 'front'/);
  assert.match(formation, /lane: 'rear'/);
});
