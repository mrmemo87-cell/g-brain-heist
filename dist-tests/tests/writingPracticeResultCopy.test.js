import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
test('writing result shows safe submitted-not-completed copy for short responses', () => {
    const writingPractice = read('src/pages/ielts/WritingPractice.tsx');
    assert.match(writingPractice, /Writing submitted/, 'short submission state must use neutral header');
    assert.match(writingPractice, /too short to complete this assignment/i, 'short submission state must explain non-completion clearly');
    assert.match(writingPractice, /Minimum for assignment completion:\s*\{MIN_MEANINGFUL_WORDS\}\s*words\./, 'short submission state must show assignment completion minimum');
});
test('writing result removes fake examiner, email promise, and sms/notification preference claims', () => {
    const writingPractice = read('src/pages/ielts/WritingPractice.tsx');
    assert.doesNotMatch(writingPractice, /certified IELTS examiner/i, 'student writing result must not claim certified IELTS examiner review');
    assert.doesNotMatch(writingPractice, /within\s*<strong>24 hours<\/strong>/i, 'student writing result must not promise 24-hour email delivery');
    assert.doesNotMatch(writingPractice, /Notification Preferences/i, 'student writing result must not show notification preferences UI');
    assert.doesNotMatch(writingPractice, /SMS updates|Send SMS notification/i, 'student writing result must not show SMS claims or controls');
});
test('writing result hides review link until finalized and distinguishes assignment minimum from ielts target', () => {
    const writingPractice = read('src/pages/ielts/WritingPractice.tsx');
    assert.match(writingPractice, /lastAttemptId && hasFinalizedReview/, 'review button must be gated by finalized review availability');
    assert.match(writingPractice, /Teacher feedback will appear here after finalization\./, 'non-finalized state must show waiting message');
    assert.match(writingPractice, /Assignment completion minimum:\s*\{MIN_MEANINGFUL_WORDS\}/, 'summary must show assignment completion minimum explicitly');
    assert.match(writingPractice, /IELTS Task 2 target/, 'summary must show IELTS recommendation separately');
    assert.doesNotMatch(writingPractice, /Minimum:\s*250/i, '250 must not be labeled as minimum completion threshold');
});
