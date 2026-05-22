import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('TeacherPortal subject restrictions are normalized and still enforced', () => {
  const source = read('components/TeacherPortal.tsx');

  assert.match(source, /const normalizeSubjectKey = \(value: string \| null \| undefined\) => \(value \?\? ''\)\.trim\(\)\.toLowerCase\(\);/, 'subject normalization helper must trim and lowercase');
  assert.match(source, /const subjectAllowed = \(allowed: string\[], candidate: string \| null \| undefined\) => \{[\s\S]*normalized\.has\(normalizeSubjectKey\(candidate\)\)/, 'subject allowed helper must compare normalized values');
  assert.match(source, /if \(!subjectAllowed\(assignedSubjects, subject\)\) \{[\s\S]*You can only create assignments for subjects assigned to you by the school admin\./, 'question-set flow must still block unauthorized subjects');
  assert.match(source, /if \(!subjectAllowed\(assignedSubjects, assignmentSubject\)\) \{[\s\S]*You can only create assignments for subjects assigned to you by the school admin\./, 'assignment creation flow must still block unauthorized subjects');
});
