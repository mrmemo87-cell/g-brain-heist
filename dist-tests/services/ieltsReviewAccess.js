export const normalizeIeltsRole = (role) => (role ?? '').trim().toLowerCase();
export const canAccessIeltsReviewQueue = (profile) => {
    if (!profile)
        return false;
    const role = normalizeIeltsRole(profile.role);
    return Boolean(profile.is_admin)
        || Boolean(profile.can_administer_school)
        || role === 'admin'
        || role === 'superadmin';
};
