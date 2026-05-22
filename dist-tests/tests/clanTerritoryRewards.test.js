import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const read = (relativePath) => {
    const fullPath = path.join(process.cwd(), relativePath);
    return fs.readFileSync(fullPath, 'utf8');
};
test('open arena reward threshold adapts to short-match top score', () => {
    const rewardsTs = read('src/features/clanTerritory/clanTerritoryRewards.ts');
    assert.match(rewardsTs, /const\s+winningClanTopScore\s*=\s*winningClanPlayers\.reduce\(/, 'rewards flow should calculate top score for winning clan');
    assert.match(rewardsTs, /const\s+minContributionScore\s*=\s*isOfficialArena\s*\?\s*rewardPool\.minContributionScore\s*:\s*Math\.min\(rewardPool\.minContributionScore,\s*Math\.max\(1,\s*winningClanTopScore\)\)/s, 'open arena should clamp contribution threshold to winning clan top score');
    assert.match(rewardsTs, /player\.battleScore\s*>=\s*minContributionScore/, 'reward eligibility should use the adaptive threshold');
});
test('clan territory reward claim retries are throttled and capped', () => {
    const studentViewTs = read('src/features/clanTerritory/components/ClanTerritoryStudentView.tsx');
    assert.match(studentViewTs, /const\s+rewardClaimRetryCountRef\s*=\s*useRef\(0\)/, 'student view should track reward claim retry count');
    assert.match(studentViewTs, /now\s*>=\s*rewardClaimRetryAtRef\.current/, 'student view should throttle retries by next-allowed timestamp');
    assert.match(studentViewTs, /if\s*\(retryCount\s*<\s*3\)/, 'student view should cap auto-retries to avoid infinite request loops');
    assert.doesNotMatch(studentViewTs, /supabase\.functions\.invoke\(\s*['"]bh_api['"]/i, 'student view should not use bh_api for clan territory reward claim');
    assert.match(studentViewTs, /supabase\.rpc\(\s*['"]rpc_claim_clan_territory_reward['"]/i, 'student view should claim territory rewards via direct rpc_claim_clan_territory_reward call');
});
