import React from "react";
import "./commanderWarGate.css";

type Props = {
  enrolled: boolean;
  busy: boolean;
  art: { guard?: string; commander?: string; archer?: string; enemy?: string };
  /** XP still available today from a practice win; null when already earned. */
  practiceXp: number | null;
  pvpXp: number;
  onSummon: () => void;
  onFight: () => void;
  onPvp: () => void;
};

/** Rotating rune circle used by both the summoning and the versus scenes. */
const RuneCircle: React.FC<{ tone: "summon" | "versus" }> = ({ tone }) => (
  <svg className={`cc-gate-runes cc-gate-runes--${tone}`} viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 7" />
    <g className="cc-gate-runes__ring">
      <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x = 100 + Math.cos(a) * 80;
        const y = 100 + Math.sin(a) * 80;
        return <path key={i} d={`M${x - 4} ${y}l4-6 4 6-4 6z`} fill="currentColor" />;
      })}
    </g>
    <g className="cc-gate-runes__ring cc-gate-runes__ring--inner">
      <polygon points="100,38 154,131 46,131" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
      <polygon points="100,162 46,69 154,69" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
    </g>
  </svg>
);

const Embers: React.FC = () => (
  <span className="cc-gate-embers" aria-hidden="true">
    {Array.from({ length: 10 }).map((_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}
  </span>
);

/**
 * The first thing on the Headquarters page: one huge, animated way into a battle.
 * - New students: a summoning circle reveals the free starter army (one tap to claim it).
 * - Enrolled students: your Commander faces an enemy Commander; one tap starts a fight.
 */
const CommanderWarGate: React.FC<Props> = ({ enrolled, busy, art, practiceXp, pvpXp, onSummon, onFight, onPvp }) => {
  if (!enrolled) {
    return (
      <section className={`cc-gate cc-gate--summon ${busy ? "is-summoning" : ""}`} aria-labelledby="cc-gate-title">
        <Embers />
        <div className="cc-gate-stage">
          <RuneCircle tone="summon" />
          <div className="cc-gate-trio">
            {[art.archer, art.commander, art.guard].map((src, index) =>
              src ? <img key={index} src={src} alt="" draggable={false} className={`cc-gate-shadow cc-gate-shadow--${index}`} /> : null,
            )}
          </div>
        </div>
        <div className="cc-gate-copy">
          <span className="cc-gate-eyebrow">Cursed Commander</span>
          <h2 id="cc-gate-title" className="cc-gate-title">Summon your army</h2>
          <p className="cc-gate-sub">3 fighters · free</p>
        </div>
        <button type="button" className="cc-gate-cta cc-gate-cta--summon" onClick={onSummon} disabled={busy} data-testid="commander-summon">
          {busy ? <><span className="cc-gate-spinner" aria-hidden /> Summoning…</> : <>✦ Summon</>}
        </button>
      </section>
    );
  }

  return (
    <section className="cc-gate cc-gate--versus" aria-label="Start a battle">
      <Embers />
      <div className="cc-gate-versus">
        <div className="cc-gate-fighter cc-gate-fighter--you">
          {art.commander && <img src={art.commander} alt="" draggable={false} />}
          <span>You</span>
        </div>
        <div className="cc-gate-vs" aria-hidden="true">
          <svg viewBox="0 0 60 90" className="cc-gate-bolt"><path d="M36 2 10 50h16l-8 38 32-52H32z" /></svg>
          <b>VS</b>
        </div>
        <div className="cc-gate-fighter cc-gate-fighter--enemy">
          {art.enemy && <img src={art.enemy} alt="" draggable={false} />}
          <span>Enemy</span>
        </div>
      </div>
      <button type="button" className="cc-gate-cta cc-gate-cta--fight" onClick={onFight} disabled={busy} data-testid="commander-fight">
        ⚔ Fight
        {practiceXp !== null && <span className="cc-gate-reward">+{practiceXp} XP</span>}
      </button>
      <button type="button" className="cc-gate-pvp" onClick={onPvp} disabled={busy}>
        👥 Player battle <span>+{pvpXp} XP</span>
      </button>
    </section>
  );
};

export default CommanderWarGate;
