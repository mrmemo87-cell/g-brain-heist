/** Preferences can select only freshly authorized workspaces. */
export const resolveAccountWorkspace = (profileRole, capabilities, hasParentWorkspace, requested, preferred) => {
    const available = [];
    if (capabilities?.is_owner)
        available.push('school_head');
    if (capabilities?.can_administer)
        available.push('school_admin');
    if ((profileRole === 'teacher' && !capabilities?.can_administer)
        || Boolean(capabilities?.can_teach && capabilities.has_active_teacher_allocation))
        available.push('teacher');
    if (hasParentWorkspace)
        available.push('parent');
    if (requested && available.includes(requested))
        return requested;
    if (preferred && available.includes(preferred))
        return preferred;
    if (available.length > 1)
        return 'workspace_chooser';
    return available[0] ?? (profileRole === 'school_admin' ? 'school_admin' : 'teacher');
};
