import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const guard = readFileSync('components/SchoolProgrammeRouteGuard.tsx', 'utf8');
const requestService = readFileSync('services/programmeAccessRequestService.ts', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260817120000_student_programme_access_requests.sql', 'utf8');
const seatManager = readFileSync('components/school-admin/ProgrammeSeatManager.tsx', 'utf8');

test('locked Learn programmes use one school-admin message and a real request action', () => {
  const expected = "You're not selected for this program. Ask your school admin if you need it.";
  assert.match(app, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(guard, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(app, /Send a request to the school admin/);
  assert.match(requestService, /student_request_programme_access/);
  assert.match(migration, /student_request_programme_access/);
  assert.match(migration, /A request never grants programme access or capacity/);
  assert.match(migration, /student_user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.enqueue_transactional_email/);
  assert.match(seatManager, /Student programme requests/);
});

test('Tasks lists every pending teacher assignment with collapsible details and an exact route action', () => {
  assert.match(gameService, /\(\) => get_student_pending_assignments\(\)/);
  assert.match(app, /setPendingAssignments\(assignmentData\)/);
  assert.match(app, /pendingAssignments\.map\(\(assignment\)/);
  assert.match(app, /<details key=\{assignment\.assignment_id\}/);
  assert.match(app, /Teacher instructions:/);
  assert.match(app, /Go to this assignment/);
  assert.match(app, /setActiveAssignment\(assignment\)[\s\S]*handleViewChange\('quest'\)/);
});

test('student-facing class labels do not expose the legacy batch term', () => {
  const surfaces = [
    readFileSync('components/PlayerProfileCard.tsx', 'utf8'),
    readFileSync('components/ClickableUsername.tsx', 'utf8'),
    readFileSync('components/PvPView.tsx', 'utf8'),
    readFileSync('components/LeaderboardView.tsx', 'utf8'),
    readFileSync('components/SettingsModal.tsx', 'utf8'),
    readFileSync('components/onboarding/SetupWizard.tsx', 'utf8'),
  ].join('\n');
  assert.doesNotMatch(surfaces, />\s*Batch(?:es)?\b|`Batch\s|['"]No Batch['"]|Class \/ Batch/i);
});
