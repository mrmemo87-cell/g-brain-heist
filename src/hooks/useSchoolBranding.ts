import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { createSchoolBrand, type SchoolBrandInput } from '../lib/schoolBranding';

export interface SchoolBranding extends SchoolBrandInput {}

const canonicalBrandCache = new Map<string, SchoolBrandInput>();

/** Resolves the current schools row instead of relying on a stale profile. */
export const useSchoolBranding = (fallback: SchoolBranding) => {
  const fallbackBrand = () => {
    const brand = createSchoolBrand(fallback.schoolId ? canonicalBrandCache.get(fallback.schoolId) : null, fallback);
    return { schoolName: brand.name, schoolLogoUrl: brand.logoUrl };
  };
  const [branding, setBranding] = useState(fallbackBrand);

  useEffect(() => {
    setBranding(fallbackBrand());
    if (!fallback.schoolId) return;
    let active = true;
    void supabase.from('schools').select('name, logo_url').eq('id', fallback.schoolId).maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const canonical = { schoolId: fallback.schoolId, schoolName: data.name, schoolLogoUrl: data.logo_url };
        canonicalBrandCache.set(fallback.schoolId!, canonical);
        const brand = createSchoolBrand(canonical, fallback);
        setBranding({ schoolName: brand.name, schoolLogoUrl: brand.logoUrl });
      });
    return () => { active = false; };
  }, [fallback.schoolId, fallback.schoolName, fallback.schoolLogoUrl]);

  useEffect(() => {
    const handleBrandingUpdate = (event: Event) => {
      const updated = (event as CustomEvent<SchoolBrandInput>).detail;
      if (!fallback.schoolId || updated?.schoolId !== fallback.schoolId) return;
      canonicalBrandCache.set(fallback.schoolId, updated);
      const brand = createSchoolBrand(updated, fallback);
      setBranding({ schoolName: brand.name, schoolLogoUrl: brand.logoUrl });
    };
    window.addEventListener('school-branding-updated', handleBrandingUpdate);
    return () => window.removeEventListener('school-branding-updated', handleBrandingUpdate);
  }, [fallback.schoolId, fallback.schoolName, fallback.schoolLogoUrl]);

  return branding;
};
