import React from 'react';
import type { EffectsChoice } from '../../lib/appEffects';
import { setEffectsChoice, setSoundOn, useAppEffects } from '../../native/effects/effectsStore';

const CHOICES: Array<{ id: EffectsChoice; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'Best for this phone' },
  { id: 'full', label: 'Full', hint: '3D, light, sound' },
  { id: 'light', label: 'Light', hint: 'Calmer, saves battery' },
  { id: 'off', label: 'Off', hint: 'Still pictures' },
];

const WEB_HINTS: Partial<Record<EffectsChoice, string>> = { auto: 'Best for this device', full: 'Moving 3D Blaze', off: 'Still Blaze' };

/** Effects Full / Light / Off and, in the app, sounds (IELTS Visual & UX Bible §14.5). On the website it controls the animated Blaze. */
export function EffectsControl() {
  const { native, choice, soundOn } = useAppEffects();
  const reduced = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  return (
    <section className="ih-section">
      <h3>Effects</h3>
      <div className="ih-goals ih-effects" role="radiogroup" aria-label="Effects">
        {CHOICES.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={choice === c.id}
            className={`ih-goal-option${choice === c.id ? ' is-on' : ''}`} onClick={() => setEffectsChoice(c.id)}>
            <b>{c.label}</b><small>{native ? c.hint : WEB_HINTS[c.id] ?? c.hint}</small>
          </button>
        ))}
      </div>
      {reduced && <p className="ih-muted">Your device is set to reduce motion, so Blaze stays still.</p>}
      {native && (
        <label className="ih-switch">
          <input type="checkbox" role="switch" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
          <span>{soundOn ? 'Sounds on' : 'Sounds off'}</span>
        </label>
      )}
      <p className="ih-muted">Effects never play during tests, screeners or practice.</p>
    </section>
  );
}

export default EffectsControl;
