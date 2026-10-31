import React, { useEffect } from "react";
import "./commanderJuice.css";

export type CommanderCelebrationData = {
  /** Changes the colours: gold for level-ups, rarity colours for new fighters. */
  tone: "gold" | "cyan" | "violet" | "emerald";
  icon: string;
  title: string;
  subtitle?: string;
  art?: string;
};

const CONFETTI = Array.from({ length: 28 }, (_, index) => index);

/** Short full-screen celebration (about 2.6 seconds). Tap anywhere to close it early. */
export default function CommanderCelebration({
  data,
  onDone,
}: {
  data: CommanderCelebrationData;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(timer);
  }, [data, onDone]);

  return (
    <div className={`cc-celebration is-${data.tone}`} role="status" aria-live="polite" onClick={onDone}>
      <div className="cc-celebration-burst" aria-hidden />
      <div className="cc-celebration-confetti" aria-hidden>
        {CONFETTI.map((index) => (
          <span key={index} style={{ "--i": index, left: `${(index * 37 + 7) % 100}%` } as React.CSSProperties} />
        ))}
      </div>
      <div className="cc-celebration-card">
        {data.art ? (
          <img className="cc-celebration-art" src={data.art} alt="" draggable={false} />
        ) : (
          <div className="cc-celebration-icon" aria-hidden>{data.icon}</div>
        )}
        <strong>{data.title}</strong>
        {data.subtitle && <p>{data.subtitle}</p>}
        <small>Tap to continue</small>
      </div>
    </div>
  );
}
