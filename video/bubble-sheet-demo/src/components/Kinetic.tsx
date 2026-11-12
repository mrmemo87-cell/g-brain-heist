import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

interface WordProps {
  text: string;
  /** Frame the word lands. */
  at: number;
  /** Optional frame it leaves. */
  until?: number;
  x: number;
  y: number;
  size?: number;
  color?: string;
  align?: "left" | "center";
  width?: number;
  weight?: number;
}

/** A word or line that slams in with a slight overshoot and a blur-out, for kinetic typography beats. */
export const Kinetic: React.FC<WordProps> = ({ text, at, until, x, y, size = 110, color = theme.ink, align = "center", width, weight = 700 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  if (until !== undefined && frame > until + 8) return null;
  const inSpring = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 220 } });
  const scale = interpolate(inSpring, [0, 1], [1.5, 1]);
  const opacity = until !== undefined && frame > until ? interpolate(frame, [until, until + 8], [1, 0]) : interpolate(frame - at, [0, 4], [0, 1], { extrapolateRight: "clamp" });
  const blur = until !== undefined && frame > until ? interpolate(frame, [until, until + 8], [0, 14]) : interpolate(inSpring, [0, 1], [10, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        transform: `translate(${align === "center" ? "-50%" : "0"}, -50%) scale(${scale})`,
        fontFamily: theme.font,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.05,
        color,
        textAlign: align,
        opacity,
        filter: `blur(${blur}px)`,
        letterSpacing: -1,
        textShadow: "0 20px 60px rgba(0,0,0,0.5)",
        whiteSpace: width ? "normal" : "nowrap",
      }}
    >
      {text}
    </div>
  );
};

/** Rounded label that pops in near a point: used to annotate what the footage is doing. */
export const Badge: React.FC<{ text: string; at: number; until?: number; x: number; y: number; color?: string; size?: number }> = ({ text, at, until, x, y, color = theme.cyan, size = 30 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  if (until !== undefined && frame > until + 6) return null;
  const pop = spring({ frame: frame - at, fps, config: { damping: 11, stiffness: 240 } });
  const out = until !== undefined && frame > until ? interpolate(frame, [until, until + 6], [1, 0]) : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${pop * out})`,
        padding: `${size * 0.4}px ${size * 0.8}px`,
        borderRadius: 999,
        backgroundColor: color,
        color: theme.bg,
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: size,
        whiteSpace: "nowrap",
        boxShadow: `0 12px 40px ${color}66`,
        opacity: out,
      }}
    >
      {text}
    </div>
  );
};
