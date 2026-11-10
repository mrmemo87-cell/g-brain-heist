import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261110120000_writing_server_drafts.sql', 'utf8');
const hub = readFileSync('src/pages/writing/WritingHub.tsx', 'utf8');

test('drafts table is closed to direct access and students reach only their own row', () => {
  assert.match(migration, /alter table public\.bh_writing_drafts enable row level security/);
  assert.match(migration, /revoke all on table public\.bh_writing_drafts from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy/i);
  for (const fn of ['rpc_bh_writing_save_draft', 'rpc_bh_writing_load_draft']) {
    const start = migration.indexOf(`function public.${fn}(`);
    const body = migration.slice(start, migration.indexOf('$$;', start));
    assert.match(body, /security definer/);
    assert.match(body, /auth\.uid\(\)/);
    assert.doesNotMatch(body, /p_student_id/);
  }
});

test('teachers read class drafts only through the English roster boundary', () => {
  const start = migration.indexOf('function public.rpc_bh_writing_class_drafts(');
  const body = migration.slice(start, migration.indexOf('$$;', start));
  assert.match(body, /bh_writing_authorized_english_roster\(\)/);
  assert.match(body, /Forbidden: this class is not in your English roster/);
});

test('the task picker returns to a saved draft and keeps school-written tasks out of the rotation', () => {
  const start = migration.indexOf('function public.rpc_bh_writing_student_prompt(');
  const body = migration.slice(start, migration.indexOf('$$;', start));
  assert.match(body, /left join public\.bh_writing_drafts saved/);
  assert.match(body, /not \(pb\.payload \? 'owner_school_id'\)/);
  assert.match(body, /Requested grade does not match the student record/);
  assert.ok(body.indexOf('bh_writing_open_task_assignment') < body.indexOf('bh_writing_drafts saved'));
});

test('the writing box turns off spelling help and refuses pasted or dragged text', () => {
  const start = hub.indexOf('ref={responseFieldRef}');
  const editor = hub.slice(start, hub.indexOf('aria-describedby="writing-editor-help"', start));
  for (const attribute of ['spellCheck={false}', 'autoCorrect="off"', 'autoCapitalize="off"', 'autoComplete="off"', 'data-gramm="false"', 'data-enable-grammarly="false"']) {
    assert.ok(editor.includes(attribute), `${attribute} is set on the editor`);
  }
  assert.match(editor, /onPaste=/);
  assert.match(editor, /onDrop=/);
  assert.match(editor, /const shouldBlock = true/);
});

test('drafts are saved to and restored from the account', () => {
  assert.match(hub, /saveWritingDraftToServer\(/);
  assert.match(hub, /loadWritingDraftFromServer\(promptId\)/);
  assert.match(hub, /clearServerDraft\(promptId\)/);
});
