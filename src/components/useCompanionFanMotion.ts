import { useEffect, useRef } from 'react';

type FanTimeline = { play(): unknown; reverse(): unknown; progress(value: number): unknown };
/** One lazy, reversible timeline; CSS remains usable if animation loading fails. */
export function useCompanionFanMotion(root: { current: HTMLDivElement | null }, enabled: boolean, open: boolean, side: string) {
 const timeline = useRef<FanTimeline | null>(null);
 const opened = useRef(open); opened.current = open;
 useEffect(() => {
  if (!enabled || !root.current) return;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (media.matches) return;
  const element = root.current;
  let cancelled = false; let revert: (() => void) | undefined;
  const stop = () => { cancelled = true; timeline.current = null; revert?.(); element.classList.remove('has-gsap'); };
  const hidden = () => { if (document.visibilityState === 'hidden') stop(); };
  void import('gsap').then(({ gsap }) => {
   if (cancelled || media.matches) return;
   element.classList.add('has-gsap');
   const context = gsap.context(() => {
    const animation = gsap.timeline({ paused: true }).fromTo('.companion-hub-option',
     { x: side === 'left' ? -116 : 116, y: (index: number) => (1.5 - index) * 54, scale: .55, opacity: 0 },
     { x: 0, y: 0, scale: 1, opacity: 1, duration: .32, stagger: .035, ease: 'power3.out' });
    timeline.current = animation;
    animation.progress(opened.current ? 1 : 0);
   }, element);
   revert = () => context.revert();
  }).catch(() => { element.classList.remove('has-gsap'); });
  media.addEventListener('change', stop); document.addEventListener('visibilitychange', hidden);
  return () => { stop(); media.removeEventListener('change', stop); document.removeEventListener('visibilitychange', hidden); };
 }, [root, enabled, side]);
 useEffect(() => { if (open) timeline.current?.play(); else timeline.current?.reverse(); }, [open]);
}
