import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SchoolHeadLearningIntelligence from '../components/school-head/SchoolHeadLearningIntelligence';
import { supabase } from '../services/supabaseClient';

const Entry: React.FC = () => {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const { data, error: capabilityError } = await supabase.rpc('school_admin_get_my_allocation_capabilities', { p_school_id: null });
      if (cancelled) return;
      if (capabilityError) { setError(capabilityError.message || 'School Head authority could not be verified.'); return; }
      const payload = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
      if (payload['success'] !== true || payload['account_type'] !== 'school_head' || typeof payload['school_id'] !== 'string') {
        setError('This academic progress workspace is reserved for the active School Head.');
        return;
      }
      setSchoolId(payload['school_id']);
      const { data: school } = await supabase.from('schools').select('name,logo_url').eq('id', payload['school_id']).maybeSingle();
      if (!cancelled) {
        setSchoolName(typeof school?.name === 'string' ? school.name : null);
        setSchoolLogoUrl(typeof school?.logo_url === 'string' ? school.logo_url : null);
      }
    };
    void resolve();
    return () => { cancelled = true; };
  }, []);

  if (error) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#10243a', fontFamily: 'Inter,system-ui' }}><section style={{ maxWidth: 620, padding: 32, textAlign: 'center' }}><h1>Executive access unavailable</h1><p style={{ color: '#607389' }}>{error}</p><button onClick={() => window.location.assign('/')} style={{ padding: '10px 14px', border: '1px solid #cbd8e4', borderRadius: 9, color: '#173047', background: '#fff' }}>Return to Brains Heist</button></section></main>;
  if (!schoolId) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#607389', fontFamily: 'Inter,system-ui' }}>Verifying School Head authority…</main>;

  return <SchoolHeadLearningIntelligence schoolId={schoolId} schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} onBack={() => window.history.length > 1 ? window.history.back() : window.location.assign('/?view=school_head&headTab=academic')} />;
};

const root = document.getElementById('school-head-learning-intelligence-root');
if (!root) throw new Error('School Head learning intelligence root was not found');
createRoot(root).render(<React.StrictMode><Entry /></React.StrictMode>);
