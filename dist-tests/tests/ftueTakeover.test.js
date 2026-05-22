import assert from 'node:assert/strict';
import test from 'node:test';
import { isActiveLearnerFtue, shouldSuppressLegacyTutorialForFtue, } from '../src/features/onboarding/ftueTakeover.js';
const flags = {
    ftue_enabled: true,
    progressive_reveal_enabled: true,
    byte_ftue_enabled: true,
    teacher_ftue_enabled: true,
    admin_ftue_enabled: true,
};
test('active learner FTUE predicate suppresses legacy tutorial for new learners', () => {
    assert.equal(shouldSuppressLegacyTutorialForFtue({
        flags,
        profile: {
            id: 'learner-1',
            username: 'learner-1',
            role: 'student',
            school_id: null,
            needs_setup: false,
            tutorial_completed: false,
        },
    }), true);
});
test('legacy tutorial remains available when global FTUE flag is disabled', () => {
    assert.equal(shouldSuppressLegacyTutorialForFtue({
        flags: { ...flags, ftue_enabled: false },
        profile: {
            id: 'learner-rollback',
            username: 'learner-rollback',
            role: 'student',
            school_id: null,
            needs_setup: false,
            tutorial_completed: false,
        },
    }), false);
});
test('legacy tutorial is not suppressed for non-learner FTUE segments', () => {
    assert.equal(shouldSuppressLegacyTutorialForFtue({
        flags,
        profile: {
            id: 'teacher-1',
            username: 'teacher-1',
            role: 'teacher',
            school_id: null,
            needs_setup: false,
            tutorial_completed: false,
        },
    }), false);
});
test('completed learner resolutions are not active learner FTUE', () => {
    assert.equal(isActiveLearnerFtue({
        eligible: true,
        isComplete: true,
        segment: 'solo_learner',
        context: 'solo',
        state: null,
        nextStep: 'complete',
        featureRevealLevel: 'normal_dashboard',
        requiredData: [],
        gates: [],
        primaryCta: 'Continue',
        fallbackRoute: '/',
        reason: 'complete',
    }), false);
});
