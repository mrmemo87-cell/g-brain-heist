import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string): string => {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, 'utf8');
};

test('open arena reward threshold adapts to short-match top score', () => {
  const rewardsTs = read('src/features/clanTerritory/clanTerritoryRewards.ts');

  assert.match(
    rewardsTs,
    /const\s+winningClanTopScore\s*=\s*winningClanPlayers\.reduce\(/,
    'rewards flow should calculate top score for winning clan',
  );

  assert.match(
    rewardsTs,
    /const\s+minContributionScore\s*=\s*isOfficialArena\s*\?\s*rewardPool\.minContributionScore\s*:\s*Math\.min\(rewardPool\.minContributionScore,\s*Math\.max\(1,\s*winningClanTopScore\)\)/s,
    'open arena should clamp contribution threshold to winning clan top score',
  );

  assert.match(
    rewardsTs,
    /player\.battleScore\s*>=\s*minContributionScore/,
    'reward eligibility should use the adaptive threshold',
  );
});
