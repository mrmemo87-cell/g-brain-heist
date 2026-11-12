import { Badge, Kinetic } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 10;

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
      { from: markTime(tl, "start-review", -0.3), to: markTime(tl, hasFlag ? "flag-visible" : "choose-c", 1.4), focus: [{ at: markTime(tl, "start-review", -0.3), scale: 1.0, ...markPoint(tl, "start-review") }, { at: markTime(tl, "start-review", 0.1), scale: 1.4, ...markPoint(tl, "start-review") }, { at: markTime(tl, hasFlag ? "flag-visible" : "choose-c", 0.3), scale: 1.8, ...flagFocus }], weight: 3.2 },
      { from: markTime(tl, "choose-c", -0.6), to: markTime(tl, "save-1", 0.8), focus: [{ at: markTime(tl, "choose-c", -0.6), scale: 1.8, ...flagFocus }, { at: markTime(tl, "choose-c", 0.2), scale: 1.9, ...flag }, { at: markTime(tl, "checked-1"), scale: 1.5, ...markPoint(tl, "checked-1") }, { at: markTime(tl, "save-1", 0.5), scale: 1.3, ...markPoint(tl, "save-1") }], weight: 4 },
      { from: markTime(tl, "review-page-2", -0.1), to: markTime(tl, "tray-reviewed", 0.4), focus: [{ at: markTime(tl, "review-page-2"), scale: 1.1, x: tl.size.width / 2, y: tl.size.height * 0.5 }], weight: 2.2 },
    ],
    scene.durationInFrames - 4,
    FPS,
    CLIP_TRANSITION,
  );
  const badgeX = layout === "landscape" ? g.screen.x + g.screen.width - 250 : g.width / 2;
  const badgeY = layout === "landscape" ? g.screen.y + 44 : g.screen.y - 60;
  return (
    <SceneShell scene={scene} layout={layout} accent={theme.amber}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      <Badge text="Question 7 · flagged: two marks" at={b(3.6)} until={b(6.2)} x={badgeX} y={badgeY} color={theme.amber} size={layout === "landscape" ? 26 : 30} />
      <Badge text="Tap the right answer, save" at={b(6.3)} until={b(8.5)} x={badgeX} y={badgeY} color={theme.teal} size={layout === "landscape" ? 26 : 30} />
      <Sfx name="pop" at={b(3.6)} volume={0.45} />
      <Sfx name="click" at={b(6.9)} volume={0.5} />
      <Sfx name="chime" at={b(8.1)} volume={0.45} />
      <Kinetic text="Nothing is graded blind." at={b(8.8)} x={g.width / 2} y={layout === "landscape" ? 22 : 70} size={layout === "landscape" ? 44 : 52} color={theme.amber} width={g.width - 200} />
    </SceneShell>
  );
};
