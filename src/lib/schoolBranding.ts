export const PRODUCT_NAME = 'Brains Heist';
export const PRODUCT_LOGO_URL = '/logo.png';

export interface SchoolBrand {
  schoolId: string | null;
  name: string;
  logoUrl: string | null;
  isSchoolBrand: boolean;
}

export interface SchoolBrandInput {
  schoolId?: string | null;
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
}

/** Only remote HTTPS images and the bundled product logo are safe to render. */
export const normalizeBrandLogoUrl = (value?: string | null): string | null => {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (candidate === PRODUCT_LOGO_URL) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

export const createSchoolBrand = (
  canonical: SchoolBrandInput | null | undefined,
  fallback: SchoolBrandInput = {},
): SchoolBrand => {
  const schoolId = canonical?.schoolId || fallback.schoolId || null;
  const schoolName = canonical?.schoolName?.trim() || fallback.schoolName?.trim();
  const schoolLogo = normalizeBrandLogoUrl(canonical?.schoolLogoUrl)
    || normalizeBrandLogoUrl(fallback.schoolLogoUrl);

  return {
    schoolId,
    name: schoolName || PRODUCT_NAME,
    logoUrl: schoolLogo || (!schoolName ? PRODUCT_LOGO_URL : null),
    isSchoolBrand: Boolean(schoolId || schoolName),
  };
};
