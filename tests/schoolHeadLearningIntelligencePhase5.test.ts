import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260809175000_school_head_learning_intelligence.sql', 'utf8');
const service = readFileSync('services/schoolHeadLearningIntelligenceService.ts', 'utf8');
const page = readFileSync('components/school-head/SchoolHeadLearningIntelligence.tsx', 'utf8');
const entry = readFileSync('src/schoolHeadLearningIntelligenceEntry.tsx', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');

test('School Head learning intelligence is owner-scoped and server authoritative', () => {
  assert.match(migration, /public\.is_school_owner\(p_school_id\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.school_head_get_learning_intelligence\(uuid, integer\) from public, anon, authenticated/i);
  assert.match(migration, /student_learning_focus_states/i);
  assert.match(migration, /student_learning_observations/i);
  assert.match(migration, /student_assignment_results/i);
});

test('executive intelligence keeps current learning state separate from period attainment', () => {
  assert.match(migration, /period_assignments[\s\S]*completed_at >= v_start/i);
  assert.match(migration, /school_focus[\s\S]*student_learning_focus_states/i);
  assert.match(migration, /stale_persistent_areas/i);
  assert.match(migration, /last_observed_at < now\(\)-interval '60 days'|last_observed_at < now\(\) - interval '60 days'/i);
  assert.match(page, /Assignment averages use the selected period/i);
  assert.match(page, /full qualifying evidence history/i);
  assert.match(page, /does not mean the student has failed to improve/i);
});

test('School Head view surfaces subject class curriculum and student intervention intelligence', () => {
  for (const label of ['Subject intelligence', 'Class intelligence', 'Curriculum priorities', 'Student intervention queue', 'School strengths']) {
    assert.match(page, new RegExp(label, 'i'));
  }
  assert.match(page, /academic-profile\.html\?student=/i);
  assert.match(migration, /subjects_needing_support|students_needing_support/i);
  assert.match(migration, /priority_skills/i);
  assert.match(migration, /school_strengths/i);
});

test('School Head standalone entry verifies the canonical account persona', () => {
  assert.match(entry, /school_admin_get_my_capabilities/i);
  assert.match(entry, /account_type.*school_head/i);
  assert.match(entry, /reserved for the active School Head/i);
  assert.match(service, /school_head_get_learning_intelligence/i);
});

test('School Head learning intelligence is part of the production build', () => {
  assert.match(vite, /schoolHeadLearningIntelligence:\s*path\.resolve\(__dirname, 'school-head-learning-intelligence\.html'\)/i);
});
