import { useCallback, useRef } from 'react';
import { pushBackHandler } from '../../native/backHandlers';

/**
 * Bottom sheets close the way phone users expect: pull the sheet down (from its grip, or anywhere once it
 * is scrolled to the top), or press Android back in the app. Returns a callback ref for the sheet element,
 * so it also works for a sheet that is shown and hidden inside a page. Without onClose the sheet stays put.
 */
export function useSheetDismiss<T extends HTMLElement>(onClose: (() => void) | undefined) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((sheet: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (sheet && closeRef.current) cleanupRef.current = attach(sheet, () => closeRef.current?.());
  }, []);
}

function attach(sheet: HTMLElement, close: () => void): () => void {
  const removeBack = pushBackHandler(() => { close(); return true; }, 'overlay');
  const backdrop = sheet.parentElement;
  let y0 = 0;
  let t0 = 0;
  let fromTop = false;
  let dragging = false;
  let dy = 0;
  let closing = false;

  const set = (offset: number, animate: boolean) => {
    sheet.style.transition = animate ? 'transform .2s cubic-bezier(.2, .8, .3, 1)' : 'none';
    sheet.style.transform = offset ? `translateY(${offset}px)` : '';
    if (backdrop) {
      backdrop.style.transition = animate ? 'opacity .2s ease-out' : 'none';
      backdrop.style.opacity = String(Math.max(0.25, 1 - offset / Math.max(sheet.offsetHeight, 1)));
    }
  };

  const onStart = (e: TouchEvent) => {
    if (closing || e.touches.length !== 1) return;
    const touch = e.touches[0]!;
    y0 = touch.clientY;
    t0 = performance.now();
    dy = 0;
    dragging = false;
    // The grip strip at the top always drags; the rest only when the sheet is scrolled to the top.
    fromTop = touch.clientY - sheet.getBoundingClientRect().top < 48 || sheet.scrollTop <= 0;
  };
  const onMove = (e: TouchEvent) => {
    if (closing || !fromTop) return;
    dy = e.touches[0]!.clientY - y0;
    if (!dragging) {
      if (dy > 8 && (sheet.scrollTop <= 0 || y0 - sheet.getBoundingClientRect().top < 48)) {
        dragging = true;
        sheet.style.animation = 'none'; // the opening animation would otherwise pin the position
      } else {
        if (dy < -4) fromTop = false; // scrolling up: let the content scroll
        return;
      }
    }
    e.preventDefault();
    set(Math.max(0, dy - 8), false);
  };
  const onEnd = () => {
    if (!dragging || closing) return;
    dragging = false;
    const velocity = dy / Math.max(1, performance.now() - t0);
    if (dy > Math.min(140, sheet.offsetHeight * 0.25) || velocity > 0.6) {
      closing = true;
      set(sheet.offsetHeight + 40, true);
      window.setTimeout(close, 190);
    } else {
      set(0, true);
    }
  };

  sheet.addEventListener('touchstart', onStart, { passive: true });
  sheet.addEventListener('touchmove', onMove, { passive: false });
  sheet.addEventListener('touchend', onEnd);
  sheet.addEventListener('touchcancel', onEnd);
  return () => {
    removeBack();
    sheet.removeEventListener('touchstart', onStart);
    sheet.removeEventListener('touchmove', onMove);
    sheet.removeEventListener('touchend', onEnd);
    sheet.removeEventListener('touchcancel', onEnd);
  };
}
