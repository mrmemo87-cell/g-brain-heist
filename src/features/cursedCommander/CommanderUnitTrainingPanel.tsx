import React from "react";
import type {
  CommanderCatalogItem,
  CommanderHeadquarters,
  CommanderMasterySchool,
} from "../../../services/commanderHeadquartersService";
import {
  commanderItemEquipped,
  commanderMissingCoins,
  commanderSchoolMasteryCost,
  commanderSchoolMasteryDoctrine,
  commanderSchoolMasteryMaxRank,
  commanderSchoolMasteryNextLevel,
  commanderSchoolMasteryRank,
  commanderSchoolMasteryRankCap,
  commanderSchoolMasteryUnlockLevel,
  commanderUnitEvolutionBonus,
  commanderUnitEvolutionCost,
  commanderUnitEvolutionDoctrine,
  commanderUnitEvolutionMaxTier,
  commanderUnitEvolutionNextLevel,
  commanderUnitEvolutionTierCap,
  commanderUnitEvolutionUnlockLevel,
  commanderUnitNextEvolutionGain,
  commanderUnitNextRankGain,
  commanderUnitProgressFor,
  commanderUnitRankBonus,
  commanderUnitTrainingUnlockLevel,
} from "./commanderHeadquartersModel";
import { getCommanderRecruitIdentity } from "./commanderRecruitIdentity";
import { getCommanderSpriteUrl } from "./commanderSpriteAssets";
import "./commanderUnitTraining.css";
import "./commanderUnitEvolution.css";
import "./commanderSchoolMastery.css";

type Props = {
  hq: CommanderHeadquarters;
  coins: number;
  disabled?: boolean;
  onTrain: (item: CommanderCatalogItem, cost: number) => void;
};

const MASTERY_SCHOOLS: CommanderMasterySchool[] = ["void", "storm", "rot", "grave"];
const format = (value: number) => value.toLocaleString("en-US");

const gainText = (value: number, label: string) =>
  value > 0 ? `+${value} ${label}` : null;

const trainingSprite = (item: CommanderCatalogItem) => {
  const combatantId = item.slot === "guard" ? "player_guard" : "player_archer";
  return getCommanderSpriteUrl(combatantId, "standing", item.id) ?? undefined;
};

export default function CommanderUnitTrainingPanel({
  hq,
  coins,
  disabled = false,
  onTrain,
}: Props) {
  const rules = hq.campaign.rules;
  const level = hq.profile?.level ?? 1;
  const trainingUnlockLevel = commanderUnitTrainingUnlockLevel(rules);
  const evolutionUnlockLevel = commanderUnitEvolutionUnlockLevel(rules);
  const masteryUnlockLevel = commanderSchoolMasteryUnlockLevel(rules);
  const trainingUnlocked = Boolean(hq.profile) && level >= trainingUnlockLevel;
  const evolutionCap = commanderUnitEvolutionTierCap(level, rules);
  const maxEvolutionTier = commanderUnitEvolutionMaxTier(rules);
  const evolutionUnlocked = Boolean(hq.profile) && level >= evolutionUnlockLevel;
  const masteryCap = commanderSchoolMasteryRankCap(level, rules);
  const maxMasteryRank = commanderSchoolMasteryMaxRank(rules);
  const masteryUnlocked = Boolean(hq.profile) && level >= masteryUnlockLevel;
  const ownedUnits = hq.catalog.filter(
    (item) => item.kind === "unit" && hq.owned.includes(item.id),
  );

  return (
    <section className="cc-unit-training" aria-labelledby="cc-unit-training-title">
      <div className="cc-unit-training-head">
        <div>
          <span className="cc-hq-eyebrow">UNIT DEVELOPMENT · LEVELS 11–40</span>
          <h2 id="cc-unit-training-title">Train veterans. Evolve specialists. Master schools.</h2>
          <p>
            Every owned unit develops independently through Rank and Evolution. At Level 31,
            fully evolved specialists can unlock permanent School Mastery for Void, Storm, Rot,
            and Grave powers. Brains Heist Coins fund every upgrade; combat remains server-authoritative.
          </p>
        </div>
        <div className="cc-unit-development-statuses">
          <div className={`cc-unit-training-unlock ${trainingUnlocked ? "is-open" : "is-locked"}`}>
            <span>{trainingUnlocked ? "TRAINING ONLINE" : "TRAINING LOCKED"}</span>
            <strong>{trainingUnlocked ? `Rank cap ${hq.profile?.unitRankCap ?? 1}` : `Level ${trainingUnlockLevel}`}</strong>
            <small>
              {trainingUnlocked
                ? "Your unit-rank cap rises with Commander Level."
                : `${Math.max(0, trainingUnlockLevel - level)} Commander level${trainingUnlockLevel - level === 1 ? "" : "s"} remaining.`}
            </small>
          </div>
          <div className={`cc-unit-training-unlock cc-unit-evolution-unlock ${evolutionUnlocked ? "is-open" : "is-locked"}`}>
            <span>{evolutionUnlocked ? "EVOLUTION ONLINE" : "EVOLUTION LOCKED"}</span>
            <strong>{evolutionUnlocked ? `Tier cap ${evolutionCap} / ${maxEvolutionTier}` : `Level ${evolutionUnlockLevel}`}</strong>
            <small>
              {evolutionUnlocked
                ? "Rank 10 veterans evolve at Commander Levels 21, 25, and 30."
                : "Reach Rank 10 first, then unlock the first Evolution tier at Level 21."}
            </small>
          </div>
          <div className={`cc-unit-training-unlock cc-school-mastery-unlock ${masteryUnlocked ? "is-open" : "is-locked"}`}>
            <span>{masteryUnlocked ? "MASTERY ONLINE" : "MASTERY LOCKED"}</span>
            <strong>{masteryUnlocked ? `Mastery cap ${masteryCap} / ${maxMasteryRank}` : `Level ${masteryUnlockLevel}`}</strong>
            <small>
              {masteryUnlocked
                ? "Tier III evolved units can advance their School power at Levels 31, 35, and 40."
                : "Complete a unit's Evolution path before beginning School Mastery."}
            </small>
          </div>
        </div>
      </div>

      {!hq.profile ? (
        <div className="cc-unit-training-empty">
          Claim your starter squad before developing individual units.
        </div>
      ) : ownedUnits.length === 0 ? (
        <div className="cc-unit-training-empty">Recruit a unit to begin its development path.</div>
      ) : (
        <div className="cc-unit-training-grid">
          {ownedUnits.map((item) => {
            const progress = commanderUnitProgressFor(hq, item.id);
            const rank = progress.unitRank;
            const maxRank = progress.maxRank;
            const rankCap = progress.rankCap;
            const atMax = rank >= maxRank;
            const atLevelCap = !atMax && rank >= rankCap;
            const cost = progress.nextCost ?? 0;
            const short = Math.max(0, commanderMissingCoins(cost, coins));
            const bonus = commanderUnitRankBonus(item, rank, rules);
            const nextGain = atMax
              ? { hp: 0, shield: 0, attack: 0 }
              : commanderUnitNextRankGain(item, rank, rules);
            const identity = getCommanderRecruitIdentity(item.id, item.school);
            const equipped = commanderItemEquipped(hq, item);
            const nextCommanderLevel = trainingUnlockLevel + Math.max(0, rank - 1);
            const gains = [
              gainText(nextGain.hp, "HP"),
              gainText(nextGain.shield, "SH"),
              gainText(nextGain.attack, "ATK"),
            ].filter(Boolean);

            const tier = Math.max(0, progress.evolutionTier ?? 0);
            const evolved = tier > 0;
            const evolutionMaxed = tier >= maxEvolutionTier;
            const tierLocked = !evolutionMaxed && tier >= evolutionCap;
            const evolutionRankReady = rank >= maxRank;
            const evolutionCost = evolutionMaxed ? 0 : commanderUnitEvolutionCost(tier, rules);
            const evolutionShort = Math.max(0, commanderMissingCoins(evolutionCost, coins));
            const evolutionBonus = commanderUnitEvolutionBonus(item, tier, rules);
            const nextEvolutionGain = evolutionMaxed
              ? { hp: 0, shield: 0, attack: 0 }
              : commanderUnitNextEvolutionGain(item, tier, rules);
            const evolutionDoctrine = commanderUnitEvolutionDoctrine(item);
            const requiredLevel = commanderUnitEvolutionNextLevel(tier, rules);
            const evolutionGains = [
              gainText(nextEvolutionGain.hp, "HP"),
              gainText(nextEvolutionGain.shield, "SH"),
              gainText(nextEvolutionGain.attack, "ATK"),
            ].filter(Boolean);
            const evolutionItem: CommanderCatalogItem = {
              ...item,
              name: `${item.name} · Evolution Tier ${Math.min(maxEvolutionTier, tier + 1)}`,
            };

            return (
              <article
                key={item.id}
                className={`cc-unit-training-card ${equipped ? "is-equipped" : ""} ${evolved ? "is-evolved" : ""}`}
                data-school={item.school ?? "neutral"}
                data-evolution-tier={tier}
                style={{
                  "--cc-unit-accent": identity.accent,
                  "--cc-unit-accent-2": identity.accent2,
                  "--cc-unit-glow": identity.glow,
                } as React.CSSProperties}
              >
                <div className="cc-unit-training-stage" aria-hidden>
                  <span className="cc-unit-training-rank">RANK {rank}</span>
                  {equipped && <span className="cc-unit-training-deployed">DEPLOYED</span>}
                  {evolved && <span className="cc-unit-evolution-badge">EVO {tier}</span>}
                  <div className="cc-unit-training-halo" />
                  {evolved && <div className="cc-unit-evolution-aura" />}
                  <img src={trainingSprite(item)} alt="" draggable={false} />
                </div>

                <div className="cc-unit-training-body">
                  <div className="cc-unit-training-title-row">
                    <div>
                      <small>{item.slot === "guard" ? "FRONTLINE" : "RANGED"} · {(item.rarity ?? "common").toUpperCase()}</small>
                      <h3>{item.name}</h3>
                    </div>
                    <span title={`${identity.codename} doctrine`}>{identity.sigil}</span>
                  </div>

                  <div className="cc-unit-training-meter">
                    <div>
                      <span>UNIT RANK</span>
                      <strong>{rank} / {maxRank}</strong>
                    </div>
                    <progress max={maxRank} value={rank} aria-label={`${item.name} unit rank`} />
                    <small>
                      Current Commander cap: {rankCap}
                      {progress.veteran ? " · Veteran ready" : ""}
                    </small>
                  </div>

                  <dl className="cc-unit-training-bonuses">
                    <div><dt>Training HP</dt><dd>+{bonus.hp}</dd></div>
                    <div><dt>Training SH</dt><dd>+{bonus.shield}</dd></div>
                    <div><dt>Training ATK</dt><dd>+{bonus.attack}</dd></div>
                  </dl>

                  <div className="cc-unit-training-next">
                    <span>{atMax ? "TRAINING COMPLETE" : `NEXT · RANK ${rank + 1}`}</span>
                    <strong>
                      {atMax
                        ? "VETERAN UNIT · EVOLUTION PATH AVAILABLE"
                        : gains.length
                          ? gains.join(" · ")
                          : "Foundation reinforcement"}
                    </strong>
                  </div>

                  <button
                    className="cc-hq-primary cc-unit-training-action"
                    disabled={
                      disabled
                      || !trainingUnlocked
                      || atMax
                      || atLevelCap
                      || short > 0
                    }
                    onClick={() => onTrain(item, cost)}
                  >
                    {!trainingUnlocked
                      ? `Unlocks at Level ${trainingUnlockLevel}`
                      : atMax
                        ? "Rank 10 complete"
                        : atLevelCap
                          ? `Reach Commander Level ${nextCommanderLevel}`
                          : short > 0
                            ? `${format(short)} more Coins needed`
                            : `Train to Rank ${rank + 1} · ${format(cost)} Coins`}
                  </button>

                  <div className={`cc-unit-evolution ${evolved ? "is-active" : ""}`}>
                    <div className="cc-unit-evolution-head">
                      <div>
                        <span>EVOLUTION PROTOCOL</span>
                        <strong>{evolutionDoctrine.name}</strong>
                      </div>
                      <div className="cc-unit-evolution-tiers" aria-label={`${item.name} Evolution tier ${tier} of ${maxEvolutionTier}`}>
                        {Array.from({ length: maxEvolutionTier }, (_, index) => (
                          <i key={index} className={index < tier ? "is-filled" : index < evolutionCap ? "is-open" : ""} />
                        ))}
                      </div>
                    </div>

                    <p>{evolutionDoctrine.detail}</p>

                    <dl className="cc-unit-evolution-bonuses">
                      <div><dt>Evo HP</dt><dd>+{evolutionBonus.hp}</dd></div>
                      <div><dt>Evo SH</dt><dd>+{evolutionBonus.shield}</dd></div>
                      <div><dt>Evo ATK</dt><dd>+{evolutionBonus.attack}</dd></div>
                    </dl>

                    <div className="cc-unit-evolution-next">
                      <span>{evolutionMaxed ? "FINAL FRAME" : `NEXT · EVOLUTION TIER ${tier + 1}`}</span>
                      <strong>
                        {evolutionMaxed
                          ? "EVOLUTION COMPLETE · SCHOOL MASTERY READY"
                          : evolutionGains.length
                            ? evolutionGains.join(" · ")
                            : "Doctrine reinforcement"}
                      </strong>
                    </div>

                    <button
                      className="cc-unit-evolution-action"
                      disabled={
                        disabled
                        || evolutionMaxed
                        || !evolutionRankReady
                        || !evolutionUnlocked
                        || tierLocked
                        || evolutionShort > 0
                      }
                      onClick={() => onTrain(evolutionItem, evolutionCost)}
                    >
                      {evolutionMaxed
                        ? `Evolution complete · Mastery at Level ${masteryUnlockLevel}`
                        : !evolutionRankReady
                          ? "Reach Unit Rank 10"
                          : !evolutionUnlocked
                            ? `Unlocks at Commander Level ${evolutionUnlockLevel}`
                            : tierLocked
                              ? `Next tier unlocks at Level ${requiredLevel ?? evolutionUnlockLevel}`
                              : evolutionShort > 0
                                ? `${format(evolutionShort)} more Coins needed`
                                : `Evolve to Tier ${tier + 1} · ${format(evolutionCost)} Coins`}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hq.profile && (
        <section className="cc-school-mastery" aria-labelledby="cc-school-mastery-title">
          <div className="cc-school-mastery-heading">
            <div>
              <span className="cc-hq-eyebrow">SCHOOL MASTERY · LEVELS 31–40</span>
              <h3 id="cc-school-mastery-title">Turn faction identity into battlefield doctrine</h3>
              <p>
                Mastery is shared by the entire school. A Tier III evolved unit qualifies its school;
                once trained, the bonus follows that school power whenever the power is available in your loadout.
              </p>
            </div>
            <strong>{masteryCap} / {maxMasteryRank} CURRENT CAP</strong>
          </div>

          <div className="cc-school-mastery-grid">
            {MASTERY_SCHOOLS.map((school) => {
              const identity = getCommanderRecruitIdentity(null, school);
              const doctrine = commanderSchoolMasteryDoctrine(school);
              const rank = commanderSchoolMasteryRank(hq, school);
              const maxed = rank >= maxMasteryRank;
              const atCap = !maxed && rank >= masteryCap;
              const nextLevel = commanderSchoolMasteryNextLevel(rank, rules);
              const cost = maxed ? 0 : commanderSchoolMasteryCost(rank, rules);
              const short = Math.max(0, commanderMissingCoins(cost, coins));
              const schoolUnits = ownedUnits.filter((item) => item.school === school);
              const qualifyingUnit = schoolUnits.find(
                (item) => commanderUnitProgressFor(hq, item.id).evolutionTier >= maxEvolutionTier,
              );
              const active = school === "void" || Boolean(hq.loadout?.units.some((unit) => unit.school === school));
              const masteryItem = qualifyingUnit
                ? {
                    ...qualifyingUnit,
                    name: `${identity.school.toUpperCase()} School · Mastery ${Math.min(maxMasteryRank, rank + 1)}`,
                  }
                : null;

              return (
                <article
                  key={school}
                  className={`cc-school-mastery-card ${active ? "is-active" : ""} ${rank > 0 ? "is-trained" : ""}`}
                  data-school={school}
                  style={{
                    "--cc-mastery-accent": identity.accent,
                    "--cc-mastery-accent-2": identity.accent2,
                    "--cc-mastery-glow": identity.glow,
                  } as React.CSSProperties}
                >
                  <div className="cc-school-mastery-card-head">
                    <span className="cc-school-mastery-sigil" aria-hidden>
                      {identity.sigilUrl ? <img src={identity.sigilUrl} alt="" draggable={false} /> : identity.sigil}
                    </span>
                    <div>
                      <small>{school.toUpperCase()} SCHOOL · {active ? "POWER ACTIVE" : "STORED DOCTRINE"}</small>
                      <h4>{doctrine.name}</h4>
                      <strong>{doctrine.power}</strong>
                    </div>
                    <b>R{rank}</b>
                  </div>

                  <p>{doctrine.summary}</p>
                  <div className="cc-school-mastery-effect">{doctrine.effect}</div>

                  <div className="cc-school-mastery-ranks" aria-label={`${school} School Mastery rank ${rank} of ${maxMasteryRank}`}>
                    {Array.from({ length: maxMasteryRank }, (_, index) => (
                      <i key={index} className={index < rank ? "is-filled" : index < masteryCap ? "is-open" : ""} />
                    ))}
                  </div>

                  <div className="cc-school-mastery-qualification">
                    <span>{qualifyingUnit ? "QUALIFIED BY" : "QUALIFICATION"}</span>
                    <strong>
                      {qualifyingUnit
                        ? `${qualifyingUnit.name} · EVO ${commanderUnitProgressFor(hq, qualifyingUnit.id).evolutionTier}`
                        : schoolUnits.length
                          ? `Evolve a ${school.toUpperCase()} unit to Tier III`
                          : `Recruit and evolve a ${school.toUpperCase()} unit`}
                    </strong>
                  </div>

                  <button
                    className="cc-school-mastery-action"
                    disabled={
                      disabled
                      || !masteryUnlocked
                      || !masteryItem
                      || maxed
                      || atCap
                      || short > 0
                    }
                    onClick={() => masteryItem && onTrain(masteryItem, cost)}
                  >
                    {maxed
                      ? "School Mastery complete"
                      : !masteryItem
                        ? `Requires Tier III ${school.toUpperCase()} specialist`
                        : !masteryUnlocked
                          ? `Unlocks at Commander Level ${masteryUnlockLevel}`
                          : atCap
                            ? `Next rank unlocks at Level ${nextLevel ?? masteryUnlockLevel}`
                            : short > 0
                              ? `${format(short)} more Coins needed`
                              : `Master ${school.toUpperCase()} to Rank ${rank + 1} · ${format(cost)} Coins`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="cc-unit-training-doctrine">
        <strong>Controlled power curve</strong>
        <span>
          Rank training handles Levels 11–20, Evolution handles 21–30, and School Mastery begins
          at 31. Mastery strengthens the existing Void, Storm, Rot, and Grave powers rather than
          adding another combat slot, currency, or PvP farming loop.
        </span>
      </div>
    </section>
  );
}
