import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { Sfx } from "./components/Sfx";
import type { Layout } from "./plan";
import { Create } from "./scenes/Create";
import { Fill } from "./scenes/Fill";
import { Hook } from "./scenes/Hook";
import { Outro } from "./scenes/Outro";
import { Print } from "./scenes/Print";
import { Results } from "./scenes/Results";
import { Review } from "./scenes/Review";
import { Scan } from "./scenes/Scan";
import { FPS, SCENE_TRANSITION_FRAMES, scenes, totalFrames, type SceneTiming } from "./timing";

const SCENES: Record<string, React.FC<{ scene: SceneTiming; layout: Layout }>> = {
  hook: Hook,
  create: Create,
  print: Print,
  fill: Fill,
  scan: Scan,
  review: Review,
  results: Results,
  outro: Outro,
};

/** Music sits under the narration: louder in the gaps, ducked while the voice speaks. */
const musicVolume = (frame: number): number => {
  const ramp = 0.45 * FPS;
  let level = 0.34;
  for (const scene of scenes) {
    const start = scene.from + scene.voiceStart;
    const end = start + scene.seconds * FPS;
    if (frame >= start - ramp && frame <= end + ramp) {
      const inFade = Math.min(1, Math.max(0, (frame - (start - ramp)) / ramp));
      const outFade = Math.min(1, Math.max(0, (end + ramp - frame) / ramp));
      const duck = Math.min(inFade, outFade);
      level = Math.min(level, 0.34 - 0.22 * duck);
    }
  }
  const tail = totalFrames - frame;
  if (tail < 2 * FPS) level *= Math.max(0, tail / (2 * FPS));
  return level;
};

export const Demo: React.FC<{ layout: Layout }> = ({ layout }) => (
  <AbsoluteFill style={{ backgroundColor: "#0b1220" }}>
    <TransitionSeries>
      {scenes.flatMap((scene, i) => {
        const Scene = SCENES[scene.id];
        if (!Scene) throw new Error(`No scene component for ${scene.id}`);
        const items = [
          <TransitionSeries.Sequence key={scene.id} durationInFrames={scene.durationInFrames} name={scene.title}>
            <Scene scene={scene} layout={layout} />
          </TransitionSeries.Sequence>,
        ];
        if (i < scenes.length - 1) {
          items.push(
            <TransitionSeries.Transition
              key={`${scene.id}-t`}
              presentation={i % 2 === 0 ? slide({ direction: layout === "landscape" ? "from-right" : "from-bottom" }) : fade()}
              timing={linearTiming({ durationInFrames: SCENE_TRANSITION_FRAMES })}
            />,
          );
        }
        return items;
      })}
    </TransitionSeries>
    {scenes.slice(1).map((scene) => (
      <Sfx key={scene.id} name="whoosh" at={scene.from - 2} volume={0.45} />
    ))}
    <Audio src={staticFile("music/bed.mp3")} volume={musicVolume} />
  </AbsoluteFill>
);
