import { Badge } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 6;

export const Create: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const p = (label: string) => markPoint(tl, label);
  const focus = (label: string, scale: number, offset = 0) => ({ at: markTime(tl, label, offset), scale, ...p(label) });
  const clips = planClips(
    layout,
    [
      { from: markTime(tl, "audience-7a", -0.5), to: markTime(tl, "audience-7a", 0.7), focus: [focus("audience-7a", 1.6, -0.5), focus("audience-7a", 1.6, 0.7)] },
      { from: markTime(tl, "select-all", -0.6), to: markTime(tl, "select-all", 0.7), focus: [focus("select-all", 1.5, -0.6), focus("select-all", 1.5, 0.7)] },
      { from: markTime(tl, "delivery-paper", -0.5), to: markTime(tl, "delivery-paper", 0.9), focus: [focus("delivery-paper", 1.8, -0.5), focus("delivery-paper", 1.8, 0.9)], weight: 1.6 },
      { from: markTime(tl, "publish", -0.4), to: markTime(tl, "published-dialog", 0.6), focus: [focus("publish", 1.6, -0.4), focus("publish", 1.6, 0.3), focus("published-dialog", 1.1, 0.4)], weight: 1.3 },
    ],
    scene.durationInFrames - 2,
    FPS,
    CLIP_TRANSITION,
  );
  const labels = ["Pick the class", "Pull questions", "Delivery: Paper", "Publish"];
  let cursor = 2;
  const chips = clips.map((clip, i) => {
    const at = cursor;
    cursor += clip.durationInFrames - CLIP_TRANSITION;
    return { at, text: labels[i] };
  });
  const chipPos = layout === "landscape" ? { x: g.screen.x + g.screen.width - 230, y: g.screen.y + 44 } : { x: g.width / 2, y: g.screen.y - 50 };

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.cyan}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      {chips.map((chip, i) => (
        <Badge key={chip.text} text={chip.text} at={chip.at + 3} until={i < chips.length - 1 ? chips[i + 1].at : undefined} x={chipPos.x} y={chipPos.y} color={i === 2 ? theme.amber : theme.cyan} size={layout === "landscape" ? 28 : 32} />
      ))}
      <Sfx name="success" at={chips[3].at + Math.round(clips[3].durationInFrames * 0.55)} volume={0.4} />
    </SceneShell>
  );
};
