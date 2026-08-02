import { useCallback, useEffect, useRef } from 'react';

const TOP_EXPANDED_THRESHOLD = 40;
const DIRECT_SCROLL_PORTION = 2 / 3;
const HIDDEN_OPACITY = 0.82;
const NAVIGATION_PEEK_HEIGHT = 15;
const MIN_SETTLE_DURATION = 120;
const MAX_SETTLE_DURATION = 420;
const DEFAULT_SETTLE_DURATION = 280;
const SCROLL_SETTLE_DELAY = 140;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const easeOutCubic = (value: number) => 1 - ((1 - value) ** 3);

/**
 * Moves mobile navigation with the page for the first two thirds of its travel,
 * then preserves the incoming velocity while easing through the final third.
 * Transient motion is written to CSS variables to avoid rerendering a dashboard
 * on every scroll frame.
 */
export const useSmartCollapsedNavigation = (
  routeKey: string,
  mobileMediaQuery = '(max-width: 767px)',
) => {
  const navigationRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef(0);
  const settleFrameRef = useRef<number | null>(null);
  const settleTargetRef = useRef<number | null>(null);

  const getTravelDistance = useCallback(() => {
    const height = navigationRef.current?.getBoundingClientRect().height ?? 0;
    return Math.max(1, height - NAVIGATION_PEEK_HEIGHT);
  }, []);

  const applyProgress = useCallback((nextProgress: number) => {
    const progress = clamp(nextProgress, 0, 1);
    const navigation = navigationRef.current;
    progressRef.current = progress;

    if (!navigation) return;

    const fadeProgress = Math.min(progress / DIRECT_SCROLL_PORTION, 1);
    const opacity = 1 - ((1 - HIDDEN_OPACITY) * fadeProgress);
    const translateY = progress * getTravelDistance();

    navigation.style.setProperty('--smart-nav-translate-y', `${translateY.toFixed(2)}px`);
    navigation.style.setProperty('--smart-nav-opacity', opacity.toFixed(3));
    navigation.dataset['hidden'] = progress >= 0.985 ? 'true' : 'false';
    navigation.dataset['revealVisible'] = progress >= DIRECT_SCROLL_PORTION ? 'true' : 'false';
  }, [getTravelDistance]);

  const stopSettle = useCallback(() => {
    if (settleFrameRef.current !== null) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
    settleTargetRef.current = null;
  }, []);

  const animateTo = useCallback((target: number, incomingVelocity = 0) => {
    const boundedTarget = clamp(target, 0, 1);
    if (settleTargetRef.current === boundedTarget) return;

    stopSettle();

    const startProgress = progressRef.current ?? 0;
    if (Math.abs(startProgress - boundedTarget) < 0.001) {
      applyProgress(boundedTarget);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyProgress(boundedTarget);
      return;
    }

    const distance = Math.abs(boundedTarget - startProgress) * getTravelDistance();
    const velocityMatchedDuration = incomingVelocity > 0
      ? (3 * distance) / incomingVelocity
      : DEFAULT_SETTLE_DURATION;
    const duration = clamp(velocityMatchedDuration, MIN_SETTLE_DURATION, MAX_SETTLE_DURATION);
    let startedAt: number | null = null;
    settleTargetRef.current = boundedTarget;

    const settle = (timestamp: number) => {
      if (startedAt === null) startedAt = timestamp;
      const elapsed = timestamp - startedAt;
      const timeProgress = Math.min(1, elapsed / duration);
      const easedProgress = easeOutCubic(timeProgress);
      applyProgress(startProgress + ((boundedTarget - startProgress) * easedProgress));

      if (timeProgress < 1) {
        settleFrameRef.current = window.requestAnimationFrame(settle);
      } else {
        settleFrameRef.current = null;
        settleTargetRef.current = null;
        applyProgress(boundedTarget);
      }
    };

    settleFrameRef.current = window.requestAnimationFrame(settle);
  }, [applyProgress, getTravelDistance, stopSettle]);

  const revealNavigation = useCallback(() => {
    animateTo(0);
  }, [animateTo]);

  useEffect(() => {
    animateTo(0);

    const mediaQuery = window.matchMedia(mobileMediaQuery);
    let lastScrollY = Math.max(0, window.scrollY);
    let lastUpdateTime = performance.now();
    let scrollFrame: number | null = null;
    let scrollSettleTimer: number | null = null;

    const settleInterruptedGesture = () => {
      scrollSettleTimer = null;
      if (!mediaQuery.matches || window.scrollY < TOP_EXPANDED_THRESHOLD) {
        animateTo(0);
        return;
      }

      const progress = progressRef.current ?? 0;
      if (progress <= 0.001 || progress >= 0.999) return;
      animateTo(progress >= DIRECT_SCROLL_PORTION ? 1 : 0);
    };

    const scheduleScrollSettle = () => {
      if (scrollSettleTimer !== null) window.clearTimeout(scrollSettleTimer);
      scrollSettleTimer = window.setTimeout(settleInterruptedGesture, SCROLL_SETTLE_DELAY);
    };

    const update = (timestamp: number) => {
      scrollFrame = null;
      const scrollY = Math.max(0, window.scrollY);

      if (!mediaQuery.matches || scrollY < TOP_EXPANDED_THRESHOLD) {
        lastScrollY = scrollY;
        lastUpdateTime = timestamp;
        animateTo(0);
        return;
      }

      const delta = scrollY - lastScrollY;
      const elapsed = Math.max(8, timestamp - lastUpdateTime);
      lastScrollY = scrollY;
      lastUpdateTime = timestamp;
      if (delta === 0) return;

      const travelDistance = getTravelDistance();
      const currentOffset = (progressRef.current ?? 0) * travelDistance;

      if (delta < 0) {
        stopSettle();
        applyProgress((Math.max(0, currentOffset + delta)) / travelDistance);
        return;
      }

      const directScrollLimit = travelDistance * DIRECT_SCROLL_PORTION;
      if (currentOffset < directScrollLimit) {
        stopSettle();
        const nextOffset = Math.min(directScrollLimit, currentOffset + delta);
        applyProgress(nextOffset / travelDistance);
        if (nextOffset < directScrollLimit) return;
      }

      animateTo(1, Math.abs(delta) / elapsed);
    };

    const onScroll = () => {
      if (scrollFrame === null) {
        scrollFrame = window.requestAnimationFrame(timestamp => {
          update(timestamp);
          scheduleScrollSettle();
        });
      }
    };

    const onBreakpointChange = () => {
      lastScrollY = Math.max(0, window.scrollY);
      lastUpdateTime = performance.now();
      if (!mediaQuery.matches || lastScrollY < TOP_EXPANDED_THRESHOLD) animateTo(0);
    };

    const onResize = () => applyProgress(progressRef.current ?? 0);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    mediaQuery.addEventListener('change', onBreakpointChange);
    onBreakpointChange();
    applyProgress(progressRef.current ?? 0);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      mediaQuery.removeEventListener('change', onBreakpointChange);
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      if (scrollSettleTimer !== null) window.clearTimeout(scrollSettleTimer);
      stopSettle();
    };
  }, [animateTo, applyProgress, mobileMediaQuery, routeKey, stopSettle]);

  return { navigationRef, revealNavigation };
};
