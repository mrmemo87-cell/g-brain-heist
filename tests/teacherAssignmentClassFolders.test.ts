import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');

test('assignment workspace groups existing assignments by class without changing assignment creation', () => {
  assert.match(portal, /const \[assignmentClassFilter, setAssignmentClassFilter\]/);
  assert.match(portal, /aria-label="Assignment folders by class"/);
  assert.match(portal, /assignmentClassFolders\.map/);
  assert.match(portal, /assignment\.assignment_mode === 'custom'/);
  assert.match(portal, /assignment\.batch/);
  assert.match(portal, /Individual assignments/);
  assert.match(portal, /Class folders/);
  assert.match(portal, /🏫 \$\{assignment\.batch \|\| 'Class'\}/);
});

test('class folder selection participates in display filtering only', () => {
  assert.match(portal, /Filtered assignments based on class folder, search, subject, and status filters/);
  assert.match(portal, /assignmentClassFilter === 'individual'/);
  assert.match(portal, /assignmentClassFilter !== 'all'/);
  assert.doesNotMatch(portal, /rpc_create_assignment[^\n]*assignmentClassFilter/);
});
