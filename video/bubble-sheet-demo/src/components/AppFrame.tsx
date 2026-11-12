import { Img, staticFile } from "remotion";
import { theme } from "../theme";

interface Props {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  /** Tabs shown under the header, with the active one highlighted. */
  tabs?: string[];
  activeTab?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** A stylised Brains Heist teacher window: header, optional tabs, dark content area. */
export const AppFrame: React.FC<Props> = ({ x, y, width, height, title, tabs, activeTab = 0, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      height,
      borderRadius: 22,
      backgroundColor: theme.panel,
      border: `1px solid ${theme.panelBorder}`,
      boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
      overflow: "hidden",
      fontFamily: theme.font,
      color: theme.ink,
      ...style,
    }}
  >
    <div
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 22px",
        backgroundColor: "rgba(255,255,255,0.04)",
        borderBottom: `1px solid ${theme.panelBorder}`,
      }}
    >
      <Img src={staticFile("logo.png")} style={{ height: 36 }} />
      <div style={{ fontWeight: 700, fontSize: 24 }}>{title}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8 }}>
        {[theme.pink, theme.amber, theme.teal].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c, opacity: 0.8 }} />
        ))}
      </div>
    </div>
    {tabs && (
      <div style={{ display: "flex", gap: 8, padding: "14px 22px 0" }}>
        {tabs.map((tab, i) => (
          <div
            key={tab}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              fontSize: 21,
              fontWeight: i === activeTab ? 700 : 400,
              color: i === activeTab ? theme.bg : theme.muted,
              backgroundColor: i === activeTab ? theme.cyan : "rgba(255,255,255,0.05)",
            }}
          >
            {tab}
          </div>
        ))}
      </div>
    )}
    <div style={{ position: "absolute", left: 0, right: 0, top: tabs ? 128 : 64, bottom: 0 }}>{children}</div>
  </div>
);

/** Numbered step list that mirrors the real scan workspace ("1 · Add photos" …). */
export const Steps: React.FC<{ steps: string[]; active: number; x?: number; y?: number }> = ({ steps, active, x = 22, y = 16 }) => (
  <div style={{ position: "absolute", left: x, top: y, display: "flex", gap: 10 }}>
    {steps.map((step, i) => (
      <div
        key={step}
        style={{
          padding: "6px 14px",
          borderRadius: 10,
          fontSize: 19,
          fontFamily: theme.font,
          color: i === active ? theme.ink : theme.muted,
          backgroundColor: i === active ? "rgba(34,211,238,0.16)" : "transparent",
          border: `1px solid ${i === active ? theme.cyan : "transparent"}`,
        }}
      >
        {i + 1} · {step}
      </div>
    ))}
  </div>
);
