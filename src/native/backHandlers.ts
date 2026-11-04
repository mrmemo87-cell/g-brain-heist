// Android back button inside the installed app: things on screen register what "back" means for them.
// The newest registration is asked first (an open sheet before the tab bar under it). A handler returns
// true when it used the back press. On the website nothing calls these, so behaviour there is unchanged.

export type BackHandler = () => boolean;

/** "overlay": sheets and pop-ups (asked first). "tabs": tab bars under them (asked after any pop-up closed). */
export type BackLayer = 'overlay' | 'tabs';

const layers: Record<BackLayer, BackHandler[]> = { overlay: [], tabs: [] };

export function pushBackHandler(handler: BackHandler, layer: BackLayer = 'overlay'): () => void {
  const handlers = layers[layer];
  handlers.push(handler);
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Ask the layer's handlers, newest first. True when one of them used the back press. */
export function runBackHandlers(layer: BackLayer): boolean {
  const handlers = layers[layer];
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    try {
      if (handlers[i]!()) return true;
    } catch { /* a broken handler must never trap the back button */ }
  }
  return false;
}

/**
 * Any other open pop-up (role="dialog" aria-modal="true") gets an Escape key, which the app's dialogs already
 * treat as "close". Resolves true if the dialog went away, false if it ignored Escape.
 */
export function closeTopDialog(): Promise<boolean> {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'))
    .filter((el) => el.isConnected && el.getClientRects().length > 0);
  const top = dialogs[dialogs.length - 1];
  if (!top) return Promise.resolve(false);
  const esc = () => new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
  top.dispatchEvent(esc());
  window.dispatchEvent(esc());
  return new Promise((resolve) => window.setTimeout(() => resolve(!top.isConnected || top.getClientRects().length === 0), 160));
}
