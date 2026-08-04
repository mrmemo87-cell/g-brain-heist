import React, { useEffect, useState } from 'react';
import { resolveIeltsExtraPracticeAccess } from '../../../services/ieltsExtraPracticeAccessService';

interface Props { children: React.ReactElement }

const IeltsExtraPracticeGuard: React.FC<Props> = ({ children }) => {
  const [state, setState] = useState<{ loading: boolean; allowed: boolean; error: boolean }>({ loading: true, allowed: false, error: false });

  useEffect(() => {
    let active = true;
    void resolveIeltsExtraPracticeAccess().then((access) => {
      if (!active) return;
      setState({ loading: false, allowed: access.status === 'ready' && (access.isAdmin || access.enabled), error: access.status === 'error' });
    }).catch(() => {
      if (!active) return;
      setState({ loading: false, allowed: false, error: true });
    });
    return () => { active = false; };
  }, []);

  if (state.loading) return <div style={{ padding: '1rem' }}>Loading…</div>;
  if (state.error) {
    return <div role="alert" style={{ padding: '1.5rem', maxWidth: 640, margin: '2rem auto', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, color: '#991b1b' }}>Extra Practice access could not be verified. Refresh the page and try again.</div>;
  }
  if (!state.allowed) {
    return <div style={{ padding: '1.5rem', maxWidth: 640, margin: '2rem auto', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, color: '#9a3412' }}>Extra Practice is currently disabled by your school.</div>;
  }
  return children;
};

export default IeltsExtraPracticeGuard;
