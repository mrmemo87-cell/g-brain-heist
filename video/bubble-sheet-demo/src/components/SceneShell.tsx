import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { SceneTiming } from "../timing";
import type { Layout } from "../plan";
import { geometry } from "../layout";
import { Background } from "./Background";
import { Caption } from "./Caption";

interface Props {
  scene: SceneTiming;
  layout: Layout;
  accent?: string;
  /** Hide the subtitle strip when the narration is already shown on screen. */
  captions?: boolean;
  children?: React.ReactNode;
}

/** Plays the scene's narration, shows its captions and fades the content at the edges. */
export const SceneShell: React.FC<Props> = ({ scene, layout, accent, captions = true, children }) => {
  const frame = useCurrentFrame();
  const g = geometry(layout);
  const opacity = interpolate(frame, [0, 6, scene.durationInFrames - 6, scene.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Background accent={accent} />
      <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
      {captions && <Caption scene={scene} bottom={g.captionBottom} size={g.captionSize} maxWidth={g.width - 120} />}
      <Sequence from={scene.voiceStart} layout="none">
        <Audio src={staticFile(`vo/${scene.id}.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};
