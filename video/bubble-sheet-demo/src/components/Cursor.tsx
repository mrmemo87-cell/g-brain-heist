import { Easing, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

export interface CursorKey {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
}

/** Mouse pointer that glides between keyframes and pulses on click frames. */
export const Cursor: React.FC<{ keys: CursorKey[]; color?: string }> = ({ keys, color = theme.ink }) => {
  const frame = useCurrentFrame();
  if (keys.length === 0 || frame < keys[0].frame) return null;
  const frames = keys.map((k) => k.frame);
  const x = interpolate(frame, frames, keys.map((k) => k.x), { easing: Easing.inOut(Easing.cubic), extrapolateRight: "clamp" });
  const y = interpolate(frame, frames, keys.map((k) => k.y), { easing: Easing.inOut(Easing.cubic), extrapolateRight: "clamp" });
  const clickKey = keys.find((k) => k.click && frame >= k.frame && frame < k.frame + 12);
  const press = clickKey ? interpolate(frame - clickKey.frame, [0, 4, 12], [1, 0.8, 1]) : 1;
  const ripple = clickKey ? interpolate(frame - clickKey.frame, [0, 12], [0, 1]) : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {clickKey && (
        <div
          style={{
            position: "absolute",
            left: -30 * ripple,
            top: -30 * ripple,
            width: 60 * ripple,
            height: 60 * ripple,
            borderRadius: "50%",
            border: `3px solid ${theme.cyan}`,
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg width={40} height={44} viewBox="0 0 20 22" style={{ transform: `scale(${press})`, transformOrigin: "top left", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))" }}>
        <path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.5 L9.5 12 L15.5 12 Z" fill={color} stroke={theme.bg} strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
    </div>
  );
};
