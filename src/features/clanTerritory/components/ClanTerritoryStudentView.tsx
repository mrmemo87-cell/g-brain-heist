import React, { useState, useEffect } from "react";
import {
  ClanId,
  ClanMetadata,
  ClanTerritoryGameState,
  PlayerStats,
  ZONES,
  ZoneId,
  getClanColor,
} from "../clanTerritoryTypes";
import { ClanTerritoryMap } from "./ClanTerritoryMap";
import { calculateClanTerritoryResults } from "../clanTerritoryRewards";

interface ClanTerritoryStudentViewProps {
  gameState: ClanTerritoryGameState;
  playerId: string;
  fallbackPlayer?: {
    id: string;
    name: string;
    clanId: ClanId;
    clanName: string;
  };
  onSelectZone: (zoneId: ZoneId | null) => void;
  onSubmitAnswer: (isCorrect: boolean, durationMs: number) => void;
}

export const ClanTerritoryStudentView: React.FC<ClanTerritoryStudentViewProps> = ({
  gameState,
  playerId,
  fallbackPlayer,
  onSelectZone,
  onSubmitAnswer,
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
  const [shuffledAnswers, setShuffledAnswers] = useState<string[]>([]);
  const [answerStartTime, setAnswerStartTime] = useState<number>(Date.now());
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [rewardsClaimed, setRewardsClaimed] = useState(false);
  const [claimingRewards, setClaimingRewards] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const clanList = React.useMemo(() => {
    const known = Object.values(gameState.clans);
    if (known.length > 0) {
      return [...known].sort((a, b) => a.name.localeCompare(b.name));
    }

    const derived = new Map<ClanId, ClanMetadata>();
    Object.values(gameState.players).forEach((p) => {
      if (!derived.has(p.clanId)) {
        derived.set(p.clanId, {
          id: p.clanId,
          name: p.clanName,
          color: getClanColor(p.clanId),
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
    return ZONES.map((zone) => {
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
  }, [getZoneSnapshot, hydratedPlayer]);

  // Shuffle answers when question changes
  useEffect(() => {
    if (gameState.questions.length > 0) {
      const currentQ = gameState.questions[questionIndex % gameState.questions.length];
      
      // Handle both formats: options array OR correct_answer + wrong_answers
      let allAnswers: string[];
      if (currentQ.options && currentQ.options.length > 0) {
        allAnswers = currentQ.options;
      } else if (currentQ.wrong_answers) {
        allAnswers = [currentQ.correct_answer, ...currentQ.wrong_answers];
      } else {
        // Fallback: just show correct answer
        allAnswers = [currentQ.correct_answer];
      }
      
      const shuffled = [...allAnswers].sort(() => Math.random() - 0.5);
      setShuffledAnswers(shuffled);
      setAnswerStartTime(Date.now());
    }
  }, [questionIndex, gameState.questions]);

  const currentQuestion = gameState.questions.length > 0
    ? gameState.questions[questionIndex % gameState.questions.length]
    : null;

  // Initialize first question when entering active phase
  useEffect(() => {
    if (gameState.phase === "ACTIVE" && gameState.questions.length > 0) {
      setQuestionIndex(0);
    }
  }, [gameState.phase, gameState.questions.length]);

  useEffect(() => {
    if (gameState.phase === "ENDED" && !rewardsClaimed && !claimingRewards && hydratedPlayer) {
      const results = calculateClanTerritoryResults(gameState);
      const myReward = results.playerRewards.find((r) => r.playerId === playerId);
      if (myReward && (myReward.coins > 0 || myReward.xp > 0 || myReward.gems > 0)) {
        console.log("Claiming rewards:", myReward);
        setClaimingRewards(true);
        
        // Direct Supabase RPC call (fallback for Vite dev environment without API routing)
        import("../../../../services/supabaseClient").then(async ({ supabase }) => {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError || !user) {
            throw new Error("Not authenticated");
          }
          return supabase.rpc("claim_clan_territory_rewards", {
            p_student_id: user.id,
            p_room_id: "clan-territory-session",
            p_player_id: playerId,
            p_coins: myReward.coins,
            p_xp: myReward.xp,
            p_gems: myReward.gems,
            p_battle_score: myReward.battleScore,
            p_questions_correct: myReward.questionsCorrect,
            p_questions_answered: myReward.questionsAnswered,
          });
        })
          .then(({ data, error }) => {
            if (error) throw error;
            console.log("Rewards claimed:", data);
            setRewardsClaimed(true);
            setClaimingRewards(false);
          })
          .catch((err) => {
            console.error("Failed to claim rewards:", err);
            setClaimingRewards(false);
          });
      } else if (myReward) {
        console.log("No rewards to claim (zero amounts)");
        setRewardsClaimed(true);
      }
    }
  }, [gameState.phase, playerId, rewardsClaimed, claimingRewards, hydratedPlayer]);

  const handleAnswerClick = (selectedAnswer: string) => {
    if (!currentQuestion) return;

    const durationMs = Date.now() - answerStartTime;
    const isCorrect = selectedAnswer === currentQuestion.correct_answer;

    onSubmitAnswer(isCorrect, durationMs);
    setFeedback(isCorrect ? "correct" : "incorrect");
    
    // Clear feedback and move to next question
    setTimeout(() => {
      setFeedback(null);
      setQuestionIndex((prev) => prev + 1);
    }, 1000);
  };

  if (!hydratedPlayer) return <div className="text-white p-4">Loading player data...</div>;

  const myClan =
    clanList.find((c) => c.id === hydratedPlayer.clanId) ?? gameState.clans[hydratedPlayer.clanId];

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
        <ClanTerritoryMap zones={gameState.zones} clans={gameState.clans} />
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs uppercase text-slate-400">Agents Online</p>
            <p className="text-3xl font-mono">{Object.keys(gameState.players).length}</p>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs uppercase text-slate-400">Clan</p>
            <p className="text-xl font-bold" style={{ color: myClan?.color }}>{myClan?.name}</p>
          </div>
        </div>
        <div className="text-center text-slate-400 animate-pulse">
          Scanning... the battlefield unlocks once the teacher starts the raid.
        </div>
      </div>
    );
  }

  // 2. Active Phase - Zone Selection
  if (gameState.phase === "ACTIVE" && !hydratedPlayer.selectedZoneId) {
    return (
      <div className="flex flex-col h-full bg-gray-950 text-white p-4 gap-4">
        <h2 className="text-3xl font-bold text-center text-yellow-300">Select a Zone to Reinforce</h2>
        <div className="grid lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
          <div className="lg:col-span-2 overflow-y-auto pr-2 flex flex-col gap-4">
            {ZONES.map((zone) => {
              const zoneState = gameState.zones[zone.id];
              const zoneTotal = zoneState ? Object.values(zoneState.influence).reduce((a, b) => a + b, 0) : 0;
              const snapshot = getZoneSnapshot(zone.id);
              const holder = snapshot.controller ? clanList.find((c) => c.id === snapshot.controller) : null;

              return (
                <button
                  key={zone.id}
                  onClick={() => onSelectZone(zone.id)}
                  className="relative bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden flex flex-col hover:border-yellow-400 transition-all text-left group"
                >
                  <div className="p-4 flex justify-between items-center border-b border-slate-800">
                    <div>
                      <p className="text-sm uppercase text-slate-400">{holder ? `${holder.name} control ${Math.round(snapshot.percent * 100)}%` : "Unclaimed"}</p>
                      <h3 className="font-bold text-2xl">{zone.name}</h3>
                    </div>
                    <span className="text-xs bg-slate-950 px-3 py-1 rounded-full text-yellow-400 font-mono">
                      {zone.baseValue} pts
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {clanList.map((clan) => {
                      const influence = zoneState?.influence[clan.id] || 0;
                      const percent = zoneTotal > 0 ? (influence / zoneTotal) * 100 : 0;

                      return (
                        <div key={clan.id} className="w-full">
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: clan.color }} className="font-bold">{clan.name}</span>
                            <span className="text-gray-400">{influence}</span>
                          </div>
                          <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all duration-500 ease-out"
                              style={{
                                width: `${percent}%`,
                                backgroundColor: clan.color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="absolute inset-0 bg-yellow-500/0 group-hover:bg-yellow-500/5 transition-colors pointer-events-none" />
                </button>
              );
            })}
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
            <h3 className="text-lg font-bold text-center">Battle Map</h3>
            <ClanTerritoryMap zones={gameState.zones} clans={gameState.clans} />
            <div>
              <p className="text-xs uppercase text-slate-400 mb-2">Targets needing reinforcements</p>
              <div className="flex flex-col gap-2">
                {priorityTargets.map(({ zone, snapshot, needsHelp }) => (
                  <div key={zone.id} className={`p-3 rounded-xl border ${needsHelp ? "border-yellow-400" : "border-slate-800"} bg-slate-950/60`}>
                    <p className="font-semibold">{zone.name}</p>
                    <p className="text-xs text-slate-400">
                      {snapshot.controller ? `${clanList.find((c) => c.id === snapshot.controller)?.name ?? "Unknown"}` : "Unclaimed"} · {Math.round(snapshot.percent * 100)}%
                    </p>
                    {needsHelp && <p className="text-xs text-yellow-400">Your clan needs this zone</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Active Phase - Combat (Answering Questions)
  if (gameState.phase === "ACTIVE" && hydratedPlayer.selectedZoneId) {
    const zone = ZONES.find((z) => z.id === hydratedPlayer.selectedZoneId);
    const zoneState = gameState.zones[hydratedPlayer.selectedZoneId];
    const zoneTotal = zoneState ? Object.values(zoneState.influence).reduce((a, b) => a + b, 0) : 0;

    if (showMap) {
      return (
        <div className="flex flex-col h-full bg-gray-950 text-white p-4 gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Battle Map</h2>
            <button
              onClick={() => setShowMap(false)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold"
            >
              BACK TO COMBAT
            </button>
          </div>
          <ClanTerritoryMap zones={gameState.zones} clans={gameState.clans} />
          <div className="flex flex-col gap-2">
            {ZONES.map((z) => {
              const snapshot = getZoneSnapshot(z.id);
              const holder = snapshot.controller ? clanList.find((c) => c.id === snapshot.controller) : null;
              return (
                <button
                  key={z.id}
                  onClick={() => {
                    onSelectZone(z.id);
                    setShowMap(false);
                  }}
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 hover:border-yellow-400 transition text-left"
                >
                  <p className="font-bold text-lg">{z.name}</p>
                  <p className="text-xs text-slate-400">
                    {holder ? `${holder.name} ${Math.round(snapshot.percent * 100)}%` : "Unclaimed"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* HUD */}
        <div className="bg-gray-800 p-4 border-b border-gray-700 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-400">LOCATION</div>
              <div className="font-bold text-yellow-400">{zone?.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">STREAK</div>
              <div className="font-bold text-xl text-orange-500">x{hydratedPlayer.streak}</div>
            </div>
          </div>

          {/* Zone Control Bar */}
          <div className="h-2 flex rounded-full overflow-hidden bg-gray-900">
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
        </div>

        {/* Question Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => onSelectZone(null as any)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold"
            >
              SWITCH ZONE
            </button>
            <button
              onClick={() => setShowMap(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold"
            >
              VIEW MAP
            </button>
          </div>
          {currentQuestion ? (
            <>
              <div className="text-3xl font-bold mb-8 text-center max-w-2xl">
                {currentQuestion.question_text}
              </div>
              
              <div className="w-full max-w-2xl grid gap-3">
                {shuffledAnswers.map((answer, idx) => {
                  const isSelected = feedback !== null;
                  const isCorrect = answer === currentQuestion.correct_answer;
                  const showResult = isSelected && isCorrect;
                  const showWrong = isSelected && !isCorrect && feedback === "incorrect";
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswerClick(answer)}
                      disabled={feedback !== null}
                      className={`p-4 rounded-xl text-left text-lg font-semibold transition-all ${
                        showResult ? "bg-green-600 border-green-400" :
                        showWrong ? "bg-red-600 border-red-400" :
                        "bg-gray-800 border-gray-600 hover:bg-gray-700 hover:border-blue-500"
                      } border-2 disabled:cursor-not-allowed`}
                    >
                      {answer}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-xl text-gray-400">
              Waiting for questions to load...
            </div>
          )}
        </div>

        {/* Stats Footer */}
        <div className="bg-gray-800 p-4 grid grid-cols-2 gap-4 text-center text-sm">
          <div>
            <div className="text-gray-400">Battle Score</div>
            <div className="font-bold text-lg">{hydratedPlayer.battleScore}</div>
          </div>
          <div>
            <div className="text-gray-400">Accuracy</div>
            <div className="font-bold text-lg">
              {hydratedPlayer.questionsAnswered > 0
                ? Math.round((hydratedPlayer.questionsCorrect / hydratedPlayer.questionsAnswered) * 100)
                : 0}
              %
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Ended Phase
  const results = gameState.phase === "ENDED" ? calculateClanTerritoryResults(gameState) : null;
  const myReward = results?.playerRewards.find((r) => r.playerId === playerId);
  const wonRewards = myReward && (myReward.coins > 0 || myReward.xp > 0 || myReward.gems > 0);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-6 text-center gap-6">
      <h1 className="text-4xl font-bold text-yellow-400">BATTLE ENDED</h1>
      <div className="bg-gray-800 p-6 rounded-xl w-full max-w-sm">
        <div className="text-gray-400 mb-2">Your Contribution</div>
        <div className="text-5xl font-bold mb-4 text-blue-400">{hydratedPlayer.battleScore}</div>
        <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-700 pt-4">
          <div>
            <span className="block text-gray-500">Correct</span>
            <span className="font-bold text-green-400">{hydratedPlayer.questionsCorrect}</span>
          </div>
          <div>
            <span className="block text-gray-500">Streak Best</span>
            <span className="font-bold text-orange-400">{hydratedPlayer.streak}</span>
          </div>
        </div>
      </div>
      {wonRewards && myReward && (
        <div className="bg-gradient-to-br from-yellow-900/40 to-amber-900/40 border-2 border-yellow-500/50 p-6 rounded-xl w-full max-w-sm">
          <h2 className="text-2xl font-bold text-yellow-300 mb-4">🎉 REWARDS CLAIMED</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            {myReward.coins > 0 && (
              <div>
                <div className="text-3xl font-bold text-amber-400">{myReward.coins}</div>
                <div className="text-xs text-gray-400">Coins</div>
              </div>
            )}
            {myReward.xp > 0 && (
              <div>
                <div className="text-3xl font-bold text-purple-400">{myReward.xp}</div>
                <div className="text-xs text-gray-400">XP</div>
              </div>
            )}
            {myReward.gems > 0 && (
              <div>
                <div className="text-3xl font-bold text-cyan-400">{myReward.gems}</div>
                <div className="text-xs text-gray-400">Gems</div>
              </div>
            )}
          </div>
          {claimingRewards && <p className="text-xs text-yellow-400 mt-4">Processing rewards...</p>}
          {rewardsClaimed && <p className="text-xs text-green-400 mt-4">✓ Added to your vault</p>}
        </div>
      )}
      {!wonRewards && (
        <p className="text-gray-400">Better luck next raid, agent.</p>
      )}
    </div>
  );
};
