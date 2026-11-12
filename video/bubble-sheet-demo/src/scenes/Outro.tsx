import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { popIn, ramp } from "../anim";
import { SceneShell } from "../components/SceneShell";
import { StickFigure } from "../components/StickFigure";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const WORDS = [
  { text: "Print.", color: theme.cyan, at: 0.05 },
  { text: "Scan.", color: theme.purple, at: 0.5 },
  { text: "Done.", color: theme.teal, at: 0.95 },
];

export const Outro: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);
  const lift = ramp(frame, b(1.7), b(2.2));
  const brandIn = popIn(frame, b(2.0), fps, { damping: 14 });

  return (
    <SceneShell scene={scene} accent={theme.cyan} captions={false}>
      <div style={{ position: "absolute", left: 0, right: 0, top: interpolate(lift, [0, 1], [400, 150]), display: "flex", justifyContent: "center", gap: 50, transform: `scale(${interpolate(lift, [0, 1], [1, 0.6])})` }}>
        {WORDS.map((w) => {
          const pop = popIn(frame, b(w.at), fps, { damping: 10, stiffness: 180 });
          return (
            <div key={w.text} style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 150, color: w.color, transform: `scale(${pop})`, textShadow: `0 20px 60px ${w.color}55` }}>
              {w.text}
            </div>
          );
        })}
      </div>
      {frame >= b(2.0) && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, transform: `scale(${brandIn})`, opacity: brandIn }}>
          <Img src={staticFile("logo.png")} style={{ height: 220 }} />
          <div style={{ fontFamily: theme.font, fontWeight: 700, fontSize: 84, color: theme.ink }}>Brains Heist</div>
          <div style={{ fontFamily: theme.font, fontSize: 40, color: theme.muted }}>Paper exams, digital speed.</div>
        </div>
      )}
      {frame >= b(2.2) && (
        <>
          <StickFigure pose="cheer" x={220} y={520} size={360} />
          <StickFigure pose="cheer" x={1500} y={520} size={360} accent={theme.teal} />
        </>
      )}
    </SceneShell>
  );
};
