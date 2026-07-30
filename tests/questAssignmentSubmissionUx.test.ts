import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const questView = readFileSync(path.resolve(process.cwd(), 'components/QuestView.tsx'), 'utf8');

test('successful assignment submission waits for student acknowledgement before refreshing', () => {
  const successFlow = questView.slice(
    questView.indexOf("setAssignmentSubmissionState('submitted')"),
    questView.indexOf('} catch (error)', questView.indexOf("setAssignmentSubmissionState('submitted')")),
  );

  assert.doesNotMatch(successFlow, /refreshAssignment/);
  assert.match(questView, /Select OK when you are ready to continue\./);
  assert.match(questView, /onClick=\{resetCompletedMission\}[\s\S]*?>\s*OK\s*<\/button>/);
});
