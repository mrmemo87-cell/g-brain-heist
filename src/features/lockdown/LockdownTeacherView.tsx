import React, { useEffect, useState, useMemo } from "react";
import {
  AlarmLevel,
  GameAction,
  GamePhase,
  GameState,
} from "./lockdownTypes";
import { LockdownTransport, RoomId } from "../../lib/lockdownTransport";
import { LockdownMap } from "./LockdownMap";
import { calculateRegionStats } from "./regionCalculator";
import DotLottieAnimation from "../../../components/DotLottieAnimation";

const alarmBadges: Record<AlarmLevel, string> = {
  [AlarmLevel.LOW]: "bg-emerald-600",
  [AlarmLevel.GUARDED]: "bg-amber-500",
  [AlarmLevel.HIGH]: "bg-orange-500",
  [AlarmLevel.CRITICAL]: "bg-rose-600",
};

interface LockdownTeacherViewProps {
  transport: LockdownTransport;
  roomId: RoomId;
  onExit: () => void;
}

export const LockdownTeacherView: React.FC<LockdownTeacherViewProps> = ({
  transport,
  roomId,
  onExit,
}) => {
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    const unsubscribe = transport.onGameState(roomId, setGameState);
    return () => unsubscribe();
  }, [transport, roomId]);

  const sendCommand = async (action: GameAction) => {
    await transport.sendTeacherCommand(roomId, action);
  };

  const players = useMemo(() => Object.values(gameState?.players ?? {}), [gameState]);
  const totalCoins = useMemo(() => players.reduce((sum, player) => sum + player.coins, 0), [players]);
  const remainingSeconds = Math.ceil((gameState?.remainingTimeMs ?? 0) / 1000);
  const totalDurationSeconds = Math.max(1, Math.ceil((gameState?.roomSettings.durationMs ?? 0) / 1000));

  const regionStats = useMemo(() => {
    if (!gameState) return {};
    return calculateRegionStats(gameState);
  }, [gameState]);

  const battleResults = useMemo(() => {
    const teamMap = new Map<string, {
      id: string;
      name: string;
      members: number;
      totalCoins: number;
      territories: number;
      color?: string;
    }>();

    players.forEach((player) => {
      const teamId = player.clanId ?? `solo-${player.id}`;
      const existing = teamMap.get(teamId);
      if (existing) {
        existing.members += 1;
        existing.totalCoins += player.coins;
        if (!existing.color && player.color) existing.color = player.color;
      } else {
        teamMap.set(teamId, {
          id: teamId,
          name: player.clanName ?? player.name,
          members: 1,
          totalCoins: player.coins,
          territories: 0,
          color: player.color,
        });
      }
    });

    Object.values(regionStats).forEach((region) => {
      const winningClanId = region.topClan?.clanId;
      if (!winningClanId) return;
      const team = teamMap.get(winningClanId);
      if (team) team.territories += 1;
    });

    const leaderboard = Array.from(teamMap.values()).sort((a, b) =>
      b.territories - a.territories || b.totalCoins - a.totalCoins || a.name.localeCompare(b.name)
    );

    return { leaderboard, winner: leaderboard[0] ?? null };
  }, [players, regionStats]);

  const renderPanicBadge = () => {
    if (!gameState) return null;
    if (gameState.phase === GamePhase.FINISHED || !gameState.panicModeActive) {
      return null;
    }
    return (
      <span className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-600/20 px-3 py-1 text-xs font-semibold text-rose-200 animate-pulse">
        <span className="h-2 w-2 rounded-full bg-rose-400"></span>
        Panic Mode Active
      </span>
    );
  };

  if (!gameState) {
    return <div className="p-8 text-center text-slate-400">Initializing room...</div>;
  }

  const roomCode = roomId.replace("room-", "");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-2xl shadow-emerald-900/20 backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-600/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Teacher Control
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Lockdown Host Console</h1>
                <p className="mt-1 text-sm text-slate-400">Orchestrate the operation, monitor agent heat, and keep the alarm in check.</p>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 text-center font-mono text-sm text-emerald-300">
                <span className="block text-[0.7rem] uppercase tracking-[0.3em] text-slate-500">Room Code</span>
                <span className="text-2xl font-bold text-white">{roomCode}</span>
              </div>
              <button
                onClick={onExit}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-500/60 hover:bg-rose-600/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/40 sm:w-auto"
              >
                End Session
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-emerald-900/10">
            <p className="text-[0.7rem] uppercase tracking-[0.32em] text-slate-500">Alarm Status</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${alarmBadges[gameState.alarmLevel]}`}>
                {gameState.alarmLevel}
              </div>
              {renderPanicBadge()}
            </div>
            <div className="text-5xl font-black leading-none text-white sm:text-6xl">{gameState.alarm}%</div>
            <p className="text-xs text-slate-400">Threshold {gameState.roomSettings.alarmMax}%</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-rose-500/80 transition-all"
                style={{ width: `${Math.min(100, (gameState.alarm / gameState.roomSettings.alarmMax) * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-emerald-900/10">
            <p className="text-[0.7rem] uppercase tracking-[0.32em] text-slate-500">Total Loot</p>
            <div className="text-5xl font-black leading-none text-amber-300 sm:text-6xl">{totalCoins}</div>
            <p className="text-xs text-slate-400">Goal: {gameState.roomSettings.coinGoal}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${Math.min(100, (totalCoins / gameState.roomSettings.coinGoal) * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-emerald-900/10">
            <p className="text-[0.7rem] uppercase tracking-[0.32em] text-slate-500">Time Remaining</p>
            <div className={`text-5xl font-black leading-none sm:text-6xl ${remainingSeconds < 30 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
              {Math.max(0, remainingSeconds)}s
            </div>
            <p className="text-xs text-slate-400">Phase: {gameState.phase}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${remainingSeconds < 30 ? 'bg-rose-500/80' : 'bg-emerald-500/80'}`}
                style={{ width: `${Math.min(100, (remainingSeconds / totalDurationSeconds) * 100)}%` }}
              />
            </div>
          </div>
        </section>

        {gameState.phase === GamePhase.FINISHED && (
          <section className="rounded-3xl border border-amber-400/40 bg-amber-500/10 p-6 shadow-xl shadow-amber-900/20">
            <div className="flex flex-col items-center gap-4 text-center lg:flex-row lg:justify-between lg:text-left">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Battle Finished</p>
                <h2 className="mt-1 text-3xl font-black text-white">🏆 Winner: {battleResults.winner?.name ?? 'No winner resolved'}</h2>
                <p className="mt-2 text-sm text-amber-100">All other clans are marked as defeated in the standings below.</p>
              </div>
              {battleResults.winner && (
                <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-2">
                  <DotLottieAnimation src="/lotties/Trophy.lottie" width={140} height={140} loop autoplay />
                </div>
              )}
            </div>
            {!!battleResults.leaderboard.length && (
              <div className="mt-5 grid gap-2 md:grid-cols-2">
                {battleResults.leaderboard.map((team, index) => {
                  const isWinner = battleResults.winner?.id === team.id;
                  return (
                    <div key={team.id} className={`rounded-xl border px-4 py-3 ${isWinner ? 'border-emerald-500/60 bg-emerald-500/15' : 'border-rose-500/30 bg-rose-500/10'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-white">{index + 1}. {team.name} {isWinner ? '🏆' : ''}</p>
                        <span className={`text-xs font-bold ${isWinner ? 'text-emerald-200' : 'text-rose-200'}`}>{isWinner ? 'WINNER' : 'LOST'}</span>
                      </div>
                      <p className="text-xs text-slate-300">{team.territories} zones · {team.totalCoins} coins · {team.members} players</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="rounded-3xl border border-slate-800/70 bg-slate-900/50 p-6 shadow-lg shadow-slate-950/40">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold tracking-tight sm:text-xl">Territory Map</h2>
                {gameState.roomSettings.mapId && (
                  <span className="text-xs text-slate-400 uppercase tracking-wide">
                    {gameState.roomSettings.mapId}
                  </span>
                )}
              </div>
              <LockdownMap regionStats={regionStats} mapId={gameState.roomSettings.mapId} className="h-96" />
            </div>

            <div className="rounded-3xl border border-slate-800/70 bg-slate-900/50 p-6 shadow-lg shadow-slate-950/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight sm:text-xl">Active Agents</h2>
                <span className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-300">{players.length} online</span>
              </div>
              <div className="mt-5 grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2" role="list">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-emerald-500/40 hover:bg-slate-900"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-slate-900/80"
                          style={{ backgroundColor: p.color ?? "#94a3b8" }}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold text-white sm:text-base">{p.name}</p>
                      </div>
                      <p className="text-xs text-slate-400">
                        Heat {p.heat}% · Coins {p.coins}
                        {p.clanName ? ` · ${p.clanName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {p.mostWanted && (
                        <span className="rounded-full border border-rose-500/40 bg-rose-600/20 px-2 py-1 text-[0.65rem] font-semibold text-rose-200">
                          Most Wanted
                        </span>
                      )}
                      <button
                        onClick={() => sendCommand({ type: 'KICK_PLAYER', playerId: p.id } as any)}
                        className="rounded-lg border border-rose-800/70 bg-rose-900/40 px-3 py-1 text-xs font-semibold text-rose-200 opacity-0 transition group-hover:opacity-100 hover:bg-rose-800/60"
                        title="Kick Player"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {players.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
                    Waiting for players to join the operation…
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-800/70 bg-slate-900/50 p-6 shadow-lg shadow-slate-950/40">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">Controls</h2>
              <p className="mt-1 text-xs text-slate-400">Deploy commands instantly. Actions broadcast to every connected agent.</p>
              <div className="mt-4 grid gap-3">
                {gameState.phase === GamePhase.LOBBY && (
                  <button
                    onClick={() => sendCommand({ type: 'START_GAME' } as any)}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    Start Heist
                  </button>
                )}
                {gameState.phase === GamePhase.ACTIVE_ROUNDS && (
                  <>
                    <button
                      onClick={() => sendCommand({ type: 'TRIGGER_PANIC' } as any)}
                      disabled={gameState.panicModeActive}
                      className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Trigger Panic Mode
                    </button>
                    <button
                      onClick={() => sendCommand({ type: 'PAUSE_GAME' } as any)}
                      className="w-full rounded-xl bg-amber-600 py-3 text-sm font-bold text-white transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    >
                      Pause Game
                    </button>
                  </>
                )}
                {gameState.phase === GamePhase.PAUSED && (
                  <button
                    onClick={() => sendCommand({ type: 'RESUME_GAME' } as any)}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    Resume Game
                  </button>
                )}
                {gameState.phase === GamePhase.FINISHED && (
                  <p className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                    Operation complete. You can end the session or review results above.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
