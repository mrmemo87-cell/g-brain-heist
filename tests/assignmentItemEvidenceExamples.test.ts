import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261031080000_assignment_item_evidence_examples.sql', 'utf8');
const page = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');

test('assignment-sourced needs get evidence examples from the student’s own wrong answers', () => {
  // Only as a fallback when there are no Writing-hub examples, and only for registry-lane keys.
  assert.match(migration, /jsonb_array_length\(coalesce\(v_examples, '\[\]'::jsonb\)\) = 0 and v_focus\.skill_key like 'registry:%'/);
  assert.match(migration, /from public\.student_learning_registry_item_evidence ie/);
  assert.match(migration, /and not ie\.is_correct/);
  assert.match(migration, /order by ie\.is_independent_assessment desc, ie\.answered_at desc/);
  assert.match(migration, /limit 6/);
  // Same shape the Writing examples use, so the card and review modal render unchanged.
  for (const key of ["'original'", "'better_version'", "'issue'", "'weakness_tag'"]) assert.match(migration, new RegExp(key));
  assert.match(migration, /'source', 'assignment_item'/);
  // The evidence-focus statement becomes the selectable diagnostic target, kept as a sentence.
  assert.match(migration, /'weakness_tag', nullif\(trim\(f\.name\), ''\)/);
  assert.match(migration, /e\.value->>'weakness_tag' ~ '\\s' then e\.value->>'weakness_tag'/);
  // Read-only.
  assert.doesNotMatch(migration, /insert into|update public\.|delete from/i);
});

test('the page renders examples as original → correction with the issue line', () => {
  assert.match(page, /<del>\{example\.original/);
  assert.match(page, /<ins>\{example\.better_version/);
  assert.match(page, /\{example\.issue \? <small>\{example\.issue\}<\/small> : null\}/);
});
