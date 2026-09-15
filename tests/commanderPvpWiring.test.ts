import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('Commander PvP migration is persistent, RLS protected, and reward neutral', () => {
  const sql = read('supabase/migrations/20260915123000_commander_pvp_progression_foundation.sql');
  assert.match(sql, /create table public\.commander_pvp_battles/i);
  assert.match(sql, /alter table public\.commander_pvp_battles enable row level security/i);
  assert.match(sql, /revoke all on public\.commander_pvp_battles from public, anon, authenticated/i);
  assert.match(sql, /unique index commander_pvp_one_active_battle_per_attacker/i);
  assert.match(sql, /create function public\.rpc_commander_pvp_lobby/i);
  assert.match(sql, /perform commander_private\.student\(u\)/i);
  assert.doesNotMatch(sql, /update\s+public\.users\s+set\s+(?:coins|xp)/i);
});

test('Commander PvP function authenticates both sides through trusted server loadouts', () => {
  const api = read('supabase/functions/commander_pvp/index.ts');
  const config = read('supabase/config.toml');
  assert.match(api, /admin\.auth\.getUser\(token\)/);
  assert.match(api, /rpc_commander_owned_loadout/);
  assert.match(api, /p_user_id:\s*user\.id/);
  assert.match(api, /p_user_id:\s*targetUserId/);
  assert.match(api, /state_version/);
  assert.match(api, /commander_pvp_target_cooldown/);
  assert.doesNotMatch(api, /\bfetch\s*\(/);
  assert.match(config, /\[functions\.commander_pvp\][\s\S]*?verify_jwt\s*=\s*true/);
});

test('Commander PvP client exposes a recorded battle network instead of practice semantics', () => {
  const lobby = read('src/features/cursedCommander/CommanderPvpLobby.tsx');
  const arena = read('src/features/cursedCommander/CommanderPvpArena.tsx');
  assert.match(lobby, /Player Battles/);
  assert.match(lobby, /ATTACK COMMANDER/);
  assert.match(lobby, /Resume Battle/);
  assert.match(arena, /RECORDED PLAYER BATTLE/);
  assert.match(arena, /persistent/i);
  assert.match(arena, /submitCommanderPvpTurn/);
});
