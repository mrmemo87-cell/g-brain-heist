import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string): string => {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, 'utf8');
};

const expectPattern = (content: string, pattern: RegExp, message: string) => {
  assert.match(content, pattern, message);
};

test('reward RPCs are locked down from authenticated clients', () => {
  const applyRewardSql = read('supabase-functions/rpc_apply_reward_delta.sql');
  const levelupSql = read('supabase-functions/rpc_grant_levelup_rewards.sql');

  expectPattern(
    applyRewardSql,
    /auth\.role\(\).*service_role|service_role.*auth\.role\(\)/is,
    'rpc_apply_reward_delta must enforce service_role runtime guard',
  );
  expectPattern(
    applyRewardSql,
    /revoke execute on function public\.rpc_apply_reward_delta\([^\)]*\) from authenticated/is,
    'rpc_apply_reward_delta must revoke execute from authenticated',
  );

  expectPattern(
    levelupSql,
    /auth\.role\(\).*service_role|service_role.*auth\.role\(\)/is,
    'rpc_grant_levelup_rewards must enforce service_role runtime guard',
  );
  expectPattern(
    levelupSql,
    /revoke execute on function public\.rpc_grant_levelup_rewards\([^\)]*\) from authenticated/is,
    'rpc_grant_levelup_rewards must revoke execute from authenticated',
  );
});

test('PvP hack RPC retains auth, cooldown and idempotency guards', () => {
  const hackSql = read('supabase-functions/rpc_hack_attempt.sql');

  expectPattern(hackSql, /v_attacker_id\s+uuid\s*:=\s*auth\.uid\(\)/i, 'rpc_hack_attempt must derive actor from auth.uid()');
  expectPattern(hackSql, /c_attack_cooldown_seconds/i, 'rpc_hack_attempt must enforce attack cooldown');
  expectPattern(hackSql, /where\s+request_id\s*=\s*p_request_id/is, 'rpc_hack_attempt must check idempotency request id');
  expectPattern(hackSql, /insert into public\.pvp_attack_attempts\s*\(request_id,\s*attacker_id,\s*defender_id,\s*response\)/is, 'rpc_hack_attempt must persist idempotency receipt');
});

test('assignment submission invariants are enforced server-side', () => {
  const assignmentSql = read('supabase-functions/teacher_assignments.sql');

  expectPattern(assignmentSql, /ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED/i, 'assignment submission must validate assignment ownership');
  expectPattern(assignmentSql, /ASSIGNMENT_ALREADY_SUBMITTED/i, 'assignment submission must reject duplicates');
  expectPattern(assignmentSql, /MISMATCHED_QUESTION_TOTAL/i, 'assignment submission must validate question totals');
  expectPattern(assignmentSql, /INVALID_ACCURACY_CALCULATION/i, 'assignment submission must validate accuracy consistency');
  expectPattern(assignmentSql, /ASSIGNMENT_STATE_TRANSITION_FAILED/i, 'assignment submission must enforce state transition integrity');
});

test('tournament mutating RPCs require explicit admin authorization', () => {
  const tournamentMigration = read('supabase/migrations/20260324020000_tournament_security_baseline.sql');

  expectPattern(tournamentMigration, /create or replace function public\.require_tournament_admin/is, 'tournament baseline must define require_tournament_admin');
  expectPattern(tournamentMigration, /approve_tournament_signup\([\s\S]*?PERFORM\s+public\.require_tournament_admin\(\)/i, 'approve_tournament_signup must enforce admin authorization');
  expectPattern(tournamentMigration, /generate_season_bracket\([\s\S]*?PERFORM\s+public\.require_tournament_admin\(\)/i, 'generate_season_bracket must enforce admin authorization');
  expectPattern(tournamentMigration, /update_match_schedule\([\s\S]*?PERFORM\s+public\.require_tournament_admin\(\)/i, 'update_match_schedule must enforce admin authorization');
  expectPattern(tournamentMigration, /record_match_winner\([\s\S]*?PERFORM\s+public\.require_tournament_admin\(\)/i, 'record_match_winner must enforce admin authorization');
});

test('tenant-scope denials and reward-event idempotency schema exist', () => {
  const tenantMigration = read('supabase/migrations/20260324010000_tenant_scoped_sensitive_rls.sql');
  const rewardReceiptMigration = read('supabase/migrations/20260324050000_reward_event_idempotency_receipts.sql');

  expectPattern(tenantMigration, /create policy users_select_self_or_same_tenant/is, 'tenant migration must scope users reads');
  expectPattern(tenantMigration, /create policy activities_select_same_tenant/is, 'tenant migration must scope activities reads');
  expectPattern(tenantMigration, /create policy clan_members_select_same_tenant_or_shared_clan/is, 'tenant migration must scope clan member reads');

  expectPattern(rewardReceiptMigration, /unique \(user_id,\s*event_type,\s*event_id\)/i, 'reward receipts must dedupe by event identity');
  expectPattern(rewardReceiptMigration, /unique \(user_id,\s*idempotency_key\)/i, 'reward receipts must dedupe by idempotency key');
  expectPattern(rewardReceiptMigration, /enable row level security/i, 'reward receipts must have RLS enabled');
});

test('clan territory reward claim is client-direct and uses authenticated actor context', () => {
  const bhApi = read('supabase/functions/bh_api/index.ts');
  const studentViewTs = read('src/features/clanTerritory/components/ClanTerritoryStudentView.tsx');
  const clanRewardRpcMigration = read('supabase/migrations/20260328110000_clan_territory_reward_claim_rpc_client_safe.sql');

  assert.doesNotMatch(
    bhApi,
    /"clan-territory\/claim-reward"\s*:/i,
    'bh_api must not expose clan-territory/claim-reward route',
  );

  assert.doesNotMatch(
    studentViewTs,
    /supabase\.functions\.invoke\(\s*['"]bh_api['"]/i,
    'clan territory reward flow must not invoke bh_api edge function',
  );

  expectPattern(
    studentViewTs,
    /supabase\.rpc\(\s*['"]rpc_claim_clan_territory_reward['"]/i,
    'student view must call rpc_claim_clan_territory_reward directly',
  );

  expectPattern(
    clanRewardRpcMigration,
    /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i,
    'clan territory claim rpc must derive actor from auth.uid()',
  );

  assert.doesNotMatch(
    clanRewardRpcMigration,
    /p_user_id/i,
    'clan territory claim rpc must not accept caller-provided user id',
  );

  expectPattern(
    clanRewardRpcMigration,
    /grant execute on function public\.rpc_claim_clan_territory_reward\(text, text, int, int, int, text, text\) to authenticated;/i,
    'clan territory claim rpc must be invokable by authenticated clients',
  );
});

test('task reward claim is client-direct rpc and does not mutate rewards in TypeScript', () => {
  const bhApi = read('supabase/functions/bh_api/index.ts');
  const gameService = read('services/gameService.ts');
  const taskClaimMigration = read('supabase/migrations/20260328130000_task_claim_rpc_client_safe.sql');
  const taskClaimFnMatch = gameService.match(/export const task_claim[\s\S]*?^};$/m);
  const taskClaimFn = taskClaimFnMatch?.[0] ?? '';

  assert.doesNotMatch(
    bhApi,
    /"tasks\/claim"\s*:/i,
    'bh_api must not expose tasks/claim route',
  );

  assert.doesNotMatch(
    gameService,
    /supabase\.functions\.invoke\(\s*['"]bh_api['"]/i,
    'task claim flow must not invoke bh_api edge function',
  );

  expectPattern(
    gameService,
    /supabase\.rpc\(\s*['"]rpc_claim_task_reward['"]/i,
    'task claim flow must call rpc_claim_task_reward directly',
  );

  assert.doesNotMatch(
    taskClaimFn,
    /\.from\(['"]users['"]\)\.update\(/i,
    'task_claim function must not manually mutate user rewards in TypeScript',
  );

  expectPattern(
    taskClaimMigration,
    /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i,
    'task claim rpc must derive actor from auth.uid()',
  );

  assert.doesNotMatch(
    taskClaimMigration,
    /if\s+coalesce\(auth\.role\(\),\s*''\)\s*<>\s*'service_role'/i,
    'task claim rpc must not enforce service_role-only runtime guard',
  );

  expectPattern(
    taskClaimMigration,
    /grant execute on function public\.rpc_claim_task_reward\(text, text, int, int, int, text\) to authenticated;/i,
    'task claim rpc must be invokable by authenticated clients',
  );

  expectPattern(
    taskClaimMigration,
    /v_event_id\s*:=\s*'task:'\s*\|\|\s*p_task_id\s*\|\|\s*':'\s*\|\|\s*v_period_key/i,
    'task claim rpc must force canonical event id instead of trusting caller input',
  );
});
