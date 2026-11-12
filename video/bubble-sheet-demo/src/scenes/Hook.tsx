import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut, popIn, ramp } from "../anim";
import { Kinetic } from "../components/Kinetic";
import { SceneShell } from "../components/SceneShell";
import { Sfx } from "../components/Sfx";
import { geometry } from "../layout";
import type { Layout } from "../plan";
import { beat, type SceneTiming } from "../timing";
import { theme } from "../theme";

export const Hook: React.FC<{ scene: SceneTiming; layout: Layout }> = ({ scene, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = geometry(layout);
  const b = (s: number) => beat(scene, s);
  const dir = layout === "landscape" ? "desktop" : "mobile";
  const words = [
    { text: "Thirty paper quizzes.", at: b(0.05), until: b(1.3) },
    { text: "One red pen.", at: b(1.35), until: b(2.5) },
    { text: "Your whole evening.", at: b(2.55), until: b(3.8) },
  ];
  const photoIn = ramp(frame, b(3.9), b(4.6), easeInOut);
  const push = interpolate(frame, [b(3.9), scene.durationInFrames], [1.0, 1.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const photo = layout === "landscape" ? { x: 1000, y: 40, width: 760, height: 1000 } : { x: 90, y: 160, width: 900, height: 1200 };
  const textX = layout === "landscape" ? 540 : g.width / 2;
  const textY = layout === "landscape" ? 480 : 1560;

  return (
    <SceneShell scene={scene} layout={layout} accent={theme.pink}>
      {words.map((w, i) => (
        <Kinetic key={w.text} text={w.text} at={w.at} until={w.until} x={g.width / 2} y={g.height / 2 - 20} size={g.heroText.size} color={i === 1 ? theme.pink : theme.ink} width={g.width - 160} />
      ))}
      {words.map((w) => (
        <Sfx key={w.at} name="whoosh" at={w.at - 3} volume={0.3} />
      ))}
      {frame >= b(3.9) && (
        <div style={{ position: "absolute", left: photo.x + (1 - photoIn) * 500, top: photo.y, width: photo.width, height: photo.height, borderRadius: 26, overflow: "hidden", boxShadow: "0 50px 120px rgba(0,0,0,0.6)", transform: `rotate(${(1 - photoIn) * 6}deg)`, opacity: photoIn }}>
          <Img src={staticFile(`footage/${dir}/photo-1.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${push})`, transformOrigin: "50% 40%" }} />
        </div>
      )}
      <Sfx name="paper" at={b(3.9)} volume={0.6} />
      <Kinetic text="There's a faster way." at={b(4.0)} x={textX} y={textY} size={layout === "landscape" ? 84 : 72} color={theme.cyan} align="center" width={layout === "landscape" ? 820 : 900} />
      {frame >= b(5.5) && (
        <div style={{ position: "absolute", left: textX, top: textY + (layout === "landscape" ? 120 : 110), transform: `translateX(-50%) scale(${popIn(frame, b(5.5), fps)})`, fontFamily: theme.font, fontSize: layout === "landscape" ? 44 : 40, color: theme.muted, whiteSpace: "nowrap" }}>
          It's already in your pocket.
        </div>
      )}
      <Sfx name="pop" at={b(5.5)} volume={0.5} />
    </SceneShell>
  );
};
