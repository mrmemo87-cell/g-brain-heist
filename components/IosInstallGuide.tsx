import React, { useEffect, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import {
  INSTALL_GUIDE_OPEN_EVENT,
  detectStandalone,
  installGuidePlatform,
  iosShareLayout,
  readInstallGuideDismissed,
  shouldAutoShowNativeInstall,
  shouldShowIosInstallGuide,
  writeInstallGuideDismissed,
} from '../src/lib/installPrompt';
import { NATIVE_INSTALL_CHANGED_EVENT, canInstallNatively, promptNativeInstall } from '../src/lib/nativeInstall';

const SHOW_DELAY_MS = 2500;

const storage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

const ShareIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2cf6c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
  </svg>
);

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="install-guide__key">{children}</span>;

/**
 * "Add to Home Screen" sheet.
 * - Android (Chrome, Edge, Samsung): one big "Install" button — a single tap, then the browser's own confirm.
 *   Shown on its own as soon as the browser allows it.
 * - iPhone/iPad Safari: Apple allows no install button, so the sheet shows the steps for this Safari version and a
 *   bouncing arrow pointing at the button to tap first (⋯ on Safari 26+, Share on older iPhones, top right on iPad).
 * Never when already installed or on timed IELTS routes. "Not now" hides it for 7 days; after 3 it stops on its own.
 * "How to install" in Settings fires INSTALL_GUIDE_OPEN_EVENT and opens it on any device.
 */
const IosInstallGuide: React.FC = () => {
  const { t, direction } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const [canInstall, setCanInstall] = useState(() => (typeof window === 'undefined' ? false : canInstallNatively()));
  const [installState, setInstallState] = useState<'idle' | 'busy' | 'done'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const open = () => { setManual(true); setVisible(true); setInstallState('idle'); };
    window.addEventListener(INSTALL_GUIDE_OPEN_EVENT, open);
    return () => window.removeEventListener(INSTALL_GUIDE_OPEN_EVENT, open);
  }, []);

  // iPhone Safari: show the steps on their own.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const show = shouldShowIosInstallGuide({
      userAgent: window.navigator.userAgent,
      standalone: detectStandalone(window),
      pathname: window.location.pathname,
      dismissed: readInstallGuideDismissed(storage()),
    });
    if (!show) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Android: follow the browser's one-tap install availability and offer it on its own.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timer: number | null = null;
    const sync = () => {
      const available = canInstallNatively();
      setCanInstall(available);
      const autoShow = shouldAutoShowNativeInstall({
        userAgent: window.navigator.userAgent,
        standalone: detectStandalone(window),
        pathname: window.location.pathname,
        dismissed: readInstallGuideDismissed(storage()),
        canInstall: available,
      });
      if (autoShow && timer === null) timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    };
    sync();
    window.addEventListener(NATIVE_INSTALL_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(NATIVE_INSTALL_CHANGED_EVENT, sync);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  // The floating language button sits on the very top layer; tuck it under this sheet while it is open.
  useEffect(() => {
    if (!visible || typeof document === 'undefined') return;
    document.body.classList.add('install-guide-open');
    return () => document.body.classList.remove('install-guide-open');
  }, [visible]);

  if (!visible) return null;

  const ua = window.navigator.userAgent;
  const touch = window.navigator.maxTouchPoints || 0;
  const platform = installGuidePlatform(ua, touch);
  // No Safari toolbar to point at once it already runs from the Home Screen.
  const layout = platform === 'ios' && !detectStandalone(window) ? iosShareLayout(ua, touch) : null;
  const oneTap = canInstall || installState !== 'idle';

  const close = () => {
    setVisible(false);
    setManual(false);
  };
  const dismiss = () => {
    if (!manual && installState !== 'done') writeInstallGuideDismissed(storage());
    close();
  };
  const install = async () => {
    setInstallState('busy');
    const outcome = await promptNativeInstall();
    if (outcome === 'accepted') {
      setInstallState('done');
      window.setTimeout(close, 4000);
    } else {
      setInstallState('idle');
    }
  };

  return (
    <>
      {layout && installState === 'idle' && (
        <div className={`install-guide__pointer install-guide__pointer--${layout}`} aria-hidden="true">
          <span className="install-guide__pointer-label">
            {layout === 'iphone-more-menu' ? '⋯' : <ShareIcon size={16} />}
          </span>
          <svg className="install-guide__pointer-arrow" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v15" /><path d="m6 13 6 6 6-6" />
          </svg>
        </div>
      )}
      <div
        role="dialog"
        aria-labelledby="bh-install-guide-title"
        dir={direction}
        data-testid="ios-install-guide"
        data-layout={layout ?? platform}
        className={`install-guide${layout && layout !== 'ipad-top' ? ' install-guide--raised' : ''}`}
        style={{ zIndex: manual ? 90 : 60 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="install-guide__icon" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="bh-install-guide-title" className="font-heading install-guide__title">
              {installState === 'done' ? t('Installed! 🎉') : t('Add Brains Heist to your Home Screen')}
            </h2>
            <p className="install-guide__lead">
              {installState === 'done'
                ? t('Open Brains Heist from your Home Screen. One more tap there turns on raid alerts.')
                : t('Open it like an app, full screen, and stay signed in.')}
            </p>
          </div>
          <button type="button" onClick={dismiss} aria-label={t('Dismiss')} className="install-guide__close">×</button>
        </div>

        {oneTap && installState !== 'done' && (
          <button
            type="button"
            data-testid="native-install-button"
            className="install-guide__install"
            onClick={() => void install()}
            disabled={installState === 'busy'}
          >
            {installState === 'busy' ? t('Installing…') : t('Install Brains Heist')}
          </button>
        )}

        {!oneTap && layout === 'iphone-more-menu' && (
          <ol className="install-guide__steps">
            <li>{t('Tap the ⋯ button at the bottom right of Safari')} <Key>⋯</Key></li>
            <li>{t('Tap "Share"')} <Key><ShareIcon size={15} /></Key></li>
            <li>{t('Choose "Add to Home Screen" (tap "View More" if you don\'t see it)')}</li>
            <li>{t('Keep "Open as Web App" on, then tap "Add"')}</li>
          </ol>
        )}
        {!oneTap && platform === 'ios' && layout !== 'iphone-more-menu' && (
          <ol className="install-guide__steps">
            <li>
              {t('Tap the Share button')} <Key><ShareIcon size={15} /></Key>{' '}
              {layout === 'ipad-top' ? t('(top right)') : layout === 'iphone-share-bar' ? t('(bottom of the screen)') : null}
            </li>
            <li>{t('Choose "Add to Home Screen"')}</li>
            <li>{t('Tap "Add"')}</li>
          </ol>
        )}
        {!oneTap && platform === 'android' && (
          <ol className="install-guide__steps">
            <li>{t('Open Brains Heist in Chrome')}</li>
            <li>{t('Tap the ⋮ menu (top right)')}</li>
            <li>{t('Choose "Add to Home screen" or "Install app"')}</li>
            <li>{t('Tap "Install"')}</li>
          </ol>
        )}
        {!oneTap && platform === 'other' && (
          <p className="install-guide__note" style={{ color: '#f8fafc' }}>
            {t('Open Brains Heist on your phone (Safari on iPhone, Chrome on Android) and tap "How to install" in Settings there.')}
          </p>
        )}
        {platform === 'ios' && (
          <p className="install-guide__note">
            {t('Already added, but it opens inside Safari with an address bar? Delete the icon and add it again with these steps. Notifications only work when it opens full screen.')}
          </p>
        )}
        {installState !== 'done' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button type="button" onClick={dismiss} className="install-guide__later">
              {manual ? t('Close') : t('Not now')}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default IosInstallGuide;
