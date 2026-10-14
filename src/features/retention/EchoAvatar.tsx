import React, { useEffect, useRef, useState } from 'react';
import { echoAsset, type EchoPose } from './echoModel';

function FoxFallback() {
 return <svg viewBox="0 0 180 200" fill="none" aria-hidden="true"><path d="m35 87-8-67 46 40m34 0 45-40-8 67" fill="#243449" stroke="currentColor" strokeWidth="4"/><path d="M36 80q54-44 108 0v45q-54 43-108 0Z" fill="#182232" stroke="currentColor" strokeWidth="3"/><path d="M55 97q12-15 25 0m21 0q12-15 25 0m-51 23q15 15 30 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><path d="m52 139 27-9 42 10-15 47H70Z" fill="#243449"/><path d="m55 142 71 8-8 14-70-10Z" fill="#ff2d91"/><circle cx="90" cy="174" r="7" stroke="currentColor" strokeWidth="4"/></svg>;
}

const STRANDS: Record<EchoPose, { ears: string; tail: string; coat: string }> = {
 greeting: { ears: 'M183 33q-10 51 12 100m263-54q-4 38-32 75', tail: 'M48 297q35-30 77 1m-55 41q4 50 60 84', coat: 'M286 310q24 13 31 40m-47 61 13 25m51-36 12 34' },
 curious: { ears: 'M215 28q-24 42-21 108m253 22q-4 39-26 57', tail: 'M54 300q39-37 82-7m-60 48q-2 54 69 82', coat: 'M268 315q18 17 22 36m-48 77 10 33m64-29 15 26' },
 thinking: { ears: 'M107 91q17 20 44 67m194-111q15 48 3 98', tail: 'M124 394q26-33 51-48m-21 75q24 42 103 49', coat: 'M269 291q19 8 22 31m-44 49 39 18m43-26 22-10' },
 celebrate: { ears: 'M193 35q-14 46 6 98m247-56q-5 44-27 72', tail: 'M47 308q34-35 92-12m-66 56q18 70 97 62', coat: 'M269 306q22 12 29 40m-64 40 17 33m52-12 10 35' },
 cheer: { ears: 'M211 30q-14 43-5 99m238-27q-9 44-33 61', tail: 'M59 305q42-39 91-1m-57 52q18 70 91 65', coat: 'M285 288q20 20 20 48m-48 55 15 31m36-13 12 31' },
 keepsake: { ears: 'M191 39q-13 46 6 103m248-58q-4 40-25 80', tail: 'M62 311q31-38 83-12m-63 60q12 72 88 57', coat: 'M245 322q-9 14-1 31m91-8q17-9 21-29m-85 111 10 29m38-16 15 13' },
};

export default function EchoAvatar({ pose, floating = false, motion = true }: { pose: EchoPose; floating?: boolean; motion?: boolean }) {
 const root = useRef<HTMLSpanElement>(null); const [visible, setVisible] = useState(false); const [pageVisible, setPageVisible] = useState(() => typeof document !== 'undefined' && document.visibilityState !== 'hidden');
 const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [failed, setFailed] = useState(false); const [displayPose, setDisplayPose] = useState<EchoPose>('greeting');
 useEffect(() => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReduced(media.matches); const visibility = () => setPageVisible(document.visibilityState !== 'hidden');
  media.addEventListener('change', change); document.addEventListener('visibilitychange', visibility);
  let observer: IntersectionObserver | undefined;
  if (typeof IntersectionObserver !== 'undefined' && root.current) { observer = new IntersectionObserver(entries => setVisible(Boolean(entries[0]?.isIntersecting)), { threshold: .05 }); observer.observe(root.current); }
  else setVisible(true);
  return () => { observer?.disconnect(); media.removeEventListener('change', change); document.removeEventListener('visibilitychange', visibility); };
 }, []);
 useEffect(() => {
  // Only request an extra pose when it is needed on a visible surface.
  if (pose === 'greeting' || reduced) { setDisplayPose('greeting'); return; }
  if (!visible || !pageVisible) return;
  let active = true; const image = new Image(); image.onload = () => { if (active) { setFailed(false); setDisplayPose(pose); } }; image.onerror = () => { if (active) setDisplayPose('greeting'); }; image.src = echoAsset(pose);
  return () => { active = false; image.onload = null; image.onerror = null; };
 }, [pose, reduced, visible, pageVisible]);
 const strands = STRANDS[displayPose]; const source = echoAsset(displayPose); const moving = motion && visible && pageVisible && !reduced;
 return <span ref={root} className={`echo-avatar ${floating ? 'is-floating' : ''} ${moving ? 'is-moving' : ''}`} data-echo-pose={displayPose}>
  <span className="echo-pose-frame" key={source}>{failed ? <FoxFallback/> : <img src={source} width="512" height="512" loading="lazy" decoding="async" alt="" onError={() => { if (displayPose !== 'greeting') { setDisplayPose('greeting'); } else setFailed(true); }}/>}</span>
  {!failed ? <span className="echo-energy-mask" style={{ maskImage: `url("${source}")`, WebkitMaskImage: `url("${source}")` }} aria-hidden="true"><svg viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeLinecap="round" className="echo-energy-strands">
   <path className="echo-strand echo-strand-ear" d={strands.ears}/>
   <path className="echo-strand echo-strand-tail" d={strands.tail}/>
   <path className="echo-strand echo-strand-coat" d={strands.coat}/>

  </svg></span> : null}
 </span>;
}
