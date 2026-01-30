import React from "react";
import {
  ClanId,
  ClanMetadata,
  ClanTerritoryGameState,
  PlayerStats,
  getClanColor,
  CONFIG,
  getZonesForMap,
} from "../clanTerritoryTypes";
import { calculateClanTerritoryResults } from "../clanTerritoryRewards";
import { ClanTerritoryMap } from "./ClanTerritoryMap";
import { audioService } from "../../../../services/audioService";

interface ClanTerritoryTeacherViewProps {
  gameState: ClanTerritoryGameState;
  selectedQuestions: any[];
  onStartGame: () => void;
  onEndGame: () => void;
  onKickPlayer: (playerId: string) => void;
}

type WarEvent = {
  id: string;
  text: string;
  color?: string;
  timestamp: number;
};

const getZoneController = (zoneId: string, state: ClanTerritoryGameState): ClanId | null => {
  const zone = state.zones[zoneId];
  if (!zone) return null;
  const ordered = Object.entries(zone.influence)
    .filter(([, val]) => val > 0)
    .sort((a, b) => b[1] - a[1]);
  const leader = ordered[0];
  const runnerUp = ordered[1];
  if (!leader) return null;
  if (runnerUp && runnerUp[1] === leader[1]) return null;
  return leader[0] as ClanId;
};

const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
};

export const ClanTerritoryTeacherView: React.FC<ClanTerritoryTeacherViewProps> = ({
  gameState,
  selectedQuestions,
  onStartGame,
  onEndGame,
  onKickPlayer,
}) => {
  const clanList = React.useMemo(() => {
    const knownClans = Object.values(gameState.clans).map((clan) => ({
      ...clan,
      color: clan.color || getClanColor(clan.id),
    }));
    if (knownClans.length > 0) {
      return [...knownClans].sort((a, b) => a.name.localeCompare(b.name));
    }

    const derived = new Map<ClanId, ClanMetadata>();
    Object.values(gameState.players).forEach((player) => {
      if (!derived.has(player.clanId)) {
        derived.set(player.clanId, {
          id: player.clanId,
          name: player.clanName,
          color: getClanColor(player.clanId),
        });
      }
    });

    Object.values(gameState.zones).forEach((zone) => {
      Object.keys(zone.influence).forEach((clanId) => {
        if (!derived.has(clanId as ClanId)) {
          derived.set(clanId as ClanId, {
            id: clanId as ClanId,
            name: clanId,
            color: getClanColor(clanId),
          });
        }
      });
    });

    return [...derived.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [gameState.clans, gameState.players, gameState.zones]);

  const clansWithColors = React.useMemo(() => {
    const map: Record<ClanId, ClanMetadata> = {};
    clanList.forEach((clan) => {
      map[clan.id] = { ...clan, color: clan.color || getClanColor(clan.id) };
    });
    return map;
  }, [clanList]);

  // Get the correct zones based on mapId
  const activeZones = React.useMemo(() => {
    return getZonesForMap(gameState.mapId);
  }, [gameState.mapId]);

  const totalInfluence = React.useCallback(
    (clanId: ClanId) => {
      return Object.values(gameState.zones).reduce(
        (sum, zone) => sum + (zone.influence[clanId] || 0),
        0
      );
    },
    [gameState.zones]
  );

  const zoneControl = React.useMemo(() => {
    const control: Record<ClanId, number> = {};
    activeZones.forEach((zone) => {
      const controller = getZoneController(zone.id, gameState);
      if (controller) {
        control[controller] = (control[controller] || 0) + 1;
      }
    });
    return control;
  }, [gameState, activeZones]);

  const topAgents = React.useMemo(() => {
    return clanList.map((clan) => {
      const players = Object.values(gameState.players)
        .filter((p) => p.clanId === clan.id)
        .sort((a, b) => b.battleScore - a.battleScore || b.streak - a.streak);
      return { clan, player: players[0] as PlayerStats | undefined };
    });
  }, [clanList, gameState.players]);

  const results = gameState.phase === "ENDED" ? calculateClanTerritoryResults(gameState) : null;
  const winningClan = results?.winningClanId
    ? clanList.find((c) => c.id === results.winningClanId) ?? gameState.clans[results.winningClanId]
    : null;
  const controlStats = React.useMemo(() => {
    if (!results) return [] as { clan: ClanMetadata; count: number }[];
    const tally: Record<string, number> = {};
    Object.values(results.zoneControl).forEach((clanId) => {
      if (!clanId) return;
      tally[clanId] = (tally[clanId] || 0) + 1;
    });
    return Object.entries(tally)
      .map(([clanId, count]) => ({
        clan:
          gameState.clans[clanId as ClanId] ||
          clanList.find((c) => c.id === clanId) || {
            id: clanId as ClanId,
            name: clanId,
            color: getClanColor(clanId),
          },
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [results, gameState.clans, clanList]);
  const topRewardLeaders = React.useMemo(() => {
    if (!results) return [] as Array<{ reward: (typeof results.playerRewards)[number]; player?: PlayerStats }>;
    return [...results.playerRewards]
      .sort((a, b) => b.coins - a.coins || b.battleScore - a.battleScore)
      .slice(0, 3)
      .map((reward) => ({
        reward,
        player: gameState.players[reward.playerId],
      }));
  }, [results, gameState.players]);

  const endgameOverlay =
    gameState.phase === "ENDED" && results ? (
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Territory Control</p>
            <p
              className="text-5xl font-black leading-tight"
              style={{ color: winningClan?.color ?? "#f1f5f9" }}
            >
              {winningClan?.name ?? "Stalemate"}
            </p>
            <p className="text-sm text-slate-400">
              {winningClan ? "Treasure secured" : "No clan held the grid"}
            </p>
          </div>
          <div className="bg-slate-900/85 backdrop-blur rounded-2xl border border-slate-700 p-3 w-48">
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400 mb-2">Active Clans</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {clanList.map((clan) => (
                <div key={clan.id} className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: clan.color }} />
                    {clan.name}
                  </span>
                  <span className="text-slate-500">
                    {controlStats.find((stat) => stat.clan.id === clan.id)?.count ?? 0}z
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 max-w-2xl">
          {controlStats.length > 0 ? (
            controlStats.map(({ clan, count }) => (
              <div
                key={clan.id}
                className="bg-slate-950/85 border border-slate-800 rounded-2xl px-4 py-2 min-w-[150px]"
              >
                <p className="text-xs uppercase tracking-wider text-slate-400">{clan.name}</p>
                <p className="text-3xl font-black" style={{ color: clan.color }}>
                  {count}
                  <span className="text-sm text-slate-400 ml-1">zones</span>
                </p>
              </div>
            ))
          ) : (
            <div className="text-slate-400 text-sm">No territory locked down.</div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Total Loot</p>
            <p className="text-2xl font-mono text-amber-300">
              {CONFIG.TOTAL_COIN_LOOT.toLocaleString()} Coins
            </p>
          </div>
          <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">XP Pool</p>
            <p className="text-2xl font-mono text-purple-300">
              {CONFIG.TOTAL_XP_LOOT.toLocaleString()} XP
            </p>
          </div>
          <div className="bg-slate-950/85 border border-slate-800 rounded-2xl p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Gem Winners</p>
            <p className="text-2xl font-mono text-cyan-300">
              {results.playerRewards.filter((reward) => reward.gems > 0).length}
            </p>
          </div>
        </div>
      </div>
    ) : null;

  const [warfeed, setWarfeed] = React.useState<WarEvent[]>([]);
  const previousState = React.useRef<ClanTerritoryGameState | null>(null);

  // Start/stop music based on game phase
  React.useEffect(() => {
    if (gameState.phase === "ACTIVE") {
      // Start background music when game becomes active
      if (audioService.isAudioEnabled() && audioService.isBgMusicEnabled()) {
        audioService.playBackgroundMusic();
      }
    } else if (gameState.phase === "ENDED" || gameState.phase === "LOBBY") {
      // Stop music when game ends or returns to lobby
      audioService.stopBackgroundMusic();
    }

    // Cleanup: stop music when component unmounts
    return () => {
      if (gameState.phase === "ACTIVE") {
        audioService.stopBackgroundMusic();
      }
    };
  }, [gameState.phase]);

  React.useEffect(() => {
    const prev = previousState.current;
    if (!prev) {
      previousState.current = gameState;
      return;
    }

    const newEvents: WarEvent[] = [];

    activeZones.forEach((zone) => {
      const prevController = getZoneController(zone.id, prev);
      const currentController = getZoneController(zone.id, gameState);
      if (prevController !== currentController) {
        const clanMeta = currentController ? gameState.clans[currentController] : prev.clans[prevController as ClanId];
        const text = currentController
          ? `${clanMeta?.name ?? "Unknown Clan"} seized ${zone.name}`
          : `${zone.name} is up for grabs`;
        newEvents.push({
          id: `${zone.id}-${Date.now()}`,
          text,
          color: clanMeta?.color,
          timestamp: Date.now(),
        });
      }
    });

    Object.values(gameState.players).forEach((player) => {
      const prevPlayer = prev.players[player.id];
      if (!prevPlayer) return;
      if (
        player.streak >= CONFIG.STREAK_BONUS_THRESHOLD &&
        player.streak > prevPlayer.streak
      ) {
        newEvents.push({
          id: `${player.id}-streak-${player.streak}`,
          text: `${player.name} hit a x${player.streak} streak for ${player.clanName}`,
          color: gameState.clans[player.clanId]?.color,
          timestamp: Date.now(),
        });
      }
    });

    if (newEvents.length > 0) {
      setWarfeed((existing) => {
        const combined = [...newEvents, ...existing];
        return combined.slice(0, 8);
      });
    }

    previousState.current = gameState;
  }, [gameState]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white p-4 gap-4 relative overflow-y-auto">

      <div className="flex flex-wrap gap-4 items-center bg-slate-900/70 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Arena Status</p>
          <h1 className="text-3xl font-black text-yellow-300">Clan Territory Battle</h1>
          <p className="text-slate-400 text-sm">Phase: {gameState.phase}</p>
        </div>
        <div className="flex-1" />
        <div className="text-center">
          <p className="text-xs uppercase text-slate-400">Countdown</p>
          <p className="text-4xl font-mono font-bold">{formatTimer(gameState.timer)}</p>
        </div>
        <div className="flex gap-2">
          {gameState.phase === "LOBBY" && (
            <button
              onClick={() => onStartGame()}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold tracking-wide"
            >
              START BATTLE
            </button>
          )}
          {gameState.phase === "ACTIVE" && (
            <button
              onClick={onEndGame}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold tracking-wide"
            >
              END EARLY
            </button>
          )}
          {gameState.phase === "ENDED" && (
            <button
              onClick={() => onStartGame(300)}
              className="px-6 py-2 bg-white text-black hover:bg-gray-200 rounded-lg font-bold tracking-wide"
            >
              DEPLOY AGAIN
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 flex flex-col gap-4 min-h-0">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex-1 min-h-0 flex flex-col">
            <ClanTerritoryMap
              zones={gameState.zones}
              clans={clansWithColors}
              hideHeader={gameState.phase === "ENDED"}
              hideLegend={gameState.phase === "ENDED"}
              overlay={endgameOverlay}
              mapId={gameState.mapId}
              containerClassName="w-full h-full flex-1"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeZones.map((zone) => {
              const zoneState = gameState.zones[zone.id];
              const influences = Object.entries(zoneState?.influence || {})
                .filter(([, val]) => val > 0)
                .map(([clanId, influence]) => ({
                  clanId: clanId as ClanId,
                  influence,
                  clan: clanList.find((c) => c.id === clanId) || gameState.clans[clanId as ClanId],
                }))
                .sort((a, b) => b.influence - a.influence);

              const total = influences.reduce((sum, { influence }) => sum + influence, 0);
              const controller = getZoneController(zone.id, gameState);
              const controllerClan = controller
                ? clanList.find((c) => c.id === controller) || gameState.clans[controller]
                : null;

              return (
                <div
                  key={zone.id}
                  className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden"
                  style={{
                    boxShadow: controllerClan ? `0 0 20px ${controllerClan.color}40` : undefined,
                  }}
                >
                  <div className="p-3 border-b border-slate-800">
                    <h3 className="font-bold text-base">{zone.name}</h3>
                    <p className="text-xs text-slate-400">
                      {controllerClan ? `${controllerClan.name} Control` : "Contested"}
                    </p>
                  </div>
                  <div className="h-4 flex w-full rounded overflow-hidden bg-slate-950">
                    {total > 0 && influences.map(({ clanId, influence, clan }) => {
                      const percent = (influence / total) * 100;
                      return (
                        <div
                          key={clanId}
                          style={{
                            width: `${percent}%`,
                            backgroundColor: clan?.color || getClanColor(clanId),
                          }}
                          className="transition-all duration-500"
                          title={`${clan?.name || clanId}: ${Math.round(percent)}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="p-3 space-y-1">
                    {influences.map(({ clanId, influence, clan }) => {
                      const percent = total > 0 ? (influence / total) * 100 : 0;
                      return (
                        <div key={clanId} className="flex justify-between text-xs">
                          <span style={{ color: clan?.color }}>{clan?.name || clanId}</span>
                          <span className="text-slate-400">{Math.round(percent)}% ({influence})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {gameState.phase === "ENDED" && results && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-4">
              {topRewardLeaders.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold mb-2">MVP Agents</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    {topRewardLeaders.map(({ reward, player }) => (
                      <div key={reward.playerId} className="bg-slate-950/60 border border-slate-800 rounded-lg p-4">
                        <p className="text-sm text-slate-400">{reward.clanName}</p>
                        <p className="text-xl font-bold">{player?.name ?? reward.playerId}</p>
                        <div className="text-sm text-amber-300">{reward.coins} coins</div>
                        <div className="text-xs text-slate-500">Battle score {reward.battleScore}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-bold mb-2">Reward Ledger</h3>
                <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-400 uppercase text-xs tracking-wider">
                      <tr>
                        <th className="px-4 py-2">Agent</th>
                        <th className="px-4 py-2">Clan</th>
                        <th className="px-4 py-2 text-right">Coins</th>
                        <th className="px-4 py-2 text-right">XP</th>
                        <th className="px-4 py-2 text-right">Gems</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...results.playerRewards]
                        .sort((a, b) => b.coins - a.coins)
                        .map((reward) => (
                          <tr key={reward.playerId} className="border-t border-slate-800">
                            <td className="px-4 py-2 font-semibold">
                              {gameState.players[reward.playerId]?.name ?? reward.playerId}
                            </td>
                            <td className="px-4 py-2 text-slate-400">{reward.clanName}</td>
                            <td className="px-4 py-2 text-right text-amber-300">{reward.coins}</td>
                            <td className="px-4 py-2 text-right text-purple-300">{reward.xp}</td>
                            <td className="px-4 py-2 text-right text-cyan-300">{reward.gems}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => onStartGame()}
                  className="px-6 py-2 bg-white text-black rounded-full font-bold tracking-wide hover:bg-gray-200"
                >
                  Deploy New Battle
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">Top Agents</h3>
              <span className="text-xs text-slate-500">live streaks & accuracy</span>
            </div>
            <div className="flex flex-col gap-3">
              {topAgents.map(({ clan, player }) => (
                <div
                  key={clan.id}
                  className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-bold" style={{ color: clan.color }}>
                      {clan.name}
                    </p>
                    {player ? (
                      <>
                        <p className="text-base font-semibold">{player.name}</p>
                        <p className="text-xs text-slate-400">
                          Streak x{player.streak} · Accuracy {player.questionsAnswered > 0
                            ? Math.round((player.questionsCorrect / player.questionsAnswered) * 100)
                            : 0}%
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">No agents deployed yet</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Battle Score</p>
                    <p className="text-xl font-mono text-white">{player?.battleScore ?? 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Warfeed</h3>
              <span className="text-xs text-slate-500">live updates</span>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-64 pr-2">
              {warfeed.length === 0 ? (
                <p className="text-sm text-slate-500">Awaiting battlefield events...</p>
              ) : (
                warfeed.map((event) => (
                  <div
                    key={event.id}
                    className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    style={{ borderLeft: `3px solid ${event.color ?? "#64748b"}` }}
                  >
                    <p>{event.text}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {(gameState.phase === "LOBBY" || gameState.phase === "ACTIVE") && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-lg font-bold mb-4 text-gray-100">
            {gameState.phase === "LOBBY" ? "Lobby" : "Active Agents"} ({Object.keys(gameState.players).length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
            {Object.values(gameState.players).map((player) => {
              const clan = clanList.find((c) => c.id === player.clanId);
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2"
                >
                  <div className="overflow-hidden">
                    <div className="font-bold text-sm truncate">{player.name}</div>
                    <div className="text-xs" style={{ color: clan?.color }}>
                      {clan?.name}
                      {gameState.phase === "ACTIVE" && (
                        <span className="text-slate-500"> · {player.battleScore} pts</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onKickPlayer(player.id)}
                    className="text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 rounded hover:bg-red-500/20"
                    title="Kick Player"
                  >
                    KICK
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
