import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260808111806_gameplay_integrity_inventory_streak_targets.sql');
const streakBoostMigration = read('supabase/migrations/20260808121659_multiply_daily_streak_rewards.sql');
const service = read('services/gameService.ts');
const missionBoard = read('components/quest/MissionBoard.tsx');
const app = read('App.tsx');
const header = read('components/Header.tsx');
const help = read('components/HelpModal.tsx');
const streakGuide = read('components/StreakRewardGuide.tsx');
const streakModal = read('components/StreakRewardModal.tsx');
test('inventory activation is atomic and authenticated', () => {
    assert.match(migration, /function public\.inventory_activate\(p_inventory_id uuid\)/i);
    assert.match(migration, /where id = p_inventory_id and user_id = v_user_id for update/i);
    assert.match(service, /supabase\.rpc\('inventory_activate', \{ p_inventory_id: inv_id \}\)/);
});
test('daily streak rewards are idempotent and server-authoritative', () => {
    assert.match(migration, /primary key \(user_id, reward_date\)/i);
    assert.match(migration, /pg_advisory_xact_lock/i);
    assert.match(service, /supabase\.rpc\('rpc_record_daily_streak'\)/);
});
test('daily streak reward ladder is boosted by 10x without weakening RPC access', () => {
    assert.match(streakBoostMigration, /when v_new_streak % 30 = 0 then 2500/i);
    assert.match(streakBoostMigration, /when v_new_streak % 14 = 0 then 1000/i);
    assert.match(streakBoostMigration, /when v_new_streak % 7 = 0 then 500/i);
    assert.match(streakBoostMigration, /when v_new_streak % 3 = 0 then 250/i);
    assert.match(streakBoostMigration, /else 100/i);
    assert.match(streakBoostMigration, /set search_path = ''/i);
    assert.match(streakBoostMigration, /revoke all on function public\.rpc_record_daily_streak\(\) from public, anon/i);
    assert.match(streakBoostMigration, /grant execute on function public\.rpc_record_daily_streak\(\) to authenticated/i);
});
test('streak guide and HUD clicks expose the complete branded reward ladder', () => {
    for (const reward of ['100', '250', '500', '1000', '2500']) {
        assert.match(streakGuide, new RegExp(`coins: ${reward}(?:,|\\s)`));
    }
    assert.match(help, /Daily Streak Rewards/);
    assert.match(header, /onShowStreak/);
    assert.match(app, /setHelpInitialSection\('streak'\)/);
});
test('a claimed server receipt opens one streak celebration with level-up audio and OK close', () => {
    assert.match(service, /pendingDailyStreakReward/);
    assert.match(service, /receipt\.claimed/);
    assert.match(app, /shownStreakRewardRef/);
    assert.match(app, /<StreakRewardModal/);
    assert.match(streakModal, /audioService\.play\('tada'\)/);
    assert.match(streakModal, /OK — CONTINUE/);
});
test('attack targets expose active shields and mission duplicate submissions resync cleanly', () => {
    assert.match(migration, /i\.state='active'/i);
    assert.match(migration, /i\.expires_at is null or i\.expires_at > now\(\)/i);
    assert.match(missionBoard, /Your answer was already saved\. Mission state re-synced from server\./);
});
