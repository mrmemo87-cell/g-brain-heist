import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20261014100000_guard_assignment_edits_with_learning_evidence.sql', import.meta.url),
  'utf8'
);

test('preserves teacher ownership and assignment update authorization', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /v_teacher_user_id <> v_actor/);
  assert.match(sql, /private\.teacher_assignment_authorized_students/);
  assert.match(sql, /SECURITY DEFINER/i);
});

test('question reordering does not reset a completed assignment', () => {
  assert.match(sql, /array_agg\(question_id order by question_id\)/i);
  assert.match(sql, /if not v_content_changed and v_old_questions is distinct from p_question_ids then/i);
  assert.match(sql, /set order_index = ordering\.position::integer/i);
});

test('guards both immutable evidence ledgers and attempted answers before deletions', () => {
  const guards = sql.indexOf('Governed Academic Profile ledgers are append-only');
  const firstAnswerDelete = sql.indexOf('delete from public.student_assignment_answers');
  assert.ok(guards > 0 && firstAnswerDelete > guards);
  for (const table of [
    'public.student_assignment_answers',
    'public.student_assignment_results',
    'public.student_learning_item_evidence',
    'public.student_learning_registry_item_evidence'
  ]) {
    assert.match(sql.slice(guards, firstAnswerDelete), new RegExp(table.replaceAll('.', '\\.'), 'i'));
  }
  assert.match(sql, /Cannot remove students with submitted work/);
  assert.match(sql, /Cannot change questions after students have submitted work/);
});

test('never drops foreign keys or weakens append-only triggers', () => {
  assert.doesNotMatch(sql, /drop constraint|disable trigger|drop trigger|on delete cascade/i);
  assert.match(sql, /insert into public\.assignment_change_audit/);
});
