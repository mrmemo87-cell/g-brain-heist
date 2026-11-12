import { Badge, Kinetic } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 6;

export const Review: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const flag = markPoint(tl, "choose-c");
  const flagFocus = { x: flag.x, y: Math.max(200, flag.y - (layout === "landscape" ? 120 : 260)) };
  const hasFlag = tl.marks["flag-visible"] !== undefined;
  const clips = planClips(
    layout,
    [
      { from: markTime(tl, hasFlag ? "flag-visible" : "choose-c", -0.4), to: markTime(tl, hasFlag ? "flag-visible" : "choose-c", 1.2), focus: [{ at: markTime(tl, hasFlag ? "flag-visible" : "choose-c", -0.4), scale: 1.7, ...flagFocus }, { at: markTime(tl, hasFlag ? "flag-visible" : "choose-c", 1.2), scale: 1.85, ...flagFocus }], weight: 1.6 },
      { from: markTime(tl, "choose-c", -0.4), to: markTime(tl, "save-1", 0.6), focus: [{ at: markTime(tl, "choose-c", -0.4), scale: 1.9, ...flag }, { at: markTime(tl, "choose-c", 0.3), scale: 1.9, ...flag }, { at: markTime(tl, "checked-1"), scale: 1.5, ...markPoint(tl, "checked-1") }, { at: markTime(tl, "save-1", 0.5), scale: 1.35, ...markPoint(tl, "save-1") }], weight: 3 },
    ],
    scene.durationInFrames - 2,
    FPS,
    CLIP_TRANSITION,
  );
  const badgeX = layout === "landscape" ? g.screen.x + g.screen.width - 250 : g.width / 2;
  const badgeY = layout === "landscape" ? g.screen.y + 44 : g.screen.y - 50;
  return (
    <SceneShell scene={scene} layout={layout} accent={theme.amber}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      <Badge text="Question 7 · flagged: two marks" at={b(1.1)} until={b(2.9)} x={badgeX} y={badgeY} color={theme.amber} size={layout === "landscape" ? 28 : 32} />
      <Badge text="See the crop, tap the answer" at={b(3.0)} until={b(4.5)} x={badgeX} y={badgeY} color={theme.teal} size={layout === "landscape" ? 28 : 32} />
      <Sfx name="pop" at={b(1.1)} volume={0.4} />
      <Sfx name="click" at={b(3.4)} volume={0.45} />
      <Sfx name="chime" at={b(4.4)} volume={0.4} />
      <Kinetic text="Nothing is graded blind." at={b(4.6)} x={g.width / 2} y={layout === "landscape" ? 18 : 60} size={layout === "landscape" ? 44 : 52} color={theme.amber} width={g.width - 200} />
    </SceneShell>
  );
};
