import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { blazeLook, type EffectsLevel } from '../../lib/appEffects';
import { haptic } from '../../native/effects/haptics';
import { playSfx } from '../../native/effects/sfx';
import { playBrandSound } from '../../native/effects/brandSounds';
import { createPresenter } from './presentCanvas';

/**
 * Blaze in real-time 3D for the installed app (IELTS Visual & UX Bible §14): a living flame with a face,
 * glow, flickering ground light and rising embers. It leans when the phone tilts, flares with a sound and a
 * vibration when tapped, grows with the streak and turns weak in the evening when the streak is at risk.
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

const FLAME_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uFlare;
  uniform float uWobble;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 p = position;
    float h = clamp((p.y + 1.0) / 2.6, 0.0, 1.0);
    vHeight = h;
    float sway = sin(uTime * 3.1 + p.y * 2.2) * 0.09 + sin(uTime * 5.3 + p.x * 4.0) * 0.04;
    p.x += sway * h * h * uWobble;
    p.z += cos(uTime * 2.7 + p.y * 3.0) * 0.05 * h * uWobble;
    float tongue = sin(atan(p.z, p.x) * 3.0 + uTime * 6.0) * 0.12 * h * h * uWobble;
    p.y += tongue + uFlare * 0.45 * h;
    p.xz *= 1.0 + uFlare * 0.18;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uOuter;
  uniform float uOpacity;
  uniform float uFlicker;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 1.6);
    vec3 col = mix(uCore, uOuter, smoothstep(0.05, 0.85, vHeight + rim * 0.55));
    col += uOuter * rim * 0.8;
    float alpha = (0.92 - rim * 0.35) * uOpacity * uFlicker;
    alpha *= 1.0 - smoothstep(0.82, 1.0, vHeight);
    gl_FragColor = vec4(col, alpha);
  }
`;

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

/** Teardrop profile turned on a lathe: round base, pointed tip. */
function flameGeometry(segments: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const y = -1 + t * 2.6;
    const r = Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - t * 0.55) * 0.95;
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  return new THREE.LatheGeometry(pts, segments);
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
    const uniformsFor = (core: string, outer: string, opacity: number) => ({
      uTime: { value: 0 }, uFlare: { value: 0 }, uWobble: { value: full ? 1 : 0.7 },
      uCore: { value: new THREE.Color(core) }, uOuter: { value: new THREE.Color(outer) },
      uOpacity: { value: opacity }, uFlicker: { value: 1 },
    });
    const outerU = uniformsFor(look.outer, `#${new THREE.Color(look.outer).multiplyScalar(0.55).getHexString()}`, 0.95);
    const innerU = uniformsFor(look.core, look.outer, 1);
    const flameMat = (u: ReturnType<typeof uniformsFor>) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLAME_VERTEX, fragmentShader: FLAME_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
    const outerFlame = new THREE.Mesh(flameGeometry(full ? 48 : 28), flameMat(outerU));
    body.add(outerFlame);
    const innerFlame = new THREE.Mesh(flameGeometry(full ? 40 : 24), flameMat(innerU));
    innerFlame.scale.set(0.58, 0.62, 0.58);
    innerFlame.position.set(0, -0.32, 0.32);
    body.add(innerFlame);

    // Face: two eyes that look toward the tilt and blink; closed when sleepy.
    const face = new THREE.Group();
    face.position.set(0, -0.08, 0.86);
    body.add(face);
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const dark = new THREE.MeshBasicMaterial({ color: '#1f2937' });
    const eyes: Array<{ eye: THREE.Mesh; pupil: THREE.Mesh }> = [-0.27, 0.27].map((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), white);
      eye.scale.set(1, 1.25, 0.6);
      eye.position.set(x, 0, 0);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), dark);
      pupil.position.set(x, -0.01, 0.08);
      face.add(eye, pupil);
      return { eye, pupil };
    });

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
    flareRef.current = () => {
      flare = 1;
      for (let i = 0; i < emberCount; i += 1) if (Math.random() < 0.7) resetEmber(i, true);
      // Asleep or weak (today not done yet): a yawn and a low crackle. Otherwise the fire whooshes up.
      if (moodRef.current === 'sleepy' || moodRef.current === 'weak') playBrandSound('streakSleepy');
      else playBrandSound('streakFlare');
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
    let blinkAt = 2 + Math.random() * 3;
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
      const cheerBounce = m === 'cheer' ? Math.abs(Math.sin(t * 4.2)) * 0.12 : 0;
      for (const u of [outerU, innerU]) {
        u.uTime.value = t;
        u.uFlare.value = flare;
        u.uFlicker.value = flicker;
        u.uWobble.value = (full ? 1 : 0.7) * (weak ? 1.6 : 1);
      }
      body.scale.setScalar((weak ? 0.82 : 1) * (1 + flare * 0.12));
      body.position.y = cheerBounce;
      halo.material.opacity = (weak ? 0.35 : 0.75) * flicker + flare * 0.4;
      (ground.material as THREE.MeshBasicMaterial).opacity = (weak ? 0.35 : 0.8) * flicker;

      rig.rotation.z += (tiltZ - rig.rotation.z) * 0.08;
      rig.rotation.x += (tiltX - rig.rotation.x) * 0.08;
      rig.rotation.y = Math.sin(t * 0.6) * 0.12;

      const sleepy = m === 'sleepy' || weak;
      if (t > blinkAt) blinkAt = t + 2.5 + Math.random() * 3.5;
      const blinking = blinkAt - t < 0.12;
      eyes.forEach(({ eye, pupil }) => {
        const open = sleepy ? 0.18 : blinking ? 0.12 : 1;
        eye.scale.y += (1.25 * open - eye.scale.y) * 0.4;
        pupil.visible = open > 0.5;
        pupil.position.x = eye.position.x + tiltZ * -0.08;
        pupil.position.y = -0.01 + tiltX * 0.08;
      });

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
      if (!verified) {
        checks += 1;
        // Sample the flame body (centre, a little below the middle) of what is actually on screen.
        verified = presenter.hasPixelsAt(0.5, 0.58);
        if (verified) host.dataset['ready'] = 'true';
        else if (checks > 90) { window.cancelAnimationFrame(raf); presenter.remove(); }
      }
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
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

  const onTap = interactive ? (e: React.PointerEvent) => { e.stopPropagation(); flareRef.current?.(); } : undefined;
  return (
    <div
      ref={hostRef}
      className={`blaze3d${interactive ? ' blaze3d--tap' : ''}`}
      style={{ width: size, height: size }}
      onPointerDown={onTap}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? (label ?? 'Blaze, tap to make the flame flare up') : undefined}
      aria-hidden={interactive ? undefined : true}
    />
  );
}
