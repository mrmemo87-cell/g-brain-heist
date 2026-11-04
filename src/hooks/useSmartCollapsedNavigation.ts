import { useCallback, useEffect, useRef } from 'react';

/**
 * Mobile bottom navigation stays fully visible and opaque at all times.
 *
 * Owner decision (2026-11-04, after testing the Android app): the earlier hide-on-scroll behaviour made the
 * menu half-transparent and let page text show through it, so it was removed for every portal. The hook keeps
 * its name and return shape so the student, teacher, school-admin, school-head and parent navigations need no
 * changes; it now only pins the CSS variables those navigations read to "shown".
 */
export const useSmartCollapsedNavigation = (
  routeKey: string,
  // Kept for call-site compatibility; the navigation no longer depends on the viewport width.
  _mobileMediaQuery = '(max-width: 767px)',
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

  return { navigationRef, revealNavigation };
};
