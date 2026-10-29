import React, { useEffect, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import { disablePushOnThisDevice, enablePushOnThisDevice, getPushAvailability, isPushEnabledOnThisDevice } from '../services/pushService';

type Status = 'checking' | 'unavailable' | 'off' | 'on' | 'busy';

/**
 * "Enable notifications" control for the student. Requests permission only on tap (iOS rule),
 * and explains in plain words when this device cannot receive notifications.
 */
const PushNotificationToggle: React.FC<{ compact?: boolean; onEnabled?: () => void }> = ({ compact = false, onEnabled }) => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>('checking');
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const availability = getPushAvailability();
    if (!availability.ok) {
      setReason(availability.reason);
      setStatus('unavailable');
      return () => { active = false; };
    }
    void isPushEnabledOnThisDevice().then((on) => { if (active) setStatus(on ? 'on' : 'off'); });
    return () => { active = false; };
  }, []);

  if (status === 'checking') return null;
  if (status === 'unavailable') {
    // Never leave the section blank: say why, and what to do (see "How to install" below it in Settings).
    const message = reason === 'denied'
      ? t('Notifications are blocked for Brains Heist. Turn them on in iPhone Settings → Notifications → Brains Heist (Android: Settings → Apps → Brains Heist → Notifications).')
      : reason === 'ios_needs_home_screen'
        ? t('On iPhone, notifications only work in the Brains Heist app on your Home Screen. If the app opens inside Safari with an address bar, delete the icon and add it again.')
        : t('This browser cannot receive notifications. Use Chrome on Android, or the Brains Heist app on your iPhone Home Screen.');
    return <p className="text-sm text-gray-400" data-testid="push-unavailable" data-reason={reason ?? 'unsupported'}>{message}</p>;
  }

  const enable = async () => {
    setStatus('busy'); setError(null);
    const result = await enablePushOnThisDevice();
    if (result.ok) { setStatus('on'); onEnabled?.(); return; }
    setStatus('off');
    setError(result.reason === 'denied' ? t('Notifications were not allowed.') : t('Could not turn on notifications. Please try again.'));
  };
  const disable = async () => { setStatus('busy'); await disablePushOnThisDevice(); setStatus('off'); };

  return (
    <div data-testid="push-toggle" className={compact ? '' : 'space-y-2'}>
      {status === 'on' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-emerald-300">{t('Notifications are on for this device.')}</span>
          <button type="button" onClick={disable} className="text-xs font-semibold text-gray-300 underline-offset-2 hover:underline">{t('Turn off')}</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={status === 'busy'}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-60"
        >
          {status === 'busy' ? t('Turning on…') : t('Enable notifications')}
        </button>
      )}
      {!compact && <p className="text-xs text-gray-400">{t('Get a ping for raids, reactions, clan news and new assignments. Never during the night.')}</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
};

export default PushNotificationToggle;
