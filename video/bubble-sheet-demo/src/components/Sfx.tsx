import { Audio, Sequence, staticFile } from "remotion";

export type SfxName = "shutter" | "click" | "chime" | "paper" | "whoosh" | "pop" | "success" | "tick";

/** Plays a short sound effect starting at the given scene frame. */
export const Sfx: React.FC<{ name: SfxName; at: number; volume?: number }> = ({ name, at, volume = 0.7 }) => (
  <Sequence from={at} durationInFrames={45} layout="none">
    <Audio src={staticFile(`sfx/${name}.mp3`)} volume={volume} />
  </Sequence>
);
