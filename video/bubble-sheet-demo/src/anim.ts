import { Easing, interpolate, spring } from "remotion";

/** Linear 0..1 ramp between two frames, clamped. */
export const ramp = (frame: number, from: number, to: number, easing?: (t: number) => number) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** Spring-based 0..1 pop that starts at `from`. Returns 0 before it starts. */
export const popIn = (frame: number, from: number, fps: number, config: { damping?: number; stiffness?: number } = {}) =>
  frame < from ? 0 : spring({ frame: frame - from, fps, config: { damping: 13, stiffness: 170, ...config } });

/** Overshooting ease for UI elements sliding into place. */
export const easeOutBack = Easing.out(Easing.back(1.4));
export const easeInOut = Easing.inOut(Easing.cubic);

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export const hash = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};
