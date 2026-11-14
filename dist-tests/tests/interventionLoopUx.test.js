import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pickQuickCheckQuestions, planStage } from '../services/studentInterventionService.js';
const page = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
const followUps = readFileSync('components/student-progress/TeacherWeeklyFollowUpsPage.tsx', 'utf8');
const service = readFileSync('services/studentInterventionService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261103010000_teacher_support_plans_overview.sql', 'utf8');
const plan = (status, done, needed = 3) => ({
    status, target_min_followup_observations: needed, follow_up_qualifying_observations: done,
});
test('plan stage tells the teacher the one next step', () => {
    assert.equal(planStage(plan('planned', 0)), 'start');
    assert.equal(planStage(plan('active', 0)), 'check');
    assert.equal(planStage(plan('active', 1)), 'waiting');
    assert.equal(planStage(plan('active', 3)), 'results');
    assert.equal(planStage(plan('active', 5)), 'results');
    assert.equal(planStage(plan('completed', 5)), 'done');
    assert.equal(planStage(plan('cancelled', 0)), 'done');
});
test('quick checks never reuse practised questions', () => {
    assert.deepEqual(pickQuickCheckQuestions(['a', 'b', 'c', 'd', 'e'], ['a', 'c']), ['b', 'd', 'e']);
    assert.deepEqual(pickQuickCheckQuestions(['a', 'a', 'b'], [], 3), ['a', 'b']);
    assert.deepEqual(pickQuickCheckQuestions(['a', 'b'], ['a', 'b']), []);
    assert.equal(pickQuickCheckQuestions(['a', 'b', 'c', 'd', 'e'], [], 3).length, 3);
});
test('plan actions use an in-page window, not browser prompts', () => {
    assert.doesNotMatch(page, /\bprompt\(/);
    assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="plan-modal-title"/);
    assert.match(page, /Approve plan & start/);
    assert.match(page, /See the result/);
    assert.match(page, /Set a quick check/);
    // Approval is still an explicit, recorded teacher decision before the plan starts.
    assert.match(page, /if \(planModal\.plan\.approval_status === 'pending'\) \{\s*await reviewLearningInterventionPlan/);
    // Changing the measured result still needs a longer explanation.
    assert.match(page, /noteLength >= \(changed \? 20 : 10\)/);
});
test('quick check is a normal assessed quiz for one student, not intervention practice', () => {
    assert.match(page, /GameService\.create_assignment\(\{/);
    assert.match(page, /assignment_mode: 'custom'/);
    assert.match(page, /student_ids: \[data\.student\.id\]/);
    assert.match(page, /assignment_category: 'quiz'/);
    assert.match(page, /tryConsumePilotQuota\('assignments_created'\)/);
    const quickCheck = page.slice(page.indexOf("planModal.mode === 'check') {\n        if (!data)"));
    assert.doesNotMatch(quickCheck.slice(0, 1500), /createInterventionPracticeAssignment|registerInterventionPractice/);
});
test('plans show progress visually and celebrate wins', () => {
    assert.match(page, /const PlanStepper/);
    assert.match(page, /const BeforeAfter/);
    assert.match(page, /const ProgressRing/);
    assert.match(page, /className="intervention-wins"/);
    assert.doesNotMatch(page, /className="intervention-cycle"/);
});
test('page opens on the teacher class and hides the grouping switch', () => {
    assert.match(page, /bh\.intervention\.lastClass/);
    assert.match(page, /classes\.size === 1/);
    assert.doesNotMatch(page, /Group by skill/);
    assert.match(page, /<details className="intervention-panel intervention-panel--watch intervention-watch-collapsed">/);
});
test('Follow-ups opens with a Today card built from the teacher’s own plans', () => {
    assert.match(followUps, /getSupportPlansOverview\(\)\.catch/);
    assert.match(followUps, /id="tfu-today-title">Today</);
    assert.match(followUps, /You’re all caught up/);
    assert.match(service, /rpc\('rpc_teacher_support_plans_overview'\)/);
});
test('support plans overview is read-only, scoped and locked down', () => {
    assert.match(migration, /create or replace function public\.rpc_teacher_support_plans_overview\(\)/);
    assert.match(migration, /\bstable\b/);
    assert.match(migration, /security definer\s+set search_path = ''/);
    assert.match(migration, /i\.created_by = auth\.uid\(\)/);
    assert.match(migration, /public\.student_learning_can_manage_intervention\(i\.student_id, i\.subject\)/);
    assert.match(migration, /revoke all on function public\.rpc_teacher_support_plans_overview\(\) from public, anon/);
    assert.doesNotMatch(migration, /insert into|update public\.|delete from/i);
});
