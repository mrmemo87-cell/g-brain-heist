import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const questView = readFileSync(path.resolve(process.cwd(), 'components/QuestView.tsx'), 'utf8');

test('successful assignment submission waits for acknowledgement, then refreshes dashboard assignment state', () => {
  const successFlow = questView.slice(
    questView.indexOf("setAssignmentSubmissionState('submitted')"),
    questView.indexOf('} catch (error)', questView.indexOf("setAssignmentSubmissionState('submitted')")),
  );

  assert.doesNotMatch(successFlow, /refreshAssignment/);
  assert.match(questView, /Select OK to return to your refreshed dashboard and continue practicing\./);
  assert.match(questView, /const handleExitQuest = useCallback\([\s\S]*refreshAssignment\?\.\(\)[\s\S]*onComplete\(\)/);
  assert.match(questView, /onClick=\{resetCompletedMission\}[\s\S]*?>\s*OK\s*<\/button>/);
  assert.match(questView, /onClick=\{handleExitQuest\}[\s\S]*disabled=\{isAssignmentRun && assignmentSubmissionState !== 'submitted'\}/);
  assert.match(questView, /<BackButton onClick=\{handleExitQuest\} \/>/);
});
