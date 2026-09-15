import React from "react";
import type {
  CommanderCatalogItem,
  CommanderHeadquarters,
} from "../../../services/commanderHeadquartersService";
import {
  commanderItemEquipped,
  commanderMissingCoins,
  commanderUnitNextRankGain,
  commanderUnitProgressFor,
  commanderUnitRankBonus,
  commanderUnitTrainingUnlockLevel,
} from "./commanderHeadquartersModel";
import { getCommanderRecruitIdentity } from "./commanderRecruitIdentity";
import { getCommanderSpriteUrl } from "./commanderSpriteAssets";
import "./commanderUnitTraining.css";

type Props = {
  hq: CommanderHeadquarters;
  coins: number;
  disabled?: boolean;
  onTrain: (item: CommanderCatalogItem, cost: number) => void;
};

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
  const unlockLevel = commanderUnitTrainingUnlockLevel(rules);
  const trainingUnlocked = Boolean(hq.profile) && level >= unlockLevel;
  const ownedUnits = hq.catalog.filter(
    (item) => item.kind === "unit" && hq.owned.includes(item.id),
  );

  return (
    <section className="cc-unit-training" aria-labelledby="cc-unit-training-title">
      <div className="cc-unit-training-head">
        <div>
          <span className="cc-hq-eyebrow">UNIT DEVELOPMENT · LEVELS 11–20</span>
          <h2 id="cc-unit-training-title">Train the soldiers you chose to keep</h2>
          <p>
            Every owned unit develops independently. Commander Level opens higher ranks;
            Brains Heist Coins pay for the upgrade. Trained stats are used in both Practice
            and Player Battles.
          </p>
        </div>
        <div className={`cc-unit-training-unlock ${trainingUnlocked ? "is-open" : "is-locked"}`}>
          <span>{trainingUnlocked ? "TRAINING ONLINE" : "LOCKED"}</span>
          <strong>{trainingUnlocked ? `Rank cap ${hq.profile?.unitRankCap ?? 1}` : `Level ${unlockLevel}`}</strong>
          <small>
            {trainingUnlocked
              ? "Your cap rises as Commander Level increases."
              : `${Math.max(0, unlockLevel - level)} Commander level${unlockLevel - level === 1 ? "" : "s"} remaining.`}
          </small>
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
            const nextCommanderLevel = unlockLevel + Math.max(0, rank - 1);
            const gains = [
              gainText(nextGain.hp, "HP"),
              gainText(nextGain.shield, "SH"),
              gainText(nextGain.attack, "ATK"),
            ].filter(Boolean);

            return (
              <article
                key={item.id}
                className={`cc-unit-training-card ${equipped ? "is-equipped" : ""}`}
                data-school={item.school ?? "neutral"}
                style={{
                  "--cc-unit-accent": identity.accent,
                  "--cc-unit-accent-2": identity.accent2,
                  "--cc-unit-glow": identity.glow,
                } as React.CSSProperties}
              >
                <div className="cc-unit-training-stage" aria-hidden>
                  <span className="cc-unit-training-rank">RANK {rank}</span>
                  {equipped && <span className="cc-unit-training-deployed">DEPLOYED</span>}
                  <div className="cc-unit-training-halo" />
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
                    <span>{atMax ? "DEVELOPMENT COMPLETE" : `NEXT · RANK ${rank + 1}`}</span>
                    <strong>
                      {atMax
                        ? (progress.veteran ? "VETERAN UNIT" : "MAX UNIT RANK")
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
                      ? `Unlocks at Level ${unlockLevel}`
                      : atMax
                        ? (progress.veteran ? "Veteran ready · Evolution at 21" : "Maximum unit rank")
                        : atLevelCap
                          ? `Reach Commander Level ${nextCommanderLevel}`
                          : short > 0
                            ? `${format(short)} more Coins needed`
                            : `Train to Rank ${rank + 1} · ${format(cost)} Coins`}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="cc-unit-training-doctrine">
        <strong>Balanced progression</strong>
        <span>
          Frontline ranks mainly improve endurance. Ranged ranks mainly improve pressure.
          Commander Dexterity still applies separately, so unit training adds depth without
          replacing your existing build.
        </span>
      </div>
    </section>
  );
}
