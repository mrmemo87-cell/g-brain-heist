import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('components/school-admin/AcademicSetupPanel.tsx', 'utf8');

test('academic setup surfaces guarded current-year roster confirmation', () => {
  assert.match(panel, /Confirm current-year roster/);
  assert.match(panel, /fetchAcademicRosterReadiness/);
  assert.match(panel, /confirmAcademicRoster/);
  assert.match(panel, /Resolve roster blockers first/);
  assert.match(panel, /no active class placement/);
  assert.match(panel, /school student membership conflicts with account role/);
});

test('roster confirmation button stays disabled until readiness is clean', () => {
  assert.match(panel, /disabled=\{saving \|\| !rosterReadiness\.ready \|\| rosterConfirmed\}/);
  assert.match(panel, /rosterReadiness\.estimatedEnrolments === 0/);
  assert.match(panel, /rosterReadiness\.confirmedEnrolments === rosterReadiness\.activeStudentMembers/);
});
