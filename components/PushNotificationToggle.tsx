import React, { useEffect, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import { disablePushOnThisDevice, enablePushOnThisDevice, getPushAvailability, isPushEnabledOnThisDevice } from '../services/pushService';

type Status = 'checking' | 'unavailable' | 'off' | 'on' | 'busy';

/**
 * "Enable notifications" control for the student. Requests permission only on tap (iOS rule),
 * explains the Home Screen requirement on iPhone, and never shows when the browser cannot push.
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
    // iPhone in Safari: only the Home Screen app can receive notifications; say so rather than hide.
    if (reason === 'ios_needs_home_screen') {
      return (
        <p className="text-sm text-gray-400" data-testid="push-ios-hint">
          {t('To get notifications on iPhone, add Brains Heist to your Home Screen first, then open it from there.')}
        </p>
      );
    }
    if (reason === 'denied') {
      return <p className="text-sm text-gray-400">{t('Notifications are blocked for Brains Heist in your phone settings.')}</p>;
    }
    return null;
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
      {!compact && <p className="text-xs text-gray-400">{t('Get a message when your teacher posts a new assignment and the day before it is due.')}</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
};

export default PushNotificationToggle;
