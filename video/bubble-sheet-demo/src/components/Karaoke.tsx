import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type SceneTiming } from "../timing";
import { theme } from "../theme";

interface Word {
  text: string;
  start: number;
  end: number;
  phrase: number;
}

/**
 * Word timings estimated from the narration length: each word's share is its
 * character count plus a pause weight after punctuation. Phrases hold at most
 * four words and break at sentence punctuation.
 */
const layoutWords = (scene: SceneTiming): Word[] => {
  const tokens = scene.text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.replace(/[^\p{L}\p{N}']/gu, "").length + 1.2 + (/[.!?]$/.test(t) ? 3.2 : /[,;:]$/.test(t) ? 1.4 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const voiceFrames = scene.seconds * FPS;
  let cursor = scene.voiceStart;
  let phrase = 0;
  let inPhrase = 0;
  return tokens.map((text, i) => {
    const length = (weights[i] / total) * voiceFrames;
    const word = { text, start: cursor, end: cursor + length, phrase };
    cursor += length;
    inPhrase += 1;
    if (/[.!?,;:]$/.test(text) || inPhrase >= 4) {
      phrase += 1;
      inPhrase = 0;
    }
    return word;
  });
};

interface Props {
  scene: SceneTiming;
  /** Vertical centre of the caption block, in composition pixels. */
  y: number;
  size: number;
  maxWidth: number;
}

/** Burned-in, karaoke-style captions: the phrase stays up, the spoken word lights up. */
export const Karaoke: React.FC<Props> = ({ scene, y, size, maxWidth }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = layoutWords(scene);
  const active = words.find((w) => frame >= w.start && frame < w.end) ?? (frame >= scene.voiceStart ? words.filter((w) => w.start <= frame).at(-1) : undefined);
  if (!active) return null;
  const phrase = words.filter((w) => w.phrase === active.phrase);
  const phraseStart = phrase[0].start;
  const phraseEnd = phrase[phrase.length - 1].end;
  if (frame > phraseEnd + 8) return null;
  const pop = spring({ frame: frame - phraseStart, fps, config: { damping: 14, stiffness: 260 } });
  const out = interpolate(frame, [phraseEnd + 2, phraseEnd + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: y,
        transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * pop})`,
        width: maxWidth,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: `${size * 0.12}px ${size * 0.3}px`,
        opacity: Math.min(pop + 0.2, 1) * out,
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.15,
        textAlign: "center",
        textShadow: "0 3px 0 rgba(0,0,0,0.9), 0 0 18px rgba(0,0,0,0.9), 0 10px 40px rgba(0,0,0,0.7)",
        letterSpacing: -0.5,
      }}
    >
      {phrase.map((w) => {
        const isActive = w === active;
        const spoken = frame >= w.end;
        return (
          <span
            key={w.start}
            style={{
              color: isActive ? theme.amber : spoken ? theme.ink : "rgba(238,242,255,0.78)",
              transform: `scale(${isActive ? 1.1 : 1})`,
              display: "inline-block",
              transition: "none",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
