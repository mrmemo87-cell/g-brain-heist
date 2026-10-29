// One-tap install where the browser allows it (Chrome/Edge/Samsung Internet on Android, desktop Chrome).
// The browser fires `beforeinstallprompt` once, early, so we capture it at startup and keep it for a tap.
// iPhone Safari never fires it: there the guide shows the Share → Add to Home Screen steps instead.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export type NativeInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** Fired on the window whenever one-tap install becomes available or goes away. */
export const NATIVE_INSTALL_CHANGED_EVENT = 'brains-heist:native-install-changed';

type Target = Pick<EventTarget, 'addEventListener' | 'dispatchEvent'>;

export function createNativeInstall(target: Target | undefined) {
  let deferred: BeforeInstallPromptEvent | null = null;
  let installed = false;
  let started = false;

  const changed = () => {
    try { target?.dispatchEvent(new Event(NATIVE_INSTALL_CHANGED_EVENT)); } catch { /* Old WebViews. */ }
  };

  return {
    /** Call once at startup, before React renders, so the early event is not missed. */
    start(): void {
      if (started || !target) return;
      started = true;
      target.addEventListener('beforeinstallprompt', (event: Event) => {
        event.preventDefault(); // We show our own button instead of the browser's mini-bar.
        deferred = event as BeforeInstallPromptEvent;
        changed();
      });
      target.addEventListener('appinstalled', () => {
        deferred = null;
        installed = true;
        changed();
      });
    },
    canInstall(): boolean {
      return deferred !== null;
    },
    wasInstalled(): boolean {
      return installed;
    },
    /** Must run from a tap. The browser lets each captured prompt be used once. */
    async prompt(): Promise<NativeInstallOutcome> {
      const event = deferred;
      if (!event) return 'unavailable';
      deferred = null;
      changed();
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === 'accepted') installed = true;
        return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch {
        return 'unavailable';
      }
    },
  };
}

const shared = createNativeInstall(typeof window === 'undefined' ? undefined : window);

export const startNativeInstallCapture = (): void => shared.start();
export const canInstallNatively = (): boolean => shared.canInstall();
export const nativeInstallHappened = (): boolean => shared.wasInstalled();
export const promptNativeInstall = (): Promise<NativeInstallOutcome> => shared.prompt();

/**
 * Register the service worker on startup (not only when notifications are turned on): Android Chrome
 * offers one-tap install only for sites with a worker. Safe to call repeatedly.
 */
export function registerAppServiceWorker(win: (Window & typeof globalThis) | undefined = typeof window === 'undefined' ? undefined : window): void {
  try {
    if (!win || !('serviceWorker' in win.navigator) || !win.isSecureContext) return;
    const register = () => { void win.navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined); };
    if (win.document.readyState === 'complete') register();
    else win.addEventListener('load', register, { once: true });
  } catch { /* Private modes and old WebViews: no worker, no install button, nothing breaks. */ }
}
