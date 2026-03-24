import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ClanId,
  ClanMetadata,
  ClanTerritoryGameState,
  PlayerStats,
  ZoneId,
  getClanColor,
  assignSessionClanColor,
  getUsedSessionColors,
  getZonesForMap,
  BattleQuestionOption,
} from "../clanTerritoryTypes";
import { ClanTerritoryMap } from "./ClanTerritoryMap";
import { calculateClanTerritoryResults } from "../clanTerritoryRewards";
import type { MapId } from "../mapCatalog";

// Helper to get option text (handles both string and BattleQuestionOption formats)
const getOptionText = (option: string | BattleQuestionOption): string => {
  if (typeof option === 'string') return option;
  return option.text;
};

// Helper to get option image URL (handles both string and BattleQuestionOption formats)
const getOptionImageUrl = (option: string | BattleQuestionOption): string | undefined => {
  if (typeof option === 'string') return undefined;
  return option.image_url;
};

const hashSeed = (value: string) => {
  let hash = 1779033703 ^ value.length;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
};

const createSeededRandom = (seedString: string) => {
  let seed = hashSeed(seedString) || 1;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleAnswersWithSeed = <T,>(answers: T[], seed: string): T[] => {
  const random = createSeededRandom(seed);
  const result = [...answers];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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

interface ClanTerritoryStudentViewProps {
  gameState: ClanTerritoryGameState;
  playerId: string;
  roomId?: string;
  fallbackPlayer?: {
    id: string;
    name: string;
    clanId: ClanId;
    clanName: string;
  };
  onSelectZone: (zoneId: ZoneId | null) => void;
  onSubmitAnswer: (isCorrect: boolean, durationMs: number) => void;
  onRewardsClaimed?: () => Promise<void> | void;
  onExit?: () => void;
}

export const ClanTerritoryStudentView: React.FC<ClanTerritoryStudentViewProps> = ({
  gameState,
  playerId,
  roomId,
  fallbackPlayer,
  onSelectZone,
  onSubmitAnswer,
  onRewardsClaimed,
  onExit,
}) => {
  const player = gameState.players[playerId];
  const hydratedPlayer: PlayerStats | undefined = player
    ? player
    : fallbackPlayer
    ? {
        id: fallbackPlayer.id,
        name: fallbackPlayer.name,
        clanId: fallbackPlayer.clanId,
        clanName: fallbackPlayer.clanName,
        selectedZoneId: null,
        battleScore: 0,
        questionsAnswered: 0,
        questionsCorrect: 0,
        totalAnswerTimeMs: 0,
        fastAnswers: 0,
        streak: 0,
        bestStreak: 0,
      }
    : undefined;
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerStartTime, setAnswerStartTime] = useState<number>(Date.now());
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);

  // Optimistic zone override: immediately reflect zone selection/deselection in the UI
  // without waiting for the Supabase realtime round-trip (client → host → client).
  // undefined = no override (use server state)
  // null      = optimistically deselected (show zone picker)
  // ZoneId    = optimistically selected (show combat UI)
  const [localZoneOverride, setLocalZoneOverride] = useState<ZoneId | null | undefined>(undefined);
  const zoneOverrideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply an optimistic override and schedule an automatic rollback after 5 s.
  // If the server confirms the change before that, the effect below cancels the timer.
  const applyLocalZoneOverride = useCallback((id: ZoneId | null) => {
    if (zoneOverrideTimeoutRef.current !== null) {
      clearTimeout(zoneOverrideTimeoutRef.current);
    }
    setLocalZoneOverride(id);
    zoneOverrideTimeoutRef.current = setTimeout(() => {
      zoneOverrideTimeoutRef.current = null;
      setLocalZoneOverride(undefined); // revert to server state on timeout (send failed/dropped)
    }, 5000);
  }, []);

  // Clear the optimistic override once the server state has caught up
  useEffect(() => {
    if (localZoneOverride === undefined) return;
    const serverZoneId = hydratedPlayer?.selectedZoneId ?? null;
    if (serverZoneId === localZoneOverride) {
      if (zoneOverrideTimeoutRef.current !== null) {
        clearTimeout(zoneOverrideTimeoutRef.current);
        zoneOverrideTimeoutRef.current = null;
      }
      setLocalZoneOverride(undefined);
    }
  }, [hydratedPlayer?.selectedZoneId, localZoneOverride]);

  // Always reset local override when leaving ACTIVE phase (game over / lobby)
  useEffect(() => {
    if (gameState.phase !== 'ACTIVE') {
      if (zoneOverrideTimeoutRef.current !== null) {
        clearTimeout(zoneOverrideTimeoutRef.current);
        zoneOverrideTimeoutRef.current = null;
      }
      setLocalZoneOverride(undefined);
    }
  }, [gameState.phase]);

  // Cleanup rollback timer on unmount
  useEffect(() => {
    return () => {
      if (zoneOverrideTimeoutRef.current !== null) {
        clearTimeout(zoneOverrideTimeoutRef.current);
      }
    };
  }, []);

  // The authoritative zone used for rendering — local override takes priority
  const effectiveZoneId: ZoneId | null =
    localZoneOverride !== undefined ? localZoneOverride : (hydratedPlayer?.selectedZoneId ?? null);
  // Stable key for tracking whether rewards have been claimed for this game session.
  // Uses roomId (stable from join) + playerId. Falls back to gameStartTime if roomId unavailable.
  const rewardStorageKey = React.useMemo(() => {
    const sessionId = roomId ?? (gameState.gameStartTime ? String(gameState.gameStartTime) : null);
    if (!sessionId) return null; // Not ready yet
    return `ct-rewards-claimed:${sessionId}:${playerId}`;
  }, [roomId, gameState.gameStartTime, playerId]);

  const [rewardsClaimed, setRewardsClaimed] = useState(() => {
    // Try to read from sessionStorage using roomId-based key (available immediately)
    if (typeof window !== 'undefined' && roomId) {
      const key = `ct-rewards-claimed:${roomId}:${playerId}`;
      return sessionStorage.getItem(key) === '1';
    }
    return false;
  });

  // Re-check sessionStorage whenever the key stabilises (e.g. gameStartTime arrives)
  useEffect(() => {
    if (!rewardStorageKey || rewardsClaimed) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem(rewardStorageKey) === '1') {
      setRewardsClaimed(true);
    }
  }, [rewardStorageKey, rewardsClaimed]);

  // Ref guard to prevent double reward claiming across rapid re-renders
  const rewardClaimStartedRef = useRef(false);
  const [claimingRewards, setClaimingRewards] = useState(false);
  const lastQuestionKeyRef = useRef<string | null>(null);
  const clanList = React.useMemo(() => {
    // Prefer clans from engine state (session-assigned colors)
    const known = Object.values(gameState.clans).map((clan) => ({
      ...clan,
      color: clan.color || getClanColor(clan.id),
    }));
    if (known.length > 0) {
      return [...known].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Fallback: derive from players/zones with session-aware unique colors
    const derived = new Map<ClanId, ClanMetadata>();
    const usedColors = new Set<string>();

    const addClan = (clanId: ClanId, name: string) => {
      if (derived.has(clanId)) return;
      const color = assignSessionClanColor(clanId, usedColors);
      usedColors.add(color);
      derived.set(clanId, { id: clanId, name, color });
    };

    Object.values(gameState.players).forEach((p) => {
      addClan(p.clanId, p.clanName);
    });

    Object.values(gameState.zones).forEach((zone) => {
      Object.keys(zone.influence).forEach((clanId) => {
        addClan(clanId as ClanId, clanId);
      });
    });

    return [...derived.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [gameState.clans, gameState.players, gameState.zones]);

  // Get the correct zones based on mapId
  const activeZones = React.useMemo(() => {
    return getZonesForMap((gameState.mapId || 'default') as MapId);
  }, [gameState.mapId]);

  const getZoneSnapshot = React.useCallback(
    (zoneId: ZoneId) => {
      const zoneState = gameState.zones[zoneId];
      if (!zoneState) {
        return { controller: null as ClanId | null, percent: 0, total: 0 };
      }
      const ordered = Object.entries(zoneState.influence)
        .filter(([, val]) => val > 0)
        .sort((a, b) => b[1] - a[1]);
      const leader = ordered[0];
      const total = ordered.reduce((sum, [, val]) => sum + val, 0);
      return {
        controller: leader ? (leader[0] as ClanId) : null,
        percent: total > 0 && leader ? leader[1] / total : 0,
        total,
      };
    },
    [gameState.zones]
  );

  const priorityTargets = React.useMemo(() => {
    return activeZones.map((zone) => {
      const snapshot = getZoneSnapshot(zone.id);
      const needsHelp = hydratedPlayer ? snapshot.controller !== hydratedPlayer.clanId : true;
      return {
        zone,
        snapshot,
        needsHelp,
      };
    })
      .sort((a, b) => {
        if (a.needsHelp === b.needsHelp) {
          return b.snapshot.percent - a.snapshot.percent;
        }
        return a.needsHelp ? -1 : 1;
      })
      .slice(0, 3);
  }, [getZoneSnapshot, hydratedPlayer, activeZones]);

  const currentQuestion = gameState.questions.length > 0
    ? gameState.questions[questionIndex % gameState.questions.length]
    : null;

  const currentQuestionKey = currentQuestion
    ? currentQuestion.id ?? `${questionIndex}-${currentQuestion.question_text}`
    : null;

  const shuffledAnswers = React.useMemo(() => {
    if (!currentQuestion || !currentQuestionKey) return [];

    let allAnswers: (string | BattleQuestionOption)[];
    if (currentQuestion.options && currentQuestion.options.length > 0) {
      allAnswers = currentQuestion.options;
    } else if (currentQuestion.wrong_answers) {
      allAnswers = [currentQuestion.correct_answer, ...currentQuestion.wrong_answers];
    } else {
      allAnswers = [currentQuestion.correct_answer];
    }

    return shuffleAnswersWithSeed(allAnswers, currentQuestionKey);
  }, [currentQuestion, currentQuestionKey]);

  useEffect(() => {
    if (!currentQuestionKey) return;
    if (lastQuestionKeyRef.current !== currentQuestionKey) {
      lastQuestionKeyRef.current = currentQuestionKey;
      setAnswerStartTime(Date.now());
      setFeedback(null);
    }
  }, [currentQuestionKey]);

  useEffect(() => {
    if (gameState.phase !== "ACTIVE") {
      lastQuestionKeyRef.current = null;
    }
  }, [gameState.phase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Initialize first question when entering active phase
  useEffect(() => {
    if (gameState.phase === "ACTIVE" && gameState.questions.length > 0) {
      setQuestionIndex(0);
    }
  }, [gameState.phase, gameState.questions.length]);

  const clansWithColors = React.useMemo(() => {
    const map: Record<ClanId, ClanMetadata> = {};
    clanList.forEach((c) => {
      map[c.id] = c; // color already assigned in clanList
    });
    return map;
  }, [clanList]);

  useEffect(() => {
    if (
      gameState.phase === "ENDED" &&
      gameState.endReason !== "TEACHER_DISMISSED" &&
      !rewardsClaimed &&
      !claimingRewards &&
      !rewardClaimStartedRef.current &&
      rewardStorageKey &&
      hydratedPlayer
    ) {
      const results = calculateClanTerritoryResults(gameState);
      const myReward = results.playerRewards.find((r) => r.playerId === playerId);
      if (myReward && (myReward.coins > 0 || myReward.xp > 0 || myReward.gems > 0)) {
        console.log("Claiming rewards:", myReward);
        rewardClaimStartedRef.current = true;
        setClaimingRewards(true);
        
        Promise.reject(new Error("Clan territory reward claim is temporarily disabled pending server-verified reward events"))
          .then(() => {
            setRewardsClaimed(true);
            if (typeof window !== 'undefined' && rewardStorageKey) {
              sessionStorage.setItem(rewardStorageKey, '1');
            }
            setClaimingRewards(false);
            if (onRewardsClaimed) {
              void Promise.resolve(onRewardsClaimed());
            }
          })
          .catch((err) => {
            console.error("Failed to claim rewards:", err);
            rewardClaimStartedRef.current = false; // allow retry on error
            setClaimingRewards(false);
          });
      } else if (myReward) {
        console.log("No rewards to claim (zero amounts)");
        rewardClaimStartedRef.current = true;
        setRewardsClaimed(true);
        if (typeof window !== 'undefined' && rewardStorageKey) {
          sessionStorage.setItem(rewardStorageKey, '1');
        }
      }
    }
  }, [gameState.phase, gameState.endReason, playerId, rewardsClaimed, claimingRewards, rewardStorageKey, hydratedPlayer]);

  const handleAnswerClick = (selectedAnswer: string) => {
    if (!currentQuestion) return;
    if (feedback !== null) return; // Prevent double-clicking

    const durationMs = Date.now() - answerStartTime;
    const isCorrect = selectedAnswer === currentQuestion.correct_answer;

    console.log('[StudentView] Answer clicked:', { selectedAnswer, isCorrect, durationMs, selectedZoneId: hydratedPlayer?.selectedZoneId });
    
    onSubmitAnswer(isCorrect, durationMs);
    setFeedback(isCorrect ? "correct" : "incorrect");
    
    // Clear feedback and move to next question
    setTimeout(() => {
      setFeedback(null);
      setQuestionIndex((prev) => prev + 1);
    }, 1200);
  };

  if (!hydratedPlayer) return <div className="text-white p-4">Loading player data...</div>;

  const myClan =
    clanList.find((c) => c.id === hydratedPlayer.clanId) ?? gameState.clans[hydratedPlayer.clanId];

  const handleBackToArenas = React.useCallback(() => {
    if (onExit) {
      onExit();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [onExit]);

  // 1. Lobby Phase
  if (gameState.phase === "LOBBY") {
    return (
      <div className="flex flex-col h-full bg-gray-950 text-white p-6 gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-black text-yellow-300 mb-2">Prepare for Battle</h1>
          <p className="text-lg text-slate-300">
            You are fighting for <span style={{ color: myClan?.color }}>{myClan?.name}</span>
          </p>
          <p className="text-slate-500 text-sm">Awaiting teacher to arm the arena...</p>
        </div>
        <div className="flex-1 min-h-0">
          <ClanTerritoryMap
            zones={gameState.zones}
            clans={clansWithColors}
            mapId={gameState.mapId}
            containerClassName="w-full h-full"
            showControls={false}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 text-center shrink-0">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs uppercase text-slate-400">Agents Online</p>
            <p className="text-3xl font-mono">{Object.keys(gameState.players).length}</p>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs uppercase text-slate-400">Clan</p>
            <p className="text-xl font-bold" style={{ color: myClan?.color }}>{myClan?.name}</p>
          </div>
        </div>
        <div className="text-center text-slate-400 animate-pulse shrink-0">
          Scanning... the battlefield unlocks once the teacher starts the raid.
        </div>
      </div>
    );
  }

  // 2. Active Phase - Zone Selection
  if (gameState.phase === "ACTIVE" && !effectiveZoneId) {
    return (
      <div className="flex flex-col h-full bg-gray-950 text-white overflow-hidden">
        <div className="p-4 border-b border-gray-800 shrink-0">
          <h2 className="text-2xl font-bold text-center text-yellow-300">Select a Zone to Reinforce</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-4xl mx-auto">
            {activeZones.map((zone) => {
              const zoneState = gameState.zones[zone.id];
              const zoneTotal = zoneState ? Object.values(zoneState.influence).reduce((a, b) => a + b, 0) : 0;
              const snapshot = getZoneSnapshot(zone.id);
              const holder = snapshot.controller ? clanList.find((c) => c.id === snapshot.controller) : null;
              const myClanInfluence = zoneState?.influence[hydratedPlayer.clanId] || 0;
              const myPercent = zoneTotal > 0 ? (myClanInfluence / zoneTotal) * 100 : 0;

              return (
                <button
                  key={zone.id}
                  onClick={() => {
                    console.log('[ZoneSelection] Zone clicked:', zone.id);
                    applyLocalZoneOverride(zone.id); // optimistic: switch UI immediately
                    onSelectZone(zone.id);
                  }}
                  className="relative bg-slate-900/70 border-2 border-slate-700 rounded-xl p-3 hover:border-yellow-400 hover:bg-slate-800/70 transition-all text-left cursor-pointer active:scale-95"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-sm text-white">{zone.name}</h3>
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-mono">
                      {zone.baseValue}
                    </span>
                  </div>
                  
                  {/* Control bar */}
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden mb-2">
                    {clanList.map((clan) => {
                      const influence = zoneState?.influence[clan.id] || 0;
                      const percent = zoneTotal > 0 ? (influence / zoneTotal) * 100 : 0;
                      if (percent === 0) return null;
                      return (
                        <div
                          key={clan.id}
                          className="h-full float-left"
                          style={{ width: `${percent}%`, backgroundColor: clan.color }}
                        />
                      );
                    })}
                  </div>
                  
                  <p className="text-xs text-slate-400">
                    {holder ? (
                      <span style={{ color: holder.color }}>{holder.name} {Math.round(snapshot.percent * 100)}%</span>
                    ) : (
                      'Unclaimed'
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Bottom Map Preview */}
        <div className="shrink-0 border-t border-gray-800 bg-gray-900/50 p-3">
          <div className="max-w-md mx-auto">
            <ClanTerritoryMap
              zones={gameState.zones}
              clans={clansWithColors}
              mapId={gameState.mapId}
              hideHeader
              hideLegend
              showControls={false}
            />
          </div>
        </div>
      </div>
    );
  }

  // 3. Active Phase - Combat (Answering Questions) - WITH LIVE MAP
  if (gameState.phase === "ACTIVE" && effectiveZoneId) {
    const zone = activeZones.find((z) => z.id === effectiveZoneId);
    const zoneState = gameState.zones[effectiveZoneId];
    const zoneTotal = zoneState ? Object.values(zoneState.influence).reduce((a, b) => a + b, 0) : 0;
    
    return (
      <div className="flex flex-col h-full bg-gray-950 text-white overflow-hidden">
        {/* Compact HUD Header */}
        <div className="bg-gray-900/90 backdrop-blur px-4 py-2 border-b border-gray-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Zone</div>
              <div className="font-bold text-yellow-400 text-sm">{zone?.name}</div>
            </div>
            <div className="h-8 w-px bg-gray-700" />
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Streak</div>
              <div className="font-bold text-orange-500">x{hydratedPlayer.streak}</div>
            </div>
            <div className="h-8 w-px bg-gray-700" />
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Score</div>
              <div className="font-bold text-cyan-400">{hydratedPlayer.battleScore}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Time Left</div>
              <div className="font-mono text-sm text-emerald-300">
                {formatTimer(gameState.timer)}
              </div>
            </div>
            <button
              onClick={() => {
                console.log('[StudentView] SWITCH ZONE clicked - deselecting zone');
                applyLocalZoneOverride(null); // optimistic: show zone picker immediately
                onSelectZone(null as any);
              }}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              SWITCH ZONE
            </button>
          </div>
        </div>

        {/* Main Content Area - Optimized for Mobile & Desktop */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden gap-0 lg:gap-0">
          
          {/* Mobile: Map + Zone Info (Full width, stacked) */}
          <div className="lg:hidden flex flex-col gap-2 bg-gray-900/50 border-b border-gray-800 p-3 shrink-0 h-auto">
            {/* Map - Fit to available space with aspect ratio */}
            <div
              className="w-full min-h-[45vh] bg-slate-950 rounded-lg overflow-hidden"
              style={{ aspectRatio: "16/9", maxHeight: "300px" }}
            >
              <ClanTerritoryMap 
                zones={gameState.zones} 
                clans={clansWithColors} 
                mapId={gameState.mapId}
                hideHeader
                hideLegend
                containerClassName="w-full h-full"
                showControls={false}
              />
            </div>
            
            {/* Zone Control Data */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{zone?.name} Control</h4>
              <div className="h-2 flex rounded-full overflow-hidden bg-gray-700 mb-2">
                {clanList.map((clan) => {
                  const influence = zoneState?.influence[clan.id] || 0;
                  const percent = zoneTotal > 0 ? (influence / zoneTotal) * 100 : 0;
                  if (percent === 0) return null;
                  return (
                    <div 
                      key={clan.id}
                      style={{ width: `${percent}%`, backgroundColor: clan.color }}
                      className="h-full transition-all duration-500"
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                {clanList.map((clan) => {
                  const influence = zoneState?.influence[clan.id] || 0;
                  const percent = zoneTotal > 0 ? (influence / zoneTotal) * 100 : 0;
                  return (
                    <div key={clan.id} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: clan.color }} />
                      <span className="text-gray-400 truncate">{clan.name}</span>
                      <span className="text-gray-500 font-mono ml-auto">{Math.round(percent)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Desktop: Full Map Panel */}
          <div className="hidden lg:flex lg:w-1/2 xl:w-[45%] shrink-0 bg-gray-900/50 lg:border-r border-gray-800 p-4 flex-col">
            {/* Desktop: Full map with legend */}
            <div className="flex flex-col h-full">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Live Battle Map
              </h3>
              <div className="flex-1 min-h-0 w-full">
                <ClanTerritoryMap 
                  zones={gameState.zones} 
                  clans={clansWithColors} 
                  mapId={gameState.mapId}
                  hideHeader
                  hideLegend
                  containerClassName="w-full h-full"
                  showControls={false}
                />
              </div>
              
              {/* Zone Control Legend */}
              <div className="mt-3 pt-3 border-t border-gray-800">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                  {zone?.name} Control
                </h4>
                <div className="h-2 flex rounded-full overflow-hidden bg-gray-800 mb-2">
                  {clanList.map((clan) => {
                    const influence = zoneState?.influence[clan.id] || 0;
                    const percent = zoneTotal > 0 ? (influence / zoneTotal) * 100 : 0;
                    if (percent === 0) return null;
                    return (
                      <div 
                        key={clan.id}
                        style={{ width: `${percent}%`, backgroundColor: clan.color }}
                        className="h-full transition-all duration-500"
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {clanList.map((clan) => {
                    const influence = zoneState?.influence[clan.id] || 0;
                    const percent = zoneTotal > 0 ? (influence / zoneTotal) * 100 : 0;
                    return (
                      <div key={clan.id} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: clan.color }} />
                        <span className="text-xs text-gray-400 truncate">{clan.name}</span>
                        <span className="text-xs font-mono text-gray-500 ml-auto">{Math.round(percent)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Zone Switcher */}
              <div className="mt-3 pt-3 border-t border-gray-800">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Quick Switch</h4>
                <div className={`grid gap-1.5 ${activeZones.length > 6 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {activeZones.map((z) => {
                    const snapshot = getZoneSnapshot(z.id);
                    const isCurrentZone = z.id === effectiveZoneId;
                    const holder = snapshot.controller ? clanList.find((c) => c.id === snapshot.controller) : null;
                    return (
                      <button
                        key={z.id}
                        onClick={() => {
                          console.log('[StudentView] Quick Switch clicked:', z.id);
                          applyLocalZoneOverride(z.id); // optimistic: switch UI immediately
                          onSelectZone(z.id);
                        }}
                        disabled={isCurrentZone}
                        className={`p-2 rounded-lg text-left text-xs transition ${
                          isCurrentZone 
                            ? 'bg-yellow-500/20 border border-yellow-500/50 cursor-default' 
                            : 'bg-gray-800/50 border border-gray-700 hover:border-gray-500 hover:bg-gray-700/50 cursor-pointer'
                        }`}
                      >
                        <div className="font-semibold text-white truncate">{z.name}</div>
                        <div className="text-gray-500 truncate">
                          {holder ? `${holder.name.length > 8 ? holder.name.slice(0, 8) + '...' : holder.name} ${Math.round(snapshot.percent * 100)}%` : 'Unclaimed'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: Quick Zone Buttons */}
          <div className="lg:hidden flex gap-1 bg-gray-900/50 border-b border-gray-800 p-2 overflow-x-auto shrink-0">
            {activeZones.map((z) => {
              const snapshot = getZoneSnapshot(z.id);
              const isCurrentZone = z.id === effectiveZoneId;
              const holder = snapshot.controller ? clanList.find((c) => c.id === snapshot.controller) : null;
              return (
                <button
                  key={z.id}
                  onClick={() => {
                    console.log('[StudentView] Mobile Quick Switch clicked:', z.id);
                    applyLocalZoneOverride(z.id); // optimistic: switch UI immediately
                    onSelectZone(z.id);
                  }}
                  disabled={isCurrentZone}
                  className={`flex-shrink-0 px-2 py-1 rounded text-left text-[9px] transition min-w-[90px] ${
                    isCurrentZone 
                      ? 'bg-yellow-500/30 border border-yellow-500/60 cursor-default' 
                      : 'bg-gray-800/60 border border-gray-700 hover:border-gray-500 hover:bg-gray-700/60 cursor-pointer'
                  }`}
                >
                  <div className="font-semibold text-white truncate text-[10px]">{z.name}</div>
                  <div className="text-gray-500 truncate text-[8px]">
                    {holder ? `${holder.name.slice(0, 6)}... ${Math.round(snapshot.percent * 100)}%` : 'Unclaimed'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Question Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 lg:p-6">
              {currentQuestion ? (
                <div className="max-w-2xl mx-auto">
                  {/* Question Text */}
                  <div className="text-xl lg:text-2xl font-bold mb-4 text-center">
                    {currentQuestion.question_text}
                  </div>
                  
                  {/* Question Image */}
                  {currentQuestion.image_url && (
                    <div className="mb-4 flex justify-center">
                      <img
                        src={currentQuestion.image_url}
                        alt="Question"
                        className="max-w-full max-h-36 lg:max-h-48 rounded-lg border border-gray-700 object-contain"
                      />
                    </div>
                  )}
                  
                  {/* Answer Options */}
                  <div className="grid gap-2 lg:gap-3">
                    {shuffledAnswers.map((answer, idx) => {
                      const answerText = getOptionText(answer);
                      const answerImageUrl = getOptionImageUrl(answer);
                      const isSelected = feedback !== null;
                      const isCorrect = answerText === currentQuestion.correct_answer;
                      const showResult = isSelected && isCorrect;
                      const showWrong = isSelected && !isCorrect && feedback === "incorrect";
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => handleAnswerClick(answerText)}
                          disabled={feedback !== null}
                          className={`p-3 lg:p-4 rounded-xl text-left text-base lg:text-lg font-semibold transition-all ${
                            showResult ? "bg-green-600 border-green-400" :
                            showWrong ? "bg-red-600 border-red-400" :
                            "bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-blue-500"
                          } border-2 disabled:cursor-not-allowed`}
                        >
                          <div className="flex flex-col">
                            <span>{answerText}</span>
                            {answerImageUrl && (
                              <img
                                src={answerImageUrl}
                                alt={`Option ${idx + 1}`}
                                className="mt-2 max-h-16 lg:max-h-20 rounded border border-gray-600 object-contain"
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-xl text-gray-400">
                    Waiting for questions to load...
                  </div>
                </div>
              )}
            </div>

            {/* Compact Stats Footer */}
            <div className="bg-gray-900/80 backdrop-blur px-4 py-2 border-t border-gray-800 flex items-center justify-center gap-6 text-sm shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Answered:</span>
                <span className="font-bold text-white">{hydratedPlayer.questionsAnswered}</span>
              </div>
              <div className="h-4 w-px bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Accuracy:</span>
                <span className="font-bold text-white">
                  {hydratedPlayer.questionsAnswered > 0
                    ? Math.round((hydratedPlayer.questionsCorrect / hydratedPlayer.questionsAnswered) * 100)
                    : 0}%
                </span>
              </div>
              <div className="h-4 w-px bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Best Streak:</span>
                <span className="font-bold text-orange-400">x{hydratedPlayer.bestStreak}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Ended Phase
  if (gameState.phase === "ENDED" && gameState.endReason === "TEACHER_DISMISSED") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Session Update</p>
            <h1 className="text-4xl font-black tracking-tight text-white">Arena dismissed</h1>
            <p className="text-lg text-slate-300">The arena was dismissed by the teacher.</p>
            <p className="text-sm text-slate-500">Please return to the menu to join another arena.</p>
            <div className="pt-2">
              <button
                onClick={handleBackToArenas}
                className="px-6 py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition"
              >
                Back to Arenas
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const results = gameState.phase === "ENDED" ? calculateClanTerritoryResults(gameState) : null;
  const myReward = results?.playerRewards.find((r) => r.playerId === playerId);
  const wonRewards = myReward && (myReward.coins > 0 || myReward.xp > 0 || myReward.gems > 0);
  const winningClan = results?.winningClanId
    ? clanList.find((c) => c.id === results.winningClanId) ?? gameState.clans[results.winningClanId]
    : null;
  const accuracy = hydratedPlayer.questionsAnswered > 0
    ? Math.round((hydratedPlayer.questionsCorrect / hydratedPlayer.questionsAnswered) * 100)
    : 0;
  const clanZoneCount = results
    ? Object.values(results.zoneControl).filter((clanId) => clanId === hydratedPlayer.clanId).length
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Operation Complete</p>
          <h1 className="text-4xl font-black tracking-tight">Battle debrief</h1>
          {winningClan ? (
            <p className="text-lg text-slate-300">
              {winningClan.id === hydratedPlayer.clanId
                ? "Your clan secured the grid."
                : `${winningClan.name} claimed the grid.`}
            </p>
          ) : (
            <p className="text-lg text-slate-300">The grid remains contested.</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 text-center space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Battle Score</p>
            <p className="text-5xl font-black text-amber-300">{hydratedPlayer.battleScore}</p>
            <p className="text-sm text-slate-400">Accuracy {accuracy}% - Best streak x{hydratedPlayer.streak}</p>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Zone Impact</p>
            <div className="text-4xl font-black text-emerald-300">{clanZoneCount}/{activeZones.length}</div>
            <p className="text-sm text-slate-400">Territories held by {hydratedPlayer.clanName}</p>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${(clanZoneCount / activeZones.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Intel</p>
            <p className="text-sm text-slate-300">
              {hydratedPlayer.questionsAnswered} Questions - {hydratedPlayer.fastAnswers} speed bonuses
            </p>
            <p className="text-sm text-slate-400">
              Total answer time {Math.round(hydratedPlayer.totalAnswerTimeMs / 1000)}s
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {wonRewards && myReward ? (
            <div className="bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border border-yellow-500/40 rounded-2xl p-6 space-y-4">
              <h2 className="text-2xl font-bold text-yellow-200">Rewards delivered</h2>
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div>
                  <p className="text-3xl font-black text-amber-300">{myReward.coins}</p>
                  <p className="text-slate-400 uppercase tracking-widest text-[0.6rem]">Coins</p>
                </div>
                <div>
                  <p className="text-3xl font-black text-purple-300">{myReward.xp}</p>
                  <p className="text-slate-400 uppercase tracking-widest text-[0.6rem]">XP</p>
                </div>
                <div>
                  <p className="text-3xl font-black text-cyan-300">{myReward.gems}</p>
                  <p className="text-slate-400 uppercase tracking-widest text-[0.6rem]">Gems</p>
                </div>
              </div>
              {claimingRewards && <p className="text-xs text-yellow-200">Processing rewards...</p>}
              {rewardsClaimed && <p className="text-xs text-emerald-300">✓ Added to your vault</p>}
            </div>
          ) : (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-2 text-slate-400">
              <h2 className="text-xl font-bold text-white">No payout this time</h2>
              <p>Stay ready. Bonus loot drops once you break the leaderboard.</p>
            </div>
          )}

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Next Orders</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>- Review raid intel with your clan lead.</li>
              <li>- Spend coins and gems before the next deployment.</li>
              <li>- Stay logged in - teachers can redeploy instantly.</li>
            </ul>
          </div>
        </div>

        <div className="text-center text-sm text-slate-500">
          Awaiting next raid signal… keep the comms tab open.
        </div>
      </div>
    </div>
  );
};
