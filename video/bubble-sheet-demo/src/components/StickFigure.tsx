import { useCurrentFrame } from "remotion";
import { theme } from "../theme";

export type Pose = "idle" | "stressed" | "point" | "phone" | "cheer" | "write" | "think";

interface Props {
  pose?: Pose;
  color?: string;
  accent?: string;
  /** Height in pixels. */
  size?: number;
  flip?: boolean;
  x: number;
  y: number;
  style?: React.CSSProperties;
  /** Show a smiling face (default), or a worried one. */
  mood?: "happy" | "worried" | "neutral";
}

/**
 * Hand-drawn style stick figure. The viewBox is 200x300: head at the top,
 * feet at y=290. Arms are polylines from the shoulder (100,105).
 */
export const StickFigure: React.FC<Props> = ({
  pose = "idle",
  color = theme.ink,
  accent = theme.cyan,
  size = 300,
  flip = false,
  x,
  y,
  style,
  mood,
}) => {
  const frame = useCurrentFrame();
  const breathe = Math.sin(frame / 9) * 2;
  const wiggle = Math.sin(frame / 3) * 6;
  const faceMood = mood ?? (pose === "stressed" ? "worried" : pose === "think" ? "neutral" : "happy");

  const stroke = { stroke: color, strokeWidth: 9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

  const arms = (() => {
    switch (pose) {
      case "stressed":
        return ["100,105 55,70 70,35", "100,105 145,70 130,35"];
      case "point":
        return ["100,105 70,160", "100,105 150,80 190,60"];
      case "phone":
        return ["100,105 140,135 165,120", "100,105 135,150 165,130"];
      case "cheer":
        return [`100,105 55,60 ${40 + wiggle},20`, `100,105 145,60 ${160 - wiggle},20`];
      case "write":
        return ["100,105 70,160", "100,105 150,140 175,175"];
      case "think":
        return ["100,105 70,160", "100,105 135,110 120,70"];
      default:
        return ["100,105 65,165", "100,105 135,165"];
    }
  })();

  const mouth =
    faceMood === "happy"
      ? "M86 52 Q100 64 114 52"
      : faceMood === "worried"
        ? `M86 60 Q100 ${50 + wiggle / 2} 114 60`
        : "M88 56 L112 56";

  return (
    <svg
      viewBox="0 0 200 300"
      width={size * (200 / 300)}
      height={size}
      style={{
        position: "absolute",
        left: x,
        top: y + breathe,
        transform: flip ? "scaleX(-1)" : undefined,
        overflow: "visible",
        ...style,
      }}
    >
      <circle cx={100} cy={40} r={30} {...stroke} />
      <circle cx={89} cy={36} r={3.5} fill={color} />
      <circle cx={111} cy={36} r={3.5} fill={color} />
      <path d={mouth} {...stroke} strokeWidth={5} />
      <line x1={100} y1={70} x2={100} y2={185} {...stroke} />
      {arms.map((points, i) => (
        <polyline key={i} points={points} {...stroke} />
      ))}
      <polyline points="100,185 70,285" {...stroke} />
      <polyline points="100,185 130,285" {...stroke} />

      {pose === "phone" && (
        <g transform="translate(150 105) rotate(-12)">
          <rect x={0} y={0} width={34} height={60} rx={6} fill={theme.bg2} stroke={accent} strokeWidth={4} />
          <rect x={6} y={8} width={22} height={38} rx={2} fill={accent} opacity={0.35} />
        </g>
      )}
      {pose === "write" && (
        <line x1={175} y1={175} x2={200} y2={205} stroke={accent} strokeWidth={7} strokeLinecap="round" />
      )}
      {pose === "stressed" && (
        <>
          <path d={`M140 ${15 + wiggle / 2} q6 -12 12 0 a6 6 0 1 1 -12 0`} fill={theme.cyan} />
          <path d={`M152 ${28 - wiggle / 2} q6 -12 12 0 a6 6 0 1 1 -12 0`} fill={theme.cyan} />
        </>
      )}
      {pose === "think" && (
        <>
          <circle cx={135} cy={10} r={4} fill={color} opacity={0.6} />
          <circle cx={147} cy={-4} r={6} fill={color} opacity={0.7} />
        </>
      )}
    </svg>
  );
};
