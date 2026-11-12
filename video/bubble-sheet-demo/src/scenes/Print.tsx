import { Sequence, useCurrentFrame } from "remotion";
import { easeInOut, ramp } from "../anim";
import { Callout } from "../components/Callout";
import { Clips } from "../components/Clips";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { Sheet, SHEET } from "../components/Sheet";
import { geometry } from "../layout";
import { markPoint, markTime, planClips, timelineFor, type Layout } from "../plan";
import { beat, FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

export const Print: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const frame = useCurrentFrame();
  const g = geometry(layout);
  const tl = timelineFor(layout);
  const b = (s: number) => beat(scene, s);
  const dir = layout === "landscape" ? "desktop" : "mobile";
  const footageEnd = b(1.3);
  const clips = planClips(
    layout,
    [{ from: markTime(tl, "print-papers", -0.3), to: markTime(tl, "bubble-sheets-only", 0.5), focus: [{ at: markTime(tl, "print-papers", -0.3), scale: 1.6, ...markPoint(tl, "print-papers") }, { at: markTime(tl, "bubble-sheets-only", 0.5), scale: 1.4, ...markPoint(tl, "bubble-sheets-only") }] }],
    footageEnd,
    FPS,
    0,
  );

  const sheetIn = ramp(frame, b(1.1), b(1.6), easeInOut);
  const sheet = layout === "landscape" ? { x: 1080, y: 40, width: 600 } : { x: 160, y: 250, width: 760 };
  const scale = sheet.width / SHEET.width;
  const toScreen = (px: number, py: number) => ({ x: sheet.x + px * scale, y: sheet.y + py * scale });
  const name = toScreen(SHEET.nameField.x + 160, SHEET.nameField.y - 8);
  const qr = toScreen(SHEET.qr.x + SHEET.qr.size / 2, SHEET.qr.y + SHEET.qr.size / 2);
  const marker = toScreen(SHEET.markers[3].x, SHEET.markers[3].y);
  const labels = layout === "landscape"
    ? { name: { x: 980, y: 420 }, qr: { x: 1560, y: 980 }, marker: { x: 980, y: 640 } }
    : { name: { x: sheet.x + 380, y: 190 }, qr: { x: sheet.x + 740, y: 1400 }, marker: { x: sheet.x + 420, y: 1560 } };

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.purple}>
      <Sequence from={0} durationInFrames={footageEnd + 10} layout="none">
        <Clips clips={clips} sourceWidth={tl.size.width} sourceHeight={tl.size.height} box={g.screen} transitionFrames={0} from={0} />
      </Sequence>
      {frame >= b(1.1) && (
        <div style={{ position: "absolute", left: sheet.x + (1 - sheetIn) * 500, top: sheet.y, transform: `rotate(${(1 - sheetIn) * -6}deg)`, opacity: sheetIn }}>
          <Sheet src={`footage/${dir}/sheet-1.svg`} width={sheet.width} qrGlow={ramp(frame, b(2.6), b(2.9)) * (1 - ramp(frame, b(3.5), b(3.8)))} markerGlow={ramp(frame, b(3.5), b(3.8))} markerFrame={ramp(frame, b(3.6), b(4.4), easeInOut)} />
        </div>
      )}
      <Sfx name="paper" at={b(1.1)} volume={0.5} />
      <Callout targetX={name.x} targetY={name.y} labelX={labels.name.x} labelY={labels.name.y} label="Student's name" color={theme.amber} from={b(1.7)} until={b(4.6)} />
      <Callout targetX={qr.x} targetY={qr.y} labelX={labels.qr.x} labelY={labels.qr.y} label="Unique QR code" color={theme.cyan} from={b(2.7)} until={b(4.6)} ring={70} />
      <Callout targetX={marker.x} targetY={marker.y} labelX={labels.marker.x} labelY={labels.marker.y} label="4 corner markers" color={theme.teal} from={b(3.6)} ring={30} />
      {[1.7, 2.7, 3.6].map((s) => (
        <Sfx key={s} name="pop" at={b(s)} volume={0.35} />
      ))}
      {layout === "landscape" && frame >= b(1.3) && (
        <div style={{ position: "absolute", left: 140, top: 140, width: 760, fontFamily: theme.font, opacity: ramp(frame, b(1.3), b(1.7)) }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: theme.ink, lineHeight: 1.05, letterSpacing: -2 }}>One sheet per student.</div>
          <div style={{ fontSize: 34, color: theme.muted, marginTop: 16 }}>Any office printer. Plain A4.</div>
        </div>
      )}
    </SceneShell>
  );
};
