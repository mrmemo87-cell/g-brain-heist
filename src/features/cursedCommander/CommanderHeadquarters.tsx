import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  commanderHeadquartersError,
  getCommanderHeadquarters,
  claimCommanderDailyCheckin,
  sendCommanderCommand,
  type CommanderCatalogItem,
  type CommanderHeadquarters as Headquarters,
  type CommanderOperation,
  type CommanderStat,
} from "../../../services/commanderHeadquartersService";
import {
  commanderLevelXp,
  commanderMissingCoins,
  commanderNextUnlock,
  commanderTodayXp,
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
import CommanderHelpGuide from "../../../components/CommanderHelpGuide";
import CommanderCelebration, { type CommanderCelebrationData } from "./CommanderCelebration";
import {
  commanderUiSoundEnabled,
  onCommanderUiSoundChange,
  playCommanderUi,
  setCommanderUiSound,
} from "./commanderUiSound";
import "./commanderJuice.css";
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [celebration, setCelebration] = useState<CommanderCelebrationData | null>(null);
  const [xpFloat, setXpFloat] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(commanderUiSoundEnabled);
  const lastLevel = useRef<number | null>(null);
  useEffect(() => onCommanderUiSoundChange(setSoundOn), []);
  useEffect(() => {
    if (!xpFloat) return undefined;
    const timer = window.setTimeout(() => setXpFloat(null), 1800);
    return () => window.clearTimeout(timer);
  }, [xpFloat]);
  const closeCelebration = useCallback(() => setCelebration(null), []);
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
  const checkedIn = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current || attempt.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    try {
      // Daily login XP is claimed before the HQ read so the snapshot already includes it.
      // It is best-effort: an un-enrolled player or a network blip must not block the HQ.
      if (!checkedIn.current) {
        try {
          const checkin = await claimCommanderDailyCheckin(controller.signal);
          checkedIn.current = true;
          if (alive.current && checkin.awarded && checkin.xp > 0) {
            playCommanderUi("xp");
            setXpFloat(`+${checkin.xp} XP`);
          }
          if (alive.current && checkin.awarded && checkin.xp > 0)
            setNotice(
              checkin.streak > 1
                ? `Day ${checkin.streak} login streak: +${checkin.xp} Commander XP.`
                : `Daily login: +${checkin.xp} Commander XP. Come back tomorrow to start a streak.`,
            );
        } catch {
          // Not enrolled yet, or offline: try again on the next refresh (the claim is idempotent).
        }
      }
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
      celebrateCommand(action.choice, next);
      setNotice(
        action.choice.operation === "buy"
          ? "Added to your army. Tap \"Equip\" to use it in battle."
          : action.choice.operation === "equip"
            ? "Team updated. Your next battle uses it."
            : action.choice.operation === "unit_train"
              ? "Training done! This fighter is stronger in your next battles."
              : action.choice.operation === "formation_train"
                ? "Team style is stronger now."
                : action.choice.operation === "formation_set"
                  ? "Team style changed. Your next battles use it."
                  : action.choice.operation === "train"
                    ? "Training done! Your Commander is stronger."
                    : action.choice.operation === "enroll"
                      ? "Your free team is ready. Try a Practice battle!"
                      : action.choice.target
                        ? "Goal saved. We show it on the Headquarters page."
                        : "Goal removed.",
      );
    } catch (cause) {
      if (!alive.current) return;
      const definite = Boolean(
        cause &&
          typeof cause === "object" &&
          "code" in cause &&
          ["P0001", "42501", "23505"].includes(String(cause.code)),
      );
      playCommanderUi("error");
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

  /** Sound and celebration for a confirmed command. Level-ups are handled by the effect below. */
  const celebrateCommand = (choice: Choice, next: Headquarters) => {
    const op = choice.operation;
    if (op === "enroll") {
      playCommanderUi("fanfare");
      setCelebration({ tone: "cyan", icon: "🎉", title: "Your team is ready!", subtitle: "Try a Practice battle to learn the moves." });
    } else if (op === "buy") {
      playCommanderUi("coin");
      const item = next.catalog.find((entry) => entry.id === choice.target);
      if (item) {
        const tone = item.rarity === "legendary" ? "gold" : item.rarity === "epic" ? "violet" : item.rarity === "rare" ? "cyan" : "emerald";
        setCelebration({
          tone,
          icon: item.kind === "weapon" ? "⚔️" : "🛡️",
          art: item.kind === "unit" ? sprite(item.slot as SquadSlot, item.id) : undefined,
          title: item.kind === "unit" ? "New fighter!" : "New gear!",
          subtitle: `${item.name} joined your army. Tap "Equip" to use it.`,
        });
      }
    } else if (op === "equip") playCommanderUi("equip");
    else if (op === "train" || op === "unit_train" || op === "formation_train") playCommanderUi("train");
    else playCommanderUi("tap");
  };

  // Any level increase (training, a battle win, the daily login) gets a level-up celebration.
  const currentLevel = hq?.profile ? hq.profile.level : null;
  useEffect(() => {
    if (currentLevel === null) return;
    const previous = lastLevel.current;
    lastLevel.current = currentLevel;
    if (previous !== null && currentLevel > previous) {
      playCommanderUi("levelUp");
      const unlock = hq ? commanderNextUnlock(currentLevel - 1, hq.campaign.rules) : null;
      setCelebration({
        tone: "gold",
        icon: "⭐",
        title: `Level ${currentLevel}!`,
        subtitle: unlock && unlock.level === currentLevel
          ? `New: ${unlock.label}`
          : "You can train your Commander a little higher now.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel]);

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
    playCommanderUi("tap");
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
  const today = commanderTodayXp(hq?.history ?? []);
  const rule = (key: string, fallback: number) => Number(hq?.campaign.rules[key] ?? fallback);
  const pvpDailyLimit = rule("pvpVictoryDailyLimit", 5);
  const nextUnlock = hq ? commanderNextUnlock(level, hq.campaign.rules) : null;
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

        <div className="cc-command-topbar-row">
          <button className="cc-command-mobile-back" onClick={onClose}>← Dashboard</button>
          <button
            className="cc-command-sound-toggle"
            onClick={() => { setCommanderUiSound(!soundOn); if (!soundOn) playCommanderUi("tap"); }}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
            title={soundOn ? "Sound on" : "Sound off"}
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
        </div>

        <nav className="cc-command-nav" aria-label="Commander sections">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => { playCommanderUi("tab"); selectTab(id); }}
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

      {celebration && <CommanderCelebration data={celebration} onDone={closeCelebration} />}
      {xpFloat && <div className="cc-xp-float" aria-hidden>{xpFloat}</div>}

      {helpOpen && (
        <div className="cc-command-help-overlay" role="dialog" aria-modal="true" aria-label="How to play Cursed Commander" onClick={() => setHelpOpen(false)}>
          <div className="cc-command-help-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="cc-command-help-close" onClick={() => setHelpOpen(false)} aria-label="Close how to play">✕</button>
            <CommanderHelpGuide />
          </div>
        </div>
      )}

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
                  <div className="cc-command-hero-topline">
                    <span className="cc-hq-eyebrow">CURSED COMMANDER</span>
                    <button className="cc-command-help-button" onClick={() => setHelpOpen(true)}>❓ How to play</button>
                  </div>
                  <h1 id="cc-hq-title">{p ? "Your army" : "Welcome, Commander"}</h1>
                  <p>
                    {p
                      ? "Win battles to earn XP. Level up to unlock stronger units."
                      : "Get a free team of three fighters. Then win battles to earn XP and level up."}
                  </p>

                  {p && (
                    <div className="cc-command-level-card" aria-label="Your level">
                      <div>
                        <strong>Level {level}</strong>
                        <span>
                          {level >= 100
                            ? "Highest level reached!"
                            : `${format(Math.max(0, commanderLevelXp(level + 1) - (p.xp ?? 0)))} XP to Level ${level + 1}`}
                        </span>
                      </div>
                      <progress max={levelSpan} value={Math.min(levelProgress, levelSpan)} aria-label="XP progress to the next level" />
                      {nextUnlock && (
                        <small>🔓 Level {nextUnlock.level}: {nextUnlock.label}</small>
                      )}
                    </div>
                  )}

                  <div className="cc-command-metrics" aria-label="Army summary">
                    <div>
                      <span aria-hidden>♟</span>
                      <strong>{deployed} / 3</strong>
                      <small>Fighters</small>
                    </div>
                    <div>
                      <span aria-hidden>⚔</span>
                      <strong>{strikeOutput || "—"}</strong>
                      <small>Attack</small>
                    </div>
                    <div>
                      <span aria-hidden>⬡</span>
                      <strong>{shieldReserve || "—"}</strong>
                      <small>Shield</small>
                    </div>
                    <div>
                      <span aria-hidden>◉</span>
                      <strong>{format(coins)}</strong>
                      <small>Coins</small>
                    </div>
                  </div>
                </div>

                <div className="cc-command-hero-side">
                  {p ? (
                    <>
                      <div className="cc-command-today" aria-label="Earn XP today">
                        <strong>Earn XP today</strong>
                        <ul>
                          <li data-done={today.login || undefined}>
                            <span aria-hidden>{today.login ? "✓" : "○"}</span>
                            Open Headquarters{today.streak > 1 ? ` (day ${today.streak} streak)` : ""}
                            <b>+{rule("dailyLoginXp", 100)}{today.streak > 1 ? "+" : ""} XP</b>
                          </li>
                          <li data-done={today.practiceWin || undefined}>
                            <span aria-hidden>{today.practiceWin ? "✓" : "○"}</span>
                            Win 1 Practice battle
                            <b>+{rule("practiceVictoryXp", 40)} XP</b>
                          </li>
                          <li data-done={today.pvpWins >= pvpDailyLimit || undefined}>
                            <span aria-hidden>{today.pvpWins >= pvpDailyLimit ? "✓" : "○"}</span>
                            Win Player Battles ({today.pvpWins}/{pvpDailyLimit})
                            <b>+{rule("pvpVictoryXp", 60)} XP each</b>
                          </li>
                        </ul>
                      </div>
                      <button
                        className="cc-command-hero-action is-primary"
                        disabled={unavailable}
                        onClick={() => setPractice("owned")}
                      >
                        <span className="cc-command-action-icon" aria-hidden>◎</span>
                        <span>
                          <strong>Practice battle</strong>
                          <small>
                            {today.practiceWin
                              ? "Free. Try new moves against the computer."
                              : `Free. Win once today for +${rule("practiceVictoryXp", 40)} XP.`}
                          </small>
                        </span>
                        <b aria-hidden>→</b>
                      </button>
                      <button className="cc-command-hero-action" onClick={() => setPvpOpen(true)}>
                        <span className="cc-command-action-icon" aria-hidden>⚔</span>
                        <span>
                          <strong>Player Battles</strong>
                          <small>Fight another student's army. Win for +{rule("pvpVictoryXp", 60)} XP.</small>
                        </span>
                        <b aria-hidden>→</b>
                      </button>
                      <button className="cc-command-hero-action" onClick={() => selectTab("army")}>
                        <span className="cc-command-action-icon" aria-hidden>♜</span>
                        <span><strong>My army</strong><small>Get new fighters and make them stronger</small></span>
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
                      <span><strong>Get your free team</strong><small>3 fighters, ready to battle. Costs nothing.</small></span>
                      <b aria-hidden>→</b>
                    </button>
                  )}
                </div>
              </section>

              <div className="cc-command-section-heading">
                <div>
                  <span className="cc-hq-eyebrow">YOUR TEAM</span>
                  <h2>Your three fighters</h2>
                  <p>Your Commander fights in the middle. The frontline fighter protects, the ranged fighter attacks from the back.</p>
                </div>
                <button className="cc-hq-text-button" onClick={() => selectTab("army")}>All fighters ↗</button>
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
                  <span className="cc-hq-eyebrow">SAVING UP</span>
                  <h2>{goal?.name ?? "Save for a new fighter"}</h2>
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
                      <p>Pick a fighter or item you want. We will show how many Coins you still need.</p>
                      <button className="cc-hq-secondary" onClick={() => selectTab("army")}>Browse fighters ↗</button>
                    </>
                  )}
                </article>

                <article className="cc-hq-panel cc-command-support-card">
                  <span className="cc-hq-eyebrow">LEVEL UP TO UNLOCK</span>
                  <h2>What you unlock</h2>
                  <ul className="cc-command-roadmap">
                    {[
                      { at: 1, label: "Train your Commander's stats (higher level = higher limit)", tab: "training" as Tab },
                      { at: rule("unitTrainingUnlockLevel", 11), label: "Unit Training", tab: "army" as Tab },
                      { at: rule("unitEvolutionUnlockLevel", 21), label: "Evolution", tab: "army" as Tab },
                      { at: rule("schoolMasteryUnlockLevel", 31), label: "Mastery", tab: "army" as Tab },
                      { at: rule("formationUnlockLevel", 41), label: "Formations", tab: "army" as Tab },
                    ].map((step) => (
                      <li key={step.label} data-open={level >= step.at || undefined}>
                        <span aria-hidden>{level >= step.at ? "✓" : "🔒"}</span>
                        <span>{step.at > 1 ? `Level ${step.at}: ` : ""}{step.label}</span>
                        {level >= step.at && (
                          <button className="cc-hq-text-button" onClick={() => selectTab(step.tab)}>Open ↗</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </>
          )}

          {tab !== "overview" && (
            <>
              <div className="cc-command-subpage-banner">
                <button className="cc-command-back-overview" onClick={() => selectTab("overview")}>← Headquarters</button>
                <span>{tabs.find(([id]) => id === tab)?.[1]}</span>
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
                        <span className="cc-hq-eyebrow">YOUR FIGHTERS</span>
                        <h2>Choose your team</h2>
                        <p>Your team has one frontline fighter (protects) and one ranged fighter (attacks from the back). Buy new fighters with Coins, then tap "Equip" to put them in your team.</p>
                      </div>
                    </div>
                    {catalogCards(hq.catalog.filter((item) => item.kind === "unit"))}
                    {level >= rule("unitTrainingUnlockLevel", 11) - 2 ? (
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
                            detail: "This makes the fighter stronger forever. You pay the Coins once.",
                          })
                        }
                      />
                    ) : null}
                    {level >= rule("formationUnlockLevel", 41) - 3 ? (
                      <CommanderFormationPanel
                        hq={hq}
                        coins={coins}
                        disabled={unavailable}
                        onAdvance={(formation, cost) =>
                          propose({
                            operation: "formation_train",
                            target: formation.id,
                            title: `Make ${formation.name} stronger?`,
                            cost,
                            detail: "This team style becomes stronger forever. You pay the Coins once.",
                          })
                        }
                        onActivate={(formation) =>
                          propose({
                            operation: "formation_set",
                            target: formation.id,
                            title: `Use ${formation.name} in battles?`,
                            cost: 0,
                            detail: "Your next battles will use this team style. A battle you already started does not change.",
                          })
                        }
                      />
                    ) : null}
                    {level < rule("formationUnlockLevel", 41) - 3 && (
                      <section className="cc-hq-panel cc-command-support-card cc-command-coming-later" aria-label="Unlocks later">
                        <span className="cc-hq-eyebrow">COMING LATER</span>
                        <h2>Level up to unlock more</h2>
                        <ul className="cc-command-roadmap">
                          {[
                            { at: rule("unitTrainingUnlockLevel", 11), label: "Unit Training: make each fighter stronger" },
                            { at: rule("unitEvolutionUnlockLevel", 21), label: "Evolution: upgrade a fully trained fighter" },
                            { at: rule("schoolMasteryUnlockLevel", 31), label: "Mastery: power up your magic types" },
                            { at: rule("formationUnlockLevel", 41), label: "Formations: choose a team battle style" },
                          ].filter((step) => level < step.at).map((step) => (
                            <li key={step.label}>
                              <span aria-hidden>🔒</span>
                              <span>Level {step.at}: {step.label}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
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
                        <span className="cc-hq-eyebrow">TRAIN YOUR COMMANDER</span>
                        <h2>Make your Commander stronger</h2>
                        <p>Training costs Coins and lasts forever. Each new level lets you train a little higher.</p>
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
            <span>PLAY FAIR, LEVEL UP.</span>
            <span>Battles never cost Coins. You spend Coins only when you buy or train. Commander XP is separate from your normal Brains Heist XP.</span>
          </footer>
        </>
      )}
    </section>
  );
}
