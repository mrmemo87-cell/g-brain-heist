import assert from 'node:assert/strict';
import test from 'node:test';
import { appendDashboardTourCompletedStep, getDashboardTourMetadata, getInitialDashboardTourStep, shouldShowDashboardTour, } from '../src/features/onboarding/dashboardTour.js';
const learnerState = (metadata = {}) => ({
    user_id: 'learner-1',
    segment: 'solo_learner',
    context_type: 'solo',
    context_id: null,
    current_step: 'complete',
    completed_steps: ['intent', 'school_confirm', 'goal', 'mission_brief', 'reward_reveal'],
    core_completed_at: '2026-05-12T00:00:00.000Z',
    first_value_started_at: null,
    first_value_completed_at: null,
    metadata,
});
test('dashboard tour renders only for eligible learners after Phase 1A completion', () => {
    assert.equal(shouldShowDashboardTour({
        ftueEnabled: true,
        profile: { id: 'learner-1', role: 'student' },
        state: learnerState(),
    }), true);
    assert.equal(shouldShowDashboardTour({
        ftueEnabled: false,
        profile: { id: 'learner-1', role: 'student' },
        state: learnerState(),
    }), false);
    assert.equal(shouldShowDashboardTour({
        ftueEnabled: true,
        profile: { id: 'learner-1', role: 'student' },
        state: { ...learnerState(), core_completed_at: null },
    }), false);
});
test('teacher/admin profiles do not see the dashboard tour', () => {
    assert.equal(shouldShowDashboardTour({
        ftueEnabled: true,
        profile: { id: 'teacher-1', role: 'teacher' },
        state: { ...learnerState(), segment: 'teacher', context_type: 'teacher_trial' },
    }), false);
    assert.equal(shouldShowDashboardTour({
        ftueEnabled: true,
        profile: { id: 'admin-1', role: 'school_admin' },
        state: { ...learnerState(), segment: 'school_admin', context_type: 'admin_school' },
    }), false);
});
test('completed and skipped dashboard tours stay hidden', () => {
    assert.equal(shouldShowDashboardTour({
        ftueEnabled: true,
        profile: { id: 'learner-1', role: 'student' },
        state: learnerState({ dashboard_tour: { status: 'completed' } }),
    }), false);
    assert.equal(shouldShowDashboardTour({
        ftueEnabled: true,
        profile: { id: 'learner-1', role: 'student' },
        state: learnerState({ dashboard_tour: { status: 'skipped' } }),
    }), false);
});
test('dashboard tour metadata resumes the saved step and records mission completion intent', () => {
    const metadata = getDashboardTourMetadata(learnerState({
        dashboard_tour: {
            status: 'active',
            current_step: 'first_mission',
            completed_steps: ['base_unlocked', 'profile_progress', 'xp_rewards'],
            started_at: '2026-05-12T00:00:00.000Z',
            first_mission_cta_clicked: true,
        },
    }));
    assert.equal(metadata.status, 'active');
    assert.equal(getInitialDashboardTourStep(metadata), 'first_mission');
    assert.equal(metadata.first_mission_cta_clicked, true);
    assert.deepEqual(appendDashboardTourCompletedStep(metadata.completed_steps, 'first_mission'), ['base_unlocked', 'profile_progress', 'xp_rewards', 'first_mission']);
});
