import React, { useEffect, useState } from 'react';
import './LoginLaunchpad.css';
/** Local warm-up: no requests, rewards, artificial progress, or minimum wait. */
const LoginLaunchpad: React.FC<{ message?: string; compact?: boolean }> = ({
  message = 'Opening Brains Heist…', compact = false,
}) => {
  const [taps, setTaps] = useState(0);
  const [showActivity, setShowActivity] = useState(false);
  const [slow, setSlow] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const activity = window.setTimeout(() => setShowActivity(true), 700);
    const waiting = window.setTimeout(() => setSlow(true), 8000);
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    return () => { clearTimeout(activity); clearTimeout(waiting);
      window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  }, []);
  const target = (taps * 5 + 4) % 9;
  return (
    <section className={`login-launchpad ${compact ? 'login-launchpad--compact' : ''}`} aria-label="Opening your account">
      <div className="login-launchpad__card">
        <div className="login-launchpad__brand"><span aria-hidden="true">↗</span> BRAINS HEIST</div>
        <svg className="login-launchpad__mark" viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <rect x="16" y="16" width="64" height="64" rx="18" /><path d="M32 49l11 11 23-25M48 8v8M48 80v8M8 48h8M80 48h8" />
        </svg>
        <h1>{message}</h1>
        <p className="login-launchpad__status" role="status" aria-live="polite">
          {!online ? 'You’re offline. Reconnect to continue.' : slow ? 'Still connecting. Your workspace will open when it’s ready.' : 'Getting your account ready.'}
        </p>
        <div className="login-launchpad__signal" aria-hidden="true"><span /></div>
        {showActivity && <div className="login-launchpad__activity">
          <div className="login-launchpad__activity-heading"><span>QUICK WARM-UP</span><span aria-label={`${taps} hits`}>{taps} hits</span></div>
          <p>Tap the highlighted tile. Just for fun.</p>
          <div className="login-launchpad__grid" role="group" aria-label="Optional tap warm-up">
            {Array.from({ length: 9 }, (_, tile) => <button key={tile} type="button" className={tile === target ? 'is-target' : ''}
              aria-label={`Tile ${tile + 1}${tile === target ? ', target' : ''}`}
              onClick={() => { if (tile === target) setTaps(value => value + 1); }}>
              <span aria-hidden="true">{tile === target ? '✦' : '·'}</span>
            </button>)}
          </div>
          <p className="login-launchpad__hint">Jump in automatically when ready.</p>
        </div>}
      </div>
    </section>
  );
};
export default LoginLaunchpad;
