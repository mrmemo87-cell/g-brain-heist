import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260730120000_allow_rich_question_options_in_quality_validation.sql',
  'utf8',
);

test('question validation compares correct answers with rich option text', () => {
  assert.match(migration, /jsonb_array_elements\(NEW\.options\)/);
  assert.match(migration, /WHEN 'object' THEN option_value ->> 'text'/);
  assert.match(migration, /WHEN 'string' THEN option_value #>> '\{\}'/);
  assert.match(migration, /END = NEW\.correct_answer/);
});
