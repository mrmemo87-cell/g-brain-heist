import React, { useEffect, useState } from 'react';
import { useLanguage } from '../src/contexts/LanguageContext';
import {
  INSTALL_GUIDE_OPEN_EVENT,
  detectStandalone,
  installGuidePlatform,
  readInstallGuideDismissed,
  shouldShowIosInstallGuide,
  writeInstallGuideDismissed,
} from '../src/lib/installPrompt';

const SHOW_DELAY_MS = 2500;

/**
 * Bottom sheet explaining "Add to Home Screen".
 * Automatic: once, in iPhone/iPad Safari only — never when installed, on timed IELTS routes, or after dismissal.
 * On request: "How to install" in Settings fires INSTALL_GUIDE_OPEN_EVENT and the sheet opens on any device,
 * with iPhone or Android steps and a note for icons that open inside Safari.
 */
const IosInstallGuide: React.FC = () => {
  const { t, direction } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const open = () => { setManual(true); setVisible(true); };
    window.addEventListener(INSTALL_GUIDE_OPEN_EVENT, open);
    return () => window.removeEventListener(INSTALL_GUIDE_OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { storage = undefined; }
    const show = shouldShowIosInstallGuide({
      userAgent: window.navigator.userAgent,
      standalone: detectStandalone(window),
      pathname: window.location.pathname,
      dismissed: readInstallGuideDismissed(storage),
    });
    if (!show) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const platform = installGuidePlatform(window.navigator.userAgent, window.navigator.maxTouchPoints || 0);
  const dismiss = () => {
    if (!manual) {
      let storage: Storage | undefined;
      try { storage = window.localStorage; } catch { storage = undefined; }
      writeInstallGuideDismissed(storage);
    }
    setVisible(false);
    setManual(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="bh-install-guide-title"
      dir={direction}
      data-testid="ios-install-guide"
      style={{
        position: 'fixed',
        left: '0.75rem',
        right: '0.75rem',
        bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        zIndex: manual ? 90 : 60,
        margin: '0 auto',
        maxWidth: 440,
        borderRadius: 20,
        border: '1px solid rgba(44, 246, 200, 0.35)',
        background: 'rgba(5, 8, 19, 0.96)',
        boxShadow: '0 18px 45px rgba(2, 6, 23, 0.6)',
        color: '#f8fafc',
        padding: '1rem 1rem 0.9rem',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 12, flex: 'none' }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 id="bh-install-guide-title" className="font-heading" style={{ fontSize: '1rem', lineHeight: 1.3, margin: 0 }}>
            {t('Add Brains Heist to your Home Screen')}
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', lineHeight: 1.45, color: 'rgb(203 213 225)' }}>
            {t('Open it like an app, full screen, and stay signed in.')}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('Dismiss')}
          style={{ flex: 'none', width: 36, height: 36, borderRadius: 999, border: '1px solid rgba(148,163,184,0.35)', background: 'transparent', color: 'rgb(148 163 184)', fontSize: '1.1rem', lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      {platform === 'ios' && (
      <ol style={{ margin: '0.85rem 0 0', paddingInlineStart: '1.25rem', display: 'grid', gap: '0.35rem', fontSize: '0.86rem', lineHeight: 1.4, listStyle: 'decimal' }}>
        <li>{t('Open Brains Heist in Safari')}</li>
        <li>
          {t('Tap the Share button')}{' '}
          <span aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginInlineStart: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2cf6c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
            </svg>
          </span>
        </li>
        <li>{t('Choose "Add to Home Screen"')}</li>
        <li>{t('Tap "Add"')}</li>
      </ol>
      )}
      {platform === 'android' && (
      <ol style={{ margin: '0.85rem 0 0', paddingInlineStart: '1.25rem', display: 'grid', gap: '0.35rem', fontSize: '0.86rem', lineHeight: 1.4, listStyle: 'decimal' }}>
          <li>{t('Open Brains Heist in Chrome')}</li>
          <li>{t('Tap the ⋮ menu (top right)')}</li>
          <li>{t('Choose "Add to Home screen" or "Install app"')}</li>
          <li>{t('Tap "Install"')}</li>
        </ol>
      )}
      {platform === 'other' && (
        <p style={{ margin: '0.85rem 0 0', fontSize: '0.86rem', lineHeight: 1.45 }}>
          {t('Open Brains Heist on your phone (Safari on iPhone, Chrome on Android) and tap "How to install" in Settings there.')}
        </p>
      )}
      {platform === 'ios' && (
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', lineHeight: 1.45, color: 'rgb(203 213 225)' }}>
          {t('Already added, but it opens inside Safari with an address bar? Delete the icon and add it again with these steps. Notifications only work when it opens full screen.')}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.85rem' }}>
        <button
          type="button"
          onClick={dismiss}
          style={{ minHeight: 40, padding: '0 1rem', borderRadius: 12, border: '1px solid rgba(44, 246, 200, 0.45)', background: 'rgba(44, 246, 200, 0.12)', color: '#2cf6c8', fontWeight: 700, fontSize: '0.85rem' }}
        >
          {manual ? t('Close') : t('Not now')}
        </button>
      </div>
    </div>
  );
};

export default IosInstallGuide;
