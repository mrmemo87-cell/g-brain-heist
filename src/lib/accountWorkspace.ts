import type { Profile } from '../../types';
import type { SchoolCapabilities } from '../../services/schoolAdminService';
export type AccountWorkspace = 'school_head' | 'school_admin' | 'teacher' | 'parent';
/** Preferences can select only freshly authorized workspaces. */
export const resolveAccountWorkspace = (
  profileRole: Profile['role'], capabilities: SchoolCapabilities | null, hasParentWorkspace: boolean,
  requested?: string | null, preferred?: string | null,
): AccountWorkspace | 'workspace_chooser' => {
  const available: AccountWorkspace[] = [];
  if (capabilities?.is_owner) available.push('school_head');
  if (capabilities?.can_administer) available.push('school_admin');
  if ((profileRole === 'teacher' && !capabilities?.can_administer)
    || Boolean(capabilities?.can_teach && capabilities.has_active_teacher_allocation)) available.push('teacher');
  if (hasParentWorkspace) available.push('parent');
  if (requested && available.includes(requested as AccountWorkspace)) return requested as AccountWorkspace;
  if (preferred && available.includes(preferred as AccountWorkspace)) return preferred as AccountWorkspace;
  if (available.length > 1) return 'workspace_chooser';
  return available[0] ?? (profileRole === 'school_admin' ? 'school_admin' : 'teacher');
};
