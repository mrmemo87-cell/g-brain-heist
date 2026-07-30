import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export interface SchoolBranding {
  schoolId?: string | null;
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
}

/** Resolves the current schools row instead of relying on a stale profile. */
export const useSchoolBranding = (fallback: SchoolBranding) => {
  const fallbackBrand = () => ({
    schoolName: fallback.schoolName?.trim() || 'Brains Heist',
    schoolLogoUrl: fallback.schoolLogoUrl?.trim() || '/logo.png',
  });
  const [branding, setBranding] = useState(fallbackBrand);

  useEffect(() => {
    setBranding(fallbackBrand());
    if (!fallback.schoolId) return;
    let active = true;
    void supabase.from('schools').select('name, logo_url').eq('id', fallback.schoolId).maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        setBranding({
          schoolName: data.name?.trim() || fallback.schoolName?.trim() || 'Brains Heist',
          schoolLogoUrl: data.logo_url?.trim() || fallback.schoolLogoUrl?.trim() || '/logo.png',
        });
      });
    return () => { active = false; };
  }, [fallback.schoolId, fallback.schoolName, fallback.schoolLogoUrl]);

  return branding;
};
