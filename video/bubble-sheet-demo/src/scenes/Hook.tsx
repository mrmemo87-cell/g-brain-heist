import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { popIn, ramp, hash, easeInOut } from "../anim";
import { SceneShell, Title } from "../components/SceneShell";
import { StickFigure } from "../components/StickFigure";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const PAPERS = 14;

export const Hook: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);
  const relief = frame >= b(4.0);
  const clockSpin = interpolate(frame, [b(2.0), b(3.9)], [0, 720], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
  const clockFade = ramp(frame, b(1.6), b(2.0));
  const papersShown = Math.round(interpolate(frame, [b(0.0), b(0.9)], [0, PAPERS], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const counter = Math.round(interpolate(frame, [b(0.0), b(0.9)], [0, 30], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <SceneShell scene={scene} accent={theme.pink}>
      {/* desk */}
      <div style={{ position: "absolute", left: 180, top: 760, width: 900, height: 26, borderRadius: 13, backgroundColor: "#2a3a5c" }} />
      <div style={{ position: "absolute", left: 230, top: 786, width: 24, height: 140, backgroundColor: "#22304d" }} />
      <div style={{ position: "absolute", left: 1010, top: 786, width: 24, height: 140, backgroundColor: "#22304d" }} />

      {/* stack of papers */}
      {Array.from({ length: PAPERS }, (_, i) => {
        if (i >= papersShown) return null;
        const pop = popIn(frame, b(i * 0.06), fps, { damping: 16 });
        const rot = (hash(i) - 0.5) * 10;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 700 + (hash(i + 40) - 0.5) * 20,
              top: 560 - i * 9 - (1 - pop) * 300,
              width: 220,
              height: 200,
              backgroundColor: theme.paper,
              borderRadius: 4,
              transform: `rotate(${rot}deg)`,
              boxShadow: "0 8px 16px rgba(0,0,0,0.35)",
              opacity: pop,
            }}
          >
            {[0, 1, 2, 3, 4].map((line) => (
              <div key={line} style={{ position: "absolute", left: 20, right: 20 + line * 12, top: 30 + line * 28, height: 6, backgroundColor: "#cdd5e1", borderRadius: 3 }} />
            ))}
            <div style={{ position: "absolute", right: 18, top: 24, width: 46, height: 26, borderRadius: 6, backgroundColor: theme.pink, opacity: 0.85 }} />
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 690,
          top: 330,
          padding: "10px 22px",
          borderRadius: 999,
          backgroundColor: theme.pink,
          color: theme.bg,
          fontFamily: theme.font,
          fontWeight: 700,
          fontSize: 34,
          opacity: ramp(frame, b(0.1), b(0.4)),
        }}
      >
        {counter} papers
      </div>

      {/* red pen on the desk */}
      <div style={{ position: "absolute", left: 560, top: 720, width: 150, height: 14, borderRadius: 7, backgroundColor: theme.pink, transform: "rotate(-18deg)" }} />

      {/* teacher */}
      <StickFigure pose={relief ? "think" : "stressed"} mood={relief ? "happy" : "worried"} x={330} y={580} size={360} />
      {relief && (
        <div
          style={{
            position: "absolute",
            left: 470,
            top: 490,
            width: 70,
            height: 70,
            borderRadius: "50%",
            backgroundColor: theme.amber,
            boxShadow: `0 0 60px ${theme.amber}`,
            transform: `scale(${popIn(frame, b(4.0), fps)})`,
          }}
        />
      )}

      {/* clock */}
      <div style={{ position: "absolute", left: 1330, top: 220, opacity: clockFade }}>
        <svg width={300} height={300} viewBox="0 0 300 300">
          <circle cx={150} cy={150} r={130} fill={theme.bg2} stroke={theme.ink} strokeWidth={10} />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1={150} y1={36} x2={150} y2={52} stroke={theme.muted} strokeWidth={6} transform={`rotate(${i * 30} 150 150)`} />
          ))}
          <line x1={150} y1={150} x2={150} y2={70} stroke={theme.ink} strokeWidth={10} strokeLinecap="round" transform={`rotate(${clockSpin / 12} 150 150)`} />
          <line x1={150} y1={150} x2={150} y2={48} stroke={theme.pink} strokeWidth={7} strokeLinecap="round" transform={`rotate(${clockSpin} 150 150)`} />
          <circle cx={150} cy={150} r={10} fill={theme.ink} />
        </svg>
      </div>

      <Title text="There's a faster way." from={b(4.0)} x={1120} y={640} size={76} color={theme.cyan} />
    </SceneShell>
  );
};
