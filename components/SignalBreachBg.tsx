import React, { useState, useCallback } from 'react';

/**
 * SignalBreachBg – shared animated background for loading phases.
 * Renders a perspective grid, horizontal scan sweep, and pulsing ring.
 * Includes a "SKIP FX" toggle that adds/removes `sb-no-fx` on <body>.
 */
const SignalBreachBg: React.FC<{ children: React.ReactNode; showToggle?: boolean; avatarUrl?: string }> = ({
  children,
  showToggle = true,
  avatarUrl,
}) => {
  const [fxOff, setFxOff] = useState(
    () => typeof document !== 'undefined' && document.body.classList.contains('sb-no-fx'),
  );

  const toggleFx = useCallback(() => {
    const next = !document.body.classList.contains('sb-no-fx');
    document.body.classList.toggle('sb-no-fx', next);
    setFxOff(next);
  }, []);

  return (
    <div className="sb-container" aria-live="polite">
      <div className="sb-vignette" aria-hidden="true" />
      <div className="sb-grid" aria-hidden="true" />
      <div className="sb-center">
        <div className="sb-spinner" aria-hidden="true" />
        <div className="sb-ring" aria-hidden="true">
          <img
            src={avatarUrl || '/logo.png'}
            alt=""
            className={`sb-ring-logo${avatarUrl ? ' sb-ring-avatar' : ''}`}
          />
        </div>
        <div className="sb-content">{children}</div>
      </div>
      {/* Full-width scan beam */}
      <div className="sb-beam" aria-hidden="true" />
      {showToggle && (
        <button
          className="sb-skip-btn"
          onClick={toggleFx}
          type="button"
          title="Toggle visual effects"
        >
          {fxOff ? 'FX OFF' : 'SKIP FX'}
        </button>
      )}
    </div>
  );
};

export default SignalBreachBg;
