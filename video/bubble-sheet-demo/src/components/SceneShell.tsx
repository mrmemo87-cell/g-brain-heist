import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import type { SceneTiming } from "../timing";
import type { Layout } from "../plan";
import { geometry } from "../layout";
import { Background } from "./Background";
import { Karaoke } from "./Karaoke";

interface Props {
  scene: SceneTiming;
  layout: Layout;
  accent?: string;
  /** Hide the captions when the narration is already shown on screen. */
  captions?: boolean;
  children?: React.ReactNode;
}

/** Plays the scene's narration and shows its karaoke captions over the content. */
export const SceneShell: React.FC<Props> = ({ scene, layout, accent, captions = true, children }) => {
  const g = geometry(layout);
  return (
    <AbsoluteFill>
      <Background accent={accent} />
      <AbsoluteFill>{children}</AbsoluteFill>
      {captions && <Karaoke scene={scene} y={g.captionY} size={g.captionSize} maxWidth={g.width - 140} />}
      <Sequence from={scene.voiceStart} layout="none">
        <Audio src={staticFile(`vo/${scene.id}.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};
