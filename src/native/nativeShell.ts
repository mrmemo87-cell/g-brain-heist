// Native-only start-up for the Brains Heist iPhone/Android app (Capacitor).
// Called once from index.tsx, and only when isNativeApp() is true, so none of this runs on the website.
// Plugins are loaded lazily to keep them out of the website's first download.

import { inAppPathFromUrl } from '../lib/nativePlatform';

const BRAND_BACKGROUND = '#050813';

export function startNativeShell(): void {
  void setUpStatusBar();
  void setUpAppEvents();
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

    // Android hardware/gesture back: go back inside the app, and leave the app only from the first screen.
    await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) window.history.back();
      else void App.exitApp();
    });

    // Links that open the app (email sign-in links, OAuth returns) load the matching in-app page.
    await App.addListener('appUrlOpen', ({ url }) => {
      const path = inAppPathFromUrl(url);
      if (path && path !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.location.assign(path);
      }
    });
  } catch { /* Without the App plugin the app still works; only back-button and deep links are missing. */ }
}
