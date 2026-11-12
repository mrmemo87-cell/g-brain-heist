import { interpolate, useCurrentFrame } from "remotion";
import { FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Subtitle strip that shows the narration sentence by sentence, with each
 * sentence on screen for a share of the voice track proportional to its length.
 */
export const Caption: React.FC<{ scene: SceneTiming; bottom?: number; size?: number; maxWidth?: number }> = ({ scene, bottom = 42, size = 34, maxWidth = 1500 }) => {
  const frame = useCurrentFrame();
  const sentences = splitSentences(scene.text);
  const totalChars = sentences.reduce((n, s) => n + s.length, 0);
  const voiceFrames = scene.seconds * FPS;

  let start = scene.voiceStart;
  let current: { text: string; start: number; end: number } | null = null;
  for (const sentence of sentences) {
    const length = (sentence.length / totalChars) * voiceFrames;
    const end = start + length;
    if (frame >= start && frame < end + 6) {
      current = { text: sentence, start, end };
      break;
    }
    start = end;
  }
  if (!current) return null;

  const opacity = interpolate(frame, [current.start, current.start + 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(frame, [current.start, current.start + 8], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          maxWidth,
          padding: "14px 30px",
          borderRadius: 16,
          backgroundColor: "rgba(5, 10, 24, 0.82)",
          border: `1px solid ${theme.panelBorder}`,
          color: theme.ink,
          fontFamily: theme.font,
          fontSize: size,
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        {current.text}
      </div>
    </div>
  );
};
