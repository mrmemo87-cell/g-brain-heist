import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import { enablePushOnThisDevice, getPushAvailability, isPushEnabledOnThisDevice } from '../services/pushService';
import { detectStandalone, isQuietPath, openInstallGuide } from '../src/lib/installPrompt';
import { supabase } from '../services/supabaseClient';
import { isSnoozed, readSnooze, recordSnooze } from '../src/lib/promptSnooze';
import {
  FIRST_LAUNCH_OFFER_KEY,
  PUSH_ENABLED_EVENT,
  PUSH_MOMENT_EVENT,
  PUSH_MOMENT_MAX_SNOOZES,
  PUSH_MOMENT_SNOOZE_DAYS,
  PUSH_MOMENT_SNOOZE_KEY,
  shouldOfferOnFirstLaunch,
  type PushMomentReason,
} from '../src/lib/pushMoment';

type Mode = 'enable' | 'install';
type Status = 'idle' | 'busy' | 'done' | 'error';

const DELAY_MS: Record<PushMomentReason, number> = { battle: 2800, reaction: 900, installed: 1500 };

const storage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

/**
 * Small bottom sheet offered right after a fun moment: "Want to know when someone raids you?".
 * - Push available and off → "Turn on notifications" (asks permission on the tap, as iOS requires).
 * - iPhone in Safari → "Add Brains Heist to your Home Screen" (opens the install guide).
 * - Already on, blocked, or unsupported → never shown.
 * "Not now" snoozes it for 3 days; after 4 times it stops.
 * Also offered once, on its own, the first time the student opens the app from the Home Screen icon.
 */
const PushMomentPrompt: React.FC = () => {
  const { t, direction } = useLanguage();
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState<PushMomentReason>('battle');
  const [status, setStatus] = useState<Status>('idle');
  const pending = useRef<number | null>(null);
  const shownThisVisit = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMoment = (event: Event) => {
      if (shownThisVisit.current || pending.current !== null) return;
      if (isSnoozed(readSnooze(storage(), PUSH_MOMENT_SNOOZE_KEY), Date.now(), PUSH_MOMENT_MAX_SNOOZES)) return;
      const why: PushMomentReason = (event as CustomEvent<{ reason?: PushMomentReason }>).detail?.reason === 'reaction' ? 'reaction' : 'battle';
      const availability = getPushAvailability();
      const nextMode: Mode | null = availability.ok ? 'enable' : availability.reason === 'ios_needs_home_screen' ? 'install' : null;
      if (!nextMode) return;

      pending.current = window.setTimeout(async () => {
        pending.current = null;
        if (nextMode === 'enable' && (await isPushEnabledOnThisDevice())) return;
        shownThisVisit.current = true;
        setReason(why);
        setStatus('idle');
        setMode(nextMode);
      }, DELAY_MS[why]);
    };
    window.addEventListener(PUSH_MOMENT_EVENT, onMoment);
    return () => {
      window.removeEventListener(PUSH_MOMENT_EVENT, onMoment);
      if (pending.current !== null) window.clearTimeout(pending.current);
    };
  }, []);

  // First launch from the Home Screen: offer the one tap straight away (once per device, once signed in).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let timer: number | null = null;
    const tryOffer = async (signedIn: boolean) => {
      if (cancelled || timer !== null || shownThisVisit.current) return;
      let alreadyOffered = false;
      try { alreadyOffered = storage()?.getItem(FIRST_LAUNCH_OFFER_KEY) === '1'; } catch { /* treat as not offered */ }
      const base = {
        standalone: detectStandalone(window),
        pushAvailable: getPushAvailability().ok,
        signedIn,
        alreadyOffered,
        quietPath: isQuietPath(window.location.pathname),
      };
      if (!shouldOfferOnFirstLaunch({ ...base, pushEnabled: false })) return;
      if (await isPushEnabledOnThisDevice()) return;
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (cancelled || shownThisVisit.current) return;
        shownThisVisit.current = true;
        try { storage()?.setItem(FIRST_LAUNCH_OFFER_KEY, '1'); } catch { /* may offer again next launch */ }
        setReason('installed');
        setStatus('idle');
        setMode('enable');
      }, DELAY_MS.installed);
    };
    void supabase.auth.getSession().then(({ data }) => tryOffer(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) void tryOffer(true);
    });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Turned on somewhere else (Settings, the card): close this offer. Our own tap is 'busy', so it keeps its "all set".
  useEffect(() => {
    if (typeof window === 'undefined' || status !== 'idle') return;
    const hide = () => setMode(null);
    window.addEventListener(PUSH_ENABLED_EVENT, hide);
    return () => window.removeEventListener(PUSH_ENABLED_EVENT, hide);
  }, [status]);

  if (!mode) return null;

  const notNow = () => {
    recordSnooze(storage(), PUSH_MOMENT_SNOOZE_KEY, Date.now(), PUSH_MOMENT_SNOOZE_DAYS);
    setMode(null);
  };

  const enable = async () => {
    setStatus('busy');
    const result = await enablePushOnThisDevice();
    if (result.ok) {
      setStatus('done');
      window.setTimeout(() => setMode(null), 1800);
    } else if (result.reason === 'denied') {
      recordSnooze(storage(), PUSH_MOMENT_SNOOZE_KEY, Date.now(), PUSH_MOMENT_SNOOZE_DAYS);
      setMode(null);
    } else {
      setStatus('error');
    }
  };

  const showInstall = () => {
    setMode(null);
    openInstallGuide();
  };

  const title = reason === 'installed'
    ? t("You're in! One last tap: turn on raid alerts")
    : reason === 'reaction'
      ? t('Want to know when classmates react to you?')
      : t('Want to know when someone raids you?');

  return (
    <div role="dialog" aria-labelledby="bh-push-moment-title" dir={direction} data-testid="push-moment-prompt" className="push-moment">
      <div className="push-moment__bell" aria-hidden="true">🔔</div>
      <div className="push-moment__body">
        {status === 'done' ? (
          <p id="bh-push-moment-title" className="push-moment__title">{t("You're all set! We'll ping you when something happens.")}</p>
        ) : (
          <>
            <p id="bh-push-moment-title" className="push-moment__title">{title}</p>
            <p className="push-moment__text">
              {mode === 'install'
                ? t('On iPhone, add Brains Heist to your Home Screen first. Then you can get alerts for raids, reactions and new assignments.')
                : t('Get a ping for raids, reactions, clan news and new assignments. Never during the night.')}
            </p>
            {status === 'error' && <p role="alert" className="push-moment__error">{t('Could not turn on notifications. Please try again.')}</p>}
            <div className="push-moment__actions">
              {mode === 'install' ? (
                <button type="button" className="push-moment__primary" onClick={showInstall}>{t('Show me how')}</button>
              ) : (
                <button type="button" className="push-moment__primary" onClick={() => void enable()} disabled={status === 'busy'}>
                  {status === 'busy' ? t('Turning on…') : t('Turn on notifications')}
                </button>
              )}
              <button type="button" className="push-moment__secondary" onClick={notNow}>{t('Not now')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PushMomentPrompt;
