import { Badge } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 10;

export const Results: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const confirm = markPoint(tl, "confirm-results");
  const report = markPoint(tl, "view-report");
  const rows = { x: tl.size.width * (layout === "landscape" ? 0.55 : 0.5), y: tl.size.height * (layout === "landscape" ? 0.7 : 0.82) };
  const clips = planClips(
    layout,
    [
      { from: markTime(tl, "confirm-results", -0.7), to: markTime(tl, "confirmed", 0.2), focus: [{ at: markTime(tl, "confirm-results", -0.7), scale: 1.2, ...confirm }, { at: markTime(tl, "confirm-results", 0.1), scale: 1.6, ...confirm }, { at: markTime(tl, "confirmed", 0.2), scale: 1.1, x: tl.size.width / 2, y: tl.size.height / 2 }], weight: 2.5 },
      { from: markTime(tl, "view-report", -0.5), to: markTime(tl, "end", -0.3), focus: [{ at: markTime(tl, "view-report", -0.5), scale: 1.3, ...report }, { at: markTime(tl, "view-report", 0.3), scale: 1.4, ...report }, { at: markTime(tl, "report", 0.8), scale: 1.5, ...rows }, { at: markTime(tl, "end", -0.3), scale: 1.35, ...rows }], weight: 4 },
    ],
    scene.durationInFrames - 4,
    FPS,
    CLIP_TRANSITION,
  );
  const badgeX = layout === "landscape" ? g.screen.x + g.screen.width - 250 : g.width / 2;
  const badgeY = layout === "landscape" ? g.screen.y + 44 : g.screen.y - 60;
  return (
    <SceneShell scene={scene} layout={layout} accent={theme.teal}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      <Sfx name="success" at={b(1.3)} volume={0.55} />
      <Badge text="Results in the gradebook" at={b(1.5)} until={b(3.8)} x={badgeX} y={badgeY} color={theme.teal} size={layout === "landscape" ? 26 : 30} />
      <Badge text="Paper · Teacher confirmed" at={b(4.0)} x={badgeX} y={badgeY} color={theme.cyan} size={layout === "landscape" ? 26 : 30} />
      <Sfx name="pop" at={b(1.5)} volume={0.4} />
      <Sfx name="pop" at={b(4.0)} volume={0.4} />
    </SceneShell>
  );
};
