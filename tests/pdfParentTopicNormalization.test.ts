import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20260920203500_normalize_pdf_parent_topics.sql',
  'utf8',
);

test('PDF batch submission collapses near-unique micro-topics to a parent topic', () => {
  assert.match(migration, /v_distinct_topic_count >= 6/);
  assert.match(migration, /ceil\(v_question_count \* 0\.60\)/);
  assert.match(migration, /extraction_payload ->> 'document_title'/);
  assert.match(migration, /jsonb_set\(item, '\{topic\}'/);
});

test('teacher-selected or already-clustered topic groupings are preserved', () => {
  assert.match(migration, /v_preferred_topic is not null/);
  assert.match(migration, /v_question_count >= 8/);
  assert.match(migration, /v_parent_topic is not null/);
});

test('short-answer grading metadata still uses the normalized submitted payload', () => {
  assert.match(migration, /rpc_teacher_submit_question_batch_v2\(p_extraction_id, v_effective_questions\)/);
  assert.match(migration, /jsonb_array_elements\(v_effective_questions\)/);
  assert.match(migration, /accepted_answers = case/);
  assert.match(migration, /semantic_review/);
});
