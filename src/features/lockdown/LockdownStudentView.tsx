import React, { useEffect, useState, useMemo } from "react";
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

  useEffect(() => {
    const c = createRoomClient(transport, roomId, playerId);
    setClient(c);
    const unsubscribe = transport.onGameState(roomId, setGameState);
    return () => unsubscribe();
  }, [transport, roomId, playerId]);

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

  const roomCode = roomId.replace("room-", "");
  const heatPercent = Math.min(100, Math.max(0, myPlayer.heat));
  const alarmValue = Math.max(0, gameState.alarm);
  const alarmThreshold = Math.max(1, gameState.roomSettings.alarmMax);
  const alarmGauge = Math.min(100, (alarmValue / alarmThreshold) * 100);
  const formattedPhase = gameState.phase.toString().replace(/_/g, " ");
  const remainingSeconds = Math.max(0, Math.round(gameState.remainingTimeMs / 1000));
  const totalDurationSeconds = Math.max(1, Math.round(gameState.roomSettings.durationMs / 1000));
  const timePercent = Math.min(100, (remainingSeconds / totalDurationSeconds) * 100);
  const coinGoal = Math.max(1, gameState.roomSettings.coinGoal);
  const coinProgress = Math.min(100, (myPlayer.coins / coinGoal) * 100);

  const neutralRegionStats = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 7, 8].reduce<Record<string, { regionId: string; clanStats: never[] }>>((acc, num) => {
        acc[`region_${num}`] = { regionId: `region_${num}`, clanStats: [] };
        return acc;
      }, {}),
    []
  );

  const hasRegionStats = Boolean(gameState.regionStats && Object.keys(gameState.regionStats).length > 0);
  const regionStats = hasRegionStats ? gameState.regionStats! : neutralRegionStats;
  const totalRegions = Object.keys(regionStats).length;
  const capturedByClan = hasRegionStats && myPlayer.clanId
    ? Object.values(regionStats).filter((region) => region.topClan?.clanId === myPlayer.clanId).length
    : 0;
  const capturedLabel = hasRegionStats && myPlayer.clanName ? `${myPlayer.clanName} control` : "Captured";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-xl shadow-emerald-900/20 backdrop-blur">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Agent Online</p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Agent {myPlayer.name ?? "Unknown"}</h1>
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
            highlight={hasRegionStats ? `${capturedByClan}/${totalRegions}` : "Mapping"}
            helper={hasRegionStats ? `${capturedLabel} zones` : "Awaiting intel"}
            percent={hasRegionStats ? (capturedByClan / totalRegions) * 100 : 0}
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
          <div className="flex flex-1 flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 text-center shadow-xl shadow-slate-950/40">
                <div className="space-y-2">
                  <h3 className="text-xs uppercase tracking-[0.32em] text-slate-500">Security Challenge</h3>
                  <p className="text-4xl font-black font-mono text-white sm:text-5xl">{currentQuestion?.q} = ?</p>
                  <p className="text-sm text-slate-400">Submit the correct bypass code to siphon coins without spiking the alarm.</p>
                </div>
                {currentQuestion && (
                  <form onSubmit={handleSubmitAnswer} className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={answerInput}
                      onChange={(e) => setAnswerInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-4 text-center text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      placeholder="?"
                      autoFocus
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
                <LockdownMap regionStats={regionStats} className="h-64" />
                </div>
              </div>
            </div>
          </div>
        )}

        {isFinished && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-3xl border border-slate-800/70 bg-slate-900/60 p-8 text-center shadow-xl shadow-slate-950/40">
            <h2 className="text-4xl font-black text-white">Heist Complete</h2>
            <p className="text-xl font-semibold text-amber-300">Final haul: {myPlayer.coins} 🪙</p>
            <p className="text-sm text-slate-400">Await debrief from your handler or exit the operation.</p>
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
