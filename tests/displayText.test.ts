import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { countLabel, formatTopicLabel, greetingName } from '../src/utils/displayText';

const read = (relative: string) => fs.readFileSync(relative, 'utf8');

test('greetingName keeps an honorific with the surname instead of greeting "Ms."', () => {
  assert.equal(greetingName('Ms. Sarah Mitchell'), 'Ms. Mitchell');
  assert.equal(greetingName('Dr Amina Yusuf'), 'Dr Yusuf');
  assert.equal(greetingName('Sarah Mitchell'), 'Sarah');
  assert.equal(greetingName('  '), 'School Head');
  assert.equal(greetingName(null), 'School Head');
  assert.equal(greetingName('Mr.'), 'School Head');
});

test('formatTopicLabel fixes known acronyms only', () => {
  assert.equal(formatTopicLabel('Present Perfect Active And Passive (Esl)'), 'Present Perfect Active And Passive (ESL)');
  assert.equal(formatTopicLabel('Ielts Writing Task 2'), 'IELTS Writing Task 2');
  assert.equal(formatTopicLabel('Adjectives'), 'Adjectives');
  assert.equal(formatTopicLabel('Messiness'), 'Messiness');
  assert.equal(formatTopicLabel(null), '');
});

test('countLabel uses the singular for one', () => {
  assert.equal(countLabel(1, 'question'), '1 question');
  assert.equal(countLabel(0, 'question'), '0 questions');
  assert.equal(countLabel(47, 'question'), '47 questions');
  assert.equal(countLabel(2, 'class', 'classes'), '2 classes');
});

test('School Head and teacher surfaces use the polished wording', () => {
  assert.match(read('components/SchoolHeadOverview.tsx'), /greetingName\(snapshot\.head\?\.name\)/);
  assert.match(read('components/teacher/QuestionBank.tsx'), /countLabel\(group\.count \?\? group\.questions\.length, 'question'\)/);
  const portal = read('components/TeacherPortal.tsx');
  assert.match(portal, /classAllocationsMissing && \(/);
  assert.doesNotMatch(portal, /\{!teacherHasClassAllocations && \(/);
  const mission = read('components/student/DailyMissionCard.tsx');
  assert.match(mission, /Fix your recent mistakes/);
  assert.match(read('src/i18n/messages.ts'), /"Fix your recent mistakes": \{/);
  assert.match(read('src/i18n/messages.ts'), /"Challenge a classmate": \{/);
});

test('Decision Center wording migration keeps the original rules behind a wrapper', () => {
  const sql = read('supabase/migrations/20261119170000_school_head_decision_wording_and_programme_setup.sql');
  assert.match(sql, /rename to school_head_build_operational_decisions_core_20261119/);
  assert.match(sql, /school_subject_offerings o/);
  assert.match(sql, /school_programme_seat_assignments spa/);
  assert.match(sql, /when 'ielts' then 'IELTS'/);
  assert.match(sql, /revoke all on function private\.school_head_build_operational_decisions\(uuid, integer\)\s+from public, anon, authenticated, service_role/);
});

test('Demo seed 07 only runs on the demo database and never sends email', () => {
  const seed = read('supabase/demo/seed/07_guardians.sql');
  assert.match(seed, /private\.demo_environment/);
  assert.match(seed, /@example\.com/);
  assert.match(seed, /status = 'skipped', raw_token = null/);
});
