import { useCallback, useEffect, useRef } from 'react';
import { pushBackHandler } from '../native/backHandlers';
import { isNativeApp } from '../lib/nativePlatform';

/**
 * Mobile bottom navigation stays fully visible and opaque at all times.
 *
 * Owner decision (2026-11-04, after testing the Android app): the earlier hide-on-scroll behaviour made the
 * menu half-transparent and let page text show through it, so it was removed for every portal. The hook keeps
 * its name and return shape so the student, teacher, school-admin, school-head and parent navigations need no
 * changes; it now only pins the CSS variables those navigations read to "shown".
 *
 * Android back in the app (owner report 2026-11-05): tabs are not separate web pages, so without help the
 * back button left the app from any tab. When a portal passes `back`, the hook remembers the tabs the user
 * opened and the back button walks back through them, then to the home tab, and only then leaves the app.
 */
export interface TabBackOptions {
  /** The portal's first tab; back from any other tab ends here before leaving the app. */
  homeKey: string;
  /** Switch to a tab (the same function the tab bar uses). */
  navigateTo: (key: string) => void;
  /** Walk back through visited tabs (default true). False: back always goes straight to the home tab. */
  stack?: boolean;
}

const MAX_TAB_HISTORY = 20;

export const useSmartCollapsedNavigation = (
  routeKey: string,
  // Kept for call-site compatibility; the navigation no longer depends on the viewport width.
  _mobileMediaQuery = '(max-width: 767px)',
  back?: TabBackOptions,
) => {
  const navigationRef = useRef<HTMLElement | null>(null);

  const revealNavigation = useCallback(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    navigation.style.setProperty('--smart-nav-translate-y', '0px');
    navigation.style.setProperty('--smart-nav-opacity', '1');
    navigation.dataset['hidden'] = 'false';
    navigation.dataset['revealVisible'] = 'false';
  }, []);

  useEffect(() => {
    revealNavigation();
  }, [revealNavigation, routeKey]);

  // Tab history for the Android back button (app only).
  const backRef = useRef(back);
  backRef.current = back;
  const historyRef = useRef<string[]>([]);
  const currentRef = useRef(routeKey);
  const goingBackRef = useRef(false);
  const enabled = Boolean(back) && isNativeApp();

  useEffect(() => {
    const previous = currentRef.current;
    currentRef.current = routeKey;
    if (!enabled || previous === routeKey) return;
    if (goingBackRef.current) { goingBackRef.current = false; return; }
    if (backRef.current?.stack === false) return;
    const list = historyRef.current;
    const seen = list.lastIndexOf(routeKey);
    // Returning to a tab already in the trail drops the loop instead of growing it.
    if (seen >= 0) list.splice(seen);
    else list.push(previous);
    if (list.length > MAX_TAB_HISTORY) list.splice(0, list.length - MAX_TAB_HISTORY);
  }, [routeKey, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    return pushBackHandler(() => {
      const opts = backRef.current;
      if (!opts) return false;
      const target = historyRef.current.pop() ?? (currentRef.current !== opts.homeKey ? opts.homeKey : null);
      if (!target || target === currentRef.current) return false;
      goingBackRef.current = true;
      opts.navigateTo(target);
      return true;
    }, 'tabs');
  }, [enabled]);

  return { navigationRef, revealNavigation };
};
