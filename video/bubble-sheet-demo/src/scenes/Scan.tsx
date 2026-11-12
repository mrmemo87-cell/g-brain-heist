import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut, hash, popIn, ramp } from "../anim";
import { AppFrame, Steps } from "../components/AppFrame";
import { Cursor } from "../components/Cursor";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { DEMO_ANSWERS, Sheet, SHEET, type Ring } from "../components/Sheet";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const FRAME = { x: 70, y: 90, w: 880, h: 830 };
const PHONE = { x: 1180, y: 100, w: 470, h: 760 };
const SHEET_W = 350;
const SNAPS = [4.1, 12.2, 12.6, 13.0, 13.4, 13.8, 14.2];

export const Scan: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);

  const tabActive = frame >= b(1.8) ? 1 : 0;
  const phoneIn = ramp(frame, b(2.4), b(3.3), easeInOut);
  const deskew = ramp(frame, b(8.4), b(9.3), easeInOut);
  const rotZ = -7 * (1 - deskew);
  const rotX = 8 * (1 - deskew);
  const flash = SNAPS.map((s) => (frame >= b(s) ? 1 - ramp(frame, b(s), b(s + 0.3)) : 0)).reduce((a, c) => Math.max(a, c), 0);

  const qrGlow = ramp(frame, b(4.9), b(5.2)) * (1 - ramp(frame, b(7.0), b(7.3)));
  const scanLine = frame >= b(5.0) && frame < b(6.2) ? ((frame - b(5.0)) % 18) / 18 : null;
  const matched = popIn(frame, b(6.0), fps);
  const markerGlow = ramp(frame, b(7.3), b(7.6));
  const markerFrame = ramp(frame, b(7.5), b(8.5), easeInOut);

  const rings: Ring[] = DEMO_ANSWERS.map((a, i) => ({ row: a.row, choice: a.choice, color: theme.teal, progress: popIn(frame, b(9.7 + i * 0.1), fps, { damping: 18 }) }));
  const fills = DEMO_ANSWERS.map((a) => ({ ...a, progress: 1 }));

  const thumbsShown = SNAPS.filter((s) => frame >= b(s + 0.3)).length + Math.round(interpolate(frame, [b(14.3), b(15.4)], [0, 23], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const count = Math.min(30, thumbsShown);
  const batchReady = popIn(frame, b(15.4), fps);

  const cursorKeys = [
    { frame: b(1.0), x: 520, y: 560 },
    { frame: b(1.8), x: FRAME.x + 212, y: FRAME.y + 98, click: true },
    { frame: b(2.8), x: FRAME.x + 420, y: FRAME.y + 400 },
  ];

  return (
    <SceneShell scene={scene} accent={theme.cyan}>
      <AppFrame x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} title="Teacher · Paper scanning" tabs={["Print", "Scan", "Guests"]} activeTab={tabActive}>
        {tabActive === 1 ? (
          <>
            <Steps steps={["Add photos", "Review pages", "Confirm results"]} active={0} />
            <div style={{ position: "absolute", left: 22, top: 80, width: 836, height: 150, borderRadius: 18, border: `2px dashed ${theme.cyan}66`, display: "flex", alignItems: "center", justifyContent: "center", gap: 24, color: theme.muted, fontSize: 24 }}>
              <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke={theme.cyan} strokeWidth={1.8}>
                <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
                <circle cx={12} cy={13} r={3.5} />
              </svg>
              Take photos or add from gallery
            </div>
            <div style={{ position: "absolute", left: 22, top: 256, display: "flex", alignItems: "center", gap: 16, fontSize: 24 }}>
              <span style={{ color: theme.muted }}>Sheets in this batch</span>
              <span style={{ fontWeight: 700, color: theme.cyan, fontSize: 30 }}>{count} / 30</span>
            </div>
            <div style={{ position: "absolute", left: 22, top: 306, width: 836, display: "flex", flexWrap: "wrap", gap: 12 }}>
              {Array.from({ length: Math.min(thumbsShown, 30) }, (_, i) => {
                const pop = i < SNAPS.length ? popIn(frame, b(SNAPS[i] + 0.3), fps) : 1;
                return (
                  <div key={i} style={{ width: 94, height: 118, borderRadius: 10, backgroundColor: theme.paper, transform: `scale(${pop}) rotate(${(hash(i) - 0.5) * 4}deg)`, position: "relative", overflow: "hidden", boxShadow: "0 6px 14px rgba(0,0,0,0.4)" }}>
                    <div style={{ position: "absolute", left: 10, top: 10, width: 40, height: 5, backgroundColor: "#cdd5e1" }} />
                    <div style={{ position: "absolute", right: 8, top: 8, width: 18, height: 18, backgroundColor: theme.paperInk }} />
                    {Array.from({ length: 6 }, (_, r) => (
                      <div key={r} style={{ position: "absolute", left: 14 + (Math.floor(hash(i * 7 + r) * 4) * 14), top: 36 + r * 12, width: 9, height: 9, borderRadius: 5, backgroundColor: theme.paperInk }} />
                    ))}
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 22, backgroundColor: theme.teal, color: theme.bg, fontSize: 14, fontWeight: 700, textAlign: "center", lineHeight: "22px" }}>read ✓</div>
                  </div>
                );
              })}
            </div>
            {frame >= b(15.4) && (
              <div style={{ position: "absolute", left: 22, bottom: 24, padding: "14px 26px", borderRadius: 14, backgroundColor: theme.teal, color: theme.bg, fontWeight: 700, fontSize: 30, transform: `scale(${batchReady})`, transformOrigin: "left center" }}>
                Batch ready · 30 sheets · Review pages →
              </div>
            )}
          </>
        ) : (
          <div style={{ position: "absolute", left: 22, top: 20, color: theme.muted, fontSize: 24 }}>
            30 answer sheets printed · Unit 4 Quiz: Cells & Organelles
          </div>
        )}
      </AppFrame>
      <Cursor keys={cursorKeys} />
      <Sfx name="click" at={b(1.8)} />
      {SNAPS.map((s) => (
        <Sfx key={s} name="shutter" at={b(s)} />
      ))}
      <Sfx name="click" at={b(6.0)} volume={0.5} />
      <Sfx name="chime" at={b(15.4)} volume={0.6} />

      {/* phone */}
      <div style={{ position: "absolute", left: PHONE.x + (1 - phoneIn) * 700, top: PHONE.y, width: PHONE.w, height: PHONE.h, borderRadius: 54, backgroundColor: "#0a0f1c", border: "6px solid #2a3652", boxShadow: "0 40px 90px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: 18, width: 120, height: 26, borderRadius: 13, backgroundColor: "#141c30", transform: "translateX(-50%)" }} />
        <div style={{ position: "absolute", left: 20, right: 20, top: 70, bottom: 110, borderRadius: 24, backgroundColor: "#1f2a44", overflow: "hidden", perspective: 900 }}>
          <div style={{ position: "absolute", left: (PHONE.w - 40 - SHEET_W) / 2, top: 40, transform: `rotateX(${rotX}deg) rotateZ(${rotZ}deg)`, transformOrigin: "center center" }}>
            <Sheet width={SHEET_W} fills={fills} rings={rings} qrGlow={qrGlow} markerGlow={markerGlow} markerFrame={markerFrame} />
            {scanLine !== null && (
              <div style={{ position: "absolute", left: (SHEET.qr.x - 12) * (SHEET_W / SHEET.width), top: (SHEET.qr.y - 12 + scanLine * (SHEET.qr.size + 24)) * (SHEET_W / SHEET.width), width: (SHEET.qr.size + 24) * (SHEET_W / SHEET.width), height: 3, backgroundColor: theme.cyan, boxShadow: `0 0 12px ${theme.cyan}` }} />
            )}
          </div>
          {/* viewfinder corners */}
          {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => (
            <div key={`${cx}${cy}`} style={{ position: "absolute", left: cx ? undefined : 16, right: cx ? 16 : undefined, top: cy ? undefined : 16, bottom: cy ? 16 : undefined, width: 40, height: 40, borderTop: cy ? undefined : `4px solid ${theme.ink}`, borderBottom: cy ? `4px solid ${theme.ink}` : undefined, borderLeft: cx ? undefined : `4px solid ${theme.ink}`, borderRight: cx ? `4px solid ${theme.ink}` : undefined, opacity: 0.8 }} />
          ))}
          <div style={{ position: "absolute", inset: 0, backgroundColor: "white", opacity: flash }} />
        </div>
        <div style={{ position: "absolute", left: "50%", bottom: 26, width: 64, height: 64, borderRadius: 32, border: `5px solid ${theme.ink}`, transform: `translateX(-50%) scale(${flash > 0.6 ? 0.85 : 1})`, backgroundColor: flash > 0.6 ? theme.ink : "transparent" }} />
      </div>

      {frame >= b(6.0) && (
        <div style={{ position: "absolute", left: PHONE.x + 20, top: PHONE.y - 66, padding: "12px 24px", borderRadius: 999, backgroundColor: theme.cyan, color: theme.bg, fontFamily: theme.font, fontWeight: 700, fontSize: 30, transform: `scale(${matched})`, boxShadow: `0 10px 40px ${theme.cyan}66` }}>
          Layla Hassan · matched ✓
        </div>
      )}
      {/* status line under the phone: one slot, latest state wins */}
      {frame >= b(8.6) && (
        <div style={{ position: "absolute", left: PHONE.x + 20, top: PHONE.y + PHONE.h + 18, padding: "10px 22px", borderRadius: 999, backgroundColor: frame >= b(12.2) ? theme.cyan : theme.teal, color: theme.bg, fontFamily: theme.font, fontWeight: 700, fontSize: 28, transform: `scale(${popIn(frame, frame >= b(12.2) ? b(12.2) : frame >= b(9.7) ? b(9.7) : b(8.6), fps)})`, transformOrigin: "left center" }}>
          {frame >= b(12.2)
            ? `Batch · ${count} / 30 sheets`
            : frame >= b(9.7)
              ? `Reading bubbles… ${Math.min(20, Math.max(0, Math.floor((frame - b(9.7)) / 3)))} / 20`
              : "Grid locked ✓"}
        </div>
      )}
    </SceneShell>
  );
};
