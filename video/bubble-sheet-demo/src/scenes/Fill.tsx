import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut, popIn } from "../anim";
import { Callout } from "../components/Callout";
import { SceneShell } from "../components/SceneShell";
import { bubblePosition, DEMO_ANSWERS, Sheet, SHEET, type Fill as BubbleFill } from "../components/Sheet";
import { StickFigure } from "../components/StickFigure";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const SHEET_POS = { x: 980, y: 50, width: 480 };
const FILL_COUNT = 14;
const FILL_START = 0.4;
const FILL_STEP = 0.33;

export const Fill: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);
  const scale = SHEET_POS.width / SHEET.width;
  const toScreen = (px: number, py: number) => ({ x: SHEET_POS.x + px * scale, y: SHEET_POS.y + py * scale });

  const fills: BubbleFill[] = DEMO_ANSWERS.slice(0, FILL_COUNT).map((answer, i) => ({
    ...answer,
    progress: popIn(frame, b(FILL_START + i * FILL_STEP), fps, { damping: 20, stiffness: 200 }),
  }));

  // Pencil tip glides from bubble to bubble.
  const keys = DEMO_ANSWERS.slice(0, FILL_COUNT).map((a, i) => ({ frame: b(FILL_START + i * FILL_STEP), ...toScreen(bubblePosition(a.row, a.choice).x, bubblePosition(a.row, a.choice).y) }));
  const pencilX = interpolate(frame, keys.map((k) => k.frame), keys.map((k) => k.x), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
  const pencilY = interpolate(frame, keys.map((k) => k.frame), keys.map((k) => k.y), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
  const pencilVisible = frame >= b(0.1) && frame < b(FILL_START + FILL_COUNT * FILL_STEP + 0.4);
  const target = toScreen(bubblePosition(3, 2).x, bubblePosition(3, 2).y);
  const noDevices = popIn(frame, b(5.3), fps);

  return (
    <SceneShell scene={scene} accent={theme.teal}>
      {/* classroom: two desks with students writing */}
      {[120, 470].map((x, i) => (
        <div key={x}>
          <div style={{ position: "absolute", left: x - 20, top: 700, width: 300, height: 22, borderRadius: 11, backgroundColor: "#2a3a5c" }} />
          <div style={{ position: "absolute", left: x + 40, top: 640, width: 150, height: 60, backgroundColor: theme.paper, borderRadius: 3, transform: "rotate(-4deg)", opacity: 0.95 }} />
          <StickFigure pose="write" x={x} y={420} size={300} accent={i === 0 ? theme.amber : theme.pink} />
        </div>
      ))}

      <Sheet width={SHEET_POS.width} fills={fills} style={{ position: "absolute", left: SHEET_POS.x, top: SHEET_POS.y }} />

      {pencilVisible && (
        <svg width={120} height={120} viewBox="0 0 120 120" style={{ position: "absolute", left: pencilX - 8, top: pencilY - 112, filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.5))" }}>
          <g transform="rotate(35 8 112)">
            <rect x={0} y={0} width={16} height={92} fill={theme.amber} />
            <rect x={0} y={0} width={16} height={14} fill={theme.pink} />
            <polygon points="0,92 16,92 8,112" fill="#f4e3c1" />
            <polygon points="5,104 11,104 8,112" fill={theme.paperInk} />
          </g>
        </svg>
      )}

      <Callout targetX={target.x} targetY={target.y} labelX={880} labelY={300} label="One bubble per question" color={theme.amber} from={b(2.6)} until={b(5.0)} ring={22} />

      {/* no devices badge */}
      {frame >= b(5.3) && (
        <div style={{ position: "absolute", left: 360, top: 150, transform: `scale(${noDevices})`, transformOrigin: "center", display: "flex", alignItems: "center", gap: 22 }}>
          <svg width={140} height={140} viewBox="0 0 140 140">
            <rect x={48} y={22} width={44} height={96} rx={8} fill={theme.bg2} stroke={theme.ink} strokeWidth={6} />
            <circle cx={70} cy={70} r={60} fill="none" stroke={theme.pink} strokeWidth={10} />
            <line x1={28} y1={28} x2={112} y2={112} stroke={theme.pink} strokeWidth={10} strokeLinecap="round" />
          </svg>
          <div style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 46, color: theme.ink, lineHeight: 1.1 }}>
            No devices
            <br />
            <span style={{ color: theme.muted, fontSize: 32, fontWeight: 400 }}>in the exam room</span>
          </div>
        </div>
      )}
    </SceneShell>
  );
};
