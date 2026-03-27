import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  EntryRoute,
  GamePhase,
  GameState,
  QuestionRiskRoute,
  PlayerState,
  ChooseEntryRouteAction,
  ChooseRiskRouteAction,
  SubmitAnswerAction,
} from "./lockdownTypes";
import { LockdownTransport, RoomId, PlayerId, createRoomClient, LockdownRoomClient } from "../../lib/lockdownTransport";
import { LockdownMap } from "./LockdownMap";
import { calculateRegionStats, REGION_NAMES } from "./regionCalculator";
import DotLottieAnimation from "../../../components/DotLottieAnimation";
import { audioService } from "../../../services/audioService";

const entryRouteLabels: Record<EntryRoute, string> = {
  [EntryRoute.SAFE]: "Safe Access",
  [EntryRoute.STEALTH]: "Stealth Lanes",
  [EntryRoute.FORCE]: "Force Entry",
};

const riskRouteMeta: Record<QuestionRiskRoute, { label: string; reward: string; heat: string }> = {
  [QuestionRiskRoute.SAFE]: { label: "Safe", reward: "1x reward", heat: "+2 heat" },
  [QuestionRiskRoute.RISKY]: { label: "Risky", reward: "1.5x reward", heat: "+5 heat" },
  [QuestionRiskRoute.ALL_IN]: { label: "All-In", reward: "2x reward", heat: "+9 heat" },
};

interface LockdownStudentViewProps {
  transport: LockdownTransport;
  roomId: RoomId;
  playerId: PlayerId;
  onExit: () => void;
}

export const LockdownStudentView: React.FC<LockdownStudentViewProps> = ({
  transport,
  roomId,
  playerId,
  onExit,
}) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [client, setClient] = useState<LockdownRoomClient | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<{q: string, a: number} | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"combat" | "map" | "intel">("combat");
  const [focusedZone, setFocusedZone] = useState<string | null>(null);
  const [localRemainingMs, setLocalRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const c = createRoomClient(transport, roomId, playerId);
    setClient(c);
    const unsubscribe = transport.onGameState(roomId, setGameState);
    return () => unsubscribe();
  }, [transport, roomId, playerId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") {
      return;
    }
    const media = window.matchMedia("(max-width: 768px)");
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const myPlayer = useMemo(() => gameState?.players[playerId], [gameState, playerId]);

  const generateQuestion = () => {
    const a = Math.floor(Math.random() * 12) + 2;
    const b = Math.floor(Math.random() * 12) + 2;
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    
    let q = "";
    let ans = 0;
    
    if (op === '+') { q = `${a} + ${b}`; ans = a + b; }
    else if (op === '-') { q = `${a + b} - ${b}`; ans = a; } // Ensure positive result
    else { q = `${a} × ${b}`; ans = a * b; }
    
    setCurrentQuestion({ q, a: ans });
    setAnswerInput("");
  };

  useEffect(() => {
    if (!currentQuestion) generateQuestion();
  }, [currentQuestion]);

  const handleSubmitAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion || !client) return;
    
    const val = parseInt(answerInput);
    const correct = val === currentQuestion.a;
    
    // Simplified: Always use RISKY route for standard play
    client.act({ type: "SUBMIT_ANSWER", correct, route: QuestionRiskRoute.RISKY } as Omit<SubmitAnswerAction, "playerId">);
    generateQuestion();
  };

  if (!gameState || !client) {
    return <div className="p-8 text-center text-slate-400">Connecting to heist network...</div>;
  }

  if (!myPlayer) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
            <div className="space-y-4">
                <div className="text-4xl">🚫</div>
                <h2 className="text-xl font-bold text-white">Connection Terminated</h2>
                <p className="text-slate-400">You have been removed from the operation.</p>
                <button onClick={onExit} className="px-6 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700">
                    Return to Base
                </button>
            </div>
        </div>
    );
  }

  const isLobby = gameState.phase === GamePhase.LOBBY;
  const isActive = gameState.phase === GamePhase.ACTIVE_ROUNDS;
  const isFinished = gameState.phase === GamePhase.FINISHED;
  const isPaused = gameState.phase === GamePhase.PAUSED;

  useEffect(() => {
    if (!gameState || typeof window === "undefined") {
      setLocalRemainingMs(null);
      return;
    }

    if (gameState.phase !== GamePhase.ACTIVE_ROUNDS) {
      setLocalRemainingMs(null);
      return;
    }

    const raf = window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 16) as number);
    const cancelRaf = window.cancelAnimationFrame ?? ((id: number) => window.clearTimeout(id));

    let animationFrameId: number;
    const baseMs = gameState.remainingTimeMs;
    let startTimestamp = typeof performance !== "undefined" ? performance.now() : Date.now();

    setLocalRemainingMs(baseMs);

    const tick = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = now - startTimestamp;
      const nextValue = Math.max(0, baseMs - elapsed);
      setLocalRemainingMs(nextValue);
      if (nextValue > 0) {
        animationFrameId = raf(tick);
      }
    };

    animationFrameId = raf(tick);

    return () => {
      if (animationFrameId) {
        cancelRaf(animationFrameId);
      }
    };
  }, [gameState?.phase, gameState?.remainingTimeMs]);

  const roomCode = roomId.replace("room-", "");
  const heatPercent = Math.min(100, Math.max(0, myPlayer.heat));
  const alarmValue = Math.max(0, gameState.alarm);
  const alarmThreshold = Math.max(1, gameState.roomSettings.alarmMax);
  const alarmGauge = Math.min(100, (alarmValue / alarmThreshold) * 100);
  const formattedPhase = gameState.phase.toString().replace(/_/g, " ");
  const countdownMs = localRemainingMs ?? gameState.remainingTimeMs;
  const durationMs = Math.max(1, gameState.roomSettings.durationMs);
  const remainingSeconds = Math.max(0, Math.round(countdownMs / 1000));
  const totalDurationSeconds = Math.max(1, Math.round(durationMs / 1000));
  const timePercent = Math.min(100, (countdownMs / durationMs) * 100);
  const coinGoal = Math.max(1, gameState.roomSettings.coinGoal);
  const coinProgress = Math.min(100, (myPlayer.coins / coinGoal) * 100);
// --- Territory / Region Stats (merged conflict) ---

// If backend has regionStats → use it. Otherwise generate neutral regions 1–8.
const neutralRegionStats = useMemo(
  () =>
    [1, 2, 3, 4, 5, 6, 7, 8].reduce<Record<string, { regionId: string; clanStats: never[] }>>(
      (acc, num) => {
        acc[`region_${num}`] = { regionId: `region_${num}`, clanStats: [] };
        return acc;
      },
      {}
    ),
  []
);

const derivedRegionStats = useMemo(() => {
  if (!gameState) return null;
  if (gameState.regionStats && Object.keys(gameState.regionStats).length > 0) {
    return gameState.regionStats;
  }
  return calculateRegionStats(gameState);
}, [gameState]);

const hasRegionStats = Boolean(derivedRegionStats && Object.keys(derivedRegionStats).length > 0);

const regionStats = hasRegionStats ? derivedRegionStats! : neutralRegionStats;

const totalRegions = Object.keys(regionStats).length;

const capturedByClan =
  hasRegionStats && myPlayer.clanId
    ? Object.values(regionStats).filter(
        (region) => region.topClan?.clanId === myPlayer.clanId
      ).length
    : 0;

const capturedLabel =
  hasRegionStats && myPlayer.clanName ? `${myPlayer.clanName} control` : "Captured";

const zonesForQuickSelect = useMemo(
  () =>
    Object.values(regionStats).map((region) => ({
      id: region.regionId,
      label: REGION_NAMES[region.regionId] ?? region.regionId.replace(/_/g, " "),
      percentage: region.topClan?.percentage ?? 0,
      clanName: region.topClan?.clanName ?? "Unclaimed",
      clanColor: region.topClan?.color,
    })),
  [regionStats]
);

useEffect(() => {
  if (!focusedZone && zonesForQuickSelect.length > 0) {
    setFocusedZone(zonesForQuickSelect[0].id);
  }
}, [focusedZone, zonesForQuickSelect]);

const focusedZoneDetails = useMemo(
  () => zonesForQuickSelect.find((zone) => zone.id === focusedZone) ?? zonesForQuickSelect[0],
  [focusedZone, zonesForQuickSelect]
);

const handleZoneFocus = useCallback((zoneId: string) => {
  setFocusedZone(zoneId);
}, []);

const mobilePanelOptions = [
  { id: "combat" as const, label: "Hack", helper: "Answer" },
  { id: "map" as const, label: "Map", helper: "Territory" },
  { id: "intel" as const, label: "Intel", helper: "Zones" },
];

type ZoneQuickData = {
  id: string;
  label: string;
  percentage: number;
  clanName: string;
  clanColor?: string;
};

interface ZoneQuickListProps {
  zones: ZoneQuickData[];
  focusedZoneId: string | null;
  onFocus: (zoneId: string) => void;
  compact?: boolean;
  variant?: "desktop" | "mobile";
}

const ZoneQuickList: React.FC<ZoneQuickListProps> = ({ zones, focusedZoneId, onFocus, compact = false, variant = "desktop" }) => {
  if (!zones.length) {
    return <p className="mt-4 text-sm text-slate-500">Intel en route...</p>;
  }

  const focused = zones.find((zone) => zone.id === focusedZoneId) ?? zones[0];

  return (
    <div className={`mt-4 ${compact ? "space-y-3" : "space-y-4"}`}>
      <div className={`grid gap-2 ${compact ? "sm:grid-cols-2" : variant === "mobile" ? "grid-cols-1" : "grid-cols-2"}`}>
        {zones.map((zone) => {
          const isActive = zone.id === focusedZoneId;
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onFocus(zone.id)}
              className={`rounded-2xl border px-3 py-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                isActive ? "border-emerald-500/60 bg-emerald-500/10 text-white" : "border-slate-800/80 bg-slate-950/60 text-slate-200"
              }`}
              style={isActive && zone.clanColor ? { boxShadow: `0 0 15px ${zone.clanColor}33` } : undefined}
            >
              <p className="text-[0.6rem] uppercase tracking-[0.3em] text-slate-400">{zone.label}</p>
              <p className="text-base font-semibold text-white">{zone.clanName}</p>
              <p className="text-xs text-emerald-200">{zone.percentage}% control</p>
            </button>
          );
        })}
      </div>

      {!compact && focused && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.3em] text-emerald-200">Focused Zone</p>
              <p className="text-lg font-bold text-white">{focused.label}</p>
            </div>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold">
              {focused.percentage}%
            </span>
          </div>
          <p className="mt-2 text-xs text-emerald-200">Controlled by {focused.clanName}</p>
        </div>
      )}
    </div>
  );
};

const renderCombatPanel = (variant: "desktop" | "mobile" = "desktop") => (
  <div
    className={`rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 text-center shadow-xl shadow-slate-950/40 ${
      variant === "mobile" ? "min-h-[360px]" : ""
    }`}
  >
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-[0.32em] text-slate-500">Security Challenge</h3>
      <p className="text-4xl font-black font-mono text-white sm:text-5xl">{currentQuestion?.q} = ?</p>
      <p className="text-sm text-slate-400">Submit the correct bypass code to siphon coins without spiking the alarm.</p>
    </div>
    {currentQuestion && (
      <form
        onSubmit={handleSubmitAnswer}
        className={`mt-6 flex w-full flex-col gap-3 ${variant === "desktop" ? "sm:flex-row" : ""}`}
      >
        <input
          type="text"
          value={answerInput}
          onChange={(e) => setAnswerInput(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-4 text-center text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          placeholder="?"
          autoFocus={!isMobile}
          inputMode="numeric"
        />
        <button
          type="submit"
          className="w-full rounded-xl bg-emerald-600 px-6 py-4 text-base font-bold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 sm:w-auto"
        >
          Hack Sequence
        </button>
      </form>
    )}
  </div>
);

const renderMapPanel = (variant: "desktop" | "mobile" = "desktop") => (
  <div className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-4 shadow-lg shadow-emerald-900/30">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">Territory Scan</p>
        <p className="text-lg font-semibold text-white">Captured Zones</p>
        <p className="text-xs text-slate-400">Live map of clan control</p>
      </div>

      <div className="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-semibold text-emerald-200 border border-emerald-500/40">
        {hasRegionStats ? `${capturedByClan}/${totalRegions}` : "Mapping"}
      </div>
    </div>

    <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
      <LockdownMap regionStats={regionStats} className={variant === "mobile" ? "h-72" : "h-64"} />
    </div>

    <ZoneQuickList
      zones={zonesForQuickSelect}
      focusedZoneId={focusedZoneDetails?.id ?? null}
      onFocus={handleZoneFocus}
      compact={variant === "desktop"}
    />
  </div>
);

const renderIntelPanel = (variant: "desktop" | "mobile" = "desktop") => (
  <div className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/30">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">Zone Network</p>
        <p className="text-lg font-semibold text-white">Mission Focus</p>
        <p className="text-xs text-slate-400">Tap a zone to study its control stats.</p>
      </div>
      <div className="hidden text-right text-xs text-slate-400 sm:block">
        Refocus often to plan faster routes.
      </div>
    </div>
    <ZoneQuickList
      zones={zonesForQuickSelect}
      focusedZoneId={focusedZoneDetails?.id ?? null}
      onFocus={handleZoneFocus}
      compact={false}
      variant={variant}
    />
  </div>
);

const renderActiveSection = () => {
  if (isMobile) {
    return (
      <div className="space-y-4 pb-28">
        {mobilePanel === "combat" && renderCombatPanel("mobile")}
        {mobilePanel === "map" && renderMapPanel("mobile")}
        {mobilePanel === "intel" && renderIntelPanel("mobile")}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">{renderCombatPanel("desktop")}</div>
      <div className="space-y-4">
        {renderMapPanel("desktop")}
        {renderIntelPanel("desktop")}
      </div>
    </div>
  );
};

const battleResults = useMemo(() => {
  const teamMap = new Map<string, {
    id: string;
    name: string;
    members: number;
    totalCoins: number;
    territories: number;
    color?: string;
  }>();

  Object.values(gameState.players).forEach((player) => {
    const teamId = player.clanId ?? `solo-${player.id}`;
    const existing = teamMap.get(teamId);
    const label = player.clanName ?? player.name;
    if (existing) {
      existing.members += 1;
      existing.totalCoins += player.coins;
      if (!existing.color && player.color) existing.color = player.color;
    } else {
      teamMap.set(teamId, {
        id: teamId,
        name: label,
        members: 1,
        totalCoins: player.coins,
        territories: 0,
        color: player.color,
      });
    }
  });

  Object.values(regionStats).forEach((region) => {
    if (!region.topClan?.clanId) return;
    const winner = teamMap.get(region.topClan.clanId);
    if (winner) {
      winner.territories += 1;
    }
  });

  const leaderboard = Array.from(teamMap.values()).sort((a, b) =>
    b.territories - a.territories || b.totalCoins - a.totalCoins || a.name.localeCompare(b.name)
  );

  const winner = leaderboard[0] ?? null;
  const myTeamId = myPlayer.clanId ?? `solo-${myPlayer.id}`;
  const didWin = Boolean(winner && winner.id === myTeamId);

  return { leaderboard, winner, didWin, myTeamId };
}, [gameState.players, myPlayer.clanId, myPlayer.id, regionStats]);

const winnerCelebrationPlayedRef = useRef(false);

useEffect(() => {
  if (!isFinished) {
    winnerCelebrationPlayedRef.current = false;
    return;
  }

  if (battleResults.didWin && !winnerCelebrationPlayedRef.current) {
    winnerCelebrationPlayedRef.current = true;
    audioService.play("tada");
  }
}, [isFinished, battleResults.didWin]);

const confettiBits = useMemo(
  () =>
    Array.from({ length: 24 }).map((_, index) => ({
      id: index,
      left: ((index * 37) % 100),
      delay: (index % 8) * 0.12,
      duration: 2.4 + (index % 5) * 0.25,
      rotate: ((index * 47) % 80) - 40,
      size: 16 + (index % 3) * 5,
    })),
  []
);

const renderMobilePanelNav = () => (
  <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center sm:hidden">
    <div className="pointer-events-auto w-full max-w-sm px-4">
      <div className="grid grid-cols-3 gap-2 rounded-3xl border border-slate-800/80 bg-slate-950/90 p-2 shadow-2xl shadow-black/60 backdrop-blur">
        {mobilePanelOptions.map((option) => {
          const active = mobilePanel === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setMobilePanel(option.id)}
              className={`rounded-2xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                active
                  ? "border-emerald-400/60 bg-emerald-500/20 text-white"
                  : "border-slate-800 bg-slate-900/60 text-slate-300"
              }`}
              aria-pressed={active}
            >
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-slate-400">{option.helper}</p>
              <p className="text-lg font-semibold">{option.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-xl shadow-emerald-900/20 backdrop-blur">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Agent Online</p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full border border-slate-900/80"
                    style={{ backgroundColor: myPlayer.color ?? "#94a3b8" }}
                    aria-hidden="true"
                  />
                  Agent {myPlayer.name ?? "Unknown"}
                </span>
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 font-semibold">Room {roomCode}</span>
                <span className="rounded-full border border-emerald-500/50 bg-emerald-600/10 px-3 py-1 font-semibold text-emerald-300">
                  {formattedPhase}
                </span>
                {gameState.panicModeActive && (
                  <span className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-600/20 px-3 py-1 font-semibold text-xs text-rose-200 animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-rose-300" />
                    Panic Mode
                  </span>
                )}
              </div>
            </div>
            <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Total Loot</p>
                <p className="text-3xl font-black text-amber-300">{myPlayer.coins} 🪙</p>
              </div>
              <button
                onClick={onExit}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-500/60 hover:bg-rose-600/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              >
                Exit Session
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/40">
            <p className="text-[0.7rem] uppercase tracking-[0.32em] text-slate-500">Current Heat</p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-rose-300">{heatPercent}%</span>
              <span className="text-xs text-slate-400">Stay under {gameState.roomSettings.mostWantedHeat}%</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${heatPercent >= gameState.roomSettings.mostWantedHeat ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}
                style={{ width: `${heatPercent}%` }}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/40">
            <p className="text-[0.7rem] uppercase tracking-[0.32em] text-slate-500">Facility Alarm</p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-white">{Math.round(alarmValue)}%</span>
              <span className="text-xs text-slate-400">Level {gameState.alarmLevel}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${alarmValue >= alarmThreshold ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}
                style={{ width: `${alarmGauge}%` }}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <ProgressCard
            title="Heist Timer"
            highlight={`${remainingSeconds}s left`}
            helper={`${formattedPhase}`}
            percent={timePercent}
            tone={remainingSeconds < 20 ? "alert" : "primary"}
          />
          <ProgressCard
            title="Coin Goal"
            highlight={`${myPlayer.coins} / ${coinGoal}`}
            helper="Personal haul"
            percent={coinProgress}
            tone="gold"
          />
          <ProgressCard
            title="Territory"
highlight={
  hasRegionStats
    ? `${capturedByClan}/${totalRegions}`
    : "Mapping"
}
helper={
  hasRegionStats
    ? `${capturedLabel} zones`
    : "Awaiting intel"
}
percent={
  hasRegionStats && totalRegions
    ? (capturedByClan / totalRegions) * 100
    : 0
}

            tone="emerald"
          />
        </section>

        {isLobby && (
          <div className="flex flex-1 flex-col justify-center gap-6 rounded-3xl border border-dashed border-emerald-600/40 bg-emerald-500/5 p-8 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Operation Standby</h2>
              <p className="text-sm text-slate-300">Waiting for the handler to launch the lockdown run.</p>
            </div>
            <div className="space-y-3 text-sm text-slate-400">
              <p className="font-semibold text-emerald-300 animate-pulse">Hold tight. Signal arrives any second…</p>
              <p className="text-xs uppercase tracking-[0.3em]">{Object.keys(gameState.players).length} Agents Synced</p>
              <div className="flex justify-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
              </div>
            </div>
          </div>
        )}

        {isPaused && (
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-amber-500/40 bg-amber-500/10 p-8 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-amber-300">Operation Paused</h2>
              <p className="text-sm text-amber-100">The host has suspended all activity. Await new orders.</p>
            </div>
          </div>
        )}

        {isActive && (
          <div className="relative flex flex-1 flex-col gap-6">
            {renderActiveSection()}
            {isMobile && renderMobilePanelNav()}
          </div>
        )}

        {isFinished && (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60 p-8 text-center shadow-xl shadow-slate-950/40">
            {battleResults.didWin && (
              <>
                <style>{`@keyframes lockdownConfettiDrop {0% {transform: translateY(-120%) rotate(0deg); opacity: 0;} 10% {opacity: 1;} 100% {transform: translateY(110vh) rotate(360deg); opacity: 0;}}`}</style>
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                  {confettiBits.map((bit) => (
                    <span
                      key={bit.id}
                      className="absolute top-0"
                      style={{
                        left: `${bit.left}%`,
                        fontSize: `${bit.size}px`,
                        transform: `rotate(${bit.rotate}deg)`,
                        animation: `lockdownConfettiDrop ${bit.duration}s linear ${bit.delay}s infinite`,
                      }}
                    >
                      🎉
                    </span>
                  ))}
                </div>
              </>
            )}

            <h2 className="text-4xl font-black text-white">Territory Battle Complete</h2>

            {battleResults.winner ? (
              <div className={`w-full max-w-2xl rounded-2xl border p-5 ${battleResults.didWin ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10'}`}>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Official Result</p>
                <p className="mt-2 text-3xl font-black text-white">🏆 {battleResults.winner.name} won the territory battle</p>
                <p className={`mt-2 text-base font-semibold ${battleResults.didWin ? 'text-emerald-200' : 'text-rose-200'}`}>
                  {battleResults.didWin ? 'Victory! Your clan secured the crown.' : 'Defeat. Your clan lost this battle.'}
                </p>
                {battleResults.didWin && (
                  <div className="mx-auto mt-4 w-fit rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3">
                    <DotLottieAnimation src="/lotties/Trophy.lottie" width={180} height={180} loop autoplay />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-300">No winning clan could be resolved from this round.</p>
            )}

            <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-left">
              <p className="mb-3 text-xs uppercase tracking-[0.28em] text-slate-400">Clan standings</p>
              <div className="space-y-2">
                {battleResults.leaderboard.map((team, index) => {
                  const isWinner = battleResults.winner?.id === team.id;
                  const isMyTeam = battleResults.myTeamId === team.id;
                  return (
                    <div key={team.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${isWinner ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
                      <div>
                        <p className="font-semibold text-white">
                          {index + 1}. {team.name} {isWinner ? '🏆' : ''} {isMyTeam ? '(You)' : ''}
                        </p>
                        <p className="text-xs text-slate-400">{team.members} players · {team.totalCoins} coins</p>
                      </div>
                      <p className={`text-sm font-bold ${isWinner ? 'text-emerald-200' : 'text-rose-200'}`}>
                        {isWinner ? 'WINNER' : 'LOST'} · {team.territories} zones
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={onExit}
              className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:bg-emerald-600/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              Leave Room
            </button>
          </div>
        )}

        {!isFinished && (
          <footer className="pb-4 text-center text-xs text-slate-500">
            Need to bail? Use the exit button above to return to base.
          </footer>
        )}
      </div>
    </div>
  );
};

type ProgressTone = "primary" | "emerald" | "gold" | "alert";

interface ProgressCardProps {
  title: string;
  highlight: string;
  helper: string;
  percent: number;
  tone?: ProgressTone;
}

const toneStyles: Record<ProgressTone, { track: string; fill: string; text: string }> = {
  primary: {
    track: "bg-slate-800",
    fill: "bg-sky-500/80",
    text: "text-sky-200",
  },
  emerald: {
    track: "bg-slate-800",
    fill: "bg-emerald-500/80",
    text: "text-emerald-200",
  },
  gold: {
    track: "bg-slate-800",
    fill: "bg-amber-400/80",
    text: "text-amber-200",
  },
  alert: {
    track: "bg-slate-800",
    fill: "bg-rose-500/80",
    text: "text-rose-200",
  },
};

const ProgressCard: React.FC<ProgressCardProps> = ({ title, highlight, helper, percent, tone = "primary" }) => {
  const palette = toneStyles[tone];
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/30">
      <p className="text-[0.7rem] uppercase tracking-[0.32em] text-slate-500">{title}</p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className={`text-2xl font-bold ${palette.text}`}>{highlight}</span>
        <span className="text-xs text-slate-400">{helper}</span>
      </div>
      <div className={`mt-3 h-2 w-full overflow-hidden rounded-full ${palette.track}`}>
        <div className={`h-full rounded-full transition-all ${palette.fill}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
};
