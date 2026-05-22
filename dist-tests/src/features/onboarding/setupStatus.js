export const decideNeedsSetup = ({ status, profileNeedsSetup }) => {
    if (!status?.authenticated) {
        return { needsSetup: false, reason: 'not_authenticated' };
    }
    if (!status.needs_setup) {
        return { needsSetup: false, reason: 'setup_status_false' };
    }
    if (status.reason === 'no_profile') {
        return { needsSetup: true, reason: 'missing_profile' };
    }
    if (profileNeedsSetup !== undefined && profileNeedsSetup !== null) {
        return profileNeedsSetup
            ? { needsSetup: true, reason: 'profile_needs_setup_true' }
            : { needsSetup: false, reason: 'profile_needs_setup_false' };
    }
    return { needsSetup: true, reason: 'setup_status_true' };
};
