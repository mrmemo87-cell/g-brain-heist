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

test('Commander arena includes visual-only confirmed-event battlefield playback', () => {
  const arena = readFileSync('src/features/cursedCommander/CommanderPracticeArena.tsx', 'utf8');

  assert.match(arena, /LiveBattlefield/);
  assert.match(arena, /playConfirmedEvents/);
  assert.match(arena, /confirmedEvents/);
  assert.match(arena, /prefers-reduced-motion/);
  assert.match(arena, /Speed.*1×|speed.*1 \| 2/s);
  assert.match(arena, /☄️/);
  assert.match(arena, /🎯/);
  assert.match(arena, /🛡️/);
  assert.doesNotMatch(arena, /supabase\.from|supabase\.rpc|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
});
