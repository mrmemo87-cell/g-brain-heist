import React, { Suspense, lazy, useEffect, useState } from 'react';
import { blazeIsWeak, blazeLook } from '../../lib/appEffects';
import { useAppEffects } from '../../native/effects/effectsStore';
import { Blaze, type BlazeMood } from './IeltsGameArt';

/**
 * Blaze everywhere in the IELTS motivation surfaces. With Effects off, with reduce-motion, on quiet screens,
 * on low-end website devices or without WebGL this is the still SVG Blaze. Otherwise it becomes the live 3D
 * Blaze: in the app with sound and vibration, on the website silently (IELTS Visual & UX Bible §14, §14.1a). The SVG stays underneath until the 3D
 * canvas is ready, so there is never an empty space.
 */
const Blaze3D = lazy(() => import('./Blaze3D'));

let webglOk: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement('canvas');
    webglOk = Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { webglOk = false; }
  return webglOk;
}

function useHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const t = window.setInterval(() => setHour(new Date().getHours()), 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, []);
  return hour;
}

export interface BlazeLiveProps {
  size: number;
  streak: number;
  todayDone: boolean;
  /** Mood for the still Blaze; the live one follows it. */
  mood: BlazeMood;
  hue?: number;
  /** Tap to flare (only the main Blaze; not inside buttons). */
  interactive?: boolean;
}

export function BlazeLive({ size, streak, todayDone, mood, hue, interactive = false }: BlazeLiveProps) {
  const { blazeLevel: level } = useAppEffects();
  const hour = useHour();
  const live = level !== 'off' && hasWebGL();
  const weak = blazeIsWeak({ streak, todayDone, hour });
  const look = blazeLook(streak);
  const still = <Blaze mood={mood} size={size} hue={hue} />;
  if (!live) return still;
  const liveMood = weak ? 'weak' : mood === 'cheer' ? 'cheer' : mood === 'sleepy' ? 'sleepy' : 'happy';
  return (
    <span className={`blaze-live blaze-live--${look.tier}${weak ? ' is-weak' : ''}`} style={{ width: size, height: size }}>
      <span className="blaze-live-still" aria-hidden="true">{still}</span>
      <Suspense fallback={null}>
        <Blaze3D size={size} streak={streak} mood={liveMood} level={level} interactive={interactive} />
      </Suspense>
    </span>
  );
}

export default BlazeLive;
