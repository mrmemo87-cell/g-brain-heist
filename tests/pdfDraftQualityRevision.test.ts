import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20260920214500_teacher_question_pdf_draft_quality_revisions.sql',
  'utf8',
);

test('PDF quality repairs preserve immutable extraction provenance', () => {
  assert.match(migration, /private\.teacher_question_pdf_draft_revisions/);
  assert.match(migration, /teacher_question_pdf_draft_revisions_are_append_only/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /references public\.teacher_question_pdf_extractions\(id\) on delete restrict/);
});

test('draft recovery uses latest quality overlay without changing source identity', () => {
  assert.match(migration, /coalesce\(r\.questions, e\.extraction_payload -> 'questions'/);
  assert.match(migration, /order by revision\.revision_number desc/);
  assert.match(migration, /jsonb_build_object\('quality_revision', r\.quality_revision\)/);
  assert.match(migration, /'extractionId', e\.id/);
  assert.match(migration, /'sourceObjectPath', e\.source_object_path/);
});

test('quality overlay remains teacher-scoped and unsubmitted-only', () => {
  assert.match(migration, /e\.teacher_user_id = v_actor/);
  assert.match(migration, /not exists \([\s\S]*public\.teacher_question_batches/);
  assert.match(migration, /revoke all on table private\.teacher_question_pdf_draft_revisions/);
});
