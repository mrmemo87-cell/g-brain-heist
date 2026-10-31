import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261031090000_teacher_class_learning_needs.sql', 'utf8');
const classView = readFileSync('components/student-progress/ClassLearningNeeds.tsx', 'utf8');
const interventions = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
const brief = readFileSync('components/student-progress/AcademicProfileBrief.tsx', 'utf8');
const profile = readFileSync('components/student-progress/StudentAcademicProfileV2.tsx', 'utf8');

test('class learning needs RPC is per-student authorised, read-only and registry-keyed', () => {
  assert.match(migration, /create or replace function public\.rpc_teacher_class_learning_needs\(p_student_ids uuid\[\], p_subject text\)/);
  assert.match(migration, /where public\.student_learning_can_manage_intervention\(s\.id, p_subject\)/);
  assert.match(migration, /'students_excluded'/);
  assert.match(migration, /f\.skill_key like 'registry:%'/);
  assert.match(migration, /f\.academic_year_id = r\.year_id/);
  assert.match(migration, /'has_evidence'/);
  assert.match(migration, /\bstable\b/);
  assert.doesNotMatch(migration, /insert into|update public\.|delete from/i);
  assert.match(migration, /revoke all on function public\.rpc_teacher_class_learning_needs\(uuid\[\], text\) from public, anon/);
});

test('class view groups needs by skill, sizes the teaching move by class share, and separates unassessed students', () => {
  assert.match(classView, /share >= 0\.5 \? 'whole-class' : share >= 0\.25 \? 'small-group' : 'individual'/);
  assert.match(classView, /const unassessed = data \? data\.students\.filter\(\(student\) => !student\.has_evidence\)/);
  assert.match(classView, /No assessed \{subject\} work yet/);
  assert.match(classView, /onSelectStudent\(student\.id\)/);
  // Interventions shows the class view when a class is chosen but no student yet.
  assert.match(interventions, /\{!studentId && className \? <>/);
  assert.match(interventions, /<ClassLearningNeeds classLabel=\{className\} studentIds=\{classRosterIds\} subject=\{classSubject\}/);
});

test('plan cards say what an active plan is waiting for', () => {
  assert.match(interventions, /const planNudge = \(plan: LearningIntervention\)/);
  assert.match(interventions, /Practice answers do not count/);
  assert.match(interventions, /Review date passed/);
  assert.match(interventions, /Waiting for your approval/);
  assert.match(interventions, /className=\{`plan-nudge is-\$\{nudge\.tone\}`\}/);
});

test('academic profile opens with a one-glance brief in plain language', () => {
  assert.match(profile, /<AcademicProfileBrief/);
  assert.doesNotMatch(profile, /ProfileStat\b/);
  assert.match(brief, /needs to act on/);
  assert.match(brief, /still being watched/);
  assert.match(brief, /aria-label=\{`Open Interventions for \$\{interventionsLink\.studentName\}`\}/);
  for (const title of ['title="Needs support now"', 'title="Being watched"', 'title="Going well"', 'title="Evidence by assignment"', 'title="Assignments"', 'title="How this is worked out"']) {
    assert.match(profile, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(profile, /Comparable skill evidence · assignment and writing sources remain distinct/);
});
