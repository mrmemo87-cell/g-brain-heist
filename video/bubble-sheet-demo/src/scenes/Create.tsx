import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { popIn, ramp } from "../anim";
import { AppFrame } from "../components/AppFrame";
import { Cursor } from "../components/Cursor";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { StickFigure } from "../components/StickFigure";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const TITLE = "Unit 4 Quiz: Cells & Organelles";
const QUESTIONS = [
  "Which organelle produces most of the cell's ATP?",
  "Where does protein synthesis begin?",
  "What controls what enters and leaves the cell?",
  "Which structure stores genetic material?",
  "Plant cells have which extra outer layer?",
];
const STUDENTS = ["Layla Hassan", "Omar Said", "Mia Chen", "Yusuf Ali", "Sara Noor", "Daniel Park"];

const FRAME = { x: 140, y: 110, w: 1200, h: 820 };

export const Create: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);

  const typed = Math.round(interpolate(frame, [b(0.2), b(1.9)], [0, TITLE.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const checks = [b(2.4), b(2.8), b(3.2)];
  const paperOn = frame >= b(4.4);
  const progress = ramp(frame, b(5.7), b(7.5));
  const ready = Math.round(interpolate(frame, [b(7.6), b(9.3)], [0, 30], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  const qx = FRAME.x + 60;
  // Content area starts 64px below the frame top; cards start at 190px within it.
  const qy = (i: number) => FRAME.y + 64 + 190 + i * 74 + 8;
  const cursorKeys = [
    { frame: b(2.0), x: 700, y: 600 },
    { frame: checks[0], x: qx + 18, y: qy(0) + 22, click: true },
    { frame: checks[1], x: qx + 18, y: qy(2) + 22, click: true },
    { frame: checks[2], x: qx + 18, y: qy(3) + 22, click: true },
    { frame: b(4.0), x: FRAME.x + 1030, y: FRAME.y + 150 },
    { frame: b(4.4), x: FRAME.x + 1030, y: FRAME.y + 150, click: true },
    { frame: b(5.2), x: FRAME.x + 1030, y: FRAME.y + 260 },
  ];

  return (
    <SceneShell scene={scene} accent={theme.cyan}>
      <AppFrame x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} title="Teacher · New assignment">
        <div style={{ position: "absolute", left: 60, top: 30, color: theme.muted, fontSize: 20 }}>Title</div>
        <div style={{ position: "absolute", left: 60, top: 60, width: 760, height: 64, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", border: `1px solid ${theme.panelBorder}`, display: "flex", alignItems: "center", padding: "0 20px", fontSize: 30, fontWeight: 700 }}>
          {TITLE.slice(0, typed)}
          <span style={{ opacity: frame % 20 < 10 && typed < TITLE.length ? 1 : 0, marginLeft: 2 }}>|</span>
        </div>

        <div style={{ position: "absolute", left: 60, top: 150, color: theme.muted, fontSize: 20 }}>Questions from the bank</div>
        {QUESTIONS.map((q, i) => {
          const checkedAt = i === 0 ? checks[0] : i === 2 ? checks[1] : i === 3 ? checks[2] : null;
          const checked = checkedAt !== null && frame >= checkedAt;
          const pop = checkedAt !== null ? popIn(frame, checkedAt, fps) : 0;
          return (
            <div key={q} style={{ position: "absolute", left: 60, top: 190 + i * 74, width: 760, height: 60, borderRadius: 12, display: "flex", alignItems: "center", gap: 18, padding: "0 16px", backgroundColor: checked ? "rgba(45,230,177,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${checked ? theme.teal : theme.panelBorder}` }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, border: `2px solid ${checked ? theme.teal : theme.muted}`, backgroundColor: checked ? theme.teal : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {checked && (
                  <svg width={22} height={22} viewBox="0 0 24 24" style={{ transform: `scale(${pop})` }}>
                    <path d="M4 12 L10 18 L20 6" fill="none" stroke={theme.bg} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div style={{ fontSize: 23 }}>{q}</div>
            </div>
          );
        })}

        {/* delivery toggle */}
        <div style={{ position: "absolute", left: 870, top: 30, color: theme.muted, fontSize: 20 }}>Delivery</div>
        <div style={{ position: "absolute", left: 870, top: 60, width: 280, height: 64, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", border: `1px solid ${theme.panelBorder}`, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 5, bottom: 5, width: 132, left: paperOn ? 143 : 5, borderRadius: 999, backgroundColor: theme.cyan, transition: "none" }} />
          <div style={{ position: "absolute", left: 0, width: 140, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: paperOn ? theme.muted : theme.bg }}>Online</div>
          <div style={{ position: "absolute", right: 0, width: 140, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: paperOn ? theme.bg : theme.muted }}>Paper</div>
        </div>

        {/* preparation */}
        {frame >= b(5.6) && (
          <div style={{ position: "absolute", left: 870, top: 150, width: 280 }}>
            <div style={{ fontSize: 20, color: theme.muted, marginBottom: 10 }}>{progress < 1 ? "Preparing answer sheets…" : "Answer sheets ready"}</div>
            <div style={{ height: 14, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: theme.teal }} />
            </div>
            <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
              {STUDENTS.map((name, i) => {
                const at = b(7.6 + i * 0.22);
                const pop = popIn(frame, at, fps);
                if (frame < at) return null;
                return (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, opacity: pop, transform: `translateX(${(1 - pop) * 40}px)` }}>
                    <div style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.teal, display: "flex", alignItems: "center", justifyContent: "center", color: theme.bg, fontSize: 18, fontWeight: 700 }}>✓</div>
                    {name}
                  </div>
                );
              })}
              {frame >= b(7.6) && <div style={{ fontSize: 22, color: theme.cyan, fontWeight: 700, marginTop: 6 }}>{ready} / 30 sheets ready</div>}
            </div>
          </div>
        )}
      </AppFrame>
      <Cursor keys={cursorKeys} />
      {checks.map((f) => (
        <Sfx key={f} name="click" at={f} />
      ))}
      <Sfx name="click" at={b(4.4)} />
      <Sfx name="chime" at={b(7.5)} volume={0.5} />
      <StickFigure pose="point" x={1480} y={420} size={380} flip />
    </SceneShell>
  );
};
