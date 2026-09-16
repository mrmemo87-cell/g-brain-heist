import React from "react";
import type {
  CommanderFormationId,
  CommanderFormationModifiers,
  CommanderHeadquarters,
} from "../../../services/commanderHeadquartersService";
import {
  COMMANDER_FORMATIONS,
  commanderActiveFormation,
  commanderFormationMaxRank,
  commanderFormationModifiers,
  commanderFormationNextGain,
  commanderFormationNextLevel,
  commanderFormationRank,
  commanderFormationRankCap,
  commanderFormationTrainingCost,
  commanderFormationUnlockLevel,
  commanderMissingCoins,
  type CommanderFormationDefinition,
} from "./commanderHeadquartersModel";
import { getCommanderSpriteUrl } from "./commanderSpriteAssets";
import "./commanderFormation.css";

type Props = {
  hq: CommanderHeadquarters;
  coins: number;
  disabled?: boolean;
  onAdvance: (formation: CommanderFormationDefinition, cost: number) => void;
  onActivate: (formation: CommanderFormationDefinition) => void;
};

type FormationNode = "guard" | "commander" | "archer";

const format = (value: number) => value.toLocaleString("en-US");

const milestoneLevels = (rules: Record<string, number>) => [
  rules["formationUnlockLevel"] ?? 41,
  rules["formationRank2Level"] ?? 50,
  rules["formationRank3Level"] ?? 60,
  rules["formationRank4Level"] ?? 70,
  rules["formationRank5Level"] ?? 80,
  rules["formationRank6Level"] ?? 90,
  rules["formationRank7Level"] ?? 100,
];

const positions: Record<CommanderFormationId, Record<FormationNode, React.CSSProperties>> = {
  command_line: {
    guard: { left: "68%", top: "60%" },
    commander: { left: "48%", top: "49%" },
    archer: { left: "27%", top: "37%" },
  },
  bastion_wedge: {
    guard: { left: "58%", top: "62%" },
    commander: { left: "44%", top: "52%" },
    archer: { left: "30%", top: "45%" },
  },
  spearhead: {
    guard: { left: "73%", top: "49%" },
    commander: { left: "51%", top: "62%" },
    archer: { left: "30%", top: "52%" },
  },
  arc_lattice: {
    guard: { left: "69%", top: "63%" },
    commander: { left: "50%", top: "34%" },
    archer: { left: "31%", top: "63%" },
  },
};

const modifierLabels: Array<[keyof CommanderFormationModifiers, string]> = [
  ["commanderHp", "CMD HP"],
  ["commanderShield", "CMD SH"],
  ["bolt", "BOLT"],
  ["focus", "FOCUS"],
  ["guard", "GUARD"],
  ["shieldCap", "SH CAP"],
  ["guardHp", "FRONT HP"],
  ["guardShield", "FRONT SH"],
  ["guardAttack", "FRONT ATK"],
  ["archerHp", "RANGED HP"],
  ["archerShield", "RANGED SH"],
  ["archerAttack", "RANGED ATK"],
];

const ModifierChips = ({ modifiers, empty }: { modifiers: CommanderFormationModifiers; empty: string }) => {
  const entries = modifierLabels.filter(([key]) => modifiers[key] !== 0);
  if (!entries.length) return <span className="cc-formation-no-effect">{empty}</span>;
  return (
    <div className="cc-formation-effect-chips">
      {entries.map(([key, label]) => {
        const value = modifiers[key];
        return (
          <span key={key} className={value > 0 ? "is-positive" : "is-negative"}>
            {label} {value > 0 ? "+" : ""}{value}
          </span>
        );
      })}
    </div>
  );
};

const formationSprite = (
  node: FormationNode,
  hq: CommanderHeadquarters,
) => {
  if (node === "commander") return getCommanderSpriteUrl("player_commander", "standing") ?? undefined;
  const catalogId = node === "guard" ? hq.profile?.guard : hq.profile?.archer;
  return getCommanderSpriteUrl(
    node === "guard" ? "player_guard" : "player_archer",
    "standing",
    catalogId,
  ) ?? undefined;
};

export default function CommanderFormationPanel({
  hq,
  coins,
  disabled = false,
  onAdvance,
  onActivate,
}: Props) {
  const rules = hq.campaign.rules;
  const level = hq.profile?.level ?? 1;
  const systemUnlock = rules["formationUnlockLevel"] ?? 41;
  const maxRank = commanderFormationMaxRank(rules);
  const rankCap = commanderFormationRankCap(level, rules);
  const activeId = commanderActiveFormation(hq);
  const systemUnlocked = Boolean(hq.profile) && level >= systemUnlock;
  const milestones = milestoneLevels(rules);

  return (
    <section className="cc-formation-command" aria-labelledby="cc-formation-command-title">
      <header className="cc-formation-command-head">
        <div>
          <span className="cc-hq-eyebrow">FORMATION COMMAND · LEVELS 41–100</span>
          <h2 id="cc-formation-command-title">Make positioning a doctrine, not a cosmetic</h2>
          <p>
            Your squad remains Commander + frontline + ranged. Formation doctrine changes the trusted
            combat profile with deliberate strengths and trade-offs, then travels unchanged into Practice
            and Player Battles. One formation is active at a time.
          </p>
        </div>
        <div className={`cc-formation-command-status ${systemUnlocked ? "is-online" : "is-locked"}`}>
          <span>{systemUnlocked ? "FORMATION COMMAND ONLINE" : "FORMATION COMMAND LOCKED"}</span>
          <strong>{systemUnlocked ? `Doctrine cap ${rankCap} / ${maxRank}` : `Commander Level ${systemUnlock}`}</strong>
          <small>
            {systemUnlocked
              ? `Active: ${COMMANDER_FORMATIONS.find((formation) => formation.id === activeId)?.name ?? "Command Line"}`
              : `${Math.max(0, systemUnlock - level)} Commander level${systemUnlock - level === 1 ? "" : "s"} remaining.`}
          </small>
        </div>
      </header>

      <div className="cc-formation-roadmap" aria-label="Formation doctrine milestones from Commander Level 41 to 100">
        {milestones.map((milestone, index) => (
          <div key={milestone} className={level >= milestone ? "is-reached" : ""}>
            <i aria-hidden />
            <span>R{index + 1}</span>
            <strong>LV {milestone}</strong>
            {index === milestones.length - 1 && <small>LEGENDARY</small>}
          </div>
        ))}
      </div>

      {!hq.profile ? (
        <div className="cc-formation-empty">Claim your starter squad before entering Formation Command.</div>
      ) : (
        <div className="cc-formation-grid">
          {COMMANDER_FORMATIONS.map((formation) => {
            const rank = commanderFormationRank(hq, formation.id);
            const active = activeId === formation.id;
            const unlockLevel = commanderFormationUnlockLevel(formation.id, rules);
            const available = level >= unlockLevel;
            const unlocked = rank > 0;
            const maxed = rank >= maxRank;
            const atCap = !maxed && rank >= rankCap;
            const cost = maxed ? 0 : commanderFormationTrainingCost(rank, rules);
            const short = Math.max(0, commanderMissingCoins(cost, coins));
            const nextLevel = commanderFormationNextLevel(formation.id, rank, rules);
            const current = commanderFormationModifiers(formation.id, rank);
            const next = maxed ? commanderFormationModifiers(formation.id, rank) : commanderFormationNextGain(formation.id, rank);

            return (
              <article
                key={formation.id}
                className={`cc-formation-card ${active ? "is-active" : ""} ${unlocked ? "is-unlocked" : ""}`}
                data-formation={formation.id}
              >
                <div className="cc-formation-card-top">
                  <div className="cc-formation-title">
                    <span aria-hidden>{formation.icon}</span>
                    <div>
                      <small>{formation.role} DOCTRINE</small>
                      <h3>{formation.name}</h3>
                    </div>
                  </div>
                  <div className="cc-formation-rank-badge">
                    <span>RANK</span>
                    <strong>{rank}</strong>
                    <small>/ {maxRank}</small>
                  </div>
                </div>

                <div className="cc-formation-diagram" aria-label={`${formation.name} tactical diagram`}>
                  <div className="cc-formation-grid-lines" aria-hidden />
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                    <path d={formation.id === "arc_lattice" ? "M31 63 L50 34 L69 63 Z" : "M27 42 L49 51 L70 61"} />
                  </svg>
                  {(["guard", "commander", "archer"] as FormationNode[]).map((node) => (
                    <div key={node} className={`cc-formation-node cc-formation-node--${node}`} style={positions[formation.id][node]}>
                      <img src={formationSprite(node, hq)} alt="" draggable={false} />
                      <span>{node === "guard" ? "FRONT" : node === "archer" ? "RANGED" : "CMD"}</span>
                    </div>
                  ))}
                  {active && <b className="cc-formation-active-flag">ACTIVE</b>}
                </div>

                <p className="cc-formation-summary">{formation.summary}</p>
                <div className="cc-formation-doctrine-copy">
                  <strong>Doctrine</strong>
                  <span>{formation.doctrine}</span>
                </div>
                <div className="cc-formation-tradeoff-copy">
                  <strong>Trade-off</strong>
                  <span>{formation.tradeoff}</span>
                </div>

                <div className="cc-formation-effects">
                  <div>
                    <span>CURRENT DOCTRINE EFFECT</span>
                    <ModifierChips modifiers={current} empty={rank === 0 ? "Advance to Rank 1 to activate doctrine bonuses." : "No stat delta."} />
                  </div>
                  {!maxed && (
                    <div className="cc-formation-next-effect">
                      <span>NEXT RANK DELTA</span>
                      <ModifierChips modifiers={next} empty="Doctrine refinement without a direct stat delta." />
                    </div>
                  )}
                </div>

                <div className="cc-formation-rank-track" aria-label={`${formation.name} doctrine rank ${rank} of ${maxRank}`}>
                  {Array.from({ length: maxRank }, (_, index) => (
                    <i
                      key={index}
                      className={index < rank ? "is-filled" : index < rankCap && available ? "is-open" : ""}
                    />
                  ))}
                </div>

                <div className="cc-formation-actions">
                  <button
                    className="cc-formation-advance"
                    disabled={disabled || !available || maxed || atCap || short > 0}
                    onClick={() => onAdvance(formation, cost)}
                  >
                    {!available
                      ? `Unlocks at Level ${unlockLevel}`
                      : maxed
                        ? "Legendary Doctrine complete"
                        : atCap
                          ? `Rank ${rank + 1} unlocks at Level ${nextLevel ?? 100}`
                          : short > 0
                            ? `${format(short)} more Coins needed`
                            : `${rank === 0 ? "Establish" : "Advance"} Rank ${rank + 1} · ${format(cost)} Coins`}
                  </button>
                  <button
                    className="cc-formation-activate"
                    disabled={disabled || active || !unlocked}
                    onClick={() => onActivate(formation)}
                  >
                    {active ? (rank > 0 ? "Active formation" : "Active baseline") : unlocked ? "Activate formation" : "Train Rank 1 to activate"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="cc-formation-command-foot">
        <strong>Level 100 capstone</strong>
        <span>
          Doctrine Rank 7 is the Legendary Formation milestone. It deepens tactical identity without adding
          another combat slot, new currency, or PvP reward loop; battle authority stays on the server.
        </span>
      </footer>
    </section>
  );
}
