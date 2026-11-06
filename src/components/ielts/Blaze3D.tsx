import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { blazeLook, type EffectsLevel } from '../../lib/appEffects';
import { haptic } from '../../native/effects/haptics';
import { playSfx } from '../../native/effects/sfx';
import { playBrandSound } from '../../native/effects/brandSounds';
import { createPresenter } from './presentCanvas';

/**
 * Blaze in real-time 3D for the installed app (IELTS Visual & UX Bible §14): the animated Blaze character
 * (rigged model with idle, jump, cheer, dance, sad, greet, laugh and clap) with glow, flickering ground light
 * and rising embers. He leans when the phone tilts, reacts with a move, a sound and a vibration when tapped,
 * grows with the streak, celebrates on milestones and droops in the evening when the streak is at risk.
 * Loaded lazily and only through <BlazeLive>, which falls back to the SVG Blaze everywhere else.
 */
export interface Blaze3DProps {
  size: number;
  streak: number;
  mood: 'happy' | 'sleepy' | 'cheer' | 'weak';
  level: EffectsLevel;
  interactive?: boolean;
  label?: string;
}

const MODEL = '/mascot/brains-heist-blaze.glb?v=1';

type Clip = 'idle' | 'jump' | 'cheer' | 'dance' | 'sad' | 'greet' | 'laugh' | 'clap';
const CLIP_PREFIX: Record<Clip, string> = {
  idle: 'idle', jump: 'jump', cheer: 'cheer', dance: 'dance_03', sad: 'depressed', greet: 'greet_01', laugh: 'laugh_01', clap: 'clap',
};

// One download per session; each Blaze on screen gets its own skinned copy.
let modelPromise: Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> | null = null;
function loadModel() {
  modelPromise ??= (async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const response = await fetch(MODEL);
    if (!response.ok) throw Error('Blaze model missing');
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/mascot/');
    return { scene: gltf.scene, animations: gltf.animations };
  })().catch((error) => { modelPromise = null; throw error; });
  return modelPromise;
}

function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const disposeAll = (obj: THREE.Object3D) => obj.traverse((o) => {
  const m = o as THREE.Mesh;
  m.geometry?.dispose?.();
  const mat = m.material as THREE.Material | THREE.Material[] | undefined;
  (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
    (x as THREE.MeshBasicMaterial).map?.dispose?.();
    x.dispose();
  });
});

let tiltPermissionAsked = false;
async function askTiltPermissionOnce(): Promise<void> {
  if (tiltPermissionAsked) return;
  tiltPermissionAsked = true;
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  try { await D?.requestPermission?.(); } catch { /* iPhone may refuse; Blaze just does not lean */ }
}

export default function Blaze3D({ size, streak, mood, level, interactive = false, label }: Blaze3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const flareRef = useRef<(() => void) | null>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const full = level === 'full';
    const look = blazeLook(streak);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: full, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the wrapper's still Blaze stays visible underneath
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, full ? 2 : 1.5));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    const presenter = createPresenter(host, renderer.domElement);
    if (!presenter) { renderer.dispose(); return; }
    // The still Blaze underneath is hidden only once a frame is proven to show the flame (see tick):
    // some phone GPUs create a WebGL canvas but draw nothing, and Blaze must never disappear.
    let verified = false;
    let checks = 0;
    const onLost = (e: Event) => { e.preventDefault(); delete host.dataset['ready']; };
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.7, 7.6);
    camera.lookAt(0, 0.6, 0);

    const rig = new THREE.Group();
    rig.scale.setScalar(look.scale);
    scene.add(rig);

    // Ground light: a warm pool under Blaze that breathes with the flame.
    const groundTex = radialTexture('rgba(255,170,60,0.85)', 'rgba(255,120,0,0)');
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), new THREE.MeshBasicMaterial({ map: groundTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ground.position.set(0, -1.05, 0.2);
    ground.rotation.x = -Math.PI / 2.4;
    rig.add(ground);

    // Halo: soft light around the whole flame.
    const haloMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(255,200,90,0.75)', 'rgba(255,90,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    haloMat.color = new THREE.Color(look.outer);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(3.1, 3.5, 1);
    halo.position.y = 0.35;
    if (full) rig.add(halo);

    const body = new THREE.Group();
    rig.add(body);
    scene.add(new THREE.HemisphereLight(0xfff1d6, 0x3a1a0a, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(1.5, 3, 5);
    scene.add(keyLight);

    // The character arrives asynchronously; until then (and if it never does) the still Blaze stays visible.
    let mixer: THREE.AnimationMixer | null = null;
    let model: THREE.Object3D | null = null;
    const actions = new Map<Clip, THREE.AnimationAction>();
    let current: THREE.AnimationAction | null = null;
    let backToBase = 0;
    const baseClip = (): Clip => {
      const m = moodRef.current;
      return m === 'weak' || m === 'sleepy' ? 'sad' : m === 'cheer' ? 'cheer' : 'idle';
    };
    const play = (name: Clip, seconds?: number) => {
      const action = actions.get(name) ?? actions.get('idle');
      if (!action) return;
      window.clearTimeout(backToBase);
      const isBase = name === baseClip();
      if (action !== current) { current?.fadeOut(0.2); action.reset().fadeIn(0.2); }
      else if (!isBase) action.reset();
      action.setLoop(isBase ? THREE.LoopRepeat : THREE.LoopOnce, isBase ? Infinity : 1);
      action.clampWhenFinished = !isBase;
      action.play();
      current = action;
      if (!isBase && seconds) backToBase = window.setTimeout(() => play(baseClip()), seconds * 1000);
    };
    let disposed = false;
    void loadModel().then(async ({ scene: template, animations }) => {
      if (disposed) return;
      const { clone } = await import('three/addons/utils/SkeletonUtils.js');
      if (disposed) return;
      model = clone(template);
      // Fit: about 2.6 units tall, feet on the glowing ground.
      const box = new THREE.Box3().setFromObject(model);
      const sizeV = box.getSize(new THREE.Vector3());
      const fit = 2.6 / Math.max(0.001, sizeV.y);
      model.scale.setScalar(fit);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.set(-centre.x * fit, -1 - box.min.y * fit, -centre.z * fit);
      body.add(model);
      mixer = new THREE.AnimationMixer(model);
      (Object.keys(CLIP_PREFIX) as Clip[]).forEach((name) => {
        const clip = animations.find((c) => c.name.toLowerCase().startsWith(CLIP_PREFIX[name]));
        if (clip) actions.set(name, mixer!.clipAction(clip));
      });
      mixer.addEventListener('finished', (e: { action: THREE.AnimationAction }) => { if (e.action === current) play(baseClip()); });
      // A short hello the first time he appears, then his mood.
      if (baseClip() === 'idle' && actions.has('greet')) play('greet', 3.2);
      else play(baseClip());
    }).catch(() => { /* model unavailable: the still Blaze stays */ });
    let shownBase: Clip | null = null;

    // Embers rising from the flame.
    const emberCount = full ? look.embers : Math.ceil(look.embers / 2);
    const emberGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(emberCount * 3);
    const life = new Float32Array(emberCount);
    const speed = new Float32Array(emberCount);
    const resetEmber = (i: number, burst = false) => {
      pos[i * 3] = (Math.random() - 0.5) * (burst ? 1.6 : 0.9);
      pos[i * 3 + 1] = burst ? Math.random() * 1.2 : -0.4 + Math.random() * 0.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      life[i] = burst ? 0.4 : Math.random();
      speed[i] = 0.5 + Math.random() * (burst ? 2.2 : 0.9);
    };
    for (let i = 0; i < emberCount; i += 1) resetEmber(i);
    emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const emberMat = new THREE.PointsMaterial({ size: full ? 0.12 : 0.1, map: radialTexture('rgba(255,240,180,1)', 'rgba(255,120,0,0)'), color: new THREE.Color(look.outer).lerp(new THREE.Color('#fde68a'), 0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const embers = new THREE.Points(emberGeo, emberMat);
    rig.add(embers);

    // Crown of orbiting sparks for a 100+ day legend.
    const crown = new THREE.Group();
    if (look.crown) {
      const sparkMat = new THREE.MeshBasicMaterial({ color: '#fde68a' });
      for (let i = 0; i < 7; i += 1) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), sparkMat);
        const a = (i / 7) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75);
        crown.add(s);
      }
      crown.position.y = 1.85;
      rig.add(crown);
    }

    // Tilt: lean with the phone.
    let tiltX = 0;
    let tiltZ = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 45;
      tiltZ = THREE.MathUtils.clamp(-gamma / 60, -0.6, 0.6);
      tiltX = THREE.MathUtils.clamp((beta - 45) / 120, -0.3, 0.3);
    };
    window.addEventListener('deviceorientation', onOrient);

    // Tap: flare up.
    let flare = 0;
    const tapMoves: Array<[Clip, number]> = [['jump', 2.2], ['cheer', 2.6], ['greet', 3.2], ['clap', 2.6]];
    let tapIndex = Math.floor(Math.random() * tapMoves.length);
    flareRef.current = () => {
      flare = 1;
      for (let i = 0; i < emberCount; i += 1) if (Math.random() < 0.7) resetEmber(i, true);
      // Asleep or weak (today not done yet): a sad sigh, a yawn and a low crackle. Otherwise a happy move and a whoosh.
      if (moodRef.current === 'sleepy' || moodRef.current === 'weak') {
        play('sad');
        void playBrandSound('streakSleepy');
      } else {
        tapIndex = (tapIndex + 1) % tapMoves.length;
        const [move, seconds] = tapMoves[tapIndex]!;
        play(move, seconds);
        void playBrandSound('streakFlare');
      }
      void haptic('reward');
      void askTiltPermissionOnce();
    };

    // Render only while on screen and the app is in front.
    let visible = true;
    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => { visible = entries.some((en) => en.isIntersecting); })
      : null;
    io?.observe(host);

    const start = performance.now();
    let raf = 0;
    let last = 0;
    const frameGap = full ? 0 : 1 / 30;
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      if (!visible || document.visibilityState === 'hidden') return;
      const t = (performance.now() - start) / 1000;
      if (frameGap && t - last < frameGap) return;
      const dt = Math.min(0.05, t - last || 0.016);
      last = t;
      const m = moodRef.current;
      const weak = m === 'weak';
      const flicker = weak ? 0.55 + Math.random() * 0.35 : 0.94 + Math.sin(t * 11) * 0.04 + Math.random() * 0.03;
      flare = Math.max(0, flare - dt * 1.6);
      mixer?.update(dt);
      // Mood changed (lesson finished, evening reached): switch his looping move.
      const base = baseClip();
      if (model && base !== shownBase) {
        shownBase = base;
        const playingReaction = Boolean(current && current.loop === THREE.LoopOnce && current.isRunning());
        if (!playingReaction) play(base);
      }
      body.scale.setScalar((weak ? 0.88 : 1) * (1 + flare * 0.1));
      keyLight.intensity = weak ? 1.2 : 2.2;
      halo.material.opacity = (weak ? 0.35 : 0.75) * flicker + flare * 0.4;
      (ground.material as THREE.MeshBasicMaterial).opacity = (weak ? 0.35 : 0.8) * flicker;

      rig.rotation.z += (tiltZ * 0.5 - rig.rotation.z) * 0.08;
      rig.rotation.x += (tiltX * 0.5 - rig.rotation.x) * 0.08;
      rig.rotation.y = Math.sin(t * 0.6) * 0.15;

      for (let i = 0; i < emberCount; i += 1) {
        life[i] += dt * speed[i] * 0.45;
        pos[i * 3 + 1] += dt * speed[i];
        pos[i * 3] += Math.sin(t * 3 + i) * dt * 0.25;
        if (life[i] >= 1 || pos[i * 3 + 1] > 2.6) resetEmber(i);
      }
      emberGeo.attributes['position']!.needsUpdate = true;
      emberMat.opacity = weak ? 0.45 : 0.95;
      crown.rotation.y = t * 0.9;
      renderer.render(scene, camera);
      presenter.present();
      if (!verified && model) {
        checks += 1;
        // Sample the flame body (centre, a little below the middle) of what is actually on screen.
        verified = presenter.hasPixelsAt(0.5, 0.58);
        if (verified) host.dataset['ready'] = 'true';
        else if (checks > 90) { window.cancelAnimationFrame(raf); presenter.remove(); }
      }
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.clearTimeout(backToBase);
      mixer?.stopAllAction();
      // The model shares geometry and textures with the cached download: detach it before disposing the rest.
      if (model) body.remove(model);
      window.cancelAnimationFrame(raf);
      window.removeEventListener('deviceorientation', onOrient);
      io?.disconnect();
      flareRef.current = null;
      disposeAll(scene);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.dispose();
      renderer.forceContextLoss();
      presenter.remove();
      delete host.dataset['ready'];
    };
  }, [size, streak, level]);

  const onTap = interactive ? (e: React.MouseEvent) => { e.stopPropagation(); flareRef.current?.(); } : undefined;
  return (
    <div
      ref={hostRef}
      className={`blaze3d${interactive ? ' blaze3d--tap' : ''}`}
      style={{ width: size, height: size }}
      onClick={onTap}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? (label ?? 'Blaze, tap to make him move') : undefined}
      aria-hidden={interactive ? undefined : true}
    />
  );
}
