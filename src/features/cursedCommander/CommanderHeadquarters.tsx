import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  commanderHeadquartersError,
  getCommanderHeadquarters,
  sendCommanderCommand,
  type CommanderCatalogItem,
  type CommanderHeadquarters as Headquarters,
  type CommanderOperation,
  type CommanderStat,
} from "../../../services/commanderHeadquartersService";
import {
  commanderItemEquipped,
  commanderLevelXp,
  commanderMissingCoins,
  commanderStatRank,
  commanderTrainingCost,
} from "./commanderHeadquartersModel";
import { getCommanderSpriteUrl } from "./commanderSpriteAssets";
import { COMMANDER_VFX } from "./commanderVfxAssets";
import CommanderPracticeArena from "./CommanderPracticeArena";
import "./commanderHeadquarters.css";

type Tab = "overview" | "army" | "armory" | "training" | "records";
type Choice = {
  operation: CommanderOperation;
  target: string | null;
  title: string;
  cost: number;
  detail: string;
};
const tabs: Array<[Tab, string, string]> = [
  ["overview", "Headquarters", "◈"],
  ["army", "Army", "♜"],
  ["armory", "Armory", "◇"],
  ["training", "Training", "↗"],
  ["records", "Records", "≡"],
];
const stats: Array<{
  id: CommanderStat;
  name: string;
  detail: string;
  icon: string;
}> = [
  {
    id: "force",
    name: "Force",
    detail: "+2 Death Bolt damage · +1 Focus damage per rank",
    icon: "ϟ",
  },
  {
    id: "defense",
    name: "Defense",
    detail: "+2 starting shield, Guard strength, and shield capacity per rank",
    icon: "⬡",
  },
  {
    id: "dexterity",
    name: "Dexterity",
    detail: "+1 attack to each deployed unit per rank",
    icon: "⌁",
  },
  {
    id: "stamina",
    name: "Stamina",
    detail: "+6 Commander health per rank",
    icon: "✧",
  },
];
const format = (n: number) => n.toLocaleString("en-US");
const sprite = (slot: string) =>
  getCommanderSpriteUrl(
    slot === "guard"
      ? "player_guard"
      : slot === "archer"
        ? "player_archer"
        : "player_commander",
    "standing",
  );

export default function CommanderHeadquarters({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [hq, setHq] = useState<Headquarters | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [practice, setPractice] = useState<"owned" | "fixed" | null>(null);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const attempt = useRef<{
    id: string;
    choice: Choice;
    version: number | null;
  } | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const confirmation = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current || attempt.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    try {
      const next = await getCommanderHeadquarters(controller.signal);
      if (alive.current && !controller.signal.aborted) {
        setHq(next);
        setError("");
      }
    } catch (cause) {
      if (alive.current && request.current === controller)
        setError(commanderHeadquartersError(cause));
    } finally {
      window.clearTimeout(timer);
      if (alive.current && request.current === controller) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (choice) confirmation.current?.focus();
  }, [choice]);

  const execute = async (selected: Choice, retry = false) => {
    if (inFlight.current || (attempt.current && !retry)) return;
    request.current?.abort();
    if (!retry)
      attempt.current = {
        id: crypto.randomUUID(),
        choice: selected,
        version: hq?.profile?.version ?? null,
      };
    const action = attempt.current;
    if (!action) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const next = await sendCommanderCommand(
        action.choice.operation,
        action.choice.target,
        action.version,
        action.id,
        controller.signal,
      );
      if (!alive.current) return;
      attempt.current = null;
      setRetryPending(false);
      setHq(next);
      setChoice(null);
      setNotice(
        action.choice.operation === "buy"
          ? "Added to your collection. Equip it when you are ready."
          : action.choice.operation === "equip"
            ? "Army updated. The new loadout will be used in your next battle."
            : action.choice.operation === "train"
              ? "Training complete. Your army stats are updated."
              : action.choice.operation === "enroll"
                ? "Your expedition begins. Your starter squad is ready."
                : action.choice.target
                  ? "Goal pinned to headquarters."
                  : "Goal cleared.",
      );
    } catch (cause) {
      if (!alive.current) return;
      const definite = Boolean(
        cause &&
          typeof cause === "object" &&
          "code" in cause &&
          ["P0001", "42501", "23505"].includes(String(cause.code)),
      );
      if (definite) {
        attempt.current = null;
        setRetryPending(false);
        setChoice(null);
      } else setRetryPending(true);
      setError(
        definite
          ? commanderHeadquartersError(cause)
          : "We could not confirm the response. Retry the same action to check its result without paying twice.",
      );
    } finally {
      window.clearTimeout(timer);
      inFlight.current = false;
      if (alive.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  };
  const propose = (next: Choice) => {
    if (busy || retryPending) return;
    setChoice(next);
    setNotice("");
  };
  const p = hq?.profile,
    loadout = hq?.loadout;
  const unavailable = busy || retryPending || loading;
  const find = (id: string | null | undefined) =>
    hq?.catalog.find((i) => i.id === id);
  const goal = find(p?.goal);
  const costLabel = (price: number) =>
    price > (p?.coins ?? 0)
      ? `${format(commanderMissingCoins(price, p?.coins ?? 0))} Coins needed`
      : `${format(price)} Coins`;
  const catalogCards = (items: CommanderCatalogItem[]) => (
    <div className="cc-hq-catalog">
      {items.map((item) => {
        const owned = hq!.owned.includes(item.id),
          equipped = commanderItemEquipped(hq!, item),
          current = find(p?.[item.slot]);
        return (
          <article
            className={`cc-hq-item ${equipped ? "is-equipped" : ""}`}
            key={item.id}
          >
            <div className={`cc-hq-item-art cc-hq-item-art--${item.slot}`}>
              <span className="cc-hq-item-tag">
                {item.slot === "guard"
                  ? "Frontline"
                  : item.slot === "archer"
                    ? "Ranged"
                    : item.slot}
              </span>
              <img
                src={
                  item.kind === "unit"
                    ? sprite(item.slot)
                    : item.kind === "weapon"
                      ? COMMANDER_VFX.lance
                      : COMMANDER_VFX.slash
                }
                alt=""
                draggable={false}
              />
              <span className="cc-hq-owned">
                {equipped
                  ? "● Equipped"
                  : owned
                    ? "Owned"
                    : `${format(item.price)} Coins`}
              </span>
            </div>
            <div className="cc-hq-item-body">
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <dl className="cc-hq-item-stats">
                {Object.entries(item.stats)
                  .filter(([, value]) => value !== 0)
                  .map(([name, value]) => (
                    <div key={name}>
                      <dt>
                        {name === "bolt"
                          ? "Bolt"
                          : name === "focus"
                            ? "Focus"
                            : name === "guard"
                              ? "Guard"
                              : name.toUpperCase()}
                      </dt>
                      <dd>
                        {item.kind === "weapon" && value > 0 ? "+" : ""}
                        {value}
                      </dd>
                    </div>
                  ))}
              </dl>
              {!equipped && current && (
                <p className="cc-hq-replaces">
                  {owned ? "Equipping replaces" : "Current"}: {current.name}
                </p>
              )}
              <button
                className={owned ? "cc-hq-secondary" : "cc-hq-primary"}
                disabled={
                  unavailable ||
                  !p ||
                  equipped ||
                  (!owned && p.coins < item.price)
                }
                onClick={() =>
                  propose({
                    operation: owned ? "equip" : "buy",
                    target: item.id,
                    title: owned
                      ? `Equip ${item.name}?`
                      : `${item.kind === "unit" ? "Recruit" : "Buy"} ${item.name}?`,
                    cost: owned ? 0 : item.price,
                    detail: owned
                      ? `Replaces ${current?.name ?? "the current item"}. Active battles keep their original loadout.`
                      : "Adds this item to your collection. Your equipped loadout stays in place until you change it.",
                  })
                }
              >
                {equipped
                  ? "Equipped"
                  : owned
                    ? item.kind === "unit"
                      ? "Deploy unit"
                      : "Equip item"
                    : p && p.coins < item.price
                      ? costLabel(item.price)
                      : item.kind === "unit"
                        ? "Recruit unit"
                        : "Buy item"}
              </button>
              {!owned && (
                <button
                  className="cc-hq-text-button"
                  disabled={unavailable || !p}
                  onClick={() =>
                    void execute({
                      operation: "goal",
                      target: p?.goal === item.id ? null : item.id,
                      title: "Pin goal",
                      cost: 0,
                      detail: "",
                    })
                  }
                >
                  {p?.goal === item.id ? "Unpin goal" : "Set as goal"}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  if (practice)
    return (
      <CommanderPracticeArena
        userId={userId}
        ownedLoadout={practice === "owned"}
        onClose={() => {
          setPractice(null);
          void refresh();
        }}
      />
    );
  return (
    <section
      className="cc-hq"
      lang="en"
      dir="ltr"
      data-no-interface-translation="true"
      aria-labelledby="cc-hq-title"
    >
      <header className="cc-hq-top">
        <button className="cc-hq-back" onClick={onClose}>
          ← Dashboard
        </button>
        <span className="cc-hq-edition">COMMANDER / FOUNDERS PILOT</span>
        <button
          className="cc-hq-text-button"
          onClick={() => void refresh()}
          disabled={unavailable}
        >
          Refresh
        </button>
      </header>
      <div
        className="cc-hq-hero"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(4,10,22,.96),rgba(4,10,22,.45)),url(${COMMANDER_VFX.arena})`,
        }}
      >
        <div className="cc-hq-hero-copy">
          <span className="cc-hq-eyebrow">
            {hq?.campaign.title ?? "Your command begins here"}
          </span>
          <h1 id="cc-hq-title">
            CURSED
            <br />
            <span>COMMANDER</span>
          </h1>
          <p>
            Build your army. Choose your edge.
            <br />
            Make every command count.
          </p>
          <div className="cc-hq-hero-actions">
            {p ? (
              <button
                className="cc-hq-primary"
                disabled={unavailable}
                onClick={() => setPractice("owned")}
              >
                Enter practice <span aria-hidden>↗</span>
              </button>
            ) : (
              <button
                className="cc-hq-primary"
                disabled={!hq || unavailable}
                onClick={() =>
                  void execute({
                    operation: "enroll",
                    target: null,
                    title: "Claim starter squad",
                    cost: 0,
                    detail: "",
                  })
                }
              >
                {busy ? "Preparing your squad…" : "Claim starter squad"}
              </button>
            )}
            <span>
              {p
                ? "Your equipped army · no battle costs"
                : `${format(hq?.campaign.rules["starterCoins"] ?? 150)} Commander Coins · 2 starter units`}
            </span>
          </div>
        </div>
        <div className="cc-hq-hero-unit" aria-hidden>
          <div />
          <img src={sprite("commander")} alt="" draggable={false} />
          <span>CIPHER / COMMANDER</span>
        </div>
      </div>
      {error && (
        <div className="cc-hq-message cc-hq-message--error" role="alert">
          <p>{error}</p>
          {retryPending ? (
            <button
              className="cc-hq-secondary"
              disabled={busy}
              onClick={() =>
                attempt.current && void execute(attempt.current.choice, true)
              }
            >
              Retry same action
            </button>
          ) : (
            <button
              className="cc-hq-secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Reload headquarters
            </button>
          )}
          <button
            className="cc-hq-text-button"
            disabled={busy || retryPending}
            onClick={() => setPractice("fixed")}
          >
            Open fixed-loadout practice
          </button>
        </div>
      )}
      {notice && (
        <p className="cc-hq-message" role="status">
          ✓ {notice}
        </p>
      )}
      {loading && !hq && (
        <div className="cc-hq-loading" role="status">
          <span />
          Loading your headquarters…
        </div>
      )}
      {hq && (
        <>
          <div className="cc-hq-metrics">
            <div>
              <span>COMMANDER COINS</span>
              <strong>
                {format(p?.coins ?? 0)} <small>◈</small>
              </strong>
              <p>Expedition balance</p>
            </div>
            <div>
              <span>COMMANDER LEVEL</span>
              <strong>
                {p?.level ?? 1}
                <small> / 100</small>
              </strong>
              <p>{format(p?.xp ?? 0)} XP</p>
            </div>
            <div>
              <span>DEPLOYED SQUAD</span>
              <strong>
                {p ? "02" : "—"}
                <small> / 02</small>
              </strong>
              <p>{p ? "Formation ready" : "Claim your starter squad"}</p>
            </div>
            <div>
              <span>COLLECTION</span>
              <strong>{String(hq.owned.length).padStart(2, "0")}</strong>
              <p>Units & equipment</p>
            </div>
          </div>
          <nav className="cc-hq-nav" aria-label="Commander sections">
            {tabs.map(([id, label, icon]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  setTab(id);
                  setChoice(null);
                }}
              >
                <span aria-hidden>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
          {choice && (
            <div
              className="cc-hq-confirm"
              role="region"
              aria-label="Confirm Commander action"
              tabIndex={-1}
              ref={confirmation}
            >
              <div>
                <span className="cc-hq-eyebrow">CONFIRM YOUR COMMAND</span>
                <h2>{choice.title}</h2>
                <p>{choice.detail}</p>
                {choice.cost > 0 && (
                  <strong>
                    {format(choice.cost)} Coins · Balance after:{" "}
                    {format((p?.coins ?? 0) - choice.cost)}
                  </strong>
                )}
              </div>
              <div className="cc-hq-confirm-actions">
                <button
                  className="cc-hq-primary"
                  disabled={unavailable}
                  onClick={() => void execute(choice)}
                >
                  {busy ? "Confirming…" : "Confirm"}
                </button>
                <button
                  className="cc-hq-secondary"
                  disabled={busy || retryPending}
                  onClick={() => setChoice(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="cc-hq-content" aria-busy={busy}>
            {tab === "overview" && (
              <>
                <div className="cc-hq-section-title">
                  <div>
                    <span className="cc-hq-eyebrow">DEPLOYMENT OVERVIEW</span>
                    <h2>Your field command</h2>
                  </div>
                  {p && (
                    <button
                      className="cc-hq-text-button"
                      onClick={() => setTab("army")}
                    >
                      Manage army ↗
                    </button>
                  )}
                </div>
                <div className="cc-hq-squad">
                  {[
                    {
                      slot: "guard",
                      name: find(p?.guard)?.name ?? "Neon Guard",
                      unit: loadout?.units[0],
                    },
                    {
                      slot: "commander",
                      name: "Cipher Commander",
                      unit: loadout
                        ? {
                            hp: loadout.hp,
                            shield: loadout.shield,
                            attack: loadout.bolt,
                          }
                        : null,
                    },
                    {
                      slot: "archer",
                      name: find(p?.archer)?.name ?? "Shade Archer",
                      unit: loadout?.units[1],
                    },
                  ].map(({ slot, name, unit }) => (
                    <article
                      className={`cc-hq-squad-card cc-hq-squad-card--${slot}`}
                      key={slot}
                    >
                      <span>
                        {slot === "commander"
                          ? "COMMANDER"
                          : slot === "guard"
                            ? "FRONTLINE"
                            : "RANGED"}
                      </span>
                      <img src={sprite(slot)} alt="" draggable={false} />
                      <h3>{name}</h3>
                      {unit ? (
                        <dl>
                          <div>
                            <dt>HP</dt>
                            <dd>{unit.hp}</dd>
                          </div>
                          <div>
                            <dt>SH</dt>
                            <dd>{unit.shield}</dd>
                          </div>
                          <div>
                            <dt>{slot === "commander" ? "BOLT" : "ATK"}</dt>
                            <dd>{unit.attack}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p>Starter squad</p>
                      )}
                    </article>
                  ))}
                </div>
                <div className="cc-hq-overview-bottom">
                  <article className="cc-hq-panel">
                    <span className="cc-hq-eyebrow">NEXT ACQUISITION</span>
                    <h2>{goal?.name ?? "Choose your next edge"}</h2>
                    {goal ? (
                      <>
                        <p>
                          {format(goal.price)} Coins · Your balance:{" "}
                          {format(p?.coins ?? 0)}
                        </p>
                        <strong className="cc-hq-goal-amount">
                          {p && p.coins >= goal.price
                            ? "Ready to acquire"
                            : `${format(commanderMissingCoins(goal.price, p?.coins ?? 0))} Coins needed`}
                        </strong>
                        <progress
                          max={goal.price}
                          value={Math.min(p?.coins ?? 0, goal.price)}
                          aria-label={`${goal.name} budget`}
                        />
                        <button
                          className="cc-hq-secondary"
                          onClick={() =>
                            setTab(goal.kind === "unit" ? "army" : "armory")
                          }
                        >
                          View goal ↗
                        </button>
                      </>
                    ) : (
                      <>
                        <p>
                          Pin a unit or equipment item to keep its price and
                          your remaining balance in view.
                        </p>
                        <button
                          className="cc-hq-secondary"
                          onClick={() => setTab("armory")}
                        >
                          Explore armory ↗
                        </button>
                      </>
                    )}
                  </article>
                  <article className="cc-hq-panel">
                    <span className="cc-hq-eyebrow">COMMANDER PROGRESSION</span>
                    <h2>Level {p?.level ?? 1}</h2>
                    <p>
                      {p?.level === 100
                        ? "Maximum Commander level reached."
                        : `${format(Math.max(0, commanderLevelXp((p?.level ?? 1) + 1) - (p?.xp ?? 0)))} XP to the next level`}
                    </p>
                    <progress
                      max={
                        p?.level === 100
                          ? 1
                          : commanderLevelXp((p?.level ?? 1) + 1) -
                            commanderLevelXp(p?.level ?? 1)
                      }
                      value={
                        p?.level === 100
                          ? 1
                          : (p?.xp ?? 0) - commanderLevelXp(p?.level ?? 1)
                      }
                      aria-label="Commander level progress"
                    />
                    <p>
                      Current training limit: rank {p?.rankCap ?? 5}. Your
                      account balance and academic records stay separate.
                    </p>
                    <button
                      className="cc-hq-secondary"
                      onClick={() => setTab("training")}
                    >
                      Open training ↗
                    </button>
                  </article>
                </div>
              </>
            )}
            {tab === "army" && (
              <>
                <div className="cc-hq-section-title">
                  <div>
                    <span className="cc-hq-eyebrow">THE BARRACKS</span>
                    <h2>Build a squad with a purpose</h2>
                    <p>
                      One frontline unit. One ranged unit. Recruit alternatives
                      and deploy the pair that fits your plan.
                    </p>
                  </div>
                </div>
                {catalogCards(hq.catalog.filter((i) => i.kind === "unit"))}
              </>
            )}
            {tab === "armory" && (
              <>
                <div className="cc-hq-section-title">
                  <div>
                    <span className="cc-hq-eyebrow">THE ARMORY</span>
                    <h2>Every advantage has a shape</h2>
                    <p>
                      One weapon and one shield. Purchases join your collection;
                      you choose what to equip.
                    </p>
                  </div>
                </div>
                {catalogCards(hq.catalog.filter((i) => i.kind !== "unit"))}
              </>
            )}
            {tab === "training" && (
              <>
                <div className="cc-hq-section-title">
                  <div>
                    <span className="cc-hq-eyebrow">COMMANDER TRAINING</span>
                    <h2>Commit to your strengths</h2>
                    <p>
                      Permanent for this expedition. Review each improvement
                      before spending Coins.
                    </p>
                  </div>
                </div>
                <div className="cc-hq-training">
                  {stats.map((stat) => {
                    const rank = commanderStatRank(hq, stat.id),
                      cost = commanderTrainingCost(rank, hq.campaign.rules),
                      capped = rank >= (p?.rankCap ?? 5);
                    return (
                      <article className="cc-hq-panel" key={stat.id}>
                        <div className="cc-hq-training-top">
                          <span aria-hidden>{stat.icon}</span>
                          <p>
                            RANK <strong>{rank}</strong>
                            <small> / {p?.rankCap ?? 5}</small>
                          </p>
                        </div>
                        <h3>{stat.name}</h3>
                        <p>{stat.detail}</p>
                        <progress
                          max={p?.rankCap ?? 5}
                          value={rank}
                          aria-label={`${stat.name} rank`}
                        />
                        <button
                          className="cc-hq-secondary"
                          disabled={
                            unavailable || !p || capped || p.coins < cost
                          }
                          onClick={() =>
                            propose({
                              operation: "train",
                              target: stat.id,
                              title: `Train ${stat.name} to rank ${rank + 1}?`,
                              cost,
                              detail: stat.detail,
                            })
                          }
                        >
                          {capped
                            ? "Training limit reached"
                            : p && p.coins < cost
                              ? costLabel(cost)
                              : `Train · ${format(cost)} Coins`}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
            {tab === "records" && (
              <>
                <div className="cc-hq-section-title">
                  <div>
                    <span className="cc-hq-eyebrow">EXPEDITION RECORDS</span>
                    <h2>Your recent commands</h2>
                    <p>Confirmed upgrades, deployments, and balance changes.</p>
                  </div>
                </div>
                <div className="cc-hq-history">
                  {!hq.history.length ? (
                    <p>Your story starts with your first squad.</p>
                  ) : (
                    hq.history.map((entry, index) => (
                      <article key={`${entry.created_at}-${index}`}>
                        <span className="cc-hq-history-icon" aria-hidden>
                          {entry.operation === "reward"
                            ? "◈"
                            : entry.operation === "equip"
                              ? "◇"
                              : "↗"}
                        </span>
                        <div>
                          <strong>
                            {(
                              {
                                enroll: "Expedition joined",
                                buy: "Added to collection",
                                equip: "Loadout changed",
                                train: "Training completed",
                                goal: "Goal updated",
                                reward: "Expedition reward",
                              } as Record<string, string>
                            )[entry.operation] ?? "Army updated"}
                          </strong>
                          <p>
                            {find(entry.payload.target)?.name ??
                              entry.payload.target ??
                              hq.campaign.title}{" "}
                            ·{" "}
                            {new Date(entry.created_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" },
                            )}
                          </p>
                        </div>
                        <span
                          className={
                            entry.coins_delta > 0 ? "cc-hq-positive" : ""
                          }
                        >
                          {entry.coins_delta !== 0
                            ? `${entry.coins_delta > 0 ? "+" : ""}${format(entry.coins_delta)} Coins`
                            : ""}
                          {entry.xp_delta > 0 && (
                            <small>+{format(entry.xp_delta)} XP</small>
                          )}
                        </span>
                      </article>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <footer className="cc-hq-footer">
            <span>FOUNDERS PILOT · Practice uses your equipped army.</span>
            <span>No ranked losses. No account reset.</span>
          </footer>
        </>
      )}
    </section>
  );
}
