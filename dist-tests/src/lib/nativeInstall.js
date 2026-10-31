// One-tap install where the browser allows it (Chrome/Edge/Samsung Internet on Android, desktop Chrome).
// The browser fires `beforeinstallprompt` once, early, so we capture it at startup and keep it for a tap.
// iPhone Safari never fires it: there the guide shows the Share → Add to Home Screen steps instead.
/** Fired on the window whenever one-tap install becomes available or goes away. */
export const NATIVE_INSTALL_CHANGED_EVENT = 'brains-heist:native-install-changed';
export function createNativeInstall(target) {
    let deferred = null;
    let installed = false;
    let started = false;
    const changed = () => {
        try {
            target?.dispatchEvent(new Event(NATIVE_INSTALL_CHANGED_EVENT));
        }
        catch { /* Old WebViews. */ }
    };
    return {
        /** Call once at startup, before React renders, so the early event is not missed. */
        start() {
            if (started || !target)
                return;
            started = true;
            target.addEventListener('beforeinstallprompt', (event) => {
                event.preventDefault(); // We show our own button instead of the browser's mini-bar.
                deferred = event;
                changed();
            });
            target.addEventListener('appinstalled', () => {
                deferred = null;
                installed = true;
                changed();
            });
        },
        canInstall() {
            return deferred !== null;
        },
        wasInstalled() {
            return installed;
        },
        /** Must run from a tap. The browser lets each captured prompt be used once. */
        async prompt() {
            const event = deferred;
            if (!event)
                return 'unavailable';
            deferred = null;
            changed();
            try {
                await event.prompt();
                const choice = await event.userChoice;
                if (choice.outcome === 'accepted')
                    installed = true;
                return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
            }
            catch {
                return 'unavailable';
            }
        },
    };
}
const shared = createNativeInstall(typeof window === 'undefined' ? undefined : window);
export const startNativeInstallCapture = () => shared.start();
export const canInstallNatively = () => shared.canInstall();
export const nativeInstallHappened = () => shared.wasInstalled();
export const promptNativeInstall = () => shared.prompt();
/**
 * Register the service worker on startup (not only when notifications are turned on): Android Chrome
 * offers one-tap install only for sites with a worker. Safe to call repeatedly.
 */
export function registerAppServiceWorker(win = typeof window === 'undefined' ? undefined : window) {
    try {
        if (!win || !('serviceWorker' in win.navigator) || !win.isSecureContext)
            return;
        const register = () => { void win.navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined); };
        if (win.document.readyState === 'complete')
            register();
        else
            win.addEventListener('load', register, { once: true });
    }
    catch { /* Private modes and old WebViews: no worker, no install button, nothing breaks. */ }
}
