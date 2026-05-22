export const normalizeIeltsRole = (role?: string | null): string => (role ?? '').trim().toLowerCase();

export interface IeltsReviewAccessProfile {
  role?: string | null;
  is_admin?: boolean | null;
}

export const canAccessIeltsReviewQueue = (profile?: IeltsReviewAccessProfile | null): boolean => {
  if (!profile) return false;
  const role = normalizeIeltsRole(profile.role);
  return Boolean(profile.is_admin) || role === 'school_admin' || role === 'admin' || role === 'superadmin';
};
