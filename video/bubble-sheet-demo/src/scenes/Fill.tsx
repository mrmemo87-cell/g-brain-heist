import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut, popIn, ramp } from "../anim";
import { Badge } from "../components/Kinetic";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { bubblePosition, DEMO_ANSWERS, Sheet, SHEET, type Fill as BubbleFill } from "../components/Sheet";
import { geometry } from "../layout";
import { timelineFor, type Layout } from "../plan";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const FILL_START = 0.3;

export const Fill: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const dir = layout === "landscape" ? "desktop" : "mobile";
  const count = Math.min(DEMO_ANSWERS.length, (tl as { questions?: number }).questions ?? 11);
  const step = 4.4 / count;
  const sheet = layout === "landscape" ? { x: 640, y: 40, width: 640 } : { x: 150, y: 220, width: 780 };
  const scale = sheet.width / SHEET.width;
  const toScreen = (px: number, py: number) => ({ x: sheet.x + px * scale, y: sheet.y + py * scale });

  const fills: BubbleFill[] = DEMO_ANSWERS.slice(0, count).map((answer, i) => ({ ...answer, progress: popIn(frame, b(FILL_START + i * step), fps, { damping: 20, stiffness: 200 }) }));
  const keys = DEMO_ANSWERS.slice(0, count).map((a, i) => ({ frame: b(FILL_START + i * step), ...toScreen(bubblePosition(a.row, a.choice).x, bubblePosition(a.row, a.choice).y) }));
  const pencilX = interpolate(frame, keys.map((k) => k.frame), keys.map((k) => k.x), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
  const pencilY = interpolate(frame, keys.map((k) => k.frame), keys.map((k) => k.y), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
  const photoStart = b(5.0);
  const photoIn = ramp(frame, photoStart, photoStart + 12, easeInOut);
  const push = interpolate(frame, [photoStart, scene.durationInFrames], [1.0, 1.14], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.teal}>
      {frame < photoStart + 12 && (
        <div style={{ position: "absolute", left: sheet.x, top: sheet.y, opacity: 1 - photoIn, transform: `scale(${1 - photoIn * 0.1})` }}>
          <Sheet src={`footage/${dir}/sheet-1.svg`} width={sheet.width} fills={fills} />
        </div>
      )}
      {frame >= b(0.1) && frame < photoStart && (
        <svg width={140} height={140} viewBox="0 0 120 120" style={{ position: "absolute", left: pencilX - 9, top: pencilY - 130, filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.5))" }}>
          <g transform="rotate(35 8 112)">
            <rect x={0} y={0} width={16} height={92} fill={theme.amber} />
            <rect x={0} y={0} width={16} height={14} fill={theme.pink} />
            <polygon points="0,92 16,92 8,112" fill="#f4e3c1" />
            <polygon points="5,104 11,104 8,112" fill={theme.paperInk} />
          </g>
        </svg>
      )}
      {keys.map((k) => (
        <Sfx key={k.frame} name="tick" at={k.frame} volume={0.3} />
      ))}
      {layout === "landscape" && frame < photoStart && (
        <div style={{ position: "absolute", left: 120, top: 300, width: 460, fontFamily: theme.font }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: theme.ink, lineHeight: 1.1 }}>Pencil. Paper. Done.</div>
          <div style={{ fontSize: 32, color: theme.muted, marginTop: 18 }}>One bubble per question, dark pencil or pen.</div>
        </div>
      )}
      {frame >= photoStart && (
        <div style={{ position: "absolute", inset: 0, opacity: photoIn }}>
          <Img src={staticFile(`footage/${dir}/photo-2.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${push})`, transformOrigin: "50% 35%" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,18,32,0) 55%, rgba(11,18,32,0.85) 100%)" }} />
        </div>
      )}
      <Sfx name="whoosh" at={photoStart} volume={0.4} />
      <Badge text="No devices in the exam room" at={b(5.4)} x={g.width / 2} y={layout === "landscape" ? 150 : 300} color={theme.pink} size={layout === "landscape" ? 36 : 36} />
      <Sfx name="pop" at={b(5.4)} volume={0.45} />
    </SceneShell>
  );
};
