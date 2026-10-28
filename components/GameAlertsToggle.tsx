import React, { useEffect, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import { getGameAlertsEnabled, getPushAvailability, setGameAlertsEnabled } from '../services/pushService';

/** Student switch for game notifications (PvP, clans, rivalry wars, streak reminders). Assignment alerts are unaffected. */
const GameAlertsToggle: React.FC = () => {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!getPushAvailability().ok) return;
    let active = true;
    void getGameAlertsEnabled().then((on) => { if (active) setEnabled(on); });
    return () => { active = false; };
  }, []);

  if (enabled === null) return null;

  const toggle = async () => {
    const next = !enabled;
    setSaving(true); setError(false); setEnabled(next);
    const ok = await setGameAlertsEnabled(next);
    setSaving(false);
    if (!ok) { setEnabled(!next); setError(true); }
  };

  return (
    <div className="flex items-start justify-between gap-3" data-testid="game-alerts-toggle">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-200">{t('Game alerts')}</p>
        <p className="text-xs leading-5 text-gray-400">{t('PvP attacks, clan chat, join requests, power-ups and wars, and an evening reminder before your streak breaks. Never between 22:00 and 07:00.')}</p>
        {error && <p role="alert" className="text-xs text-rose-300">{t('Could not save. Please try again.')}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('Game alerts')}
        disabled={saving}
        onClick={toggle}
        className={`relative mt-1 h-7 w-12 flex-none rounded-full border transition ${enabled ? 'border-cyan-400/60 bg-cyan-400/30' : 'border-gray-600 bg-gray-800'} disabled:opacity-60`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? 'left-6' : 'left-0.5'}`} />
      </button>
    </div>
  );
};

export default GameAlertsToggle;
