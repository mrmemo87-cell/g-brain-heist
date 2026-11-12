import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { popIn, ramp } from "../anim";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import type { Layout } from "../plan";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const WORDS = [
  { text: "Print.", color: theme.cyan, at: 0.05 },
  { text: "Scan.", color: theme.purple, at: 0.5 },
  { text: "Done.", color: theme.teal, at: 0.95 },
];

export const Outro: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = geometry(layout);
  const b = (s: number) => beat(scene, s);
  const lift = ramp(frame, b(1.7), b(2.2));
  const brandIn = popIn(frame, b(2.0), fps, { damping: 14 });
  const wordSize = layout === "landscape" ? 150 : 120;
  const row = layout === "landscape";

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.cyan} captions={false}>
      <div style={{ position: "absolute", left: 0, right: 0, top: interpolate(lift, [0, 1], [row ? 400 : 700, row ? 150 : 330]), display: "flex", flexDirection: row ? "row" : "column", alignItems: "center", justifyContent: "center", gap: row ? 50 : 0, transform: `scale(${interpolate(lift, [0, 1], [1, 0.6])})` }}>
        {WORDS.map((w) => {
          const pop = popIn(frame, b(w.at), fps, { damping: 10, stiffness: 180 });
          return (
            <div key={w.text} style={{ fontFamily: theme.font, fontWeight: 700, fontSize: wordSize, color: w.color, transform: `scale(${pop})`, textShadow: `0 20px 60px ${w.color}55`, lineHeight: 1.05 }}>
              {w.text}
            </div>
          );
        })}
      </div>
      {WORDS.map((w) => (
        <Sfx key={w.text} name="pop" at={b(w.at)} volume={0.5} />
      ))}
      {frame >= b(2.0) && (
        <div style={{ position: "absolute", left: 0, right: 0, top: row ? 380 : 760, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, transform: `scale(${brandIn})`, opacity: brandIn }}>
          <Img src={staticFile("logo.png")} style={{ height: row ? 220 : 260 }} />
          <div style={{ fontFamily: theme.font, fontWeight: 700, fontSize: row ? 84 : 76, color: theme.ink }}>Brains Heist</div>
          <div style={{ fontFamily: theme.font, fontSize: row ? 40 : 38, color: theme.muted }}>Paper exams, digital speed.</div>
          <div style={{ fontFamily: theme.font, fontSize: row ? 30 : 30, color: theme.cyan, marginTop: 10 }}>brainsheist.com</div>
        </div>
      )}
      <Sfx name="success" at={b(2.0)} volume={0.5} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: g.captionBottom + 10, textAlign: "center", fontFamily: theme.font, fontSize: 22, color: theme.muted, opacity: 0.7 }}>
        Recorded in the live app · no mock-ups
      </div>
    </SceneShell>
  );
};
