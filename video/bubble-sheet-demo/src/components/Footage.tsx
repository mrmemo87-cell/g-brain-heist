import { Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export interface CameraKey {
  /** Seconds into this footage clip. */
  at: number;
  /** Zoom factor, 1 = whole frame. */
  scale: number;
  /** Point of interest in source pixels (where the zoom centres). */
  x: number;
  y: number;
}

interface Props {
  /** Path under public/, e.g. footage/desktop/page.mp4 */
  src: string;
  /** Seconds into the source where this clip starts. */
  from: number;
  /** Playback speed. */
  rate?: number;
  /** Natural size of the source video. */
  sourceWidth: number;
  sourceHeight: number;
  /** Box the footage is fitted into, in composition pixels. */
  box: { x: number; y: number; width: number; height: number };
  /** Camera keyframes in clip seconds (after rate). */
  camera?: CameraKey[];
  radius?: number;
  muted?: boolean;
}

/**
 * A slice of a screen recording with smooth camera moves: scale and pan between
 * keyframes so the viewer's eye is taken to the control being used.
 */
export const Footage: React.FC<Props> = ({ src, from, rate = 1, sourceWidth, sourceHeight, box, camera = [], radius = 18, muted = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const fit = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const shownWidth = sourceWidth * fit;
  const shownHeight = sourceHeight * fit;

  const keys = camera.length ? camera : [{ at: 0, scale: 1, x: sourceWidth / 2, y: sourceHeight / 2 }];
  const times = keys.map((k) => k.at);
  const pick = (get: (k: CameraKey) => number) =>
    keys.length === 1
      ? get(keys[0])
      : interpolate(seconds, times, keys.map(get), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const scale = pick((k) => k.scale);
  const cx = pick((k) => k.x);
  const cy = pick((k) => k.y);

  // Translate so that (cx, cy) in source pixels lands at the centre of the box.
  const tx = (sourceWidth / 2 - cx) * fit * scale;
  const ty = (sourceHeight / 2 - cy) * fit * scale;
  const maxTx = (shownWidth * scale - shownWidth) / 2;
  const maxTy = (shownHeight * scale - shownHeight) / 2;
  const clampedTx = Math.max(-maxTx, Math.min(maxTx, tx));
  const clampedTy = Math.max(-maxTy, Math.min(maxTy, ty));

  return (
    <div
      style={{
        position: "absolute",
        left: box.x + (box.width - shownWidth) / 2,
        top: box.y + (box.height - shownHeight) / 2,
        width: shownWidth,
        height: shownHeight,
        overflow: "hidden",
        borderRadius: radius,
        boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
        backgroundColor: "#0b1220",
      }}
    >
      <div style={{ width: shownWidth, height: shownHeight, transform: `translate(${clampedTx}px, ${clampedTy}px) scale(${scale})`, transformOrigin: "center center" }}>
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={Math.round(from * fps)}
          playbackRate={rate}
          muted={muted}
          style={{ width: shownWidth, height: shownHeight, display: "block" }}
        />
      </div>
    </div>
  );
};
