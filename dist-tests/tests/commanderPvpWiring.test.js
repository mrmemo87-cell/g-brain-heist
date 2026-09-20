import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(path, 'utf8');
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
test('Commander PvP service role has only the battle table writes required by the Edge Function', () => {
    const sql = read('supabase/migrations/20260916063851_grant_commander_pvp_service_role.sql');
    assert.match(sql, /grant\s+select,\s*insert,\s*update[\s\S]*commander_pvp_battles[\s\S]*to\s+service_role/i);
    assert.doesNotMatch(sql, /\bdelete\b/i);
    assert.doesNotMatch(sql, /\bauthenticated\b/i);
    assert.doesNotMatch(sql, /\banon\b/i);
});
test('Commander PvP service role can read only the campaign table required to start a battle', () => {
    const sql = read('supabase/migrations/20260916082308_grant_commander_pvp_campaign_service_role.sql');
    assert.match(sql, /grant\s+select[\s\S]*commander_campaigns[\s\S]*to\s+service_role/i);
    assert.doesNotMatch(sql, /\binsert\b/i);
    assert.doesNotMatch(sql, /\bupdate\b/i);
    assert.doesNotMatch(sql, /\bdelete\b/i);
    assert.doesNotMatch(sql, /\bauthenticated\b/i);
    assert.doesNotMatch(sql, /\banon\b/i);
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
test('Commander PvP client sends auth and API key explicitly to the verified Edge Function', () => {
    const service = read('services/commanderPvpService.ts');
    assert.match(service, /supabase\.auth\.getSession\(\)/);
    assert.match(service, /VITE_SUPABASE_URL/);
    assert.match(service, /VITE_SUPABASE_ANON_KEY/);
    assert.match(service, /\/functions\/v1\/commander_pvp/);
    assert.match(service, /Authorization:\s*`Bearer \$\{session\.access_token\}`/);
    assert.match(service, /apikey:\s*supabaseAnonKey/);
    assert.match(service, /'Content-Type':\s*'application\/json'/);
    assert.match(service, /fetch\(endpoint,[\s\S]*?headers/);
    assert.doesNotMatch(service, /functions\.invoke/);
    assert.match(service, /commander_pvp_auth_required/);
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
test('Commander PvP interrupted battles have explicit resume, expiry, and abandon UX', () => {
    const lobby = read('src/features/cursedCommander/CommanderPvpLobby.tsx');
    assert.match(lobby, /BATTLE IN PROGRESS/);
    assert.match(lobby, /Time remaining/);
    assert.match(lobby, /Resume Battle/);
    assert.match(lobby, /Abandon Battle/);
    assert.match(lobby, /cancelCommanderPvp/);
    assert.match(lobby, /Cancel this battle\?/);
    assert.match(lobby, /Disconnecting does not decide the battle/);
    assert.doesNotMatch(lobby, /FINISH ACTIVE BATTLE/);
});
