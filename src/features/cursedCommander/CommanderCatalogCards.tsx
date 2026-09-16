import React from "react";
import type {
  CommanderCatalogItem,
  CommanderHeadquarters,
} from "../../../services/commanderHeadquartersService";
import {
  commanderItemEquipped,
  commanderMissingCoins,
} from "./commanderHeadquartersModel";
import { getCommanderRecruitIdentity } from "./commanderRecruitIdentity";
import { getCommanderSpriteUrl } from "./commanderSpriteAssets";
import { COMMANDER_VFX } from "./commanderVfxAssets";
import "./commanderCatalogCards.css";

type PurchaseIntent = {
  operation: "buy" | "equip";
  target: string;
  title: string;
  cost: number;
  detail: string;
};

type CommanderCatalogCardsProps = {
  items: CommanderCatalogItem[];
  hq: CommanderHeadquarters;
  coins: number;
  level: number;
  disabled: boolean;
  onPropose: (intent: PurchaseIntent) => void;
  onGoal: (itemId: string, selected: boolean) => void;
};

type StatKey = "hp" | "attack" | "shield" | "bolt" | "focus" | "guard";

const format = (value: number) => value.toLocaleString("en-US");

const combatantId = (slot: string) =>
  slot === "guard" ? "player_guard" : slot === "archer" ? "player_archer" : "player_commander";

const sprite = (slot: string, catalogId?: string | null) =>
  getCommanderSpriteUrl(combatantId(slot), "standing", catalogId) ?? undefined;

const roleMeta = (item: CommanderCatalogItem) => {
  if (item.slot === "guard") return { label: "FRONTLINE", subtitle: "HOLD THE LINE", glyph: "shield" as const };
  if (item.slot === "archer") return { label: "RANGED", subtitle: "STRIKE FROM AFAR", glyph: "target" as const };
  if (item.slot === "weapon") return { label: "WEAPON", subtitle: "AMPLIFY THE STRIKE", glyph: "blade" as const };
  return { label: "SHIELD", subtitle: "FORTIFY THE CORE", glyph: "shield" as const };
};

const statMeta: Record<StatKey, { label: string; glyph: string }> = {
  hp: { label: "HP", glyph: "heart" },
  attack: { label: "ATTACK", glyph: "blade" },
  shield: { label: "SHIELD", glyph: "shield" },
  bolt: { label: "BOLT", glyph: "bolt" },
  focus: { label: "FOCUS", glyph: "target" },
  guard: { label: "GUARD", glyph: "shield" },
};

const cleanDescription = (description: string) =>
  description
    .replace(/\s*New (?:purchases|recruits) unlock at Commander Level \d+\.\s*$/i, "")
    .trim();

const ThemeIcon = ({ glyph }: { glyph: string }) => {
  if (glyph === "heart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
    );
  }
  if (glyph === "blade") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="m14 4 6-2-2 6-9 9-3 1 1-3 7-11Z" />
        <path d="m7 17-3 3M6 18l-2-2" />
      </svg>
    );
  }
  if (glyph === "target") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    );
  }
  if (glyph === "bolt") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="m13 2-7 12h6l-1 8 7-12h-6l1-8Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m12 3 7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />
      <path d="M9 11.5 11 14l4-5" />
    </svg>
  );
};

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="m6 12 4 4 8-9" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

const CoinIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="8" />
    <path d="M14.5 9.2c-.7-.7-1.7-1.1-2.8-1.1-1.5 0-2.7.7-2.7 1.8 0 2.7 6 1.2 6 4 0 1.2-1.2 2-2.9 2-1.3 0-2.5-.5-3.3-1.3M12 6v2M12 16v2" />
  </svg>
);

const TargetIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export default function CommanderCatalogCards({
  items,
  hq,
  coins,
  level,
  disabled,
  onPropose,
  onGoal,
}: CommanderCatalogCardsProps) {
  const profile = hq.profile;
  const find = (id: string | null | undefined) => hq.catalog.find((item) => item.id === id);

  return (
    <div className="cc-hq-catalog cc-command-catalog cc-premium-catalog">
      {items.map((item) => {
        const owned = hq.owned.includes(item.id);
        const equipped = commanderItemEquipped(hq, item);
        const current = find(profile?.[item.slot]);
        const identity = getCommanderRecruitIdentity(
          item.kind === "unit" ? item.id : null,
          item.kind === "unit" ? item.school : "neutral",
        );
        const role = roleMeta(item);
        const unlockLevel = Math.max(1, item.unlock_level ?? 1);
        const levelLocked = !owned && level < unlockLevel;
        const coinShortfall = commanderMissingCoins(item.price, coins);
        const affordable = coins >= item.price;
        const goalSelected = profile?.goal === item.id;
        const readyToBuy = !owned && !levelLocked && affordable;
        const art = item.kind === "unit"
          ? sprite(item.slot, item.id)
          : item.kind === "weapon"
            ? COMMANDER_VFX.lance
            : COMMANDER_VFX.slash;
        const description = cleanDescription(item.description);

        const stats: Array<[StatKey, number]> = item.kind === "unit"
          ? (["hp", "attack", "shield"] as StatKey[]).map((name) => [name, Number(item.stats[name] ?? 0)])
          : (Object.entries(item.stats)
              .filter(([, value]) => value !== 0)
              .map(([name, value]) => [name as StatKey, Number(value)]) as Array<[StatKey, number]>);

        return (
          <article
            className={`cc-hq-item cc-command-catalog-card cc-premium-card ${equipped ? "is-equipped" : ""} ${owned ? "is-owned" : ""} ${levelLocked ? "is-level-locked" : ""} ${goalSelected ? "is-goal" : ""}`}
            key={item.id}
            data-school={item.school ?? "neutral"}
            style={{
              "--cc-accent": identity.accent,
              "--cc-accent-2": identity.accent2,
              "--cc-card-glow": identity.glow,
            } as React.CSSProperties}
          >
            <header className="cc-premium-card-header">
              <div className="cc-premium-role">
                <span className="cc-premium-role-icon"><ThemeIcon glyph={role.glyph} /></span>
                <span>
                  <strong>{role.label}</strong>
                  <small>{role.subtitle}</small>
                </span>
              </div>
              <div className="cc-premium-card-meta">
                <span className="cc-command-rarity">{(item.rarity ?? "common").toUpperCase()}</span>
                {item.kind === "unit" && identity.sigilUrl ? (
                  <img className="cc-premium-sigil" src={identity.sigilUrl} alt="" draggable={false} />
                ) : (
                  <span className="cc-premium-sigil-fallback" aria-hidden>{identity.sigil}</span>
                )}
              </div>
            </header>

            <div className={`cc-premium-hero cc-hq-item-art--${item.slot}`}>
              <div className="cc-premium-hero-grid" aria-hidden />
              <div className="cc-premium-hero-halo" aria-hidden />
              <img className="cc-premium-art" src={art} alt="" draggable={false} />
              <span className={`cc-premium-state-chip ${equipped ? "is-equipped" : owned ? "is-owned" : "is-price"}`}>
                {equipped || owned ? <CheckIcon /> : <CoinIcon />}
                {equipped ? "EQUIPPED" : owned ? "OWNED" : `${format(item.price)} Coins`}
              </span>
            </div>

            <div className="cc-premium-body">
              <div className="cc-premium-identity">
                <h3>{item.name}</h3>
                {item.kind === "unit" && (
                  <p className="cc-command-codename"><span aria-hidden>{identity.sigil}</span>{identity.codename}</p>
                )}
              </div>

              <p className="cc-premium-description">{description}</p>
              {item.kind === "unit" && <p className="cc-command-doctrine">{identity.doctrine}</p>}

              <dl className={`cc-premium-stats ${stats.length < 3 ? "is-compact" : ""}`}>
                {stats.map(([name, value]) => {
                  const currentValue = Number(current?.stats[name] ?? 0);
                  const delta = item.kind === "unit" && current && current.id !== item.id
                    ? value - currentValue
                    : 0;
                  const meta = statMeta[name] ?? { label: name.toUpperCase(), glyph: "target" };
                  return (
                    <div className="cc-premium-stat" key={name}>
                      <dt><ThemeIcon glyph={meta.glyph} /><span>{meta.label}</span></dt>
                      <dd>{value === 0 ? "—" : `${item.kind !== "unit" && value > 0 ? "+" : ""}${value}`}</dd>
                      {delta !== 0 && (
                        <small className={delta > 0 ? "is-positive" : "is-negative"}>
                          {delta > 0 ? "▲" : "▼"} {delta > 0 ? "+" : ""}{delta} vs current
                        </small>
                      )}
                    </div>
                  );
                })}
              </dl>

              {owned && !equipped && current && (
                <div className="cc-premium-context-panel">
                  <span className="cc-premium-swap-icon" aria-hidden>⇄</span>
                  <span><small>Equipping replaces</small><strong>{current.name}</strong></span>
                </div>
              )}

              {!owned && (
                <div className="cc-premium-requirements">
                  {unlockLevel > 1 && (
                    <div className={`cc-premium-requirement-row ${levelLocked ? "is-locked" : "is-met"}`}>
                      {levelLocked ? <LockIcon /> : <CheckIcon />}
                      <span>
                        {levelLocked
                          ? `Unlocks at Commander Level ${unlockLevel}`
                          : `Commander Level ${unlockLevel} requirement met`}
                      </span>
                    </div>
                  )}
                  <div className={`cc-premium-coin-row ${affordable ? "is-ready" : ""}`}>
                    <span className="cc-premium-coin-label">
                      <CoinIcon />
                      <strong>{affordable ? "Ready to acquire" : `${format(coinShortfall)} Coins needed`}</strong>
                    </span>
                    <span>{format(Math.min(coins, item.price))} / {format(item.price)}</span>
                  </div>
                  <progress max={Math.max(1, item.price)} value={Math.min(coins, item.price)} aria-label={`${item.name} coin progress`} />
                </div>
              )}

              <div className="cc-premium-actions">
                {owned ? (
                  <button
                    className={`cc-premium-primary ${equipped ? "is-equipped" : "is-deploy"}`}
                    disabled={disabled || !profile || equipped}
                    onClick={() =>
                      onPropose({
                        operation: "equip",
                        target: item.id,
                        title: `Equip ${item.name}?`,
                        cost: 0,
                        detail: `Replaces ${current?.name ?? "the current item"}. Active battles keep their original loadout.`,
                      })
                    }
                  >
                    {equipped ? <CheckIcon /> : <ThemeIcon glyph={item.kind === "unit" ? "target" : "shield"} />}
                    {equipped ? "Equipped" : item.kind === "unit" ? "Deploy Unit" : "Equip Item"}
                  </button>
                ) : readyToBuy ? (
                  <>
                    <button
                      className="cc-premium-primary is-purchase"
                      disabled={disabled || !profile}
                      onClick={() =>
                        onPropose({
                          operation: "buy",
                          target: item.id,
                          title: `${item.kind === "unit" ? "Recruit" : "Buy"} ${item.name}?`,
                          cost: item.price,
                          detail: "Adds this item to your collection. Your equipped loadout stays in place until you change it.",
                        })
                      }
                    >
                      <CoinIcon />
                      {item.kind === "unit" ? "Recruit" : "Buy"} · {format(item.price)} Coins
                    </button>
                    <button
                      className={`cc-premium-goal-link ${goalSelected ? "is-selected" : ""}`}
                      disabled={disabled || !profile}
                      onClick={() => onGoal(item.id, goalSelected)}
                    >
                      <TargetIcon />
                      {goalSelected ? "Goal selected" : "Set as goal"}
                    </button>
                  </>
                ) : (
                  <button
                    className={`cc-premium-primary is-goal ${goalSelected ? "is-selected" : ""}`}
                    disabled={disabled || !profile}
                    onClick={() => onGoal(item.id, goalSelected)}
                  >
                    <TargetIcon />
                    {goalSelected ? "Goal Selected" : "Set as Goal"}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
