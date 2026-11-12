import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut, popIn, ramp } from "../anim";
import { Callout } from "../components/Callout";
import { Cursor } from "../components/Cursor";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { Sheet, SHEET } from "../components/Sheet";
import { StickFigure } from "../components/StickFigure";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

const FINAL = { x: 1010, y: 60, width: 520 };
const PRINTER = { x: 180, y: 540, w: 440, h: 240 };

export const Print: React.FC<{ scene: SceneTiming }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = (s: number) => beat(scene, s);

  // Sheet emerges from the printer slot, then glides to its final spot.
  const emerge = ramp(frame, b(0.6), b(1.5), easeInOut);
  const travel = ramp(frame, b(1.5), b(2.3), easeInOut);
  const slotWidth = 300;
  const startX = PRINTER.x + (PRINTER.w - slotWidth) / 2;
  const startY = PRINTER.y + 30;
  const x = interpolate(travel, [0, 1], [startX, FINAL.x]);
  const y = interpolate(travel, [0, 1], [startY - emerge * 320, FINAL.y]);
  const width = interpolate(travel, [0, 1], [slotWidth, FINAL.width]);
  const scale = width / SHEET.width;
  const toScreen = (px: number, py: number) => ({ x: FINAL.x + px * (FINAL.width / SHEET.width), y: FINAL.y + py * (FINAL.width / SHEET.width) });

  const tilt = frame >= b(9.6) && frame < b(10.6)
    ? interpolate(frame, [b(9.6), b(9.9)], [0, -9], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut })
    : frame >= b(10.6)
      ? -9 * (1 - popIn(frame, b(10.6), fps, { damping: 9, stiffness: 120 }))
      : 0;

  const name = toScreen(SHEET.nameField.x + 200, SHEET.nameField.y - 8);
  const code = toScreen(SHEET.codeField.x + 160, SHEET.codeField.y - 6);
  const qr = toScreen(SHEET.qr.x + SHEET.qr.size / 2, SHEET.qr.y + SHEET.qr.size / 2);
  const marker = toScreen(SHEET.markers[3].x, SHEET.markers[3].y);

  return (
    <SceneShell scene={scene} accent={theme.purple}>
      {/* printer */}
      <div style={{ position: "absolute", left: PRINTER.x, top: PRINTER.y, width: PRINTER.w, height: PRINTER.h, borderRadius: 26, backgroundColor: "#243352", border: `2px solid ${theme.panelBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.45)" }}>
        <div style={{ position: "absolute", left: (PRINTER.w - slotWidth - 20) / 2, top: 18, width: slotWidth + 20, height: 16, borderRadius: 8, backgroundColor: "#0b1220" }} />
        <div style={{ position: "absolute", left: 30, bottom: 30, width: 120, height: 40, borderRadius: 10, backgroundColor: "#16213a" }} />
        <div style={{ position: "absolute", right: 36, bottom: 40, width: 22, height: 22, borderRadius: 11, backgroundColor: frame >= b(0.4) ? theme.teal : theme.muted, boxShadow: frame >= b(0.4) ? `0 0 20px ${theme.teal}` : "none" }} />
      </div>
      {/* sheet, drawn behind the printer body while it emerges */}
      <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${tilt}deg)`, transformOrigin: "center center", zIndex: travel > 0 ? 2 : 0 }}>
        <div style={{ clipPath: travel > 0 ? undefined : `inset(0 0 ${Math.max(0, (SHEET.height * scale) - (startY - y + 30))}px 0)` }}>
          <Sheet
            width={width}
            qrGlow={ramp(frame, b(4.7), b(5.1)) * (1 - ramp(frame, b(6.6), b(7.0)))}
            markerGlow={ramp(frame, b(6.5), b(6.9))}
            markerFrame={ramp(frame, b(7.0), b(8.4), easeInOut)}
          />
        </div>
      </div>
      <div style={{ position: "absolute", left: PRINTER.x, top: PRINTER.y + 34, width: PRINTER.w, height: PRINTER.h - 34, borderRadius: "0 0 26px 26px", backgroundColor: "#243352", zIndex: 1 }} />

      {/* print button and cursor */}
      <div style={{ position: "absolute", left: 240, top: 330, padding: "18px 40px", borderRadius: 16, backgroundColor: frame >= b(0.3) ? theme.teal : theme.cyan, color: theme.bg, fontFamily: theme.font, fontWeight: 700, fontSize: 36, transform: `scale(${frame >= b(0.3) && frame < b(0.6) ? 0.94 : 1})` }}>
        {frame >= b(0.3) ? "Printing 30 sheets…" : "Print answer sheets"}
      </div>
      <Cursor keys={[{ frame: 0, x: 520, y: 460 }, { frame: b(0.3), x: 410, y: 372, click: true }, { frame: b(1.2), x: 560, y: 460 }]} />
      <Sfx name="click" at={b(0.3)} />
      <Sfx name="paper" at={b(0.6)} />
      <Sfx name="paper" at={b(10.6)} volume={0.4} />

      <StickFigure pose="idle" x={660} y={600} size={300} />
      <div style={{ position: "absolute", left: PRINTER.x + 30, top: PRINTER.y + PRINTER.h - 70, fontFamily: theme.font, fontSize: 22, color: theme.muted, zIndex: 2 }}>Any office printer · plain A4</div>

      <Callout targetX={name.x} targetY={name.y} labelX={900} labelY={500} label="Student's name" color={theme.amber} from={b(1.2)} until={b(6.4)} />
      <Callout targetX={code.x} targetY={code.y} labelX={900} labelY={230} label="Assignment code" color={theme.pink} from={b(3.4)} until={b(6.4)} />
      <Callout targetX={qr.x} targetY={qr.y} labelX={1570} labelY={30} label="Unique QR code" color={theme.cyan} from={b(4.8)} until={b(6.6)} ring={70} />
      <Callout targetX={marker.x} targetY={marker.y} labelX={900} labelY={560} label="4 corner markers" color={theme.teal} from={b(6.6)} until={b(9.4)} ring={30} />
      {frame >= b(10.6) && (
        <div style={{ position: "absolute", left: 1570, top: 760, padding: "10px 22px", borderRadius: 999, backgroundColor: theme.teal, color: theme.bg, fontFamily: theme.font, fontWeight: 700, fontSize: 30, transform: `scale(${popIn(frame, b(10.7), fps)})` }}>
          Straightened ✓
        </div>
      )}
    </SceneShell>
  );
};
