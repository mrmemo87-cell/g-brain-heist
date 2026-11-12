import { Img, staticFile } from "remotion";
import { theme } from "../theme";

/** Mirrors src/lib/paperScan/layout.ts in the app, so overlays land on the printed bubbles. */
export const SHEET = {
  width: 1000,
  height: 1414,
  radius: 12,
  qr: { x: 750, y: 95, size: 180 },
  markers: [
    { x: 45, y: 45 },
    { x: 955, y: 45 },
    { x: 955, y: 1369 },
    { x: 45, y: 1369 },
  ],
  nameField: { x: 90, y: 300 },
  codeField: { x: 90, y: 255 },
} as const;

export const bubblePosition = (row: number, choice: number) => ({
  x: (row < 20 ? 210 : 650) + choice * 48,
  y: 395 + (row % 20) * 39,
});

export interface Fill {
  row: number;
  choice: number;
  /** 0..1 growth of the pencil fill. */
  progress: number;
  /** Lighter stroke for a smudged, half-hearted mark. */
  faint?: boolean;
}

export interface Ring {
  row: number;
  choice: number | null;
  color: string;
  /** 0..1 fade/scale in. */
  progress: number;
}

interface Props {
  /** Rendered width in pixels; height follows the A4 ratio. */
  width: number;
  fills?: Fill[];
  rings?: Ring[];
  /** 0..1 highlight strength on the QR code. */
  qrGlow?: number;
  /** 0..1 highlight strength on the four corner markers. */
  markerGlow?: number;
  /** 0..1 progress of the dashed quad that joins the markers. */
  markerFrame?: number;
  style?: React.CSSProperties;
}

/**
 * The real printed answer sheet (public/sheet.svg, produced by the app's own
 * print service) with animated overlays drawn in the sheet's own coordinates.
 */
export const Sheet: React.FC<Props> = ({ width, fills = [], rings = [], qrGlow = 0, markerGlow = 0, markerFrame = 0, style }) => {
  const height = width * (SHEET.height / SHEET.width);
  const quad = SHEET.markers.map((m) => `${m.x},${m.y}`).join(" ");
  const perimeter = 2 * (910 + 1324);
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        backgroundColor: theme.paper,
        borderRadius: 6,
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
        overflow: "hidden",
        ...style,
      }}
    >
      <Img src={staticFile("sheet.svg")} style={{ width, height, display: "block" }} />
      <svg viewBox={`0 0 ${SHEET.width} ${SHEET.height}`} width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {fills.map((fill, i) => {
          const p = bubblePosition(fill.row, fill.choice);
          return (
            <circle
              key={`fill-${i}`}
              cx={p.x}
              cy={p.y}
              r={Math.max(0, (SHEET.radius - 1.5) * fill.progress)}
              fill={theme.paperInk}
              opacity={fill.faint ? 0.35 : 0.95}
            />
          );
        })}
        {rings.map((ring, i) => {
          if (ring.choice === null) {
            const first = bubblePosition(ring.row, 0);
            return (
              <rect
                key={`ring-${i}`}
                x={first.x - 24}
                y={first.y - 19}
                width={4 * 48}
                height={38}
                rx={10}
                fill="none"
                stroke={ring.color}
                strokeWidth={4}
                opacity={ring.progress}
              />
            );
          }
          const p = bubblePosition(ring.row, ring.choice);
          return (
            <circle
              key={`ring-${i}`}
              cx={p.x}
              cy={p.y}
              r={SHEET.radius + 6 + (1 - ring.progress) * 14}
              fill="none"
              stroke={ring.color}
              strokeWidth={4.5}
              opacity={ring.progress}
            />
          );
        })}
        {qrGlow > 0 && (
          <rect
            x={SHEET.qr.x - 12}
            y={SHEET.qr.y - 12}
            width={SHEET.qr.size + 24}
            height={SHEET.qr.size + 24}
            rx={10}
            fill={`${theme.cyan}`}
            fillOpacity={0.18 * qrGlow}
            stroke={theme.cyan}
            strokeWidth={6}
            opacity={qrGlow}
          />
        )}
        {markerGlow > 0 &&
          SHEET.markers.map((m, i) => (
            <rect
              key={`m-${i}`}
              x={m.x - 24}
              y={m.y - 24}
              width={48}
              height={48}
              rx={8}
              fill="none"
              stroke={theme.teal}
              strokeWidth={6}
              opacity={markerGlow}
            />
          ))}
        {markerFrame > 0 && (
          <polygon
            points={quad}
            fill="none"
            stroke={theme.teal}
            strokeWidth={5}
            strokeDasharray={`${perimeter}`}
            strokeDashoffset={perimeter * (1 - markerFrame)}
            opacity={0.9}
          />
        )}
      </svg>
    </div>
  );
};

/** The answer key the demo student shades in; row index (0-based) to option index. */
export const DEMO_ANSWERS: Array<{ row: number; choice: number }> = [
  { row: 0, choice: 1 },
  { row: 1, choice: 3 },
  { row: 2, choice: 0 },
  { row: 3, choice: 2 },
  { row: 4, choice: 1 },
  { row: 5, choice: 3 },
  { row: 6, choice: 2 },
  { row: 7, choice: 0 },
  { row: 8, choice: 1 },
  { row: 9, choice: 2 },
  { row: 10, choice: 3 },
  { row: 11, choice: 0 },
  { row: 12, choice: 1 },
  { row: 13, choice: 2 },
  { row: 14, choice: 0 },
  { row: 15, choice: 3 },
  { row: 16, choice: 1 },
  { row: 17, choice: 2 },
  { row: 18, choice: 0 },
  { row: 19, choice: 1 },
];
