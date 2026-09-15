import React from "react";
import type {
  CommanderCatalogItem,
  CommanderHeadquarters,
} from "../../../services/commanderHeadquartersService";
import {
  commanderItemEquipped,
  commanderMissingCoins,
  commanderUnitEvolutionBonus,
  commanderUnitEvolutionCost,
  commanderUnitEvolutionMaxTier,
  commanderUnitEvolutionPassive,
  commanderUnitEvolutionRequiredLevel,
  commanderUnitEvolutionStage,
  commanderUnitEvolutionTierCap,
  commanderUnitEvolutionUnlockLevel,
  commanderUnitNextEvolutionGain,
  commanderUnitProgressFor,
} from "./commanderHeadquartersModel";
import { getCommanderRecruitIdentity } from "./commanderRecruitIdentity";
import { getCommanderSpriteUrl } from "./commanderSpriteAssets";
import "./commanderUnitEvolution.css";

type Props = {
  hq: CommanderHeadquarters;
  coins: number;
  disabled?: boolean;
  onEvolve: (item: CommanderCatalogItem, cost: number, targetTier: number) => void;
};

const format = (value: number) => value.toLocaleString("en-US");
const tierStages = ["Base", "Ascended", "Exalted", "Mythic"] as const;

const evolutionSprite = (item: CommanderCatalogItem) => {
  const combatantId = item.slot === "guard" ? "player_guard" : "player_archer";
  return getCommanderSpriteUrl(combatantId, "standing", item.id) ?? undefined;
};

const gainText = (value: number, label: string) =>
  value > 0 ? `+${value} ${label}` : null;

export default function CommanderUnitEvolutionPanel({
  hq,
  coins,
  disabled = false,
  onEvolve,
}: Props) {
  const rules = hq.campaign.rules;
  const level = hq.profile?.level ?? 1;
  const unlockLevel = commanderUnitEvolutionUnlockLevel(rules);
  const maxTier = commanderUnitEvolutionMaxTier(rules);
  const tierCap = commanderUnitEvolutionTierCap(level, rules);
  const evolutionUnlocked = Boolean(hq.profile) && level >= unlockLevel;
  const ownedUnits = hq.catalog.filter(
    (item) => item.kind === "unit" && hq.owned.includes(item.id),
  );

  return (
    <section className="cc-unit-evolution" aria-labelledby="cc-unit-evolution-title">
      <div className="cc-unit-evolution-head">
        <div>
          <span className="cc-hq-eyebrow">UNIT EVOLUTION · LEVELS 21–30</span>
          <h2 id="cc-unit-evolution-title">Turn veterans into signature battlefield assets</h2>
          <p>
            Rank 10 units can evolve without losing their training, equipment role, or identity.
            Ascended, Exalted, and Mythic tiers add controlled server-calculated combat bonuses
            that carry into both Practice and Player Battles.
          </p>
        </div>
        <div className={`cc-unit-evolution-unlock ${evolutionUnlocked ? "is-open" : "is-locked"}`}>
          <span>{evolutionUnlocked ? "EVOLUTION ONLINE" : "LOCKED"}</span>
          <strong>{evolutionUnlocked ? `${commanderUnitEvolutionStage(tierCap)} access` : `Level ${unlockLevel}`}</strong>
          <small>
            {evolutionUnlocked
              ? `Your Commander can currently authorize evolution through Tier ${tierCap}.`
              : `${Math.max(0, unlockLevel - level)} Commander level${unlockLevel - level === 1 ? "" : "s"} remaining.`}
          </small>
        </div>
      </div>

      <div className="cc-unit-evolution-path" aria-label="Commander evolution milestones">
        {tierStages.map((stage, tier) => {
          const required = tier === 0 ? 1 : commanderUnitEvolutionRequiredLevel(tier, rules);
          const active = tier <= tierCap;
          return (
            <div key={stage} className={`cc-unit-evolution-path-node ${active ? "is-active" : ""}`}>
              <span>{tier}</span>
              <strong>{stage}</strong>
              <small>{tier === 0 ? "Rank 10 prerequisite" : `Commander Lv ${required}`}</small>
            </div>
          );
        })}
      </div>

      {!hq.profile ? (
        <div className="cc-unit-evolution-empty">
          Claim your starter squad and complete Unit Training before entering evolution.
        </div>
      ) : ownedUnits.length === 0 ? (
        <div className="cc-unit-evolution-empty">Recruit a unit to begin its evolution path.</div>
      ) : (
        <div className="cc-unit-evolution-grid">
          {ownedUnits.map((item) => {
            const progress = commanderUnitProgressFor(hq, item.id);
            const currentTier = Math.max(0, Math.min(maxTier, progress.evolutionTier));
            const nextTier = Math.min(maxTier, currentTier + 1);
            const atMax = currentTier >= maxTier;
            const rankReady = progress.unitRank >= progress.maxRank;
            const requiredLevel = atMax
              ? commanderUnitEvolutionRequiredLevel(maxTier, rules)
              : commanderUnitEvolutionRequiredLevel(nextTier, rules);
            const levelReady = nextTier <= tierCap && level >= requiredLevel;
            const cost = atMax ? 0 : commanderUnitEvolutionCost(item, nextTier, rules);
            const short = commanderMissingCoins(cost, coins);
            const currentBonus = commanderUnitEvolutionBonus(item, currentTier);
            const nextGain = atMax
              ? { hp: 0, shield: 0, attack: 0 }
              : commanderUnitNextEvolutionGain(item, currentTier);
            const nextPassive = commanderUnitEvolutionPassive(item, atMax ? currentTier : nextTier);
            const identity = getCommanderRecruitIdentity(item.id, item.school);
            const equipped = commanderItemEquipped(hq, item);
            const gains = [
              gainText(nextGain.hp, "HP"),
              gainText(nextGain.shield, "SH"),
              gainText(nextGain.attack, "ATK"),
            ].filter(Boolean);

            return (
              <article
                key={item.id}
                className={`cc-unit-evolution-card is-tier-${currentTier} ${equipped ? "is-equipped" : ""}`}
                data-school={item.school ?? "neutral"}
                style={{
                  "--cc-evo-accent": identity.accent,
                  "--cc-evo-accent-2": identity.accent2,
                  "--cc-evo-glow": identity.glow,
                } as React.CSSProperties}
              >
                <div className="cc-unit-evolution-stage" aria-hidden>
                  <div className="cc-unit-evolution-aura" />
                  <div className="cc-unit-evolution-orbit"><i /><i /><i /></div>
                  <span className="cc-unit-evolution-tier">TIER {currentTier} · {commanderUnitEvolutionStage(currentTier).toUpperCase()}</span>
                  {equipped && <span className="cc-unit-evolution-deployed">DEPLOYED</span>}
                  <img src={evolutionSprite(item)} alt="" draggable={false} />
                </div>

                <div className="cc-unit-evolution-body">
                  <div className="cc-unit-evolution-title-row">
                    <div>
                      <small>{item.slot === "guard" ? "FRONTLINE" : "RANGED"} · {(item.rarity ?? "common").toUpperCase()}</small>
                      <h3>{item.name}</h3>
                    </div>
                    <span title={`${identity.codename} doctrine`}>{identity.sigil}</span>
                  </div>

                  <div className="cc-unit-evolution-tier-rail" aria-label={`${item.name} evolution tier`}>
                    {tierStages.map((stage, tier) => (
                      <span
                        key={stage}
                        className={tier <= currentTier ? "is-earned" : tier === currentTier + 1 ? "is-next" : ""}
                        title={stage}
                      >
                        {tier}
                      </span>
                    ))}
                  </div>

                  <div className="cc-unit-evolution-requirements">
                    <span className={rankReady ? "is-met" : ""}>RANK {progress.unitRank}/{progress.maxRank}</span>
                    <span className={evolutionUnlocked && levelReady ? "is-met" : ""}>COMMANDER LV {level}</span>
                    <span className={short === 0 ? "is-met" : ""}>{format(coins)} COINS</span>
                  </div>

                  <dl className="cc-unit-evolution-bonuses">
                    <div><dt>Evolution HP</dt><dd>+{currentBonus.hp}</dd></div>
                    <div><dt>Evolution SH</dt><dd>+{currentBonus.shield}</dd></div>
                    <div><dt>Evolution ATK</dt><dd>+{currentBonus.attack}</dd></div>
                  </dl>

                  <div className="cc-unit-evolution-next">
                    <span>{atMax ? "EVOLUTION COMPLETE" : `NEXT · ${commanderUnitEvolutionStage(nextTier).toUpperCase()}`}</span>
                    <strong>{atMax ? "MYTHIC UNIT" : gains.length ? gains.join(" · ") : "Doctrine reinforcement"}</strong>
                    {nextPassive && (
                      <p>
                        <b>{nextPassive.label}</b> · {nextPassive.description}
                      </p>
                    )}
                  </div>

                  <button
                    className="cc-hq-primary cc-unit-evolution-action"
                    disabled={
                      disabled
                      || !evolutionUnlocked
                      || !rankReady
                      || atMax
                      || !levelReady
                      || short > 0
                    }
                    onClick={() => onEvolve(item, cost, nextTier)}
                  >
                    {!evolutionUnlocked
                      ? `Unlocks at Commander Level ${unlockLevel}`
                      : !rankReady
                        ? `Train to Unit Rank ${progress.maxRank} first`
                        : atMax
                          ? "Mythic evolution complete"
                          : !levelReady
                            ? `Reach Commander Level ${requiredLevel}`
                            : short > 0
                              ? `${format(short)} more Coins needed`
                              : `Evolve to ${commanderUnitEvolutionStage(nextTier)} · ${format(cost)} Coins`}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="cc-unit-evolution-doctrine">
        <strong>Evolution preserves roster value</strong>
        <span>
          Evolution never converts one catalog recruit into another. Neon Guard remains Neon Guard;
          Neon Bulwark remains its own recruit. Each unit keeps its Rank 10 investment and gains a
          school-aligned evolution layer instead of invalidating units you already bought.
        </span>
      </div>
    </section>
  );
}