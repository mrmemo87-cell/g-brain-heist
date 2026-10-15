import React, { useEffect, useRef, useState } from 'react';
import EchoAvatar from './EchoAvatar';
import type { EchoPose } from './echoModel';
import type { CompanionPalette } from './companionModel';
import type { Echo3DRenderer } from './echo3dRenderer';

export const ECHO_3D_PILOT = 'b30e9c28-96f1-4d34-83e9-9b28b4926f42';
export type Echo3DState = { status: 'loading' | 'ready' | 'failed'; reason?: 'network' | 'timeout' | 'device' | 'render' };
export function readEcho3DPreference(userId: string): boolean {
 if (userId !== ECHO_3D_PILOT) return false;
 try { return localStorage.getItem(`bh:echo-3d:v1:${userId}`) !== '0'; } catch { return true; }
}
/** Observe the visible wrapper, never the transparent loading canvas. */
export default function Echo3DAvatar({ pose, palette, retry = 0, onState }: { pose: EchoPose; palette: CompanionPalette; retry?: number; onState?: (state: Echo3DState) => void }) {
 const root = useRef<HTMLSpanElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const renderer = useRef<Echo3DRenderer | null>(null);
 const latest = useRef({ pose, palette, onState }); latest.current = { pose, palette, onState };
 const [state, setState] = useState<Echo3DState>({ status: 'loading' });
 useEffect(() => {
  let alive = true; let loading = false; let loaded = false; let timedOut = false; let phase: 'network' | 'render' = 'network';
  const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout> | undefined;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const inViewport = () => {
   const r = root.current?.getBoundingClientRect(); const v = window.visualViewport;
   const top = v?.offsetTop ?? 0, left = v?.offsetLeft ?? 0;
   return Boolean(r && r.width > 0 && r.height > 0 && r.bottom > top && r.top < top + (v?.height ?? window.innerHeight) && r.right > left && r.left < left + (v?.width ?? window.innerWidth));
  };
  let inView = inViewport();
  const visible = () => inView && document.visibilityState !== 'hidden';
  const report = (next: Echo3DState) => { if (!alive) return; setState(next); latest.current.onState?.(next); };
  report({ status: 'loading' });
  const fail = (reason: Echo3DState['reason']) => { if (!alive) return; renderer.current?.dispose(); renderer.current = null; report({ status: 'failed', reason }); };
  const load = async () => {
   if (loading || loaded || !visible() || !canvas.current) return; loading = true;
   let rejectTimeout: ((reason: Error) => void) | undefined;
   const deadline = new Promise<never>((_, reject) => { rejectTimeout = reject; });
   timeout = setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout?.(Error('3D load timeout')); }, 30000);
   try {
    const [module, buffer] = await Promise.race([Promise.all([
     import('./echo3dRenderer.js'),
     fetch('/retention/gulla-prototype-v1.glb', { signal: controller.signal }).then(response => { if (!response.ok) throw Error('Character unavailable'); return response.arrayBuffer(); }),
    ]), deadline]);
    if (!alive || !canvas.current) return; phase = 'render';
    const api = module.createEcho3DRenderer(canvas.current, buffer, {
     palette: latest.current.palette, reduced: media.matches,
     onError: () => fail('render'),
     onReady: () => { loaded = true; report({ status: 'ready' }); },
    });
    renderer.current = api; api.setVisible(visible()); api.setPose(latest.current.pose);
   } catch (error) { controller.abort(); fail(timedOut ? 'timeout' : error instanceof Error && error.message === '3D unavailable' ? 'device' : phase); }
   finally { if (timeout) clearTimeout(timeout); }
  };
  const visibility = () => { renderer.current?.setVisible(visible()); if (visible()) void load(); };
  const measure = () => { inView = inViewport(); visibility(); };
  const motion = () => renderer.current?.setReduced(media.matches);
  const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { inView = Boolean(entries[0]?.isIntersecting); visibility(); }, { threshold: .01 }) : null;
  if (root.current) observer?.observe(root.current);
  document.addEventListener('visibilitychange', visibility); media.addEventListener('change', motion);
  window.addEventListener('resize', measure); window.addEventListener('scroll', measure, { passive: true }); window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
  // Layout can settle after a floating hub registers; do not depend on an IO notification.
  const measuredFrame = requestAnimationFrame(measure); void load();
  return () => { alive = false; controller.abort(); cancelAnimationFrame(measuredFrame); if (timeout) clearTimeout(timeout); observer?.disconnect(); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', motion); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure); renderer.current?.dispose(); renderer.current = null; };
 }, [retry]);
 useEffect(() => { renderer.current?.setPose(pose); }, [pose]);
 useEffect(() => { renderer.current?.setPalette(palette); }, [palette]);
 return <span ref={root} className="echo-3d-avatar" data-echo-3d={state.status}>
  <canvas key={retry} ref={canvas} className={state.status === 'ready' ? 'is-ready' : ''} aria-hidden="true"/>
  {state.status !== 'ready' ? <EchoAvatar pose={pose} motion={false}/> : null}
  <span className="language-dock-sr" role="status">{state.status === 'failed' ? '3D preview unavailable. Showing the original character.' : state.status === 'loading' ? 'Loading 3D companion.' : '3D companion ready.'}</span>
 </span>;
}
