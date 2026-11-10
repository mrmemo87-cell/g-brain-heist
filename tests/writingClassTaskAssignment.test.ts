import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261110100000_writing_class_task_assignments.sql', 'utf8');

test('class task tables are closed to direct access and reached only through definer RPCs', () => {
  for (const table of ['bh_writing_task_assignments', 'bh_writing_task_assignment_students']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.doesNotMatch(migration, /create policy/i);
});

test('teacher RPCs authorize through the existing English roster boundary', () => {
  for (const fn of ['rpc_bh_writing_class_task_options', 'rpc_bh_writing_assign_class_task', 'rpc_bh_writing_cancel_class_task']) {
    const start = migration.indexOf(`function public.${fn}(`);
    assert.ok(start > 0, `${fn} is defined`);
    const body = migration.slice(start, migration.indexOf('$$;', start));
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /bh_writing_authorized_english_roster\(\)/);
    assert.match(body, /Forbidden: this class is not in your English roster/);
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`));
  }
});

test('the student prompt keeps its grade checks and serves an open class task first', () => {
  const start = migration.indexOf('function public.rpc_bh_writing_student_prompt(');
  const body = migration.slice(start, migration.indexOf('$$;', start));
  assert.match(body, /Requested grade does not match the student record/);
  assert.ok(body.indexOf('bh_writing_open_task_assignment') < body.indexOf('history.last_seen_at asc nulls first'));
  assert.match(body, /'assignment', v_assignment_json/);
  assert.match(migration, /grant execute on function public\.rpc_bh_writing_student_prompt\(integer, text, text\) to authenticated/);
  // An assignment stops applying once the student has submitted that task after it opened.
  assert.match(migration, /t\.payload->>'prompt_id' = a\.prompt_id\s+and t\.created_at >= a\.opens_at/);
});

test('the hub shows the class task and the monitor offers the assignment panel', () => {
  const hub = readFileSync('src/pages/writing/WritingHub.tsx', 'utf8');
  const monitor = readFileSync('src/pages/writing/WritingMonitoringView.tsx', 'utf8');
  assert.match(hub, /data-testid="writing-hub-class-task"/);
  assert.match(hub, /Set by your teacher for/);
  assert.match(monitor, /<WritingClassTaskPanel/);
});
