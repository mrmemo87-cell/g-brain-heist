import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

/** Dark stage with two slowly drifting glows and a faint dot grid. */
export const Background: React.FC<{ accent?: string }> = ({ accent = theme.cyan }) => {
  const frame = useCurrentFrame();
  const driftX = interpolate(frame, [0, 600], [-60, 60]);
  const driftY = interpolate(frame, [0, 600], [30, -30]);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          left: -500 + driftX,
          top: -700 + driftY,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}22 0%, transparent 60%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          right: -500 - driftX,
          bottom: -600 - driftY,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.purple}22 0%, transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(rgba(148,163,184,0.16) 1.2px, transparent 1.2px)`,
          backgroundSize: "36px 36px",
          opacity: 0.6,
        }}
      />
    </AbsoluteFill>
  );
};
