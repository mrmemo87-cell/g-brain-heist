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
  commanderLevelXp,
  commanderMissingCoins,
  commanderStatRank,
  commanderTrainingCost,
} from "./commanderHeadquartersModel";
import { getCommanderRecruitIdentity } from "./commanderRecruitIdentity";
import { getCommanderSpriteUrl } from "./commanderSpriteAssets";
import { COMMANDER_VFX } from "./commanderVfxAssets";
import CommanderPracticeArena from "./CommanderPracticeArena";
import CommanderPvpLobby, { type CommanderPvpLaunch } from "./CommanderPvpLobby";
import CommanderPvpArena from "./CommanderPvpArena";
import CommanderUnitTrainingPanel from "./CommanderUnitTrainingPanel";
import CommanderFormationPanel from "./CommanderFormationPanel";
import CommanderCatalogCards from "./CommanderCatalogCards";
import CommanderElixirsPanel from "./CommanderElixirsPanel";
import "./commanderHeadquarters.css";
import "./commanderHeadquartersCommandCenter.css";

type Tab = "overview" | "army" | "armory" | "training" | "supplies" | "records";
type Choice = {
  operation: CommanderOperation;
  target: string | null;
  title: string;
  cost: number;
  detail: string;
};
type SquadSlot = "guard" | "commander" | "archer";

const tabs: Array<[Tab, string]> = [
  ["overview", "Headquarters"],
  ["army", "Army"],
  ["armory", "Armory"],
  ["training", "Training"],
  ["supplies", "Supplies"],
  ["records", "Records"],
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

const combatantId = (slot: SquadSlot | string) =>
  slot === "guard"
    ? "player_guard"
    : slot === "archer"
      ? "player_archer"
      : "player_commander";

const sprite = (slot: SquadSlot | string, catalogId?: string | null) =>
  getCommanderSpriteUrl(combatantId(slot), "standing", catalogId) ?? undefined;

const themeStyle = (accent: string, accent2: string, glow: string) =>
  ({
    "--cc-accent": accent,
    "--cc-accent-2": accent2,
    "--cc-card-glow": glow,
  }) as React.CSSProperties;

const TabIcon = ({ tab }: { tab: Tab }) => {
  if (tab === "overview") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="m12 3 8 8-8 8-8-8 8-8Z" />
        <path d="m12 8 3 3-3 3-3-3 3-3Z" />
      </svg>
    );
  }
  if (tab === "army") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M7 5h10l-1 4 2 3-2 7H8l-2-7 2-3-1-4Z" />
        <path d="M9 9h6M10 14h4" />
      </svg>
    );
  }
  if (tab === "armory") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="m12 3 7 4v5c0 4.4-2.8 7.4-7 9-4.2-1.6-7-4.6-7-9V7l7-4Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    );
  }
  if (tab === "training") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M5 18 18 5M11 5h7v7" />
        <path d="M5 12v6h6" />
      </svg>
    );
  }
  if (tab === "supplies") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M9 3h6M10 3v6l-5 8c-1 2 .4 4 2.8 4h8.4c2.4 0 3.8-2 2.8-4l-5-8V3" />
        <path d="M7.5 15h9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 6h12M6 12h12M6 18h12" />
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="11" cy="18" r="1" />
    </svg>
  );
};

export default function CommanderHeadquarters({
  userId,
  onClose,
  onBalanceChange,
}: {
  userId: string;
  onClose: () => void;
  onBalanceChange?: (userId: string, coins: number) => void;
}) {
  const [hq, setHq] = useState<Headquarters | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [practice, setPractice] = useState<"owned" | "fixed" | null>(null);
  const [pvpOpen, setPvpOpen] = useState(false);
  const [pvpLaunch, setPvpLaunch] = useState<CommanderPvpLaunch | null>(null);
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
            : action.choice.operation === "unit_train"
              ? "Unit training complete. The upgraded stats apply to new Practice and Player Battles."
              : action.choice.operation === "formation_train"
                ? "Formation doctrine advanced. Trusted combat stats are updated for future Practice and Player Battles."
                : action.choice.operation === "formation_set"
                  ? "Active formation updated. New battles will use this doctrine; existing Player Battles keep their frozen snapshots."
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

  const claimStarterSquad = () =>
    void execute({
      operation: "enroll",
      target: null,
      title: "Claim starter squad",
      cost: 0,
      detail: "",
    });

  const propose = (next: Choice) => {
    if (busy || retryPending) return;
    setChoice(next);
    setNotice("");
  };

  const p = hq?.profile;
  const loadout = hq?.loadout;
  const coins = hq?.wallet?.coins ?? p?.coins ?? 0;

  useEffect(() => {
    if (hq?.wallet) onBalanceChange?.(userId, hq.wallet.coins);
  }, [hq, userId, onBalanceChange]);

  const unavailable = busy || retryPending || loading;
  const find = (id: string | null | undefined) =>
    hq?.catalog.find((item) => item.id === id);
  const goal = find(p?.goal);
  const guardItem = find(p?.guard);
  const archerItem = find(p?.archer);
  const level = p?.level ?? 1;
  const levelFloor = commanderLevelXp(level);
  const levelCeiling = level >= 100 ? levelFloor + 1 : commanderLevelXp(level + 1);
  const levelProgress = level >= 100 ? 1 : Math.max(0, (p?.xp ?? 0) - levelFloor);
  const levelSpan = level >= 100 ? 1 : Math.max(1, levelCeiling - levelFloor);
  const deployed = p ? 3 : 0;
  const strikeOutput = loadout
    ? loadout.bolt + loadout.units.reduce((sum, unit) => sum + unit.attack, 0)
    : 0;
  const shieldReserve = loadout
    ? loadout.shield + loadout.units.reduce((sum, unit) => sum + unit.shield, 0)
    : 0;

  const costLabel = (price: number) =>
    price > coins
      ? `${format(commanderMissingCoins(price, coins))} Coins needed`
      : `${format(price)} Coins`;

  const selectTab = (next: Tab) => {
    setTab(next);
    setChoice(null);
  };

  const catalogCards = (items: CommanderCatalogItem[]) => (
    <CommanderCatalogCards
      items={items}
      hq={hq!}
      coins={coins}
      level={level}
      disabled={unavailable || !p}
      onPropose={(intent) => propose(intent)}
      onGoal={(itemId, selected) =>
        void execute({
          operation: "goal",
          target: selected ? null : itemId,
          title: selected ? "Unpin goal" : "Pin goal",
          cost: 0,
          detail: "",
        })
      }
    />
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

  if (pvpLaunch)
    return (
      <CommanderPvpArena
        launch={pvpLaunch}
        onClose={() => {
          setPvpLaunch(null);
          setPvpOpen(true);
          void refresh();
        }}
      />
    );

  if (pvpOpen)
    return (
      <CommanderPvpLobby
        onClose={() => {
          setPvpOpen(false);
          void refresh();
        }}
        onBattle={(launch) => setPvpLaunch(launch)}
      />
    );

  const guardIdentity = getCommanderRecruitIdentity(
    loadout?.units[0]?.catalogId ?? guardItem?.id,
    loadout?.units[0]?.school ?? guardItem?.school,
  );
  const archerIdentity = getCommanderRecruitIdentity(
    loadout?.units[1]?.catalogId ?? archerItem?.id,
    loadout?.units[1]?.school ?? archerItem?.school,
  );

  const squad = [
    {
      slot: "guard" as const,
      index: "01",
      role: "FRONTLINE",
      name: guardItem?.name ?? loadout?.units[0]?.name ?? "Neon Guard",
      unit: loadout?.units[0] ?? null,
      catalogId: loadout?.units[0]?.catalogId ?? guardItem?.id ?? "neon_guard",
      identity: guardIdentity,
      rarity: guardItem?.rarity ?? "common",
      school: loadout?.units[0]?.school ?? guardItem?.school ?? "neutral",
    },
    {
      slot: "commander" as const,
      index: "02",
      role: "COMMANDER",
      name: "Cipher Commander",
      unit: loadout
        ? { hp: loadout.hp, shield: loadout.shield, attack: loadout.bolt }
        : null,
      catalogId: null,
      identity: {
        school: "void",
        sigil: "◈",
        sigilUrl: null,
        codename: "Cipher Prime",
        doctrine: "Direct the formation. Break the enemy rhythm.",
        power: "Death Bolt",
        accent: "#c084fc",
        accent2: "#7c3aed",
        glow: "rgba(168,85,247,.42)",
      },
      rarity: "core",
      school: "command",
    },
    {
      slot: "archer" as const,
      index: "03",
      role: "RANGED",
      name: archerItem?.name ?? loadout?.units[1]?.name ?? "Shade Archer",
      unit: loadout?.units[1] ?? null,
      catalogId: loadout?.units[1]?.catalogId ?? archerItem?.id ?? "shade_archer",
      identity: archerIdentity,
      rarity: archerItem?.rarity ?? "common",
      school: loadout?.units[1]?.school ?? archerItem?.school ?? "neutral",
    },
  ];

  return (
    <section
      className="cc-hq cc-command-center"
      lang="en"
      dir="ltr"
      data-no-interface-translation="true"
      aria-labelledby="cc-hq-title"
    >
      <header className="cc-command-bar">
        <button className="cc-command-brand" onClick={onClose} aria-label="Return to dashboard">
          <span className="cc-command-brand-mark" aria-hidden>◇</span>
          <span>
            <strong>CURSED COMMANDER</strong>
            <small>Field operations</small>
          </span>
        </button>

        <nav className="cc-command-nav" aria-label="Commander sections">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => selectTab(id)}
            >
              <TabIcon tab={id} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="cc-command-status">
          <div className="cc-command-rank">
            <div className="cc-command-rank-avatar" aria-hidden>
              <img src={sprite("commander")} alt="" draggable={false} />
            </div>
            <div>
              <span>COMMANDER</span>
              <strong>Level {level}</strong>
              <progress max={levelSpan} value={Math.min(levelProgress, levelSpan)} aria-label="Commander level progress" />
            </div>
          </div>
          <div className="cc-command-resource" title="Brains Heist Coins">
            <span aria-hidden>◉</span>
            <strong>{format(coins)}</strong>
          </div>
          <div className="cc-command-resource" title="Owned Commander items">
            <span aria-hidden>◇</span>
            <strong>{hq ? hq.owned.length : 0}</strong>
          </div>
          <button className="cc-command-refresh" onClick={() => void refresh()} disabled={unavailable} aria-label="Refresh headquarters">
            ↻
          </button>
        </div>
      </header>

      {error && (
        <div className="cc-hq-message cc-hq-message--error" role="alert">
          <p>{error}</p>
          {retryPending ? (
            <button
              className="cc-hq-secondary"
              disabled={busy}
              onClick={() => attempt.current && void execute(attempt.current.choice, true)}
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
          {tab === "overview" && (
            <>
              <section
                className="cc-command-hero"
                style={{ backgroundImage: `url(${COMMANDER_VFX.headquarters})` }}
              >
                <div className="cc-command-hero-copy">
                  <span className="cc-hq-eyebrow">DEPLOYMENT OVERVIEW</span>
                  <h1 id="cc-hq-title">Your Field Command</h1>
                  <p>Lead the formation. Upgrade with intent. Make every deployment count.</p>

                  <div className="cc-command-metrics" aria-label="Deployment summary">
                    <div>
                      <span aria-hidden>♟</span>
                      <strong>{deployed} / 3</strong>
                      <small>Active force</small>
                    </div>
                    <div>
                      <span aria-hidden>⚔</span>
                      <strong>{strikeOutput || "—"}</strong>
                      <small>Strike output</small>
                    </div>
                    <div>
                      <span aria-hidden>⬡</span>
                      <strong>{shieldReserve || "—"}</strong>
                      <small>Shield reserve</small>
                    </div>
                    <div>
                      <span aria-hidden>✦</span>
                      <strong>Level {level}</strong>
                      <small>Command rank</small>
                    </div>
                  </div>
                </div>

                <div className="cc-command-hero-side">
                  <p className="cc-command-doctrine-quote">“A stronger army starts with a sharper command.”</p>
                  {p ? (
                    <>
                      <button className="cc-command-hero-action is-primary" onClick={() => setPvpOpen(true)}>
                        <span className="cc-command-action-icon" aria-hidden>⚔</span>
                        <span><strong>Player Battles</strong><small>Challenge another Commander army</small></span>
                        <b aria-hidden>→</b>
                      </button>
                      <button className="cc-command-hero-action" onClick={() => selectTab("army")}>
                        <span className="cc-command-action-icon" aria-hidden>♜</span>
                        <span><strong>Manage Army</strong><small>Recruit, train and deploy</small></span>
                        <b aria-hidden>→</b>
                      </button>
                      <button
                        className="cc-command-hero-action"
                        disabled={unavailable}
                        onClick={() => setPractice("owned")}
                      >
                        <span className="cc-command-action-icon" aria-hidden>◎</span>
                        <span><strong>Practice</strong><small>Test this formation without a recorded result</small></span>
                        <b aria-hidden>→</b>
                      </button>
                    </>
                  ) : (
                    <button
                      className="cc-command-hero-action is-primary"
                      disabled={unavailable}
                      onClick={claimStarterSquad}
                    >
                      <span className="cc-command-action-icon" aria-hidden>✦</span>
                      <span><strong>Claim Starter Squad</strong><small>Begin your Commander expedition</small></span>
                      <b aria-hidden>→</b>
                    </button>
                  )}
                </div>
              </section>

              <div className="cc-command-section-heading">
                <div>
                  <span className="cc-hq-eyebrow">ACTIVE FORMATION</span>
                  <h2>Your deployed squad</h2>
                  <p>Each role has a job. Read the doctrine, track the real combat stats, and deploy with purpose.</p>
                </div>
                <button className="cc-hq-text-button" onClick={() => selectTab("army")}>Full roster ↗</button>
              </div>

              <div className="cc-command-squad" aria-label="Current Commander formation">
                {squad.map(({ slot, index, role, name, unit, catalogId, identity, rarity, school }) => (
                  <article
                    className={`cc-command-squad-card cc-command-squad-card--${slot}`}
                    key={slot}
                    data-school={school}
                    style={themeStyle(identity.accent, identity.accent2, identity.glow)}
                  >
                    <div className="cc-command-card-topline">
                      <span className="cc-command-card-index">{index}</span>
                      <div className="cc-command-role">
                        {identity.sigilUrl ? (
                          <img src={identity.sigilUrl} alt="" draggable={false} />
                        ) : (
                          <span aria-hidden>{identity.sigil}</span>
                        )}
                        <div>
                          <strong>{role}</strong>
                          <small>{identity.codename}</small>
                        </div>
                      </div>
                      <span className="cc-command-rarity">{String(rarity).toUpperCase()}</span>
                    </div>

                    <div className="cc-command-unit-stage" aria-hidden>
                      <div className="cc-command-stage-grid" />
                      <div className="cc-command-stage-halo" />
                      <img
                        src={sprite(slot, catalogId)}
                        alt=""
                        draggable={false}
                        style={{ filter: `${identity.colorFilter ?? ""} drop-shadow(0 18px 22px rgba(0,0,0,.42))` }}
                      />
                    </div>

                    <div className="cc-command-unit-copy">
                      <h3>{name}</h3>
                      <p>{identity.doctrine}</p>
                    </div>

                    {unit ? (
                      <dl className="cc-command-unit-stats">
                        <div><dt>HP</dt><dd>{unit.hp}</dd></div>
                        <div><dt>SH</dt><dd>{unit.shield}</dd></div>
                        <div><dt>{slot === "commander" ? "BOLT" : "ATK"}</dt><dd>{unit.attack}</dd></div>
                      </dl>
                    ) : (
                      <div className="cc-command-unit-empty">Claim your starter squad to activate combat stats.</div>
                    )}

                    <div className="cc-command-power">
                      <span className="cc-command-power-icon" aria-hidden>{identity.sigil}</span>
                      <div>
                        <strong>{slot !== "commander" && unit && "unitRank" in unit && typeof unit.unitRank === "number" ? `Rank ${unit.unitRank} · ` : ""}{identity.power}</strong>
                        <small>{slot === "commander" ? "Commander ability" : `${String(school).toUpperCase()} doctrine`}</small>
                      </div>
                    </div>

                    <button
                      className="cc-command-card-action"
                      onClick={() => selectTab(slot === "commander" ? "training" : "army")}
                    >
                      {slot === "commander" ? "Open Training" : "View Development"} <span aria-hidden>→</span>
                    </button>
                  </article>
                ))}
              </div>

              <div className="cc-hq-overview-bottom cc-command-secondary-grid">
                <article className="cc-hq-panel cc-command-support-card">
                  <span className="cc-hq-eyebrow">NEXT ACQUISITION</span>
                  <h2>{goal?.name ?? "Choose your next edge"}</h2>
                  {goal ? (
                    <>
                      <p>{format(goal.price)} Coins · Your balance: {format(coins)}</p>
                      <strong className="cc-hq-goal-amount">
                        {p && coins >= goal.price
                          ? "Ready to acquire"
                          : `${format(commanderMissingCoins(goal.price, coins))} Coins needed`}
                      </strong>
                      <progress max={goal.price} value={Math.min(coins, goal.price)} aria-label={`${goal.name} budget`} />
                      <button className="cc-hq-secondary" onClick={() => selectTab(goal.kind === "unit" ? "army" : "armory")}>
                        View goal ↗
                      </button>
                    </>
                  ) : (
                    <>
                      <p>Pin a unit or equipment item to keep its price and your remaining balance in view.</p>
                      <button className="cc-hq-secondary" onClick={() => selectTab("armory")}>Explore armory ↗</button>
                    </>
                  )}
                </article>

                <article className="cc-hq-panel cc-command-support-card">
                  <span className="cc-hq-eyebrow">COMMANDER PROGRESSION</span>
                  <h2>Level {level}</h2>
                  <p>
                    {level === 100
                      ? "Maximum Commander level reached."
                      : `${format(Math.max(0, commanderLevelXp(level + 1) - (p?.xp ?? 0)))} XP to the next level`}
                  </p>
                  <progress max={levelSpan} value={Math.min(levelProgress, levelSpan)} aria-label="Commander level progress" />
                  <p>
                    Commander training limit: rank {p?.rankCap ?? 5} · {level >= (hq.campaign.rules["unitTrainingUnlockLevel"] ?? 11)
                      ? `Unit training cap: rank ${p?.unitRankCap ?? 1}`
                      : `Unit Training unlocks at Level ${hq.campaign.rules["unitTrainingUnlockLevel"] ?? 11}`}
                  </p>
                  <button className="cc-hq-secondary" onClick={() => selectTab(level >= (hq.campaign.rules["unitTrainingUnlockLevel"] ?? 11) ? "army" : "training")}>
                    {level >= (hq.campaign.rules["formationUnlockLevel"] ?? 41)
                      ? "Open Formation Command ↗"
                      : level >= (hq.campaign.rules["unitTrainingUnlockLevel"] ?? 11)
                        ? "Open unit development ↗"
                        : "Open training ↗"}
                  </button>
                </article>
              </div>
            </>
          )}

          {tab !== "overview" && (
            <>
              <div className="cc-command-subpage-banner">
                <button className="cc-command-back-overview" onClick={() => selectTab("overview")}>← Headquarters</button>
                <span>{hq.campaign.title}</span>
                <span>{tab === "supplies" ? "Gemstones only" : `${format(coins)} Coins`}</span>
              </div>

              {choice && (
                <div className="cc-hq-confirm" role="region" aria-label="Confirm Commander action" tabIndex={-1} ref={confirmation}>
                  <div>
                    <span className="cc-hq-eyebrow">CONFIRM YOUR COMMAND</span>
                    <h2>{choice.title}</h2>
                    <p>{choice.detail}</p>
                    {choice.cost > 0 && (
                      <strong>{format(choice.cost)} Coins · Balance after: {format(coins - choice.cost)}</strong>
                    )}
                  </div>
                  <div className="cc-hq-confirm-actions">
                    <button className="cc-hq-primary" disabled={unavailable} onClick={() => void execute(choice)}>
                      {busy ? "Confirming…" : "Confirm"}
                    </button>
                    <button className="cc-hq-secondary" disabled={busy || retryPending} onClick={() => setChoice(null)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="cc-hq-content" aria-busy={busy}>
                {tab === "army" && (
                  <>
                    <div className="cc-hq-section-title">
                      <div>
                        <span className="cc-hq-eyebrow">THE BARRACKS</span>
                        <h2>Build a squad with a purpose</h2>
                        <p>One frontline unit. One ranged unit. Recruit alternatives, develop the soldiers you own, and deploy the pair that fits your plan.</p>
                      </div>
                    </div>
                    {catalogCards(hq.catalog.filter((item) => item.kind === "unit"))}
                    <CommanderUnitTrainingPanel
                      hq={hq}
                      coins={coins}
                      disabled={unavailable}
                      onTrain={(item, cost) =>
                        propose({
                          operation: "unit_train",
                          target: item.id,
                          title: `Train ${item.name}?`,
                          cost,
                          detail: "Permanent unit development for this expedition. The trained stats are server-calculated and will apply to future Practice and Player Battles.",
                        })
                      }
                    />
                    <CommanderFormationPanel
                      hq={hq}
                      coins={coins}
                      disabled={unavailable}
                      onAdvance={(formation, cost) =>
                        propose({
                          operation: "formation_train",
                          target: formation.id,
                          title: `Advance ${formation.name} doctrine?`,
                          cost,
                          detail: "Permanent Formation Command progression. The server calculates the exact strengths and trade-offs from the formation ID and doctrine rank; future Practice and Player Battles receive only the trusted composed loadout.",
                        })
                      }
                      onActivate={(formation) =>
                        propose({
                          operation: "formation_set",
                          target: formation.id,
                          title: `Activate ${formation.name}?`,
                          cost: 0,
                          detail: "Sets this doctrine for future Practice and Player Battles. Any Player Battle already in progress keeps the trusted loadout snapshot captured when that battle started.",
                        })
                      }
                    />
                  </>
                )}

                {tab === "armory" && (
                  <>
                    <div className="cc-hq-section-title">
                      <div>
                        <span className="cc-hq-eyebrow">THE ARMORY</span>
                        <h2>Every advantage has a shape</h2>
                        <p>One weapon and one shield. Purchases join your collection; you choose what to equip.</p>
                      </div>
                    </div>
                    {catalogCards(hq.catalog.filter((item) => item.kind !== "unit"))}
                  </>
                )}

                {tab === "training" && (
                  <>
                    <div className="cc-hq-section-title">
                      <div>
                        <span className="cc-hq-eyebrow">COMMANDER TRAINING</span>
                        <h2>Commit to your strengths</h2>
                        <p>Permanent for this expedition. Training uses your Brains Heist Coins.</p>
                      </div>
                    </div>
                    <p role="status">Available: {format(coins)} Brains Heist Coins.</p>
                    {!p && <p>Claim your free starter squad below to unlock all four training paths. Claiming costs 0 Coins.</p>}
                    <div className="cc-hq-training">
                      {stats.map((stat) => {
                        const rank = commanderStatRank(hq, stat.id);
                        const cost = commanderTrainingCost(rank, hq.campaign.rules);
                        const capped = rank >= (p?.rankCap ?? 5);
                        return (
                          <article className="cc-hq-panel" key={stat.id}>
                            <div className="cc-hq-training-top">
                              <span aria-hidden>{stat.icon}</span>
                              <p>RANK <strong>{rank}</strong><small> / {p?.rankCap ?? 5}</small></p>
                            </div>
                            <h3>{stat.name}</h3>
                            <p>{stat.detail}</p>
                            <progress max={p?.rankCap ?? 5} value={rank} aria-label={`${stat.name} rank`} />
                            <button
                              className="cc-hq-secondary"
                              disabled={unavailable || (!!p && (capped || coins < cost))}
                              onClick={() =>
                                !p
                                  ? claimStarterSquad()
                                  : propose({
                                      operation: "train",
                                      target: stat.id,
                                      title: `Train ${stat.name} to rank ${rank + 1}?`,
                                      cost,
                                      detail: stat.detail,
                                    })
                              }
                            >
                              {!p
                                ? busy
                                  ? "Preparing your squad…"
                                  : retryPending
                                    ? "Resolve pending action above"
                                    : "Claim starter squad · Free"
                                : unavailable
                                  ? retryPending
                                    ? "Resolve pending action above"
                                    : "Updating…"
                                  : capped
                                    ? "Training limit reached"
                                    : coins < cost
                                      ? costLabel(cost)
                                      : `Train · ${format(cost)} Coins`}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}

                {tab === "supplies" && (
                  <CommanderElixirsPanel disabled={unavailable || !p} />
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
                              {entry.operation === "reward" ? "◈" : entry.operation === "equip" ? "◇" : "↗"}
                            </span>
                            <div>
                              <strong>
                                {(
                                  {
                                    enroll: "Expedition joined",
                                    buy: "Added to collection",
                                    equip: "Loadout changed",
                                    train: "Commander training completed",
                                    unit_train: "Unit training completed",
                                    formation_train: "Formation doctrine advanced",
                                    formation_set: "Active formation changed",
                                    goal: "Goal updated",
                                    reward: "Expedition reward",
                                  } as Record<string, string>
                                )[entry.operation] ?? "Army updated"}
                              </strong>
                              <p>
                                {find(entry.payload.target)?.name ?? entry.payload.target ?? hq.campaign.title} ·{" "}
                                {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </p>
                            </div>
                            <span className={entry.coins_delta > 0 ? "cc-hq-positive" : ""}>
                              {entry.coins_delta !== 0
                                ? `${entry.coins_delta > 0 ? "+" : ""}${format(entry.coins_delta)} Coins`
                                : ""}
                              {entry.xp_delta > 0 && <small>+{format(entry.xp_delta)} XP</small>}
                            </span>
                          </article>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <footer className="cc-hq-footer cc-command-footer">
            <span>DISCIPLINE BUILDS LEGENDS.</span>
            <span>Practice is safe · Player Battles record the result · Unit development, Formation Command, and Elixirs are server-authoritative · No Commander PvP Coin or account XP transfer.</span>
          </footer>
        </>
      )}
    </section>
  );
}
