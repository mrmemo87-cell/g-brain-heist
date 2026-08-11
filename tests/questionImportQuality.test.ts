import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const portal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');
const importer = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/teacherQuestionBulkImport.ts'), 'utf8');
const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260722045000_repair_spreadsheet_question_corruption.sql'),
  'utf8'
);

test('repairs both observed spreadsheet fraction date formats', () => {
  assert.match(migration, /20\[0-9\]\{2\}\[⁄\/\]/);
  assert.match(migration, /月\(\[0-9\]\{1,2\}\)日/);
  assert.match(migration, /question_data_repair_audit/);
  assert.match(migration, /E'\\\\1\/\\\\2'/);
});

test('repairs formula-evaluated comparison options from the live assignment', () => {
  assert.match(migration, /00baeda2-794a-4fe5-9849-069b70932f88/);
  assert.match(migration, /"-8 > -3", "-3 < -8", "8 < -3", "-8 < -3"/);
  assert.match(migration, /correct_answer = '-8 < -3'/);
});

test('database rejects future duplicate, mismatched, and date-coerced options', () => {
  assert.match(migration, /validate_question_import_quality/);
  assert.match(migration, /Multiple-choice options must be unique/);
  assert.match(migration, /correct answer must exactly match one of the options/i);
  assert.match(migration, /Format fraction cells as Text/);
});

test('CSV upload explains and blocks spreadsheet coercion before writing', () => {
  assert.match(importer, /spreadsheetDatePattern/);
  assert.match(importer, /looks like a fraction converted into a date/);
  assert.match(importer, /Duplicate TRUE\/FALSE values/);
  assert.match(importer, /format option cells as Text/i);
  assert.match(portal, /Nothing is saved until you review and confirm the preview/);
});
