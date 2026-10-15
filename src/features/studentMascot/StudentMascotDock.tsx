import React, { useEffect, useRef, useState } from 'react';
import type { AnimationAction } from 'three';
import './StudentMascotDock.css';

type ActionName = 'idle' | 'cheer' | 'angry' | 'greet' | 'box' | 'clap';
const MODEL = '/mascot/brains-heist-neon-cat.glb';
const poster = '/retention/heist-companion-v1.webp';
const keyFor = (id: string) => `bh:student-mascot:hidden:v1:${id}`;
const isHidden = (id: string) => { try { return localStorage.getItem(keyFor(id)) === '1'; } catch { return false; } };
const clipForPose = (pose: string): ActionName => pose === 'cheer' || pose === 'celebrate' ? 'cheer' : pose === 'keepsake' ? 'clap' : pose === 'thinking' || pose === 'curious' ? 'box' : 'greet';

export default function StudentMascotDock({ userId }: { userId: string }) {
  const [hidden, setHidden] = useState(() => isHidden(userId));
  const [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<{ play: (name: ActionName) => void; dispose: () => void } | null>(null);

  useEffect(() => setHidden(isHidden(userId)), [userId]);
  useEffect(() => {
    const callback = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; pose?: string }>).detail;
      if (detail?.userId === userId && detail.pose) controller.current?.play(clipForPose(detail.pose));
    };
    window.addEventListener('bh:echo-activity', callback);
    return () => window.removeEventListener('bh:echo-activity', callback);
  }, [userId]);

  useEffect(() => {
    if (hidden || !canvas.current || !host.current) return;
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
        for (const [name, prefix] of [['idle','idle'],['cheer','cheer'],['angry','angry_03'],['greet','greet_03'],['box','box_01'],['clap','clap']] as const) {
          const clip = gltf.animations.find(a => a.name.toLowerCase().startsWith(prefix));
          if (clip) actions.set(name, mixer.clipAction(clip));
        }
        const idle = actions.get('idle');
        idle?.setLoop(THREE.LoopRepeat, Infinity); idle?.play();
        let current = idle;
        const play = (name: ActionName) => {
          if (document.hidden) return;
          const action = actions.get(name) ?? idle;
          if (!action || action === current && name !== 'idle') return;
          if (current !== action) current?.fadeOut(.18);
          action.reset().fadeIn(.18);
          if (name !== 'idle') { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
          else action.setLoop(THREE.LoopRepeat, Infinity);
          action.play(); current = action;
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
        const start = () => { if (visible && !document.hidden && !frame) { clock.getDelta(); frame=requestAnimationFrame(draw); } };
        const pause = () => { cancelAnimationFrame(frame); frame=0; };
        const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { visible = Boolean(entries[0]?.isIntersecting); if (visible) start(); else pause(); }) : null;
        observer?.observe(stage);
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const visibility = () => { if (document.hidden || media?.matches) pause(); else start(); };
        document.addEventListener('visibilitychange', visibility); media?.addEventListener?.('change', visibility);
        if (media?.matches) { renderer.render(scene, camera); } else start();
        const dispose = () => {
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
  }, [hidden, userId]);

  const toggle = (value: boolean) => { setHidden(value); try { if (value) localStorage.setItem(keyFor(userId), '1'); else localStorage.removeItem(keyFor(userId)); } catch {} };
  return <aside className={`student-mascot-dock${hidden ? ' is-hidden' : ''}`} data-student-mascot aria-label="Brains Heist mascot" lang="en" dir="ltr">
    {hidden ? <button className="student-mascot-return" type="button" onClick={() => toggle(false)}>🐱 Show mascot</button> :
      <><div className="student-mascot-stage" ref={host}>
        <canvas ref={canvas} data-companion-canvas="3d" className={ready ? 'ready' : ''} aria-hidden="true"/>
        {!ready && <img src={poster} alt="" className="student-mascot-poster" draggable={false}/>}
        <button className="student-mascot-touch" type="button" aria-label="Greet Brains Heist mascot" onClick={() => controller.current?.play('greet')}/>
      </div><button className="student-mascot-close" type="button" aria-label="Hide mascot" onClick={() => toggle(true)}>×</button></>}
  </aside>;
}
