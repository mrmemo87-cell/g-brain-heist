import { Badge } from "../components/Kinetic";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 10;

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
      { from: markTime(tl, "scan-tab", -0.5), to: markTime(tl, "photos-added", 0.4), focus: [{ at: markTime(tl, "scan-tab", -0.5), scale: 1.0, ...scanTab }, { at: markTime(tl, "scan-tab", 0.2), scale: 1.5, ...scanTab }, { at: markTime(tl, "photos-added", -0.3), scale: 1.2, x: tl.size.width / 2, y: tl.size.height * 0.55 }], weight: 2.2 },
      { from: markTime(tl, "photos-added", 0.4), to: markTime(tl, "photos-read", 1.2), focus: [{ at: markTime(tl, "photos-added", 0.4), scale: 1.25, ...tray }, { at: markTime(tl, "photos-read", -1.0), scale: 1.45, ...tray }, { at: markTime(tl, "photos-read", 1.2), scale: 1.3, ...tray }], weight: 5 },
    ],
    scene.durationInFrames - 4,
    FPS,
    CLIP_TRANSITION,
  );
  const badgeX = layout === "landscape" ? g.screen.x + g.screen.width - 250 : g.width / 2;
  const badgeY = layout === "landscape" ? g.screen.y + 44 : g.screen.y - 60;
  const notes = [
    { text: "QR code → student matched", at: b(6.4), until: b(8.6), color: theme.cyan },
    { text: "Corners straighten the photo", at: b(8.7), until: b(10.5), color: theme.teal },
    { text: "Every bubble read on the spot", at: b(10.6), color: theme.amber },
  ];
  return (
    <SceneShell scene={scene} layout={layout} accent={theme.cyan}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      <Sfx name="shutter" at={clips[0].durationInFrames - 14} volume={0.6} />
      {notes.map((n) => (
        <Badge key={n.text} text={n.text} at={n.at} until={n.until} x={badgeX} y={badgeY} color={n.color} size={layout === "landscape" ? 26 : 30} />
      ))}
      {notes.map((n) => (
        <Sfx key={n.at} name="pop" at={n.at} volume={0.4} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Sfx key={i} name="tick" at={b(4.6 + i * 0.5)} volume={0.35} />
      ))}
    </SceneShell>
  );
};
