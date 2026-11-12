import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Footage } from "./Footage";
import { Sfx } from "./Sfx";
import type { PlannedClip } from "../plan";

interface Props {
  clips: PlannedClip[];
  sourceWidth: number;
  sourceHeight: number;
  box: { x: number; y: number; width: number; height: number };
  transitionFrames: number;
  /** Frame offset inside the scene where the clips start. */
  from?: number;
  radius?: number;
}

/** Plays planned footage clips back to back as punch-cuts: a short crossfade, a quick zoom settle, a soft tick. */
export const Clips: React.FC<Props> = ({ clips, sourceWidth, sourceHeight, box, transitionFrames, from = 0, radius }) => {
  let cursor = from;
  const cuts: number[] = [];
  clips.forEach((clip, i) => {
    if (i > 0) cuts.push(cursor - transitionFrames);
    cursor += clip.durationInFrames - (i < clips.length - 1 ? transitionFrames : 0);
  });
  return (
    <>
      <TransitionSeries from={from}>
        {clips.flatMap((clip, i) => {
          const items = [
            <TransitionSeries.Sequence key={`c${i}`} durationInFrames={clip.durationInFrames}>
              <Footage src={clip.src} from={clip.from} rate={clip.rate} sourceWidth={sourceWidth} sourceHeight={sourceHeight} box={box} camera={clip.camera} radius={radius} punch />
            </TransitionSeries.Sequence>,
          ];
          if (i < clips.length - 1) {
            items.push(<TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={linearTiming({ durationInFrames: transitionFrames })} />);
          }
          return items;
        })}
      </TransitionSeries>
      {cuts.map((cut) => (
        <Sfx key={cut} name="tick" at={cut} volume={0.3} />
      ))}
    </>
  );
};
