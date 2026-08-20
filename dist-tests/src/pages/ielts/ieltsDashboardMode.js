export const resolveIeltsDashboardMode = ({ profile, profileError, capabilityResolution, }) => {
    const role = String(profile?.role ?? '').trim().toLowerCase();
    const isPlatformAdmin = !profileError && (Boolean(profile?.is_admin)
        || role === 'admin'
        || role === 'superadmin');
    const canAdministerSchool = capabilityResolution.status === 'ready'
        && Boolean(capabilityResolution.capabilities?.can_administer);
    if ((profileError && !canAdministerSchool) || (capabilityResolution.status === 'error' && !isPlatformAdmin)) {
        return 'error';
    }
    return isPlatformAdmin || canAdministerSchool ? 'admin' : 'student';
};
