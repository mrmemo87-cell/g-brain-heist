import React, { useEffect, useRef, useState } from 'react';
import EchoAvatar from './EchoAvatar';
import type { EchoPose } from './echoModel';
import type { CompanionPalette } from './companionModel';
import type { Echo3DRenderer } from './echo3dRenderer';

export const ECHO_3D_PILOT = 'b30e9c28-96f1-4d34-83e9-9b28b4926f42';
export function readEcho3DPreference(userId: string): boolean {
 if (userId !== ECHO_3D_PILOT) return false;
 try { return localStorage.getItem(`bh:echo-3d:v1:${userId}`) !== '0'; } catch { return true; }
}
/** One visible model surface; the existing artwork remains the load/error fallback. */
export default function Echo3DAvatar({ pose, palette }: { pose: EchoPose; palette: CompanionPalette }) {
 const canvas = useRef<HTMLCanvasElement>(null); const renderer = useRef<Echo3DRenderer | null>(null);
 const latest = useRef({ pose, palette }); latest.current = { pose, palette };
 const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
 useEffect(() => {
  let alive = true; let loading = false; let inView = typeof IntersectionObserver === 'undefined';
  const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout> | undefined;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const visible = () => inView && document.visibilityState !== 'hidden';
  const fail = () => { if (!alive) return; renderer.current?.dispose(); renderer.current = null; setStatus('failed'); };
  const load = async () => {
   if (loading || !visible() || !canvas.current) return; loading = true;
   timeout = setTimeout(() => controller.abort(), 12000);
   try {
    const [module, response] = await Promise.all([import('./echo3dRenderer.js'), fetch('/retention/gulla-prototype-v1.glb', { signal: controller.signal })]);
    if (!response.ok) throw Error('Character unavailable');
    const buffer = await response.arrayBuffer(); if (!alive || !canvas.current) return;
    const api = module.createEcho3DRenderer(canvas.current, buffer, { palette: latest.current.palette, reduced: media.matches, onError: fail });
    renderer.current = api; api.setVisible(visible()); api.setPose(latest.current.pose); setStatus('ready');
   } catch { fail(); } finally { if (timeout) clearTimeout(timeout); }
  };
  const visibility = () => { renderer.current?.setVisible(visible()); if (visible()) void load(); };
  const motion = () => renderer.current?.setReduced(media.matches);
  const resize = () => renderer.current?.setPalette(latest.current.palette);
  const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { inView = Boolean(entries[0]?.isIntersecting); visibility(); }, { threshold: .05 }) : null;
  if (canvas.current) observer?.observe(canvas.current);
  document.addEventListener('visibilitychange', visibility); media.addEventListener('change', motion); window.addEventListener('resize', resize);
  void load();
  return () => { alive = false; controller.abort(); if (timeout) clearTimeout(timeout); observer?.disconnect(); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', motion); window.removeEventListener('resize', resize); renderer.current?.dispose(); renderer.current = null; };
 }, []);
 useEffect(() => { renderer.current?.setPose(pose); }, [pose]);
 useEffect(() => { renderer.current?.setPalette(palette); }, [palette]);
 return <span className="echo-3d-avatar" data-echo-3d={status}>
  <canvas ref={canvas} className={status === 'ready' ? 'is-ready' : ''} aria-hidden="true"/>
  {status !== 'ready' ? <EchoAvatar pose={pose} motion={false}/> : null}
  <span className="language-dock-sr" role="status">{status === 'failed' ? '3D preview unavailable. Showing the original character.' : status === 'loading' ? 'Loading 3D companion.' : '3D companion ready.'}</span>
 </span>;
}
