import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { getDemoPersonas, readStoredDemoVisitor, type DemoPersona } from '../../services/demoMode';
import { trackDemoEvent } from '../../services/demoTracker';

interface DemoBannerProps {
  onSwitchPersona: (persona: DemoPersona) => Promise<void>;
}

const STYLE = `
.demo-banner { position: fixed; left: 50%; bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 70;
  display: flex; align-items: center; gap: 0.5rem; max-width: calc(100vw - 1.5rem); padding: 0.45rem 0.55rem 0.45rem 0.9rem;
  border-radius: 999px; border: 1px solid rgba(44, 246, 200, 0.35); background: rgba(6, 16, 29, 0.92); color: #e6eef8;
  box-shadow: 0 18px 50px rgba(0,0,0,0.45); backdrop-filter: blur(12px); font: 700 0.8rem/1.2 'IBM Plex Sans', system-ui, sans-serif; }
.demo-banner-dot { width: 8px; height: 8px; border-radius: 999px; background: #2cf6c8; box-shadow: 0 0 0 4px rgba(44, 246, 200, 0.18); flex: none; }
.demo-banner-text { white-space: nowrap; }
.demo-banner-text small { display: block; font-weight: 500; color: #8fb3cc; font-size: 0.7rem; }
.demo-banner button, .demo-banner a { border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #fff; border-radius: 999px;
  padding: 0.42rem 0.75rem; font: inherit; cursor: pointer; text-decoration: none; white-space: nowrap; }
.demo-banner button:hover, .demo-banner a:hover { background: rgba(44, 246, 200, 0.14); border-color: rgba(44, 246, 200, 0.5); }
.demo-banner .is-primary { background: linear-gradient(90deg, #2cf6c8, #9a6bff); color: #06101d; border: 0; }
.demo-banner .is-icon { padding: 0.42rem 0.6rem; }
.demo-banner.is-collapsed { padding: 0.4rem 0.6rem 0.4rem 0.8rem; }
@media (max-width: 760px) {
  .demo-banner { left: 0.75rem; right: 0.75rem; transform: none; max-width: none; flex-wrap: wrap; border-radius: 1rem; justify-content: center; }
  .demo-banner-text { white-space: normal; text-align: center; width: 100%; }
  /* keep clear of the teacher/student bottom navigation */
  .demo-banner { bottom: calc(4.6rem + env(safe-area-inset-bottom, 0px)); }
}
`;

const DemoBanner: React.FC<DemoBannerProps> = ({ onSwitchPersona }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [switching, setSwitching] = useState(false);
  const visitor = readStoredDemoVisitor();
  const personas = getDemoPersonas();
  const current = visitor?.enteredAs === 'student' ? 'student' : 'teacher';
  const other = personas.find((item) => item.key !== current) ?? personas[0];

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('rpc_is_superadmin').then(({ data }) => { if (!cancelled) setIsAdmin(data === true); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const switchPersona = async () => {
    if (switching || !other) return;
    setSwitching(true);
    trackDemoEvent('switch_persona', other.key);
    try { await onSwitchPersona(other); } finally { setSwitching(false); }
  };

  if (collapsed) {
    return (
      <div className="demo-banner is-collapsed" role="region" aria-label="Demo controls">
        <style>{STYLE}</style>
        <span className="demo-banner-dot" aria-hidden="true" />
        <button type="button" onClick={() => setCollapsed(false)}>Demo</button>
      </div>
    );
  }

  return (
    <div className="demo-banner" role="region" aria-label="Demo controls">
      <style>{STYLE}</style>
      <span className="demo-banner-dot" aria-hidden="true" />
      <span className="demo-banner-text">
        Demo school · you are {current === 'teacher' ? 'the teacher' : 'a student'}
        <small>Resets nightly · emails, push and AI feedback are off here</small>
      </span>
      <button type="button" onClick={() => void switchPersona()} disabled={switching}>
        {switching ? 'Switching…' : current === 'teacher' ? 'See it as a student' : 'Back to the teacher'}
      </button>
      {isAdmin ? <a href="/demo/visitors">Visitors</a> : null}
      <a className="is-primary" href="https://www.brainsheist.com/booked" target="_blank" rel="noreferrer" onClick={() => trackDemoEvent('book_demo_click')}>Set up my school</a>
      <button type="button" className="is-icon" onClick={() => setCollapsed(true)} aria-label="Hide demo controls">✕</button>
    </div>
  );
};

export default DemoBanner;
