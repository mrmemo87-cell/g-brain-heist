import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { hash, popIn, ramp } from "../anim";
import { AppFrame, Steps } from "../components/AppFrame";
import { Cursor } from "../components/Cursor";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { StickFigure } from "../components/StickFigure";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const FRAME = { x: 70, y: 80, w: 1120, h: 860 };
const STUDENTS = [
  { name: "Layla Hassan", score: 17 },
  { name: "Omar Said", score: 14 },
  { name: "Mia Chen", score: 19 },
  { name: "Yusuf Ali", score: 12 },
  { name: "Sara Noor", score: 16 },
  { name: "Daniel Park", score: 15 },
  { name: "Aisha Rahman", score: 18 },
];
const QUESTION_DIFFICULTY = [92, 88, 76, 81, 70, 84, 41, 77, 66, 90, 73, 58, 85, 79, 62, 88, 71, 64, 83, 75];
const PHONE = { x: 1260, y: 150, w: 380, h: 760 };

export const Results: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);
  const confirmed = frame >= b(0.5);
  const avg = Math.round(interpolate(frame, [b(3.7), b(4.5)], [0, 76], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const studentScore = Math.round(interpolate(frame, [b(6.3), b(7.2)], [0, 17], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const celebrate = frame >= b(7.2);
  const phoneIn = popIn(frame, b(6.0), fps, { damping: 16 });

  return (
    <SceneShell scene={scene} accent={theme.teal}>
      <AppFrame x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} title="Teacher · Paper scanning" tabs={["Print", "Scan", "Guests"]} activeTab={1}>
        <Steps steps={["Add photos", "Review pages", "Confirm results"]} active={2} />
        <div style={{ position: "absolute", left: 22, top: 74, padding: "12px 28px", borderRadius: 14, backgroundColor: confirmed ? theme.teal : theme.cyan, color: theme.bg, fontWeight: 700, fontSize: 26 }}>
          {confirmed ? "30 results saved to the gradebook ✓" : "Confirm 30 sheets"}
        </div>

        {/* gradebook rows */}
        <div style={{ position: "absolute", left: 22, top: 150, width: 660 }}>
          {STUDENTS.map((s, i) => {
            const at = b(1.4 + i * 0.18);
            const pop = popIn(frame, at, fps, { damping: 18 });
            const value = Math.round(interpolate(frame, [at, at + 24], [0, s.score], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
            if (frame < at) return null;
            return (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 18, height: 66, opacity: pop, transform: `translateY(${(1 - pop) * 20}px)` }}>
                <div style={{ width: 200, fontSize: 24 }}>{s.name}</div>
                <div style={{ flex: 1, height: 18, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{ width: `${(value / 20) * 100}%`, height: "100%", backgroundColor: s.score >= 14 ? theme.teal : theme.amber }} />
                </div>
                <div style={{ width: 90, textAlign: "right", fontSize: 26, fontWeight: 700 }}>{value} / 20</div>
              </div>
            );
          })}
        </div>

        {/* class average tile */}
        {frame >= b(3.6) && (
          <div style={{ position: "absolute", left: 720, top: 150, width: 360, height: 180, borderRadius: 20, backgroundColor: "rgba(34,211,238,0.1)", border: `2px solid ${theme.cyan}`, padding: 22, transform: `scale(${popIn(frame, b(3.6), fps)})`, transformOrigin: "top left" }}>
            <div style={{ color: theme.muted, fontSize: 22 }}>Class average</div>
            <div style={{ fontSize: 86, fontWeight: 700, color: theme.cyan, lineHeight: 1.1 }}>{avg}%</div>
            <div style={{ color: theme.muted, fontSize: 20 }}>30 students · Unit 4 Quiz</div>
          </div>
        )}

        {/* per-question insight strip */}
        {frame >= b(4.7) && (
          <div style={{ position: "absolute", left: 720, top: 360, width: 360, transform: `scale(${popIn(frame, b(4.7), fps)})`, transformOrigin: "top left" }}>
            <div style={{ color: theme.muted, fontSize: 22, marginBottom: 12 }}>Correct per question</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {QUESTION_DIFFICULTY.map((pct, i) => {
                const grow = ramp(frame, b(4.8 + i * 0.04), b(5.1 + i * 0.04));
                const hard = pct < 50;
                return (
                  <div key={i} style={{ width: 64, height: 54, borderRadius: 10, backgroundColor: hard ? theme.pink : pct < 70 ? theme.amber : theme.teal, opacity: 0.25 + 0.75 * grow, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: theme.bg, fontWeight: 700, fontSize: 16, transform: hard && frame >= b(5.6) ? `scale(${1 + Math.sin((frame - b(5.6)) / 4) * 0.08})` : undefined }}>
                    <span>Q{i + 1}</span>
                    <span style={{ fontSize: 15 }}>{Math.round(pct * grow)}%</span>
                  </div>
                );
              })}
            </div>
            {frame >= b(5.6) && (
              <div style={{ marginTop: 14, color: theme.pink, fontSize: 22, lineHeight: 1.2, fontWeight: 700, opacity: ramp(frame, b(5.6), b(5.9)) }}>
                Q7 needs re-teaching
                <br />
                <span style={{ fontWeight: 400 }}>only 41% got it right</span>
              </div>
            )}
          </div>
        )}
      </AppFrame>
      <Cursor keys={[{ frame: 0, x: 560, y: 520 }, { frame: b(0.5), x: FRAME.x + 160, y: FRAME.y + 236, click: true }, { frame: b(1.4), x: 430, y: 900 }]} />
      <Sfx name="click" at={b(0.5)} />
      <Sfx name="chime" at={b(1.2)} volume={0.5} />
      <Sfx name="chime" at={b(7.2)} volume={0.7} />

      {/* student phone */}
      {frame >= b(6.0) && (
        <div style={{ position: "absolute", left: PHONE.x, top: PHONE.y, width: PHONE.w, height: PHONE.h, borderRadius: 48, backgroundColor: "#0a0f1c", border: "6px solid #2a3652", boxShadow: "0 40px 90px rgba(0,0,0,0.6)", overflow: "hidden", transform: `scale(${phoneIn})`, transformOrigin: "bottom center", fontFamily: theme.font }}>
          <div style={{ position: "absolute", left: 24, right: 24, top: 60, display: "flex", alignItems: "center", gap: 12 }}>
            <Img src={staticFile("logo.png")} style={{ height: 34 }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.ink }}>Brains Heist</div>
          </div>
          <div style={{ position: "absolute", left: 24, top: 130, color: theme.muted, fontSize: 20 }}>Unit 4 Quiz: Cells & Organelles</div>
          <div style={{ position: "absolute", left: 24, right: 24, top: 180, height: 230, borderRadius: 24, backgroundColor: "rgba(45,230,177,0.12)", border: `2px solid ${theme.teal}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 96, fontWeight: 700, color: theme.teal, lineHeight: 1 }}>{studentScore}<span style={{ fontSize: 36, color: theme.muted }}> / 20</span></div>
            <div style={{ fontSize: 24, color: theme.ink, marginTop: 10 }}>{celebrate ? "Great work, Layla!" : "Scoring…"}</div>
          </div>
          <div style={{ position: "absolute", left: 24, right: 24, top: 440, color: theme.muted, fontSize: 20 }}>Graded from paper · {celebrate ? "+170 XP" : ""}</div>
          {celebrate &&
            Array.from({ length: 40 }, (_, i) => {
              const t = frame - b(7.2);
              const x = hash(i) * PHONE.w;
              const y = -20 + ((t * (2 + hash(i + 9) * 3) + hash(i + 3) * 300) % (PHONE.h + 40));
              const colors = [theme.cyan, theme.pink, theme.amber, theme.teal, theme.purple];
              return <div key={i} style={{ position: "absolute", left: x, top: y, width: 10, height: 16, backgroundColor: colors[i % colors.length], transform: `rotate(${t * 6 + i * 40}deg)`, borderRadius: 2 }} />;
            })}
        </div>
      )}
      <StickFigure pose={celebrate ? "cheer" : "phone"} x={1660} y={590} size={330} accent={theme.teal} />
    </SceneShell>
  );
};
