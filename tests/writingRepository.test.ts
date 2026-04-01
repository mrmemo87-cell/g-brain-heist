import test from 'node:test';
import assert from 'node:assert/strict';

import { getWritingRepositoryMode, loadWritingStoreSnapshot, persistWritingStoreSnapshot } from '../src/lib/brains_heist/writingRepository.js';

test('writing repository no-ops in test env without throwing', async () => {
  assert.equal(getWritingRepositoryMode(), 'disabled');
  const loaded = await loadWritingStoreSnapshot();
  assert.equal(loaded, null);

  await persistWritingStoreSnapshot({
    profiles: [],
    states: [],
    attempts: [],
    weeklyPlans: [],
    dailyTasks: [],
    dailySubmissions: [],
    dailyEvaluations: [],
    monthlyReports: [],
    memorySnapshots: [],
    promptBank: [],
    reviewSignals: [],
    calibrationFollowUpByStudent: {},
  });
});
