import React, { useEffect, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import { getPushAvailability, isPushEnabledOnThisDevice } from '../services/pushService';
import PushNotificationToggle from './PushNotificationToggle';

const DISMISS_KEY = 'brains-heist:push-card-dismissed:v1';

/**
 * One-time card above the assignment list inviting the student to turn on notifications.
 * Shown only where push can actually work (installed iPhone app, Android, desktop) and not yet enabled.
 */
const PushEnableCard: React.FC = () => {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    try { if (window.localStorage.getItem(DISMISS_KEY) === '1') return; } catch { /* ignore */ }
    if (!getPushAvailability().ok) return;
    void isPushEnabledOnThisDevice().then((on) => { if (active && !on) setVisible(true); });
    return () => { active = false; };
  }, []);

  if (!visible) return null;
  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <section
      data-testid="push-enable-card"
      aria-label={t('Notifications')}
      className="mb-4 rounded-2xl border border-cyan-400/30 bg-slate-950/70 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base text-white">{t('Enable notifications')}</h3>
          <p className="mt-1 text-xs leading-5 text-gray-400">{t('Get a message when your teacher posts a new assignment and the day before it is due.')}</p>
          <div className="mt-3"><PushNotificationToggle compact onEnabled={dismiss} /></div>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('Dismiss')} className="h-9 w-9 flex-none rounded-full border border-slate-600 text-slate-400">×</button>
      </div>
    </section>
  );
};

export default PushEnableCard;
