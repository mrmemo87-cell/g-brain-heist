import { Series } from "remotion";
import { Create } from "./scenes/Create";
import { Fill } from "./scenes/Fill";
import { Hook } from "./scenes/Hook";
import { Outro } from "./scenes/Outro";
import { Print } from "./scenes/Print";
import { Results } from "./scenes/Results";
import { Review } from "./scenes/Review";
import { Scan } from "./scenes/Scan";
import { sceneById, scenes, type SceneTiming } from "./timing";

const SCENES: Record<string, React.FC<{ scene: SceneTiming }>> = {
  hook: Hook,
  create: Create,
  print: Print,
  fill: Fill,
  scan: Scan,
  review: Review,
  results: Results,
  outro: Outro,
};

export const Video: React.FC = () => (
  <Series>
    {scenes.map((scene) => {
      const Scene = SCENES[scene.id];
      if (!Scene) throw new Error(`No scene component for ${scene.id}`);
      return (
        <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames} name={scene.title}>
          <Scene scene={sceneById(scene.id)} />
        </Series.Sequence>
      );
    })}
  </Series>
);
