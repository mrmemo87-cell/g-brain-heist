import manifest from "../public/vo/manifest.json";

export const FPS = 30;
/** Silence before the narration starts in each scene, so visuals can settle. */
const LEAD_IN_SECONDS = 0.5;
/** Silence after the narration so the last visual beat can land. */
const TAIL_SECONDS = 1.1;

export interface SceneTiming {
  id: string;
  title: string;
  text: string;
  seconds: number;
  durationInFrames: number;
  voiceStart: number;
  from: number;
}

let cursor = 0;
export const scenes: SceneTiming[] = manifest.scenes.map((scene) => {
  const durationInFrames = Math.round((scene.seconds + LEAD_IN_SECONDS + TAIL_SECONDS) * FPS);
  const timing: SceneTiming = {
    ...scene,
    durationInFrames,
    voiceStart: Math.round(LEAD_IN_SECONDS * FPS),
    from: cursor,
  };
  cursor += durationInFrames;
  return timing;
});

export const totalFrames = cursor;

export const sceneById = (id: string): SceneTiming => {
  const found = scenes.find((scene) => scene.id === id);
  if (!found) throw new Error(`Unknown scene ${id}`);
  return found;
};

/** Seconds into the narration, converted to a frame offset inside the scene. */
export const beat = (scene: SceneTiming, secondsIntoNarration: number) =>
  scene.voiceStart + Math.round(secondsIntoNarration * FPS);
