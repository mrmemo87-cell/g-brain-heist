import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

type ValidationResult = { ok: boolean; errors: string[] };

async function loadValidator(): Promise<(seedDir?: string) => ValidationResult> {
  const moduleUrl = pathToFileURL(path.resolve('scripts/validate-admission-official-bank.mjs')).href;
  const mod = await import(moduleUrl) as { validateAdmissionOfficialBank: (seedDir?: string) => ValidationResult };
  return mod.validateAdmissionOfficialBank;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeMinimalSeed(overrides: { passageText?: string; rubricName?: string; questionPrompt?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'adm-bank-validation-'));
  for (const subdir of ['shared', 'english', 'maths', 'science']) mkdirSync(path.join(dir, subdir), { recursive: true });

  const official = { is_official: true, is_locked: true, content_owner: 'brain_heist' };
  writeJson(path.join(dir, 'shared', 'reading_passages.json'), {
    passages: [{
      ...official,
      external_id: 'passage-1',
      title: 'Passage',
      subject: 'english',
      grade_level: 5,
      stage_level: 'primary',
      text: overrides.passageText ?? 'A clean shared passage.',
      content_version: 'test-v1',
      source_label: 'Brains Heist Official Admission Bank',
    }],
  });
  writeJson(path.join(dir, 'shared', 'writing_rubrics.json'), {
    rubrics: [{
      ...official,
      external_id: 'rubric-1',
      name: overrides.rubricName ?? 'Clean rubric',
      grade_level: 5,
      stage_level: 'primary',
      max_marks: 6,
      criteria: [{ name: 'Ideas', max_marks: 3 }],
      content_version: 'test-v1',
      source_label: 'Brains Heist Official Admission Bank',
    }],
  });

  for (const subject of ['english', 'maths']) writeJson(path.join(dir, subject, 'grade_5.json'), { pools: [], questions: [] });
  writeJson(path.join(dir, 'science', 'grade_6.json'), {
    pools: [{
      ...official,
      external_id: 'pool-1',
      subject: 'science',
      grade_level: 6,
      stage_level: 'primary',
      placement_band: 'foundation',
      name: 'Science pool',
      content_version: 'test-v1',
      source_label: 'Brains Heist Official Admission Bank',
    }],
    questions: [{
      ...official,
      external_id: 'question-1',
      pool_external_id: 'pool-1',
      subject: 'science',
      grade_level: 6,
      stage_level: 'primary',
      placement_band: 'foundation',
      diagnostic_skill: 'Working scientifically',
      strand: 'working scientifically',
      subskill: 'fair tests',
      difficulty: 'easy',
      question_type: 'mcq',
      prompt: overrides.questionPrompt ?? 'Which variable should stay the same?',
      explanation: 'A fair test changes one variable at a time.',
      marks: 1,
      estimated_seconds: 60,
      content_version: 'test-v1',
      source_label: 'Brains Heist Official Admission Bank',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A',
      correct_index: 0,
    }],
  });

  return dir;
}

test('official admission bank validation rejects In investigation N in question text', async () => {
  const validateAdmissionOfficialBank = await loadValidator();
  const seedDir = makeMinimalSeed({ questionPrompt: 'In investigation 3, a class changes one variable. What should stay the same?' });
  const result = validateAdmissionOfficialBank(seedDir);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /In investigation 3/);
  assert.match(result.errors.join('\n'), /template\/generator residue/);
});

test('official admission bank validation scans shared passages and rubrics for generator residue', async () => {
  const validateAdmissionOfficialBank = await loadValidator();
  const passageResult = validateAdmissionOfficialBank(makeMinimalSeed({ passageText: 'In investigation 12, students observe a shadow.' }));
  assert.equal(passageResult.ok, false);
  assert.match(passageResult.errors.join('\n'), /In investigation 12/);

  const rubricResult = validateAdmissionOfficialBank(makeMinimalSeed({ rubricName: 'In investigation 7 rubric' }));
  assert.equal(rubricResult.ok, false);
  assert.match(rubricResult.errors.join('\n'), /In investigation 7/);
});
