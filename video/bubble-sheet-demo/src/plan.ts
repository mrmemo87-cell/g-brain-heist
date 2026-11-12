import desktop from "../public/footage/desktop/timeline.json";
import mobile from "../public/footage/mobile/timeline.json";
import type { CameraKey } from "./components/Footage";

export type Layout = "landscape" | "portrait";

export interface Mark {
  t: number;
  label: string;
  x?: number;
  y?: number;
}

export interface Timeline {
  mode: string;
  size: { width: number; height: number };
  title: string;
  timeline: Mark[];
  marks: Record<string, number>;
  durations: { page: number; print: number };
  sheets: string[];
  photos: string[];
}

export const timelineFor = (layout: Layout): Timeline => (layout === "landscape" ? (desktop as Timeline) : (mobile as Timeline));

/** Seconds (page time) of a click mark, with an optional offset. Throws on unknown labels so typos surface at render time. */
export const markTime = (tl: Timeline, label: string, offset = 0): number => {
  const t = tl.marks[label];
  if (t === undefined) throw new Error(`Timeline for ${tl.mode} has no mark "${label}"`);
  return t + offset;
};

/** Click position of a mark in source pixels (falls back to the frame centre). */
export const markPoint = (tl: Timeline, label: string): { x: number; y: number } => {
  const m = tl.timeline.find((entry) => entry.label === label);
  return m && m.x !== undefined && m.y !== undefined ? { x: m.x, y: m.y } : { x: tl.size.width / 2, y: tl.size.height / 2 };
};

export interface Focus {
  /** Page-time seconds when the camera should be here. */
  at: number;
  scale: number;
  x: number;
  y: number;
}

export interface ClipSpec {
  src?: "page" | "print";
  /** Page-time seconds. For the print window, seconds into print.mp4. */
  from: number;
  to: number;
  focus?: Focus[];
  /** Relative share of the scene; defaults to raw duration. */
  weight?: number;
}

export interface PlannedClip {
  src: string;
  from: number;
  rate: number;
  durationInFrames: number;
  camera: CameraKey[];
}

/**
 * Distributes a scene's frames across clips in proportion to their raw length (or
 * weight), computes the playback rate that makes each clip fit, and converts the
 * page-time focus points into clip-time camera keys.
 */
export const planClips = (layout: Layout, specs: ClipSpec[], totalFrames: number, fps: number, transitionFrames: number): PlannedClip[] => {
  const dir = layout === "landscape" ? "desktop" : "mobile";
  const available = totalFrames + transitionFrames * Math.max(0, specs.length - 1);
  const weights = specs.map((s) => s.weight ?? Math.max(0.3, s.to - s.from));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return specs.map((spec, i) => {
    const durationInFrames = Math.max(fps, Math.round((available * weights[i]) / totalWeight));
    const raw = Math.max(0.3, spec.to - spec.from);
    const rate = Math.min(4, Math.max(0.6, raw / (durationInFrames / fps)));
    // Phone footage is already large on screen; cap the zoom so controls stay in frame.
    const maxScale = layout === "landscape" ? 2 : 1.35;
    const camera: CameraKey[] = (spec.focus ?? []).map((f) => ({ at: (f.at - spec.from) / rate, scale: Math.min(maxScale, f.scale), x: f.x, y: f.y }));
    return { src: `footage/${dir}/${spec.src ?? "page"}.mp4`, from: spec.from, rate, durationInFrames, camera };
  });
};
