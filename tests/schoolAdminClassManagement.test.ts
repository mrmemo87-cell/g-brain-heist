import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(file, 'utf8');
const classes = read('components/school-admin/tabs/ClassesTab.tsx');
const service = read('services/schoolAdminService.ts');
const migration = read('supabase/migrations/20260812160000_guard_school_class_removal.sql');

test('a grade-level action opens a prefilled additional-class workflow', () => {
  assert.match(classes, /const suggestClassDetails/);
  assert.match(classes, /classCode: `\$\{base\}-\$\{section\}`/);
  assert.match(classes, /className: `Grade \$\{gradeLevel\} \$\{section\}`/);
  assert.match(classes, /setWizardStep\(2\)/);
  assert.match(classes, /Add another class to Grade/);
  assert.match(classes, /placeholder="For example, G9-B"/);
});

test('class removal is explicit, reversible, and refreshed from the school source of truth', () => {
  assert.match(classes, /Remove \$\{row\.class_code\}\?/);
  assert.match(classes, /confirmLabel: 'Remove class'/);
  assert.match(classes, /await loadAdminTools\(school\.id\)/);
  assert.match(service, /code\?: 'CLASS_IN_USE' \| 'LAST_ACTIVE_CLASS'/);
  assert.match(service, /action\?: 'archived' \| 'already_removed'/);
});

test('the database blocks unsafe removal and retains academic history', () => {
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /public\.can_administer_school\(p_school_id\)/);
  assert.match(migration, /from public\.class_students/);
  assert.match(migration, /from public\.class_teacher_assignments/);
  assert.match(migration, /'code', 'CLASS_IN_USE'/);
  assert.match(migration, /'code', 'LAST_ACTIVE_CLASS'/);
  assert.match(migration, /set is_active = false/);
  assert.match(migration, /school_governance_audit_log/);
  assert.match(migration, /revoke all on function public\.school_admin_archive_class/);
  assert.match(migration, /to authenticated/);
});
