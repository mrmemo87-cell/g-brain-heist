import { useEffect, useRef, useState } from 'react';

const TOP_EXPANDED_THRESHOLD = 40;
const COLLAPSE_DISTANCE = 60;
const EXPAND_DISTANCE = 35;
const MIN_SCROLL_DELTA = 5;

type ScrollDirection = 'up' | 'down' | null;

/**
 * Collapses a mobile navigation bar only after intentional, sustained scrolling.
 * The page remains the scroll owner; the navigation is never tied to finger position.
 */
export const useSmartCollapsedNavigation = (
  routeKey: string,
  mobileMediaQuery = '(max-width: 767px)',
) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isCollapsedRef = useRef(false);

  useEffect(() => {
    const updateCollapsedState = (nextCollapsed: boolean) => {
      if (isCollapsedRef.current === nextCollapsed) return;
      isCollapsedRef.current = nextCollapsed;
      setIsCollapsed(nextCollapsed);
    };

    updateCollapsedState(false);

    const mediaQuery = window.matchMedia(mobileMediaQuery);
    let lastScrollY = Math.max(0, window.scrollY);
    let accumulatedDistance = 0;
    let direction: ScrollDirection = null;
    let animationFrame: number | null = null;

    const update = () => {
      animationFrame = null;

      if (!mediaQuery.matches) {
        updateCollapsedState(false);
        return;
      }

      const scrollY = Math.max(0, window.scrollY);
      if (scrollY < TOP_EXPANDED_THRESHOLD) {
        accumulatedDistance = 0;
        direction = null;
        lastScrollY = scrollY;
        updateCollapsedState(false);
        return;
      }

      const delta = scrollY - lastScrollY;
      if (Math.abs(delta) < MIN_SCROLL_DELTA) return;

      const nextDirection: ScrollDirection = delta > 0 ? 'down' : 'up';
      if (direction !== nextDirection) {
        direction = nextDirection;
        accumulatedDistance = 0;
      }

      accumulatedDistance += Math.abs(delta);
      lastScrollY = scrollY;

      if (direction === 'down' && accumulatedDistance >= COLLAPSE_DISTANCE) {
        updateCollapsedState(true);
        accumulatedDistance = 0;
      } else if (direction === 'up' && accumulatedDistance >= EXPAND_DISTANCE) {
        updateCollapsedState(false);
        accumulatedDistance = 0;
      }
    };

    const onScroll = () => {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(update);
    };

    const onBreakpointChange = () => {
      lastScrollY = Math.max(0, window.scrollY);
      accumulatedDistance = 0;
      direction = null;
      if (!mediaQuery.matches || lastScrollY < TOP_EXPANDED_THRESHOLD) updateCollapsedState(false);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    mediaQuery.addEventListener('change', onBreakpointChange);
    onBreakpointChange();

    return () => {
      window.removeEventListener('scroll', onScroll);
      mediaQuery.removeEventListener('change', onBreakpointChange);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [mobileMediaQuery, routeKey]);

  return isCollapsed;
};
