/**
 * Returns the exact Phase 1A learner onboarding seed that should be written when
 * SetupWizard completes. Non-learner roles intentionally return null so teacher
 * and admin routes cannot be accidentally forced into the learner FTUE.
 */
export const buildSetupCompletionOnboardingSeed = ({ role, path, schoolId = null, schoolName = null, }) => {
    if (role !== 'student')
        return null;
    const isSchoolPath = path === 'school';
    return {
        segment: isSchoolPath ? 'school_student' : 'solo_learner',
        context_type: isSchoolPath ? 'school' : 'solo',
        context_id: isSchoolPath ? schoolId : null,
        current_step: 'intent',
        completed_steps: [],
        core_completed_at: null,
        metadata: {
            setup_path: path,
            selected_role: role,
            school_name: isSchoolPath ? schoolName ?? undefined : undefined,
        },
    };
};
export const buildSetupProfileFallback = ({ userId, selectedRole, onboardingState, }) => {
    if (!userId || selectedRole !== 'student')
        return null;
    if (onboardingState?.segment !== 'solo_learner' && onboardingState?.segment !== 'school_student')
        return null;
    return {
        id: userId,
        role: 'student',
        school_id: onboardingState.segment === 'school_student' ? onboardingState.context_id : null,
        needs_setup: false,
        tutorial_completed: false,
    };
};
