import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { HEIGHT, WIDTH, theme } from "../theme";

interface Props {
  /** Point the arrow lands on, in composition pixels. */
  targetX: number;
  targetY: number;
  /** Where the label box sits (its anchor corner nearest the target). */
  labelX: number;
  labelY: number;
  label: string;
  color?: string;
  /** Frame the callout appears. */
  from: number;
  /** Optional frame it disappears. */
  until?: number;
  /** Radius of the ring drawn around the target. */
  ring?: number;
}

/**
 * Annotation: a label box that springs in, a line that draws itself toward the
 * target, and a pulsing ring on the target.
 */
export const Callout: React.FC<Props> = ({
  targetX,
  targetY,
  labelX,
  labelY,
  label,
  color = theme.amber,
  from,
  until,
  ring = 26,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from) return null;
  const local = frame - from;
  const fadeOut = until ? interpolate(frame, [until - 8, until], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  if (fadeOut <= 0) return null;

  const pop = spring({ frame: local, fps, config: { damping: 14, stiffness: 160 } });
  const draw = interpolate(local, [4, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 1 + Math.sin(local / 5) * 0.08;

  const dx = targetX - labelX;
  const dy = targetY - labelY;
  const length = Math.hypot(dx, dy);
  const endX = labelX + dx * draw;
  const endY = labelY + dy * draw;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: fadeOut, pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
        <line x1={labelX} y1={labelY} x2={endX} y2={endY} stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray="10 8" />
        {draw >= 1 && (
          <>
            <circle cx={targetX} cy={targetY} r={ring * pulse} fill="none" stroke={color} strokeWidth={4} />
            <circle cx={targetX} cy={targetY} r={7} fill={color} />
          </>
        )}
        <title>{`${length.toFixed(0)}px callout`}</title>
      </svg>
      <div
        style={{
          position: "absolute",
          left: labelX,
          top: labelY,
          transform: `translate(${dx >= 0 ? "-100%" : "0"}, ${dy >= 0 ? "-100%" : "0"}) scale(${pop})`,
          transformOrigin: `${dx >= 0 ? "right" : "left"} ${dy >= 0 ? "bottom" : "top"}`,
          padding: "12px 20px",
          borderRadius: 14,
          backgroundColor: color,
          color: theme.bg,
          fontFamily: theme.font,
          fontWeight: 700,
          fontSize: 30,
          whiteSpace: "nowrap",
          boxShadow: `0 10px 30px ${color}55`,
        }}
      >
        {label}
      </div>
    </div>
  );
};
