import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { popIn } from "../anim";
import { Clips } from "../components/Clips";
import { Kinetic } from "../components/Kinetic";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

/**
 * Cold open on the payoff: the tray reading the photos and matching students,
 * with the text hook on screen from frame one. No logo, no build-up.
 */
export const Hook: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const start = markPoint(tl, "start-review");
  const tray = { x: start.x, y: Math.min(tl.size.height - 200, start.y + (layout === "landscape" ? 170 : 620)) };
  const clips = planClips(
    layout,
    [
      {
        from: markTime(tl, "photos-added", 0.3),
        to: markTime(tl, "photos-read", 0.6),
        focus: [
          { at: markTime(tl, "photos-added", 0.3), scale: 1.45, ...tray },
          { at: markTime(tl, "photos-read", 0.6), scale: 1.3, ...tray },
        ],
      },
    ],
    scene.durationInFrames,
    FPS,
    0,
  );
  // Landscape: footage on the right, hook text on the left. Portrait: text over the top of the phone.
  const box = layout === "landscape" ? { x: 760, y: 40, width: 1120, height: 900 } : g.screen;
  const textX = layout === "landscape" ? 80 : 60;
  const textY = layout === "landscape" ? 300 : 90;
  const textWidth = layout === "landscape" ? 640 : g.width - 120;
  const count = Math.min(24, Math.round(interpolate(frame, [b(0.2), b(2.2)], [0, 24], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.cyan}>
      <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={box} transitionFrames={0} from={0} />
      {layout === "portrait" && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 700, background: "linear-gradient(180deg, rgba(11,18,32,0.97) 62%, rgba(11,18,32,0) 100%)" }} />}
      <div style={{ position: "absolute", left: textX, top: textY, width: textWidth, fontFamily: theme.font, fontWeight: 700, color: theme.ink, lineHeight: 1.02, letterSpacing: -2 }}>
        <div style={{ fontSize: layout === "landscape" ? 92 : 88, transform: `scale(${0.96 + 0.04 * popIn(frame, 0, fps)})`, transformOrigin: "left top" }}>
          Your phone just graded
        </div>
        <div style={{ fontSize: layout === "landscape" ? 140 : 150, color: theme.cyan, marginTop: 6, textShadow: `0 0 50px ${theme.cyan}66` }}>
          {count} quizzes
        </div>
        <div style={{ fontSize: layout === "landscape" ? 50 : 52, color: theme.muted, marginTop: 14, fontWeight: 400, opacity: popIn(frame, b(1.2), fps) }}>
          in seconds, from a photo.
        </div>
      </div>
      <Sfx name="shutter" at={2} volume={0.5} />
      {[0, 1, 2, 3].map((i) => (
        <Sfx key={i} name="tick" at={b(0.6 + i * 0.45)} volume={0.35} />
      ))}
      <Kinetic text="Here's how ↓" at={b(3.3)} x={layout === "landscape" ? 400 : g.width / 2} y={layout === "landscape" ? 930 : 560} size={layout === "landscape" ? 60 : 64} color={theme.amber} />
      <Sfx name="pop" at={b(3.3)} volume={0.45} />
    </SceneShell>
  );
};
