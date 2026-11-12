import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut, popIn, ramp } from "../anim";
import { Callout } from "../components/Callout";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { Sheet, SHEET } from "../components/Sheet";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const CLIP_TRANSITION = 10;

export const Print: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const dir = layout === "landscape" ? "desktop" : "mobile";
  const footageEnd = b(3.6);
  const printWindowSeconds = Math.max(2.5, markTime(tl, "print-window-scrolled") - markTime(tl, "print-window-open") - 0.3);
  const clips = planClips(
    layout,
    [
      { from: markTime(tl, "print-papers", -0.5), to: markTime(tl, "bubble-sheets-only", 0.8), focus: [{ at: markTime(tl, "print-papers", -0.5), scale: 1.0, ...markPoint(tl, "print-papers") }, { at: markTime(tl, "print-papers"), scale: 1.6, ...markPoint(tl, "print-papers") }, { at: markTime(tl, "bubble-sheets-only", -0.2), scale: 1.4, ...markPoint(tl, "bubble-sheets-only") }] },
      { src: "print", from: 0.6, to: 0.6 + printWindowSeconds, focus: [{ at: 0.6, scale: 1.15, x: tl.size.width / 2, y: tl.size.height * 0.4 }, { at: 0.6 + printWindowSeconds, scale: 1.05, x: tl.size.width / 2, y: tl.size.height * 0.5 }], weight: 2.5 },
    ],
    footageEnd,
    FPS,
    CLIP_TRANSITION,
  );

  // Sheet hero: slides in while the footage fades, then gets annotated.
  const sheetIn = ramp(frame, b(3.3), b(4.0), easeInOut);
  const sheet = layout === "landscape" ? { x: 1080, y: 40, width: 600 } : { x: 160, y: 250, width: 760 };
  const scale = sheet.width / SHEET.width;
  const toScreen = (px: number, py: number) => ({ x: sheet.x + px * scale, y: sheet.y + py * scale });
  const name = toScreen(SHEET.nameField.x + 160, SHEET.nameField.y - 8);
  const code = toScreen(SHEET.codeField.x + 120, SHEET.codeField.y - 6);
  const qr = toScreen(SHEET.qr.x + SHEET.qr.size / 2, SHEET.qr.y + SHEET.qr.size / 2);
  const marker = toScreen(SHEET.markers[3].x, SHEET.markers[3].y);
  const labelX = layout === "landscape" ? 980 : sheet.x + 60;
  const labels = layout === "landscape"
    ? { name: { x: labelX, y: 420 }, code: { x: labelX, y: 250 }, qr: { x: 1560, y: 980 }, marker: { x: labelX, y: 640 } }
    : { name: { x: sheet.x + 40, y: 230 }, code: { x: sheet.x + 500, y: 230 }, qr: { x: sheet.x + 300, y: 1400 }, marker: { x: sheet.x + 520, y: 1600 } };

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.purple}>
      <Sequence from={0} durationInFrames={footageEnd + 6} layout="none">
        <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={CLIP_TRANSITION} from={2} />
      </Sequence>
      {frame >= b(3.3) && (
        <div style={{ position: "absolute", left: sheet.x + (1 - sheetIn) * 600, top: sheet.y, transform: `rotate(${(1 - sheetIn) * -8}deg)`, opacity: sheetIn }}>
          <Sheet src={`footage/${dir}/sheet-1.svg`} width={sheet.width} qrGlow={ramp(frame, b(6.3), b(6.7)) * (1 - ramp(frame, b(7.6), b(7.9)))} markerGlow={ramp(frame, b(7.5), b(7.9))} markerFrame={ramp(frame, b(7.7), b(8.6), easeInOut)} />
        </div>
      )}
      <Sfx name="whoosh" at={b(3.3)} volume={0.4} />
      <Callout targetX={name.x} targetY={name.y} labelX={labels.name.x} labelY={labels.name.y} label="Student's name" color={theme.amber} from={b(4.2)} until={b(8.9)} />
      <Callout targetX={code.x} targetY={code.y} labelX={labels.code.x} labelY={labels.code.y} label="Assignment code" color={theme.pink} from={b(5.3)} until={b(8.9)} />
      <Callout targetX={qr.x} targetY={qr.y} labelX={labels.qr.x} labelY={labels.qr.y} label="Unique QR code" color={theme.cyan} from={b(6.4)} until={b(8.9)} ring={70} />
      <Callout targetX={marker.x} targetY={marker.y} labelX={labels.marker.x} labelY={labels.marker.y} label="4 corner markers" color={theme.teal} from={b(7.5)} ring={30} />
      {[4.2, 5.3, 6.4, 7.5].map((s) => (
        <Sfx key={s} name="pop" at={b(s)} volume={0.4} />
      ))}
      {frame >= b(3.6) && layout === "landscape" && (
        <div style={{ position: "absolute", left: 140, top: 120, width: 760, fontFamily: theme.font, opacity: popIn(frame, b(3.8), fps) }}>
          <div style={{ fontSize: 30, color: theme.muted, letterSpacing: 4, textTransform: "uppercase" }}>Printed from the app</div>
          <div style={{ fontSize: 68, fontWeight: 700, color: theme.ink, lineHeight: 1.1, marginTop: 10 }}>One sheet per student.</div>
          <div style={{ fontSize: 34, color: theme.muted, marginTop: 18 }}>Any office printer, plain A4.</div>
        </div>
      )}
    </SceneShell>
  );
};
