import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { SceneTiming } from "../timing";
import { Background } from "./Background";
import { Caption } from "./Caption";

interface Props {
  scene: SceneTiming;
  accent?: string;
  /** Hide the subtitle strip when the narration is already shown on screen. */
  captions?: boolean;
  children?: React.ReactNode;
}

/** Fades the scene in and out, plays its narration and shows its captions. */
export const SceneShell: React.FC<Props> = ({ scene, accent, captions = true, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 10, scene.durationInFrames - 10, scene.durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill style={{ opacity }}>
      <Background accent={accent} />
      {children}
      {captions && <Caption scene={scene} />}
      <Sequence from={scene.voiceStart} layout="none">
        <Audio src={staticFile(`vo/${scene.id}.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};

/** Big title that slams in with a short overshoot. */
export const Title: React.FC<{ text: string; from: number; x: number; y: number; size?: number; color?: string; width?: number }> = ({
  text,
  from,
  x,
  y,
  size = 72,
  color = "#eef2ff",
  width,
}) => {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  const t = frame - from;
  const scale = interpolate(t, [0, 6, 12], [1.6, 0.96, 1], { extrapolateRight: "clamp" });
  const opacity = interpolate(t, [0, 5], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        fontFamily: "'IBM Plex Sans', 'Inter', sans-serif",
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.1,
        color,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "left center",
        textShadow: "0 10px 30px rgba(0,0,0,0.5)",
      }}
    >
      {text}
    </div>
  );
};
