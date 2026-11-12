import { Badge } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 10;

export const Create: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const p = (label: string) => markPoint(tl, label);
  const focus = (label: string, scale: number, offset = 0) => ({ at: markTime(tl, label, offset), scale, ...p(label) });
  const clips = planClips(
    layout,
    [
      { from: markTime(tl, "create-menu", -0.5), to: markTime(tl, "new-assignment", 0.8), focus: [focus("create-menu", 1.0, -0.5), focus("create-menu", 1.6), focus("new-assignment", 1.6)] },
      { from: markTime(tl, "wizard-audience", -0.1), to: markTime(tl, "next-2", 0.3), focus: [focus("wizard-audience", 1.0, -0.1), focus("audience-7a", 1.7, -0.6), focus("audience-7a", 1.7, 0.8), focus("next-2", 1.2)] },
      { from: markTime(tl, "topic-open", -0.3), to: markTime(tl, "select-all", 0.9), focus: [focus("topic-open", 1.5, -0.3), focus("select-all", 1.5, 0.9)] },
      { from: markTime(tl, "delivery-paper", -0.7), to: markTime(tl, "type-quiz", 0.3), focus: [focus("delivery-paper", 1.8, -0.7), focus("delivery-paper", 1.8, 0.9), focus("title", 1.4), focus("type-quiz", 1.4)], weight: 7 },
      { from: markTime(tl, "publish", -0.6), to: markTime(tl, "published-dialog", 1.0), focus: [focus("publish", 1.6, -0.6), focus("publish", 1.6, 0.4), focus("published-dialog", 1.0, 0.3)] },
    ],
    scene.durationInFrames - 6,
    FPS,
    CLIP_TRANSITION,
  );
  // Step chips appear at the start of each clip.
  const labels = ["New assignment", "Audience: 7A", "Questions: Adjectives", "Delivery: Paper", "Publish"];
  let cursor = 3;
  const chips = clips.map((clip, i) => {
    const at = cursor;
    cursor += clip.durationInFrames - CLIP_TRANSITION;
    return { at, text: labels[i] };
  });
  const chipPos = layout === "landscape" ? { x: g.screen.x + g.screen.width - 230, y: g.screen.y + 44 } : { x: g.width / 2, y: g.screen.y - 60 };

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.cyan}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={3} />
      {chips.map((chip, i) => (
        <Badge key={chip.text} text={chip.text} at={chip.at + 4} until={i < chips.length - 1 ? chips[i + 1].at : undefined} x={chipPos.x} y={chipPos.y} color={i === 3 ? theme.amber : theme.cyan} size={layout === "landscape" ? 26 : 30} />
      ))}
      {chips.map((chip) => (
        <Sfx key={chip.at} name="pop" at={chip.at + 4} volume={0.35} />
      ))}
      <Sfx name="success" at={chips[4].at + Math.round(((markTime(tl, "published-dialog") - markTime(tl, "publish", -0.6)) / clips[4].rate) * FPS)} volume={0.5} />
    </SceneShell>
  );
};
