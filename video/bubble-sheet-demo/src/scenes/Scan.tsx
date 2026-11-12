import { Badge } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 6;

export const Scan: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const scanTab = markPoint(tl, "scan-tab");
  const start = markPoint(tl, "start-review");
  const tray = { x: start.x, y: Math.min(tl.size.height - 200, start.y + (layout === "landscape" ? 170 : 420)) };
  const clips = planClips(
    layout,
    [
      { from: markTime(tl, "scan-tab", -0.3), to: markTime(tl, "photos-added", 0.3), focus: [{ at: markTime(tl, "scan-tab", -0.3), scale: 1.5, ...scanTab }, { at: markTime(tl, "scan-tab", 0.6), scale: 1.3, x: tl.size.width / 2, y: tl.size.height * 0.5 }, { at: markTime(tl, "photos-added", 0.3), scale: 1.25, x: tl.size.width / 2, y: tl.size.height * 0.55 }], weight: 1.6 },
      { from: markTime(tl, "photos-added", 0.3), to: markTime(tl, "photos-read", 0.8), focus: [{ at: markTime(tl, "photos-added", 0.3), scale: 1.3, ...tray }, { at: markTime(tl, "photos-read", -1.0), scale: 1.5, ...tray }, { at: markTime(tl, "photos-read", 0.8), scale: 1.35, ...tray }], weight: 5 },
    ],
    scene.durationInFrames - 2,
    FPS,
    CLIP_TRANSITION,
  );
  const badgeX = layout === "landscape" ? g.screen.x + g.screen.width - 250 : g.width / 2;
  const badgeY = layout === "landscape" ? g.screen.y + 44 : g.screen.y - 50;
  const notes = [
    { text: "QR → student matched", at: b(1.9), until: b(3.6), color: theme.cyan },
    { text: "Corners straighten the photo", at: b(3.7), until: b(5.1), color: theme.teal },
    { text: "Every bubble read on the spot", at: b(5.2), color: theme.amber },
  ];
  return (
    <SceneShell scene={scene} layout={layout} accent={theme.cyan}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      <Sfx name="shutter" at={clips[0].durationInFrames - 8} volume={0.55} />
      {notes.map((n) => (
        <Badge key={n.text} text={n.text} at={n.at} until={n.until} x={badgeX} y={badgeY} color={n.color} size={layout === "landscape" ? 28 : 32} />
      ))}
      {notes.map((n) => (
        <Sfx key={n.at} name="pop" at={n.at} volume={0.35} />
      ))}
    </SceneShell>
  );
};
