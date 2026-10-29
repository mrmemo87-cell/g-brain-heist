import React, { useEffect, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import { getPushAvailability, isPushEnabledOnThisDevice } from '../services/pushService';
import { openInstallGuide } from '../src/lib/installPrompt';
import { isSnoozed, readSnooze, recordSnooze } from '../src/lib/promptSnooze';
import { PUSH_ENABLED_EVENT } from '../src/lib/pushMoment';
import PushNotificationToggle from './PushNotificationToggle';

const DISMISS_KEY = 'brains-heist:push-card-dismissed:v1';
/** "×" hides the card for a week; after 3 times it stays hidden (Settings still has the switch). */
const SNOOZE_DAYS = 7;
const MAX_SNOOZES = 3;

const storage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

/**
 * Card above the assignment list inviting the student to turn on notifications.
 * - Push works here and is off → "Enable notifications".
 * - iPhone in Safari → explains Home Screen first, with "Show me how".
 * - Already on, blocked or unsupported → hidden.
 */
const PushEnableCard: React.FC = () => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'enable' | 'install' | null>(null);

  useEffect(() => {
    let active = true;
    if (isSnoozed(readSnooze(storage(), DISMISS_KEY), Date.now(), MAX_SNOOZES)) return;
    const availability = getPushAvailability();
    if (availability.ok) {
      void isPushEnabledOnThisDevice().then((on) => { if (active && !on) setMode('enable'); });
    } else if (availability.reason === 'ios_needs_home_screen') {
      setMode('install');
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const hide = () => setMode(null);
    window.addEventListener(PUSH_ENABLED_EVENT, hide);
    return () => window.removeEventListener(PUSH_ENABLED_EVENT, hide);
  }, []);

  if (!mode) return null;
  const dismiss = () => {
    recordSnooze(storage(), DISMISS_KEY, Date.now(), SNOOZE_DAYS);
    setMode(null);
  };

  return (
    <section
      data-testid="push-enable-card"
      data-mode={mode}
      aria-label={t('Notifications')}
      className="mb-4 rounded-2xl border border-cyan-400/30 bg-slate-950/70 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none" aria-hidden="true">🔔</div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base text-white">{t('Never miss a raid')}</h3>
          <p className="mt-1 text-xs leading-5 text-gray-400">
            {mode === 'install'
              ? t('On iPhone, add Brains Heist to your Home Screen first. Then you can get alerts for raids, reactions and new assignments.')
              : t('Get a ping for raids, reactions, clan news and new assignments. Never during the night.')}
          </p>
          <div className="mt-3">
            {mode === 'install' ? (
              <button
                type="button"
                onClick={() => openInstallGuide()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-200 transition hover:bg-cyan-400/20"
              >
                {t('Show me how')}
              </button>
            ) : (
              <PushNotificationToggle compact onEnabled={() => setMode(null)} />
            )}
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('Dismiss')} className="h-9 w-9 flex-none rounded-full border border-slate-600 text-slate-400">×</button>
      </div>
    </section>
  );
};

export default PushEnableCard;
