import { theme } from "../theme";

/**
 * Phone bezel drawn around a box. The screen content (footage) is rendered by the
 * caller inside the returned inner box; this only paints the hardware.
 */
export const PhoneFrame: React.FC<{ x: number; y: number; width: number; height: number; children?: React.ReactNode }> = ({ x, y, width, height, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      borderRadius: width * 0.14,
      backgroundColor: "#0a0f1c",
      border: `${Math.max(6, width * 0.018)}px solid #2a3652`,
      boxShadow: "0 50px 120px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}
  >
    {children}
    <div style={{ position: "absolute", left: "50%", top: width * 0.03, width: width * 0.28, height: width * 0.075, borderRadius: 999, backgroundColor: "#05080f", transform: "translateX(-50%)" }} />
  </div>
);

/** Thin laptop-style surround for desktop footage. */
export const LaptopFrame: React.FC<{ x: number; y: number; width: number; height: number; children?: React.ReactNode }> = ({ x, y, width, height, children }) => (
  <>
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        borderRadius: 22,
        backgroundColor: "#0a0f1c",
        border: "8px solid #1f2a44",
        boxShadow: "0 50px 120px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
    <div style={{ position: "absolute", left: x - 60, top: y + height + 6, width: width + 120, height: 22, borderRadius: "0 0 18px 18px", background: "linear-gradient(#2a3652, #141c30)" }} />
    <div style={{ position: "absolute", left: x + width / 2 - 90, top: y + height + 8, width: 180, height: 8, borderRadius: 4, backgroundColor: theme.bg }} />
  </>
);
