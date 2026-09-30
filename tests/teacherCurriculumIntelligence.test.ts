import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const page = readFileSync('components/teacher/TeacherCurriculumIntelligencePage.tsx', 'utf8');
const service = readFileSync('services/teacherCurriculumIntelligenceService.ts', 'utf8');

test('teacher portal exposes Curriculum Intelligence as a governed reporting workspace', () => {
  assert.match(portal, /curriculum-intelligence/);
  assert.match(portal, /Curriculum Intelligence/);
  assert.match(portal, /TeacherCurriculumIntelligencePage/);
  assert.match(portal, /'curriculum-intelligence': FEATURE_KEYS\.REPORTS/);
});

test('curriculum intelligence is teaching-group scoped and defaults to Economics when available', () => {
  assert.match(service, /fetchTeacherTeachingGroups/);
  assert.match(service, /fetchTeacherTeachingGroupRoster/);
  assert.match(page, /\/economics\/i\.test\(group\.subjectLabel\)/);
  assert.match(page, /Teaching group/);
});

test('curriculum intelligence consumes the canonical registry and external framework metadata', () => {
  assert.match(service, /get_teacher_academic_skill_registry/);
  assert.match(page, /frameworkAlignments/);
  assert.match(page, /Programme alignment/);
  assert.match(page, /Strand → skill → subskill/);
  assert.match(page, /Evidence Focus catalogue/);
});

test('class intelligence treats confidence as evidence readiness rather than attainment', () => {
  assert.match(service, /assessmentState === 'assessed'/);
  assert.match(service, /assessmentState === 'low_data'/);
  assert.match(service, /assessmentState === 'contradictory'/);
  assert.match(page, /These are evidence-quality signals, not attainment scores/);
  assert.match(page, /does not yet have enough governed evidence; it does not mean a student is weak/);
  assert.doesNotMatch(service, /mastery|weakness/i);
});

test('student evidence loads with bounded concurrency and tolerates unavailable profiles', () => {
  assert.match(service, /concurrency = 6/);
  assert.match(service, /profilesUnavailable/);
  assert.match(page, /did not treat those missing records as low performance/);
});

test('curriculum intelligence is read-only and does not mutate academic evidence', () => {
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
