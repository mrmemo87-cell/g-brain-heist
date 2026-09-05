import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const wizard = fs.readFileSync(path.resolve(process.cwd(), 'components/teacher/AssignmentWizard.tsx'), 'utf8');
const portal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');
test('assignment creation uses a six-step, single-decision wizard', () => {
    for (const label of ['Audience', 'Subject', 'Questions', 'Details', 'Due date', 'Review']) {
        assert.match(wizard, new RegExp(`short: '${label}'`));
    }
    assert.match(wizard, /aria-label="Assignment creation progress"/);
    assert.match(wizard, /aria-current=\{current \? 'step'/);
    assert.match(wizard, /Publish assignment/);
    assert.match(wizard, /I have reviewed this assignment/);
});
test('question bank filters and deduplicates slash variants in the UI', () => {
    assert.match(wizard, /replace\(\/\[⁄∕／\]\/g, '\/'\)/);
    assert.match(wizard, /const ids = new Set<string>\(\)/);
    assert.match(wizard, /const content = new Set<string>\(\)/);
    for (const label of ['Filter by topic', 'Filter by difficulty', 'Filter by question type', 'Filter by XP', 'Sort questions']) {
        assert.match(wizard, new RegExp(`aria-label="${label}"`));
    }
});
test('assignment topic options only come from questions eligible for the selected audience and pool', () => {
    assert.match(wizard, /const assignmentEligibleQuestions = useMemo/);
    assert.match(wizard, /return matchesAudienceGrades && matchesPool/);
    assert.match(wizard, /new Set\(assignmentEligibleQuestions\.map/);
    assert.match(wizard, /const matches = assignmentEligibleQuestions\.filter/);
    assert.match(wizard, /if \(topicFilter !== 'all' && !topics\.includes\(topicFilter\)\) setTopicFilter\('all'\)/);
});
test('wizard clearly discards drafts and protects accidental exits', () => {
    assert.match(wizard, /beforeunload/);
    assert.match(wizard, /selected audience, questions, title, and due date will be lost/);
    assert.match(wizard, /brainsConfirm/);
    assert.doesNotMatch(wizard, /localStorage\.setItem/);
    assert.doesNotMatch(wizard, /Draft restored/);
});
test('assignment title and final review are required before publish', () => {
    assert.match(wizard, /required aria-required="true"/);
    assert.match(wizard, /if \(!assignmentTitle\.trim\(\)\)/);
    assert.match(wizard, /disabled=\{assignmentSubmitting \|\| !reviewConfirmed\}/);
    assert.match(portal, /title: assignmentTitle\.trim\(\)/);
});
test('question-bank assignments resume at audience and keep their subject consistent', () => {
    assert.match(wizard, /initialStep = 1/);
    assert.match(wizard, /lockedSubject = null/);
    assert.match(wizard, /You already added \{lockedSubject\} questions from the Question Bank/);
    assert.match(wizard, /Unavailable — \{lockedSubject\} questions selected/);
    assert.match(portal, /initialStep=\{assignmentLockedSubject \? 2 : 1\}/);
    assert.match(portal, /setAssignmentLockedSubject\(subject\)/);
});
test('assignment due dates must be in the future in the UI and publish handler', () => {
    assert.match(wizard, /const isPastDueDate/);
    assert.match(wizard, /Students cannot receive an assignment that is already overdue/);
    assert.match(wizard, /min=\{localDateTimeValue\(\)\}/);
    assert.match(portal, /dueDate\.getTime\(\) <= Date\.now\(\)/);
});
test('existing assignment publish handler remains the only creation path', () => {
    assert.match(portal, /onSubmit=\{handleCreateAssignment\}/);
    assert.match(portal, /GameService\.create_assignment/);
    assert.doesNotMatch(wizard, /GameService\.create_assignment|supabase\.rpc|supabase\.from/);
});
