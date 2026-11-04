import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EffectsLevel } from '../../lib/appEffects';
import { haptic } from '../../native/effects/haptics';
import { playSfx } from '../../native/effects/sfx';

/**
 * Unit-complete celebration in the installed app (IELTS Visual & UX Bible §14.3): a gold 3D medal drops in,
 * bounces, turns to show its face while a light sweeps across it, with sparks, a strong vibration and a
 * short victory sound. At most 4 seconds and closes on any tap. Mounted only through <UnitMedalCelebration>.
 */
export interface Medal3DProps {
  label: string;
  level: EffectsLevel;
  onDone: () => void;
}

export const MEDAL_DURATION_MS = 3800;

function faceTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(220, 200, 20, 256, 256, 260);
  grad.addColorStop(0, '#fff3c4');
  grad.addColorStop(0.55, '#f5c542');
  grad.addColorStop(1, '#b7791f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(120, 70, 10, .55)';
  g.lineWidth = 14;
  g.beginPath(); g.arc(256, 256, 214, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, .9)';
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + ((i - 2) * Math.PI) / 9;
    g.beginPath(); g.arc(256 + Math.cos(a) * 168, 256 + Math.sin(a) * 168, 9, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#7c2d12';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${label.length > 2 ? 150 : 200}px system-ui, -apple-system, sans-serif`;
  g.fillText(label, 256, 276);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sparkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.4, 'rgba(253,224,71,.8)');
  grad.addColorStop(1, 'rgba(253,186,116,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const easeOutBounce = (x: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};

export default function Medal3D({ label, level, onDone }: Medal3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const full = level === 'full';
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      doneRef.current();
      return;
    }
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, full ? 2 : 1.5));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    // Keep the whole medal (about 4.6 units wide with sparks) on screen on a narrow phone.
    const fitDistance = (aspect: number) => Math.max(9, 4.6 / (2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * aspect));
    camera.position.set(0, 0.6, fitDistance(w / h));

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xfff1c1, 1.6);
    key.position.set(3, 4, 6);
    scene.add(key);
    const sweep = new THREE.PointLight(0xffffff, 0, 8, 1.5);
    sweep.position.set(-4, 1, 2.2);
    scene.add(sweep);

    // The medal: thick coin with a raised rim, a ribbon behind it.
    const medal = new THREE.Group();
    scene.add(medal);
    const gold = new THREE.MeshStandardMaterial({ color: '#f5b82e', metalness: 1, roughness: 0.28 });
    const face = faceTexture(label);
    const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: 0.75, roughness: 0.32 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, full ? 72 : 40), gold);
    coin.rotation.x = Math.PI / 2;
    medal.add(coin);
    const front = new THREE.Mesh(new THREE.CircleGeometry(1.42, full ? 72 : 40), faceMat);
    front.position.z = 0.152;
    medal.add(front);
    const back = front.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.152;
    medal.add(back);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 16, full ? 72 : 40), gold);
    medal.add(rim);
    const ribbonMat = new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
    [-0.55, 0.55].forEach((x, i) => {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.4), ribbonMat);
      r.position.set(x, 2.2, -0.2);
      r.rotation.z = i === 0 ? 0.32 : -0.32;
      medal.add(r);
    });

    // Glint that rides with the light sweep.
    const sparkMap = sparkTexture();
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glint.scale.set(1.6, 1.6, 1);
    scene.add(glint);

    // Sparks burst out when the medal lands.
    const count = full ? 120 : 50;
    const sparkGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparkMat = new THREE.PointsMaterial({ size: 0.22, map: sparkMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    scene.add(sparks);
    const burst = () => {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 2.5 + Math.random() * 4;
        pos[i * 3] = 0; pos[i * 3 + 1] = -0.2; pos[i * 3 + 2] = 0.4;
        vel[i * 3] = Math.cos(a) * s;
        vel[i * 3 + 1] = Math.sin(a) * s + 2;
        vel[i * 3 + 2] = (Math.random() - 0.3) * 2;
      }
      sparkMat.opacity = 1;
    };

    playSfx('medalDrop');
    const timers: number[] = [];
    let landed = false;
    const start = performance.now();
    let raf = 0;
    let lastT = 0;
    const DROP = 0.9;
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      const t = (performance.now() - start) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, t - lastT));
      lastT = t;

      // Drop with bounce, then settle and turn.
      const p = Math.min(1, t / DROP);
      medal.position.y = 6 * (1 - easeOutBounce(p)) - 0.2;
      if (!landed && p >= 0.36) {
        landed = true;
        burst();
        void haptic('celebrate');
        timers.push(window.setTimeout(() => playSfx('fanfare'), 120));
        timers.push(window.setTimeout(() => playSfx('medalShine'), 1100));
      }
      const spin = t < DROP ? (1 - p) * 6 : 0;
      medal.rotation.y = spin + Math.sin(Math.max(0, t - DROP) * 1.4) * 0.35;
      medal.rotation.x = Math.sin(t * 1.1) * 0.06;
      const breathe = 1 + Math.max(0, Math.sin(Math.max(0, t - DROP) * 2)) * 0.03;
      medal.scale.setScalar(breathe);

      // Light sweep across the face from 1.2 s to 2.4 s.
      const sp = THREE.MathUtils.clamp((t - 1.2) / 1.2, 0, 1);
      sweep.intensity = sp > 0 && sp < 1 ? 60 * Math.sin(sp * Math.PI) : 0;
      sweep.position.x = -4 + sp * 8;
      sweep.position.y = 1.4 - sp * 2.4;
      glint.position.set(-1.1 + sp * 2.2, 0.9 - sp * 1.8 + medal.position.y + 0.2, 1.1);
      (glint.material as THREE.SpriteMaterial).opacity = sp > 0 && sp < 1 ? Math.sin(sp * Math.PI) : 0;

      if (landed) {
        for (let i = 0; i < count; i += 1) {
          vel[i * 3 + 1] -= 9 * dt;
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        sparkGeo.attributes['position']!.needsUpdate = true;
        sparkMat.opacity = Math.max(0, sparkMat.opacity - dt * 0.6);
      }
      renderer.render(scene, camera);
    };
    raf = window.requestAnimationFrame(tick);
    timers.push(window.setTimeout(() => doneRef.current(), MEDAL_DURATION_MS));

    const onResize = () => {
      const nw = host.clientWidth || window.innerWidth;
      const nh = host.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.position.z = fitDistance(nw / nh);
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.cancelAnimationFrame(raf);
      timers.forEach((x) => window.clearTimeout(x));
      window.removeEventListener('resize', onResize);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      face.dispose();
      sparkMap.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [label, level]);

  return (
    <div className="medal3d" role="dialog" aria-modal="true" aria-label={`Medal earned: ${label}. Tap to continue.`} onPointerDown={() => doneRef.current()}>
      <div ref={hostRef} className="medal3d-stage" aria-hidden="true" />
      <p className="medal3d-hint">Tap to continue</p>
    </div>
  );
}
