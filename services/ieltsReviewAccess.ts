export const normalizeIeltsRole = (role?: string | null): string => (role ?? '').trim().toLowerCase();

export interface IeltsReviewAccessProfile {
  role?: string | null;
  is_admin?: boolean | null;
  can_administer_school?: boolean | null;
}

export const canAccessIeltsReviewQueue = (profile?: IeltsReviewAccessProfile | null): boolean => {
  if (!profile) return false;
  const role = normalizeIeltsRole(profile.role);
  return Boolean(profile.is_admin)
    || Boolean(profile.can_administer_school)
    || role === 'admin'
    || role === 'superadmin';
};
