import { useCurrentFrame, useVideoConfig } from "remotion";
import { popIn, ramp } from "../anim";
import { AppFrame, Steps } from "../components/AppFrame";
import { Cursor } from "../components/Cursor";
import { SceneShell, Title } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { bubblePosition, Sheet, SHEET } from "../components/Sheet";
import { StickFigure } from "../components/StickFigure";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const FRAME = { x: 90, y: 80, w: 1240, h: 860 };
const ROWS: Array<{ q: number; answer: string; state: "clear" | "uncertain" }> = [
  { q: 1, answer: "B", state: "clear" },
  { q: 2, answer: "D", state: "clear" },
  { q: 3, answer: "A", state: "clear" },
  { q: 4, answer: "C", state: "clear" },
  { q: 5, answer: "B", state: "clear" },
  { q: 6, answer: "D", state: "clear" },
  { q: 7, answer: "B or C?", state: "uncertain" },
  { q: 8, answer: "A", state: "clear" },
  { q: 9, answer: "B", state: "clear" },
];

// Crop of row 7 (index 6) in sheet coordinates, enlarged to fill the preview.
const CROP_W = 560;
const region = { x: bubblePosition(6, 0).x - 40, y: bubblePosition(6, 0).y - 30, w: 4 * 48 + 56, h: 60 };
const cropScale = CROP_W / region.w;

export const Review: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);
  const resolved = frame >= b(6.9);
  const confirmed = frame >= b(8.0);
  const flagPulse = frame >= b(1.8) ? 1 + Math.sin((frame - b(1.8)) / 4) * 0.12 : 1;
  const cropIn = popIn(frame, b(4.0), fps, { damping: 15 });

  const optionX = (i: number) => FRAME.x + 640 + i * 110;
  const optionY = FRAME.y + 520;
  const cursorKeys = [
    { frame: b(5.6), x: FRAME.x + 500, y: FRAME.y + 700 },
    { frame: b(6.9), x: optionX(2) + 40, y: optionY + 36, click: true },
    { frame: b(7.6), x: FRAME.x + 760, y: FRAME.y + 660 },
    { frame: b(8.0), x: FRAME.x + 760, y: FRAME.y + 660, click: true },
  ];

  return (
    <SceneShell scene={scene} accent={theme.amber}>
      <AppFrame x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} title="Teacher · Paper scanning" tabs={["Print", "Scan", "Guests"]} activeTab={1}>
        <Steps steps={["Add photos", "Review pages", "Confirm results"]} active={1} />
        <div style={{ position: "absolute", left: 22, top: 74, fontSize: 26, fontWeight: 700 }}>Layla Hassan <span style={{ color: theme.muted, fontWeight: 400 }}>· Page 1 of 1 · 19 clear, 1 flagged</span></div>

        {/* detected answers list */}
        <div style={{ position: "absolute", left: 22, top: 124, width: 520 }}>
          {ROWS.map((row, i) => {
            const isFlag = row.state === "uncertain";
            const fixed = isFlag && resolved;
            const color = fixed ? theme.teal : isFlag ? theme.amber : theme.teal;
            const pop = popIn(frame, b(0.1 + i * 0.08), fps, { damping: 18 });
            return (
              <div key={row.q} style={{ display: "flex", alignItems: "center", gap: 16, height: 62, opacity: pop, transform: `translateX(${(1 - pop) * -30}px)`, borderBottom: `1px solid ${theme.panelBorder}` }}>
                <div style={{ width: 60, color: theme.muted, fontSize: 24 }}>Q{row.q}</div>
                <div style={{ padding: "6px 18px", borderRadius: 999, backgroundColor: `${color}22`, border: `2px solid ${color}`, color, fontWeight: 700, fontSize: 24, transform: isFlag && !fixed ? `scale(${flagPulse})` : undefined }}>
                  {fixed ? "C" : row.answer}
                </div>
                {isFlag && !fixed && <div style={{ color: theme.amber, fontSize: 22 }}>⚑ Uncertain · check the photo</div>}
                {fixed && <div style={{ color: theme.teal, fontSize: 22 }}>Reviewed by teacher</div>}
              </div>
            );
          })}
        </div>

        {/* photo crop panel */}
        {frame >= b(4.0) && (
          <div style={{ position: "absolute", left: 600, top: 124, width: 600, transform: `scale(${cropIn})`, transformOrigin: "top left" }}>
            <div style={{ color: theme.muted, fontSize: 22, marginBottom: 10 }}>Q7 · photo crop</div>
            <div style={{ width: CROP_W + 40, height: region.h * cropScale + 40, borderRadius: 18, backgroundColor: theme.paper, overflow: "hidden", position: "relative", border: `3px solid ${theme.amber}` }}>
              <div style={{ position: "absolute", left: 20 - region.x * cropScale, top: 20 - region.y * cropScale }}>
                <Sheet
                  width={SHEET.width * cropScale}
                  fills={[
                    { row: 6, choice: 1, progress: 1, faint: true },
                    { row: 6, choice: 2, progress: 1 },
                  ]}
                  rings={resolved ? [{ row: 6, choice: 2, color: theme.teal, progress: popIn(frame, b(6.9), fps) }] : [{ row: 6, choice: null, color: theme.amber, progress: 1 }]}
                  style={{ boxShadow: "none", borderRadius: 0 }}
                />
              </div>
            </div>
            <div style={{ color: theme.muted, fontSize: 22, marginTop: 26 }}>Teacher's answer</div>
            <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
              {["A", "B", "C", "D", "Blank"].map((opt, i) => {
                const chosen = resolved && opt === "C";
                return (
                  <div key={opt} style={{ width: i < 4 ? 96 : 130, height: 72, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, backgroundColor: chosen ? theme.teal : "rgba(255,255,255,0.06)", color: chosen ? theme.bg : theme.ink, border: `2px solid ${chosen ? theme.teal : theme.panelBorder}` }}>
                    {opt}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 34, display: "inline-block", padding: "16px 34px", borderRadius: 14, backgroundColor: confirmed ? theme.teal : resolved ? theme.cyan : "rgba(255,255,255,0.08)", color: confirmed || resolved ? theme.bg : theme.muted, fontWeight: 700, fontSize: 28 }}>
              {confirmed ? "Page confirmed ✓" : "Confirm page"}
            </div>
          </div>
        )}
      </AppFrame>
      <Cursor keys={cursorKeys} />
      <Sfx name="click" at={b(6.9)} />
      <Sfx name="chime" at={b(8.0)} volume={0.6} />

      <StickFigure pose={confirmed ? "point" : "think"} flip x={1500} y={430} size={380} mood={confirmed ? "happy" : "neutral"} />
      <Title text="Nothing is graded blind." from={b(8.6)} x={1380} y={200} size={54} color={theme.amber} width={500} />
      <div style={{ position: "absolute", left: 1380, top: 320, width: 500, fontFamily: theme.font, fontSize: 28, color: theme.muted, opacity: ramp(frame, b(9.2), b(9.7)) }}>
        Clear marks are graded automatically. Only doubtful ones ask for a human.
      </div>
    </SceneShell>
  );
};
