import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOnboarding } from '../src/features/onboarding/onboardingResolver.js';
const flags = {
    ftue_enabled: true,
    progressive_reveal_enabled: true,
    byte_ftue_enabled: true,
    teacher_ftue_enabled: true,
    admin_ftue_enabled: true,
};
const resolve = (input) => resolveOnboarding({
    profile: null,
    onboardingState: null,
    flags,
    ...input,
});
test('resolver is disabled and complete when ftue flag is off', () => {
    const resolution = resolve({ flags: { ...flags, ftue_enabled: false } });
    assert.equal(resolution.eligible, false);
    assert.equal(resolution.isComplete, true);
    assert.equal(resolution.featureRevealLevel, 'disabled');
    assert.deepEqual(resolution.gates, []);
});
test('school student with missing placement routes to placement and gates advanced features', () => {
    const resolution = resolve({
        profile: {
            id: 'u1',
            username: 'student',
            role: 'student',
            school_id: 'school-1',
            grade: null,
            batch: null,
            needs_setup: true,
        },
    });
    assert.equal(resolution.segment, 'school_student');
    assert.equal(resolution.context, 'school');
    assert.equal(resolution.nextStep, 'placement');
    assert.equal(resolution.featureRevealLevel, 'ftue_active');
    assert.ok(resolution.gates.includes('pvp'));
    assert.ok(resolution.gates.includes('upgrade_prompts'));
});
test('solo learner enters the short introduction without a goal questionnaire', () => {
    const resolution = resolve({
        profile: {
            id: 'u2',
            username: 'solo',
            role: 'student',
            school_id: null,
            needs_setup: true,
        },
    });
    assert.equal(resolution.segment, 'solo_learner');
    assert.equal(resolution.context, 'solo');
    assert.equal(resolution.nextStep, 'intent');
    assert.deepEqual(resolution.requiredData, []);
});
test('teacher ftue respects teacher feature flag', () => {
    const disabled = resolve({
        flags: { ...flags, teacher_ftue_enabled: false },
        profile: { id: 't1', username: 'teacher', role: 'teacher', school_id: null, needs_setup: true },
    });
    assert.equal(disabled.eligible, false);
    assert.equal(disabled.reason, 'teacher_ftue_disabled');
    const enabled = resolve({
        profile: { id: 't1', username: 'teacher', role: 'teacher', school_id: null, needs_setup: true },
    });
    assert.equal(enabled.segment, 'teacher');
    assert.equal(enabled.context, 'teacher_trial');
    assert.equal(enabled.nextStep, 'teacher_context');
});
test('legacy settled learners that already completed the tutorial are treated as complete', () => {
    const resolution = resolve({
        profile: {
            id: 'existing',
            username: 'existing-user',
            role: 'student',
            school_id: null,
            needs_setup: false,
            tutorial_completed: true,
        },
    });
    assert.equal(resolution.isComplete, true);
    assert.equal(resolution.nextStep, 'complete');
    assert.equal(resolution.featureRevealLevel, 'normal_dashboard');
});
test('eligible learners with incomplete legacy tutorial enter Phase 1A FTUE', () => {
    const resolution = resolve({
        profile: {
            id: 'new-learner',
            username: 'new-learner',
            role: 'student',
            school_id: null,
            needs_setup: false,
            tutorial_completed: false,
        },
    });
    assert.equal(resolution.eligible, true);
    assert.equal(resolution.isComplete, false);
    assert.equal(resolution.segment, 'solo_learner');
    assert.equal(resolution.nextStep, 'intent');
    assert.equal(resolution.featureRevealLevel, 'ftue_active');
});
test('teacher legacy completion remains rollback-safe', () => {
    const resolution = resolve({
        profile: {
            id: 'teacher-existing',
            username: 'teacher-existing',
            role: 'teacher',
            school_id: null,
            needs_setup: false,
            tutorial_completed: false,
        },
    });
    assert.equal(resolution.isComplete, true);
    assert.equal(resolution.segment, 'teacher');
    assert.equal(resolution.nextStep, 'complete');
});
test('student setup seed enters active learner FTUE', () => {
    const resolution = resolve({
        profile: {
            id: 'student-seeded',
            username: 'student-seeded',
            role: 'student',
            school_id: null,
            needs_setup: false,
            tutorial_completed: false,
        },
        onboardingState: {
            user_id: 'student-seeded',
            segment: 'solo_learner',
            context_type: 'solo',
            context_id: null,
            current_step: 'intent',
            completed_steps: [],
            core_completed_at: null,
            first_value_started_at: null,
            first_value_completed_at: null,
            metadata: { setup_path: 'individual' },
        },
    });
    assert.equal(resolution.eligible, true);
    assert.equal(resolution.isComplete, false);
    assert.equal(resolution.segment, 'solo_learner');
    assert.equal(resolution.nextStep, 'intent');
});
test('teacher setup bypasses learner FTUE while teacher Phase 1A flag is disabled', () => {
    const resolution = resolve({
        flags: { ...flags, teacher_ftue_enabled: false },
        profile: {
            id: 'teacher-new',
            username: 'teacher-new',
            role: 'teacher',
            school_id: null,
            needs_setup: false,
            tutorial_completed: false,
        },
    });
    assert.equal(resolution.eligible, false);
    assert.equal(resolution.segment, 'none');
    assert.equal(resolution.isComplete, true);
    assert.equal(resolution.reason, 'complete');
});
