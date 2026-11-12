import { Badge } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 6;

export const Results: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const confirm = markPoint(tl, "confirm-results");
  const rows = { x: tl.size.width * (layout === "landscape" ? 0.55 : 0.5), y: tl.size.height * (layout === "landscape" ? 0.7 : 0.82) };
  const clips = planClips(
    layout,
    [
      { from: markTime(tl, "confirm-results", -0.4), to: markTime(tl, "confirm-results", 0.9), focus: [{ at: markTime(tl, "confirm-results", -0.4), scale: 1.6, ...confirm }, { at: markTime(tl, "confirm-results", 0.9), scale: 1.5, ...confirm }], weight: 1.2 },
      { from: markTime(tl, "report", 0.4), to: markTime(tl, "end", -0.2), focus: [{ at: markTime(tl, "report", 0.4), scale: 1.45, ...rows }, { at: markTime(tl, "end", -0.2), scale: 1.35, ...rows }], weight: 2.4 },
    ],
    scene.durationInFrames - 2,
    FPS,
    CLIP_TRANSITION,
  );
  const badgeX = layout === "landscape" ? g.screen.x + g.screen.width - 250 : g.width / 2;
  const badgeY = layout === "landscape" ? g.screen.y + 44 : g.screen.y - 50;
  return (
    <SceneShell scene={scene} layout={layout} accent={theme.teal}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      <Sfx name="success" at={b(0.8)} volume={0.5} />
      <Badge text="Full report · Teacher confirmed" at={b(1.4)} x={badgeX} y={badgeY} color={theme.cyan} size={layout === "landscape" ? 28 : 32} />
      <Sfx name="pop" at={b(1.4)} volume={0.35} />
    </SceneShell>
  );
};
