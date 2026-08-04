import type { SchoolCapabilitiesResolution } from '../../../services/schoolAdminService';

export type IeltsDashboardMode = 'student' | 'admin';
export type IeltsDashboardModeResolution = IeltsDashboardMode | 'error';

export interface IeltsDashboardProfile {
  role?: string | null;
  is_admin?: boolean | null;
}

export interface IeltsDashboardModeContext {
  profile: IeltsDashboardProfile | null;
  profileError: unknown;
  capabilityResolution: SchoolCapabilitiesResolution;
}

export const resolveIeltsDashboardMode = ({
  profile,
  profileError,
  capabilityResolution,
}: IeltsDashboardModeContext): IeltsDashboardModeResolution => {
  const role = String(profile?.role ?? '').trim().toLowerCase();
  const isPlatformAdmin = !profileError && (
    Boolean(profile?.is_admin)
    || role === 'admin'
    || role === 'superadmin'
  );
  const canAdministerSchool = capabilityResolution.status === 'ready'
    && Boolean(capabilityResolution.capabilities?.can_administer);

  if ((profileError && !canAdministerSchool) || (capabilityResolution.status === 'error' && !isPlatformAdmin)) {
    return 'error';
  }
  return isPlatformAdmin || canAdministerSchool ? 'admin' : 'student';
};
