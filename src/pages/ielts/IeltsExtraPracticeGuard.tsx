import React, { useEffect, useState } from 'react';
import { resolveIeltsExtraPracticeAccess } from '../../../services/ieltsExtraPracticeAccessService';

interface Props { children: React.ReactElement }

const IeltsExtraPracticeGuard: React.FC<Props> = ({ children }) => {
  const [state, setState] = useState<{ loading: boolean; allowed: boolean }>({ loading: true, allowed: false });

  useEffect(() => {
    let active = true;
    void resolveIeltsExtraPracticeAccess().then((access) => {
      if (!active) return;
      setState({ loading: false, allowed: access.isAdmin || access.enabled });
    }).catch(() => {
      if (!active) return;
      setState({ loading: false, allowed: false });
    });
    return () => { active = false; };
  }, []);

  if (state.loading) return <div style={{ padding: '1rem' }}>Loading…</div>;
  if (!state.allowed) {
    return <div style={{ padding: '1.5rem', maxWidth: 640, margin: '2rem auto', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, color: '#9a3412' }}>Extra Practice is currently disabled by your school.</div>;
  }
  return children;
};

export default IeltsExtraPracticeGuard;
