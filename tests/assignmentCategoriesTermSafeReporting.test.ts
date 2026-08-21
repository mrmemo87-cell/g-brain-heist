import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const types = readFileSync('types.ts', 'utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');
const studentApp = readFileSync('App.tsx', 'utf8');
const report = readFileSync('components/CollectiveAssignmentReport.tsx', 'utf8');
const reportCss = readFileSync('components/CollectiveAssignmentReport.css', 'utf8');
const emailDispatcher = readFileSync('supabase/functions/school_email_dispatcher/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260821190000_assignment_categories_term_safe_reporting.sql', 'utf8');
const emailCleanup = readFileSync('supabase/migrations/20260821190500_avoid_category_only_assignment_email_duplicates.sql', 'utf8');

test('assignment categories are controlled metadata with the requested four labels', () => {
  assert.match(types, /AssignmentCategory = 'classwork' \| 'homework' \| 'quiz' \| 'term_exam'/);
  assert.match(wizard, /Classwork/);
  assert.match(wizard, /Homework/);
  assert.match(wizard, /Quiz/);
  assert.match(wizard, /Term Exam/);
  assert.match(wizard, /#FEF9C3|ASSIGNMENT_CATEGORY_META/);
  assert.match(wizard, /reporting metadata only; it does not change marks, XP, rewards, or completion rules/);
});

test('teacher create and edit flows persist category and local timezone without replacing assignment mode', () => {
  assert.match(portal, /assignment_category: assignmentCategory/);
  assert.match(portal, /client_timezone: Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(gameService, /p_assignment_category: payload\.assignment_category/);
  assert.match(gameService, /p_client_timezone: payload\.client_timezone/);
  assert.match(gameService, /p_assignment_mode: mode/);
  assert.match(portal, /setAssignmentCategory\(assignment\.assignment_category \?\? null\)/);
});

test('scheduled publication is guarded by future local time and current school term/year in UI and database', () => {
  assert.match(wizard, /type="datetime-local" min=\{localDateTimeValue\(\)\}/);
  assert.match(wizard, /max=\{scheduleWindow \? `\$\{scheduleWindow\.term\.endsOn\}T23:59`/);
  assert.match(wizard, /current academic year and term/);
  assert.match(migration, /p_assigned_at <= v_now/);
  assert.match(migration, /v_publish_date not between v_year\.starts_on and v_year\.ends_on/);
  assert.match(migration, /v_publish_date not between v_term\.starts_on and v_term\.ends_on/);
  assert.match(migration, /at time zone v_timezone/);
});

test('category edits stay outside the existing content-reset path', () => {
  assert.match(migration, /select public\.rpc_update_teacher_assignment\(/);
  assert.match(migration, /update public\.assignments\s+set assignment_category = v_category/);
  assert.doesNotMatch(migration, /delete from public\.student_assignment_results/i);
  assert.doesNotMatch(migration, /delete from public\.student_learning_observations/i);
  assert.doesNotMatch(migration, /update public\.student_assignments set status='pending'/i);
});

test('student assignment cards expose a readable category badge', () => {
  assert.match(gameService, /rpc_my_assignment_category_context/);
  assert.match(studentApp, /getAssignmentCategoryMeta\(assignment\.assignment_category\)/);
  assert.match(studentApp, /assignmentCategoryBadgeStyle\(assignment\.assignment_category\)/);
  assert.match(studentApp, /categoryMeta\.label/);
});

test('collective report requires one class and defaults to school academic calendar scope', () => {
  assert.match(report, /fetchSchoolAcademicSetup/);
  assert.match(report, /status === 'current'/);
  assert.match(report, /selectedAcademicYearId/);
  assert.match(report, /selectedTermId/);
  assert.match(report, /Custom dates/);
  assert.match(report, /min=\{selectedAcademicYear\?\.startsOn\}/);
  assert.match(report, /max=\{selectedAcademicYear\?\.endsOn\}/);
  assert.doesNotMatch(report, /<option value="all">All Classes<\/option>/);
  assert.match(report, /if \(!batchFilter\) return false/);
});

test('collective report supports category filtering and custom assignments remain class scoped', () => {
  assert.match(report, /categoryFilter !== 'all'/);
  assert.match(report, /assignment\.assignment_category !== categoryFilter/);
  assert.match(report, /assignment\.student_ids \|\| \[\]/);
  assert.match(report, /student\.batch === batchFilter/);
  assert.match(report, /assignmentCategoryBadgeStyle\(a\.assignment_category\)/);
});

test('large collective report tables scroll assignments while identity and summary columns stay frozen', () => {
  assert.match(reportCss, /overflow-x:auto/);
  assert.match(reportCss, /width:max-content/);
  assert.match(reportCss, /collective-results-assignment-cell\{min-width:140px/);
  assert.match(reportCss, /collective-results-student-cell\{position:sticky;left:0/);
  assert.match(reportCss, /collective-results-class-cell\{position:sticky/);
  assert.match(reportCss, /collective-results-average-cell\{position:sticky;right:120px/);
  assert.match(reportCss, /collective-results-status-cell\{position:sticky;right:0/);
});

test('all assignment emails display assignment category without replacing reminder jobs', () => {
  assert.match(emailDispatcher, /assignmentCategoryLabel/);
  assert.match(emailDispatcher, /assignment_category/);
  assert.match(emailDispatcher, /label: "Type"/);
  assert.match(migration, /trg_email_enrich_assignment_payload/);
  assert.doesNotMatch(migration, /create or replace function public\.rpc_enqueue_due_email_reminders/);
  assert.match(emailCleanup, /drop trigger if exists professional_email_assignment_category_changed/);
});

test('legacy assignments remain valid and uncategorized rather than being guessed', () => {
  assert.match(migration, /assignment_category is null/);
  assert.doesNotMatch(migration, /update public\.assignments set assignment_category = 'classwork'/i);
  assert.match(studentApp, /categoryMeta\.label/);
});
