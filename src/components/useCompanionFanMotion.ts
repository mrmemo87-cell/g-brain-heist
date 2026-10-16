import { useEffect, useRef } from 'react';

type FanTimeline = { play(): unknown; reverse(): unknown; progress(value: number): unknown; kill(): unknown };
/**
 * One reversible, lazy-loaded GSAP timeline. Keep the fan mounted so closing
 * retraces the opening instead of abruptly removing the controls.
 * CSS provides a fully functional animated fallback until GSAP is ready.
 */
export function useCompanionFanMotion(root: { current: HTMLDivElement | null }, enabled: boolean, open: boolean, side: string) {
 const timeline = useRef<FanTimeline | null>(null);
 const opened = useRef(open);
 opened.current = open;
 useEffect(() => {
  const element = root.current;
  if (!enabled || !element) return;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (media.matches) return;
  let cancelled = false;
  let revert: (() => void) | undefined;
  const stop = () => {
   cancelled = true;
   timeline.current?.kill();
   timeline.current = null;
   revert?.();
   element.classList.remove('has-gsap');
  };
  void import('gsap').then(({ gsap }) => {
   if (cancelled || media.matches || !element.isConnected) return;
   const context = gsap.context(() => {
    const buttons = gsap.utils.toArray<HTMLElement>('.companion-hub-option');
    const direction = side === 'left' ? -1 : 1;
    const animation = gsap.timeline({ paused: true, defaults: { overwrite: 'auto' } });
    animation.fromTo(buttons,
      { x: direction * 98, y: (index: number) => (index - 1.5) * 35, rotation: direction * 12,
        scale: .38, opacity: 0, filter: 'blur(7px)', transformOrigin: side === 'left' ? 'left center' : 'right center' },
      { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, filter: 'blur(0px)',
        duration: .43, ease: 'back.out(1.55)', stagger: { each: .045, from: 'start' } });
    timeline.current = animation;
    // Start from the closed state, then play forward even if it opened during
    // the async import. Reversals reuse the same timeline at its current time.
    animation.progress(0);
    element.classList.add('has-gsap');
    if (opened.current) animation.play();
   }, element);
   revert = () => context.revert();
  }).catch(() => { element.classList.remove('has-gsap'); });

  const motionChange = () => { if (media.matches) stop(); };
  const hidden = () => { if (document.visibilityState === 'hidden') timeline.current?.progress(opened.current ? 1 : 0); };
  media.addEventListener('change', motionChange);
  document.addEventListener('visibilitychange', hidden);
  return () => {
   stop();
   media.removeEventListener('change', motionChange);
   document.removeEventListener('visibilitychange', hidden);
  };
 }, [root, enabled, side]);

 useEffect(() => {
  if (open) timeline.current?.play();
  else timeline.current?.reverse();
 }, [open]);
}
