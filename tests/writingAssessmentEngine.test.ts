import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessWritingExam,
  createEmptyErrorMemory,
  generateMonthlyComparison,
  GENRE_EXPECTATION_CONFIG,
  storeAttemptInErrorMemory,
} from '../src/lib/brains_heist/writingAssessment.js';

const fakePrompt = `Write a response that includes:
- describe the main event
- explain why it mattered
- give one recommendation`;

test('supports all required genres with valid JSON output skeleton', () => {
  const genres = Object.keys(GENRE_EXPECTATION_CONFIG);

  for (const genre of genres) {
    const result = assessWritingExam({
      promptText: fakePrompt,
      grade: 10,
      genre: genre as keyof typeof GENRE_EXPECTATION_CONFIG,
      targetWordCount: 120,
      studentResponse:
        'Dear readers, first I describe the main event in detail. Then I explain why it mattered to our community and school. Therefore, my recommendation is to improve planning in future events with clear student roles.',
    });

    assert.strictEqual(result.genre, genre);
    assert.strictEqual(result.score_mode, 'B1B2_4_scale');
    assert.equal(typeof result.total_score, 'number');
    assert.ok(Array.isArray(result.detected_content_points));
    assert.ok(Array.isArray(result.weakness_tags));
    assert.strictEqual(result.monthly_tracking_ready, true);
  }
});

test('grade 8-9 keeps official 3 subscales and hidden coaching signals', () => {
  const result = assessWritingExam({
    promptText: fakePrompt,
    grade: 8,
    genre: 'article',
    targetWordCount: 100,
    studentResponse:
      'First, I describe the main event. Then I explain why it mattered for readers in our school community. Finally, I add one recommendation for future events.',
  });

  assert.strictEqual(result.score_mode, 'A2_3_scale');
  assert.strictEqual(result.subscores.communicative_achievement, null);
  assert.ok(result.hidden_coaching_signals);
  assert.equal(typeof result.hidden_coaching_signals?.register, 'number');
});

test('under-length but relevant response gets under_length tag while preserving content recognition', () => {
  const result = assessWritingExam({
    promptText: fakePrompt,
    grade: 9,
    genre: 'email',
    targetWordCount: 120,
    studentResponse:
      'Dear Teacher, the main event was the science fair final. It mattered because students collaborated and learned from mistakes. I recommend a longer preparation week. Regards, Ali',
  });

  assert.ok(result.detected_content_points.length >= 2);
  assert.ok(result.weakness_tags.includes('under_length'));
});

test('good language but missing one content point reduces content band', () => {
  const result = assessWritingExam({
    promptText: fakePrompt,
    grade: 11,
    genre: 'essay',
    targetWordCount: 140,
    studentResponse:
      'This essay describes the main event in the school debate final and explains why it mattered for student confidence. Furthermore, the discussion encouraged critical thinking and respectful disagreement. In conclusion, this event clearly benefited the school community.',
  });

  assert.ok(result.missed_content_points.length >= 1);
  assert.ok(result.subscores.language >= 3);
  assert.ok(result.subscores.content <= 4);
});

test('correct content but weak organisation is penalized in organisation band', () => {
  const result = assessWritingExam({
    promptText: fakePrompt,
    grade: 10,
    genre: 'report',
    targetWordCount: 140,
    studentResponse:
      'The main event was the robotics challenge and it mattered because teams solved real problems and gained confidence and my recommendation is to keep this event every term with more training and clearer judging rules because students asked for this support and said it helped them prepare for future competitions in school',
  });

  assert.ok(result.detected_content_points.length >= 3);
  assert.ok(result.subscores.organisation <= 2);
  assert.ok(result.weakness_tags.includes('weak_paragraphing'));
});

test('strong response with wrong tone/register is penalized for communicative achievement', () => {
  const result = assessWritingExam({
    promptText: fakePrompt,
    grade: 12,
    genre: 'report',
    targetWordCount: 150,
    studentResponse:
      'Hey guys, the event was super awesome and we had a blast. I described the main event clearly, explained why it mattered for everyone, and gave a recommendation to repeat it monthly. You all should totally do it again because it was really cool and fun for everybody.',
  });

  assert.ok(result.subscores.communicative_achievement !== null);
  assert.ok((result.subscores.communicative_achievement ?? 0) <= 3);
  assert.ok(result.weakness_tags.includes('wrong_tone'));
});

test('repeated error memory and monthly comparison work across attempts', () => {
  let memory = createEmptyErrorMemory();

  const marchResult = assessWritingExam({
    promptText: fakePrompt,
    grade: 11,
    genre: 'essay',
    targetWordCount: 160,
    studentResponse: 'I think the event was good but short',
  });

  const febResult = assessWritingExam({
    promptText: fakePrompt,
    grade: 11,
    genre: 'essay',
    targetWordCount: 160,
    studentResponse:
      'This essay describes the main event. However, it did not fully succeed. In conclusion, my recommendation is clear for the school audience.',
  });

  memory = storeAttemptInErrorMemory(memory, 'student-1', febResult, '2026-02-12T10:00:00.000Z');
  memory = storeAttemptInErrorMemory(memory, 'student-1', marchResult, '2026-03-08T10:00:00.000Z');

  const comparison = generateMonthlyComparison(memory, 'student-1', '2026-03');

  assert.strictEqual(comparison.studentId, 'student-1');
  assert.ok(comparison.currentMonth);
  assert.ok(comparison.previousMonth);
  assert.equal(typeof comparison.scoreDelta, 'number');
});
