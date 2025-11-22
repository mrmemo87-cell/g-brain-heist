import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmLevel,
  EntryRoute,
  GameAction,
  GamePhase,
  GameState,
  HeistCondition,
  PlayerState,
  QuestionRiskRoute,
  ChooseEntryRouteAction,
  ChooseRiskRouteAction,
  SubmitAnswerAction,
  PostRoundAction,
} from "./lockdownTypes";
import {
  InMemoryLockdownTransport,
  LockdownRoomClient,
  PlayerId,
  RoomId,
  createRoomClient,
} from "../../lib/lockdownTransport";
import { buildRoomSettings } from "./defaultRoomSettings";

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

const alarmBadges: Record<AlarmLevel, string> = {
  [AlarmLevel.LOW]: "bg-emerald-600",
  [AlarmLevel.GUARDED]: "bg-amber-500",
  [AlarmLevel.HIGH]: "bg-orange-500",
  [AlarmLevel.CRITICAL]: "bg-rose-600",
};

const SANDBOX_CLANS = [
  { clanId: "clan-alpha", clanName: "Alpha Wolves", clanAvatarUrl: "https://api.dicebear.com/7.x/identicon/svg?seed=alpha", clanColor: "#3b82f6" },
  { clanId: "clan-bravo", clanName: "Bravo Syndicate", clanAvatarUrl: "https://api.dicebear.com/7.x/identicon/svg?seed=bravo", clanColor: "#ef4444" },
  { clanId: "clan-charlie", clanName: "Charlie Ops", clanAvatarUrl: "https://api.dicebear.com/7.x/identicon/svg?seed=charlie", clanColor: "#f59e0b" },
  { clanId: "clan-delta", clanName: "Delta Ghosts", clanAvatarUrl: "https://api.dicebear.com/7.x/identicon/svg?seed=delta", clanColor: "#06b6d4" },
];

interface LocalPlayer {
  id: PlayerId;
  name: string;
  client: LockdownRoomClient;
}

interface LockdownSandboxProps {
  onExit: () => void;
}

const LockdownSandbox: React.FC<LockdownSandboxProps> = ({ onExit }) => {
  const transportRef = useRef(new InMemoryLockdownTransport());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [roomId, setRoomId] = useState<RoomId | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayers, setLocalPlayers] = useState<Record<PlayerId, LocalPlayer>>({});
  const [newPlayerName, setNewPlayerName] = useState("Agent");
  const [tickSeconds, setTickSeconds] = useState(15);
  const [hackTargets, setHackTargets] = useState<Record<PlayerId, PlayerId | "">>({});
  const [creatingRoom, setCreatingRoom] = useState(false);

  const connectRoom = useCallback(async () => {
    setCreatingRoom(true);
    unsubscribeRef.current?.();
    const transport = transportRef.current;
    const newRoomId = await transport.createRoom(buildRoomSettings());
    setRoomId(newRoomId);
    setLocalPlayers({});
    setHackTargets({});
    const unsubscribe = transport.onGameState(newRoomId, setGameState);
    unsubscribeRef.current = unsubscribe;
    setCreatingRoom(false);
  }, []);

  useEffect(() => {
    connectRoom();
    return () => unsubscribeRef.current?.();
  }, [connectRoom]);

  const handleAddPlayer = useCallback(async () => {
    if (!roomId) return;
    const label = newPlayerName.trim() || `Agent ${Object.keys(localPlayers).length + 1}`;
    const clan = SANDBOX_CLANS[Object.keys(localPlayers).length % SANDBOX_CLANS.length];
    const playerId = await transportRef.current.joinRoom(roomId, label, clan);
    const client = createRoomClient(transportRef.current, roomId, playerId);
    setLocalPlayers((prev) => ({ ...prev, [playerId]: { id: playerId, name: label, client } }));
    setNewPlayerName("");
  }, [localPlayers, newPlayerName, roomId]);

  const sendHostAction = useCallback(
    async (action: GameAction) => {
      if (!roomId) return;
      await transportRef.current.sendTeacherCommand(roomId, action);
    },
    [roomId],
  );

  const players = useMemo(() => Object.values(gameState?.players ?? {}), [gameState]);
  const totalCoins = useMemo(() => players.reduce((sum, player) => sum + player.coins, 0), [players]);
  const remainingSeconds = Math.ceil((gameState?.remainingTimeMs ?? 0) / 1000);

  const handleHackTargetChange = (playerId: PlayerId, targetId: PlayerId | "") => {
    setHackTargets((prev) => ({ ...prev, [playerId]: targetId }));
  };

  const handlePlayerAction = (player: PlayerState, fn: (client: LockdownRoomClient) => void) => {
    const local = localPlayers[player.id];
    if (!local) return;
    fn(local.client);
  };

  const renderPanicBadge = () => {
    if (!gameState) return null;
    if (gameState.phase === GamePhase.FINISHED || !gameState.panicModeActive) {
      return null;
    }
    return <span className="px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-semibold">Panic Mode</span>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Experimental Mode</p>
          <h1 className="text-3xl font-black text-white">Lockdown Countdown Sandbox</h1>
          <p className="text-sm text-slate-300">Wire the engine, UI, and teacher controls without touching live raids.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
          >
            ← Back to Dashboard
          </button>
          <button
            onClick={connectRoom}
            disabled={creatingRoom}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-emerald-200"
          >
            {creatingRoom ? "Resetting…" : "Reset Room"}
          </button>
        </div>
      </div>

      {gameState ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Alarm Status</p>
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${alarmBadges[gameState.alarmLevel]}`}>
                {gameState.alarmLevel}
              </div>
              {renderPanicBadge()}
            </div>
            <div className="text-3xl font-black text-white">{gameState.alarm}%</div>
            <p className="text-xs text-slate-400">Max {gameState.roomSettings.alarmMax}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Coin Progress</p>
            <div className="text-3xl font-black text-amber-300">{totalCoins} / {gameState.roomSettings.coinGoal}</div>
            <div className="w-full h-2 rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${Math.min(100, (totalCoins / gameState.roomSettings.coinGoal) * 100)}%` }}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Time Remaining</p>
            <div className="text-3xl font-black text-white">{Math.max(0, remainingSeconds)}s</div>
            <p className="text-xs text-slate-400">Phase: {gameState.phase}</p>
            {gameState.finishReason && (
              <p className="text-xs text-rose-400">Finished: {gameState.finishReason}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-300">Initializing room…</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
          <header className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Player Console</h2>
              <p className="text-sm text-slate-400">Add demo players and issue actions.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                placeholder="Agent codename"
              />
              <button
                onClick={handleAddPlayer}
                disabled={!roomId}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-900"
              >
                Add Player
              </button>
            </div>
          </header>

          <div className="space-y-4">
            {players.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400 text-center">
                No agents yet. Invite one above.
              </div>
            )}
            {players.map((player) => {
              const accuracy = player.accuracy.total
                ? Math.round((player.accuracy.correct / player.accuracy.total) * 100)
                : 0;
              const hackTarget = hackTargets[player.id] ?? "";
              return (
                <div key={player.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold text-white">{player.name ?? player.id}</p>
                      <p className="text-xs text-slate-400">coins {player.coins} · heat {player.heat}</p>
                    </div>
                    {player.mostWanted && (
                      <span className="px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-semibold uppercase tracking-wide">
                        Most Wanted
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Entry Route</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(EntryRoute).map((route) => (
                          <button
                            key={route}
                            onClick={() =>
                              handlePlayerAction(player, (client) =>
                                client.act({ type: "CHOOSE_ENTRY_ROUTE", route } as Omit<ChooseEntryRouteAction, "playerId">),
                              )}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                              player.entryRoute === route ? "border-emerald-400 text-emerald-200" : "border-slate-700 text-slate-300"
                            }`}
                            disabled={!localPlayers[player.id]}
                          >
                            {entryRouteLabels[route]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Risk Route</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(QuestionRiskRoute).map((route) => (
                          <button
                            key={route}
                            onClick={() =>
                              handlePlayerAction(player, (client) =>
                                client.act({ type: "CHOOSE_RISK_ROUTE", route } as Omit<ChooseRiskRouteAction, "playerId">),
                              )}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                              player.riskRoute === route ? "border-amber-400 text-amber-200" : "border-slate-700 text-slate-300"
                            }`}
                            disabled={!localPlayers[player.id]}
                            title={`${riskRouteMeta[route].reward} · ${riskRouteMeta[route].heat}`}
                          >
                            {riskRouteMeta[route].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 p-3 bg-slate-950/60">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Question Response</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() =>
                            handlePlayerAction(player, (client) =>
                              client.act({ type: "SUBMIT_ANSWER", correct: true } as Omit<SubmitAnswerAction, "playerId">),
                            )}
                          className="flex-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm py-2 disabled:bg-emerald-900"
                          disabled={!localPlayers[player.id]}
                        >
                          Correct
                        </button>
                        <button
                          onClick={() =>
                            handlePlayerAction(player, (client) =>
                              client.act({ type: "SUBMIT_ANSWER", correct: false } as Omit<SubmitAnswerAction, "playerId">),
                            )}
                          className="flex-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-sm py-2 disabled:bg-rose-900"
                          disabled={!localPlayers[player.id]}
                        >
                          Missed
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Accuracy: {accuracy}% ({player.accuracy.correct}/{player.accuracy.total})</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 p-3 bg-slate-950/60 space-y-2">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Post-Round Action</p>
                      <select
                        value={hackTarget}
                        onChange={(e) => handleHackTargetChange(player.id, e.target.value as PlayerId | "")}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200"
                      >
                        <option value="">Select target</option>
                        {players
                          .filter((p) => p.id !== player.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name ?? candidate.id}
                            </option>
                          ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handlePlayerAction(player, (client) =>
                              client.act({ type: "ROUND_POST_ACTION", action: "hack", targetId: hackTarget || undefined } as Omit<PostRoundAction, "playerId">),
                            )
                          }
                          className="flex-1 rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-200 py-2 disabled:bg-slate-900"
                          disabled={!localPlayers[player.id] || !hackTarget}
                        >
                          Hack Target
                        </button>
                        <button
                          onClick={() =>
                            handlePlayerAction(player, (client) =>
                              client.act({ type: "ROUND_POST_ACTION", action: "scrub" } as Omit<PostRoundAction, "playerId">),
                            )}
                          className="flex-1 rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-200 py-2 disabled:bg-slate-900"
                          disabled={!localPlayers[player.id]}
                        >
                          Scrub Heat
                        </button>
                        <button
                          onClick={() =>
                            handlePlayerAction(player, (client) =>
                              client.act({ type: "ROUND_POST_ACTION", action: "greed" } as Omit<PostRoundAction, "playerId">),
                            )}
                          className="flex-1 rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-200 py-2 disabled:bg-slate-900"
                          disabled={!localPlayers[player.id]}
                        >
                          Greed Coins
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Host / Teacher Controls</h2>
              <p className="text-sm text-slate-400">Advance phases, tick timers, and apply chaos.</p>
            </div>
          </header>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Phase</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500"
                  onClick={() => sendHostAction({ type: "ADVANCE_PHASE" })}
                >
                  Advance Phase
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-500"
                  onClick={() => sendHostAction({ type: "FINALIZE_CONDITION", condition: HeistCondition.DOUBLE_PAYOUTS })}
                >
                  Activate Double Payouts
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500"
                  onClick={() =>
                    sendHostAction({
                      type: "CHAOS_TRIGGER",
                      effect: {
                        id: `chaos-${Date.now()}`,
                        description: "Disabled safe route",
                        disableSafeRoute: true,
                      },
                    })
                  }
                >
                  Disable Safe Route
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Timer Tick</p>
              <div className="flex flex-wrap gap-3 items-center">
                <input
                  type="number"
                  min={1}
                  value={tickSeconds}
                  onChange={(e) => setTickSeconds(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
                <span className="text-sm text-slate-400">seconds</span>
                <button
                  onClick={() => sendHostAction({ type: "TICK", elapsedMs: tickSeconds * 1000 })}
                  className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
                >
                  Apply Tick
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Rule Set</p>
              {gameState?.ruleSet.selectedCondition ? (
                <div className="text-sm text-emerald-300 font-semibold">
                  Active condition: {gameState.ruleSet.selectedCondition}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No condition selected.</p>
              )}
              {gameState?.ruleSet.safeRouteDisabled && (
                <p className="text-xs text-rose-400 mt-2">Safe route disabled for all players.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LockdownSandbox;
