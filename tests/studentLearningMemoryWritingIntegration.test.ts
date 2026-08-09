import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const phase3 = readFileSync('supabase/migrations/20260809173000_writing_learning_evidence_quality.sql', 'utf8');

test('writing weakness tags collapse into stable parent-facing academic skills', () => {
  assert.match(phase3, /run_on' then 'Sentence control'/i);
  assert.match(phase3, /partial_content_coverage' then 'Content coverage'/i);
  assert.match(phase3, /poor_sequencing' then 'Organisation'/i);
  assert.match(phase3, /weak_audience_awareness' then 'Audience & register'/i);
  assert.match(phase3, /sum\(tag_count\)::integer occurrence_count/i);
  assert.match(phase3, /from raw_tags group by 1,2/i);
});

test('writing evidence is quality-gated by actual work completed', () => {
  assert.match(phase3, /actual_word_count/i);
  assert.match(phase3, /target_word_count/i);
  assert.match(phase3, /then 'provisional'/i);
  assert.match(phase3, /then 'standard'/i);
  assert.match(phase3, /else 'strong'/i);
  assert.match(phase3, /v_contributes := v_quality <> 'provisional'/i);
});

test('rubric dimensions produce both weakness and strength evidence', () => {
  assert.match(phase3, /jsonb_each\(v_assessment->'subscores'\)/i);
  assert.match(phase3, /v_subscore_value <= 2 then 'focus'/i);
  assert.match(phase3, /v_subscore_value >= 4 then 'strength'/i);
  assert.match(phase3, /'Writing rubric'/i);
  assert.match(phase3, /'rubric_score',v_subscore_value/i);
});

test('writing recovery needs positive rubric proof rather than tag absence alone', () => {
  assert.match(phase3, /v_quality='strong'/i);
  assert.match(phase3, /v_dimension_score < 4 then continue/i);
  assert.match(phase3, /'writing_signal','recovery'/i);
  assert.match(phase3, /Related weakness absent and rubric dimension scored 4 or 5/i);
});

test('logical attempts are synchronized and historical duplicates are canonicalized', () => {
  assert.match(phase3, /logical_attempt_key/i);
  assert.match(phase3, /delete from public\.student_learning_observations o[\s\S]*logical_attempt_key/i);
  assert.match(phase3, /row_number\(\) over/i);
  assert.match(phase3, /partition by w\.payload->>'student_id'/i);
  assert.match(phase3, /where rn=1/i);
});

test('privileged writing ingestion is not callable by normal clients', () => {
  assert.match(phase3, /security definer/i);
  assert.match(phase3, /set search_path = ''/i);
  assert.match(phase3, /revoke all on function public\.student_learning_ingest_writing_attempt\(uuid,jsonb,timestamptz\) from public,anon,authenticated/i);
  assert.match(phase3, /grant execute on function public\.student_learning_ingest_writing_attempt\(uuid,jsonb,timestamptz\) to service_role/i);
});
