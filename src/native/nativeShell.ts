// Native-only start-up for the Brains Heist iPhone/Android app (Capacitor).
// Called once from index.tsx, and only when isNativeApp() is true, so none of this runs on the website.
// Plugins are loaded lazily to keep them out of the website's first download.

import { inAppPathFromUrl, isAppRootPath } from '../lib/nativePlatform';
import { closeTopDialog, runBackHandlers } from './backHandlers';

const BRAND_BACKGROUND = '#050813';

export function startNativeShell(): void {
  void setUpStatusBar();
  void setUpAppEvents();
  preloadScreensWhenSettled();
  void import('./effects/haptics').then(({ installTapHaptics }) => installTapHaptics()).catch(() => undefined);
  void import('./effects/streakReminders').then(({ refreshStreakRemindersOnResume }) => refreshStreakRemindersOnResume()).catch(() => undefined);
}

// All screens ship inside the app, so load their code in the background once the first screen is up:
// opening Game, Learn, IELTS and the rest then never waits for code.
function preloadScreensWhenSettled(): void {
  const start = () => window.setTimeout(() => {
    void import('../utils/lazyRetry').then(({ preloadLazyScreens }) => preloadLazyScreens()).catch(() => undefined);
  }, 1500);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

async function setUpStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: BRAND_BACKGROUND }).catch(() => undefined); // Android only
  } catch { /* Status bar styling is cosmetic; never block start-up. */ }
}

async function setUpAppEvents(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');

    // Android hardware/gesture back, in this order:
    // 1. close what is open on top (a sheet or pop-up),
    // 2. go back to the previous tab, then the home tab, of the Brains Heist / teacher / parent portals,
    // 3. step back to the previous page inside a section,
    // 4. on a home screen (Brains Heist or IELTS) send the app to the background like any Android app,
    //    instead of bouncing between the two homes.
    let busy = false;
    await App.addListener('backButton', ({ canGoBack }) => {
      if (busy) return;
      if (runBackHandlers('overlay')) return;
      busy = true;
      void closeTopDialog().then((closed) => {
        busy = false;
        if (closed) return;
        if (runBackHandlers('tabs')) return;
        if (!isAppRootPath(window.location.pathname) && canGoBack && window.history.length > 1) {
          window.history.back();
          return;
        }
        void App.minimizeApp().catch(() => App.exitApp());
      });
    });

    // Links that open the app (email sign-in links, OAuth returns) load the matching in-app page.
    await App.addListener('appUrlOpen', ({ url }) => {
      // A sign-in that finished in the system browser comes back here: close that browser first.
      void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => undefined);
      const path = inAppPathFromUrl(url);
      if (path && path !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.location.assign(path);
      }
    });
  } catch { /* Without the App plugin the app still works; only back-button and deep links are missing. */ }
}
