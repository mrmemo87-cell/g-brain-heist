import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
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
  kind?: "slide" | "fade";
}

/** Plays planned footage clips back to back with a whip slide between them and a whoosh on each cut. */
export const Clips: React.FC<Props> = ({ clips, sourceWidth, sourceHeight, box, transitionFrames, from = 0, radius, kind = "slide" }) => {
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
              <Footage src={clip.src} from={clip.from} rate={clip.rate} sourceWidth={sourceWidth} sourceHeight={sourceHeight} box={box} camera={clip.camera} radius={radius} />
            </TransitionSeries.Sequence>,
          ];
          if (i < clips.length - 1) {
            items.push(
              <TransitionSeries.Transition
                key={`t${i}`}
                presentation={kind === "slide" ? slide({ direction: "from-right" }) : fade()}
                timing={linearTiming({ durationInFrames: transitionFrames })}
              />,
            );
          }
          return items;
        })}
      </TransitionSeries>
      {cuts.map((cut) => (
        <Sfx key={cut} name="whoosh" at={cut} volume={0.35} />
      ))}
    </>
  );
};
