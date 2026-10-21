import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AnimationAction } from 'three';
import { useFloatingCompanion } from '../../contexts/FloatingCompanionContext';
import { MASCOT_MOMENT_EVENT, mascotMotionReduced, type MascotMomentDetail } from './mascotMoments';
import './StudentMascotDock.css';

type ActionName = 'idle' | 'cheer' | 'angry' | 'greet' | 'box' | 'clap' | 'warmup' | 'dance' | 'dance2' | 'flip';
// v2 adds warm-up, two dances and a backflip; the query busts old cached copies.
const MODEL = '/mascot/brains-heist-neon-cat.glb?v=2';
const poster = '/retention/heist-companion-v1.webp';
const keyFor = (id: string) => `bh:student-mascot:hidden:v1:${id}`;
const isHidden = (id: string) => { try { return localStorage.getItem(keyFor(id)) === '1'; } catch { return false; } };
const clipForPose = (pose: string): ActionName => pose === 'cheer' || pose === 'celebrate' ? 'cheer' : pose === 'keepsake' ? 'clap' : pose === 'thinking' || pose === 'curious' ? 'box' : 'greet';

function MascotAvatar({ userId }: { userId: string }) {
  const [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<{ play: (name: ActionName, seconds?: number) => void; dispose: () => void } | null>(null);

  useEffect(() => {
    const callback = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; pose?: string }>).detail;
      if (detail?.userId === userId && detail.pose) { controller.current?.play(clipForPose(detail.pose)); }
    };
    window.addEventListener('bh:echo-activity', callback);
    return () => window.removeEventListener('bh:echo-activity', callback);
  }, [userId]);

  useEffect(() => {
    if (!canvas.current || !host.current) return;
    let cancelled = false, frame = 0;
    const abort = new AbortController();
    const element = canvas.current, stage = host.current;
    let cleanup = () => {};
    setReady(false);
    void (async () => {
      try {
        const [THREE, { GLTFLoader }, response] = await Promise.all([
          import('three'), import('three/addons/loaders/GLTFLoader.js'),
          fetch(MODEL, { signal: abort.signal }),
        ]);
        if (!response.ok) throw Error('Mascot model missing');
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/mascot/');
        if (cancelled) return;
        const renderer = new THREE.WebGLRenderer({ canvas: element, alpha: true, antialias: false, powerPreference: 'low-power' });
        renderer.setClearColor(0, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xd4faff, 0x24182d, 2));
        const light = new THREE.DirectionalLight(0xffffff, 2.5);
        light.position.set(2, 3, 4); scene.add(light);
        scene.add(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const scale = 1.6 / Math.max(0.001, bounds.getSize(new THREE.Vector3()).y);
        gltf.scene.scale.multiplyScalar(scale);
        gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale));
        const camera = new THREE.PerspectiveCamera(40, 1, .1, 20);
        camera.position.set(0, .05, 2.65); camera.lookAt(0, 0, 0);
        const mixer = new THREE.AnimationMixer(gltf.scene);
        const actions = new Map<ActionName, AnimationAction>();
        for (const [name, prefix] of [['idle','idle'],['cheer','cheer'],['angry','angry_03'],['greet','greet_03'],['box','box_01'],['clap','clap'],['warmup','warm_up'],['dance','dance_03'],['dance2','dance_05'],['flip','flip']] as const) {
          const clip = gltf.animations.find(a => a.name.toLowerCase().startsWith(prefix));
          if (clip) actions.set(name, mixer.clipAction(clip));
        }
        const idle = actions.get('idle');
        idle?.setLoop(THREE.LoopRepeat, Infinity); idle?.play();
        let current = idle;
        let backToIdle = 0;
        const play = (name: ActionName, seconds?: number) => {
          if (document.hidden) return;
          window.clearTimeout(backToIdle);
          const action = actions.get(name) ?? idle;
          if (!action || action === current && name !== 'idle') return;
          if (current !== action) current?.fadeOut(.18);
          action.reset().fadeIn(.18);
          if (name !== 'idle') { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
          else action.setLoop(THREE.LoopRepeat, Infinity);
          action.play(); current = action;
          // Long clips (cheer, clap, warm-up) are cut to a short reaction.
          if (seconds && name !== 'idle') backToIdle = window.setTimeout(() => play('idle'), seconds * 1000);
        };
        const done = (event: { action: AnimationAction }) => { if (event.action === current) play('idle'); };
        mixer.addEventListener('finished', done);
        const size = () => { const w = Math.max(stage.clientWidth, 1), h = Math.max(stage.clientHeight, 1); camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };
        size();
        const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
        resize?.observe(stage);
        const clock = new THREE.Clock();
        let lastFrame = 0, visible = true;
        const draw = (t: number) => {
          frame = 0;
          if (!visible || document.hidden) { clock.getDelta(); return; }
          if (t - lastFrame >= 1000/30) { mixer.update(Math.min(.08, clock.getDelta())); renderer.render(scene, camera); lastFrame=t; }
          frame = requestAnimationFrame(draw);
        };
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const start = () => { if (visible && !document.hidden && !media?.matches && !frame) { clock.getDelta(); frame=requestAnimationFrame(draw); } };
        const pause = () => { cancelAnimationFrame(frame); frame=0; };
        const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { visible = Boolean(entries[0]?.isIntersecting); if (visible) start(); else pause(); }) : null;
        observer?.observe(stage);
        const visibility = () => { if (document.hidden || media?.matches) { pause(); if (!document.hidden && media?.matches) renderer.render(scene, camera); } else start(); };
        document.addEventListener('visibilitychange', visibility); media?.addEventListener?.('change', visibility);
        if (media?.matches) { renderer.render(scene, camera); } else start();
        // Reactions to things the student does (see mascotMoments.ts).
        let celebrating = false;
        const timers: number[] = [];
        const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
        const moment = (event: Event) => {
          const detail = (event as CustomEvent<MascotMomentDetail>).detail;
          if (!detail || media?.matches || document.hidden) return; // no animation loop in reduced motion
          if (detail.moment === 'mission-complete') {
            if (celebrating) return;
            if (mascotMotionReduced()) { play('flip'); return; } // performance mode: pose only, in its corner
            celebrating = true;
            let finish: () => void = () => {};
            detail.claim?.(new Promise<void>(resolve => { finish = resolve; }));
            const box = stage.getBoundingClientRect();
            const dx = window.innerWidth / 2 - (box.left + box.width / 2);
            const dy = window.innerHeight * 0.42 - (box.top + box.height / 2);
            const grow = Math.min(2.6, (Math.min(window.innerWidth, window.innerHeight) * 0.6) / Math.max(box.width, 1));
            renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * grow, 4)); size();
            stage.classList.add('is-celebrating');
            stage.style.transform = `translate(${dx}px, ${dy}px) scale(${grow})`;
            later(300, () => play('flip'));
            later(4600, () => { stage.style.transform = ''; });
            later(5250, () => {
              stage.classList.remove('is-celebrating');
              renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); size();
              celebrating = false; finish();
            });
            return;
          }
          if (celebrating) return;
          if (detail.moment === 'mission-start') play('warmup', 7);
          else if (detail.moment === 'correct') play('dance2');
          else if (detail.moment === 'wrong') play('greet', 2.6); // a friendly wave, never the angry clip
          else if (detail.moment === 'climb') play('cheer', 3);
        };
        window.addEventListener(MASCOT_MOMENT_EVENT, moment);
        const dispose = () => {
          window.removeEventListener(MASCOT_MOMENT_EVENT, moment);
          timers.forEach(id => window.clearTimeout(id)); window.clearTimeout(backToIdle);
          stage.classList.remove('is-celebrating'); stage.style.transform = '';
          pause(); observer?.disconnect(); resize?.disconnect();
          document.removeEventListener('visibilitychange', visibility); media?.removeEventListener?.('change', visibility);
          mixer.removeEventListener('finished', done); mixer.stopAllAction();
          gltf.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
            for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
              for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
              m.dispose();
            }
          });
          renderer.dispose(); renderer.forceContextLoss();
        };
        cleanup = dispose;
        controller.current = {play, dispose};
        if (cancelled) { dispose(); return; }
        renderer.render(scene, camera); setReady(true);
      } catch { if (!cancelled) setReady(false); }
    })();
    return () => { cancelled = true; abort.abort(); cleanup(); controller.current = null; };
  }, [userId]);


 return <span ref={host} className="student-mascot-hub-avatar" data-student-mascot aria-label="Animated Brains Heist cat"><span className="student-mascot-float">
   <canvas ref={canvas} data-companion-canvas="3d" className={ready ? 'ready' : ''} aria-hidden="true"/>
   {!ready && <img src={poster} className="student-mascot-poster" alt="" draggable={false}/>}
 </span></span>;
}
function findHomeAction(label: string) {
 const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.retention-companion-world button'))
   .find(item => item.textContent?.includes(label));
 if (button) {
   const details = button.closest('details');
   if (details) details.open = true;
   button.click();
   button.scrollIntoView({block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
   return true;
 }
 return false;
}
function openHomeAction(label: string) {
 if (findHomeAction(label)) return;
 const home = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
   .find(item => item.textContent?.trim() === 'Home' || item.getAttribute('aria-label')?.toLowerCase() === 'home');
 home?.click();
 let attempts = 0;
 const locate = () => { if (!findHomeAction(label) && ++attempts < 12) window.setTimeout(locate, 180); };
 window.setTimeout(locate, 180);
}
export default function StudentMascotDock({userId}: {userId:string}) {
 const {register} = useFloatingCompanion();
 const [tucked,setTucked] = useState(() => isHidden(userId));
 useEffect(() => setTucked(isHidden(userId)), [userId]);
 const companion = useMemo(() => ({
   name:'Neon Cat', palette:'cyan',
   avatar:<MascotAvatar userId={userId}/>,
   greet:() => window.dispatchEvent(new CustomEvent('bh:echo-activity',{detail:{userId,pose:'greeting'}})),
   personalise:() => openHomeAction('Name & personalise'),
   keepsakes:() => openHomeAction('Our keepsakes'),
   tuck:() => {try{localStorage.setItem(keyFor(userId),'1');}catch{} setTucked(true);},
 }),[userId]);
 useEffect(() => {
   register(tucked ? null : companion);
   return () => register(null);
 },[register,companion,tucked]);
 if (!tucked) return null;
 return <button type="button" className="student-mascot-restore" onClick={() => {
   try{localStorage.removeItem(keyFor(userId));}catch{}
   setTucked(false);
 }}>🐱 Bring back mascot</button>;
}
