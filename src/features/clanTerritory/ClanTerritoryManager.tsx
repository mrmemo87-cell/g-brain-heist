import React, { useState, useEffect } from "react";
import { SupabaseClanTerritoryTransport } from "./clanTerritorySupabaseTransport";
import { ClanTerritoryTeacherView } from "./components/ClanTerritoryTeacherView";
import { ClanTerritoryStudentView } from "./components/ClanTerritoryStudentView";
import { QuestionSelectionModal } from "./components/QuestionSelectionModal";
import { ClanTerritoryGameState, ClanId, getClanColor } from "./clanTerritoryTypes";
import { INITIAL_STATE } from "./clanTerritoryEngine";
import { supabase } from "../../../services/supabaseClient";

interface ClanTerritoryManagerProps {
  onExit: () => void;
  isTeacher?: boolean;
  playerName?: string;
  clanId?: string | null;
  clanName?: string | null;
  onRefreshProfile?: () => Promise<void>;
  onGoToClan?: () => void;
}

export const ClanTerritoryManager: React.FC<ClanTerritoryManagerProps> = ({
  onExit,
  isTeacher = false,
  playerName = "Agent",
  clanId,
  clanName,
  onRefreshProfile,
  onGoToClan,
}) => {
  const [transport] = useState(() => new SupabaseClanTerritoryTransport());
  const [gameState, setGameState] = useState<ClanTerritoryGameState>(INITIAL_STATE);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [mode, setMode] = useState<"menu" | "host" | "player">("menu");
  const [discoveredRoom, setDiscoveredRoom] = useState<string | null>(null);
  const [resolvedClanId, setResolvedClanId] = useState<ClanId | null>(clanId ?? null);
  const [resolvedClanName, setResolvedClanName] = useState<string | null>(clanName ?? null);
  const [playerFallback, setPlayerFallback] = useState<{
    id: string;
    name: string;
    clanId: ClanId;
    clanName: string;
  } | null>(null);
  const [showQuestionSelection, setShowQuestionSelection] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<any[]>([]);
  const [clanLoadTimeout, setClanLoadTimeout] = useState(false);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);

  const handleRefreshProfile = async () => {
    setIsRefreshingProfile(true);
    try {
      // Try to fetch clan data directly first (fast)
      await fetchClanDataDirectly();
      
      // Also refresh the full profile if callback is available
      if (onRefreshProfile) {
        await onRefreshProfile();
      }
      setClanLoadTimeout(false);
    } catch (error) {
      console.error("Failed to refresh profile:", error);
    } finally {
      setIsRefreshingProfile(false);
    }
  };

  // Fetch clan data directly from database on mount and when refreshing
  const fetchClanDataDirectly = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return;

      // Fetch clan_id from clan_members table
      const { data: membership, error: membershipError } = await supabase
        .from('clan_members')
        .select('clan_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error('Error fetching clan membership:', membershipError);
        return;
      }

      if (!membership?.clan_id) {
        // User is not in a clan
        return;
      }

      // Fetch clan name and color from clans table
      const { data: clan, error: clanError } = await supabase
        .from('clans')
        .select('id, name, color')
        .eq('id', membership.clan_id)
        .single();

      if (clanError) {
        console.error('Error fetching clan details:', clanError);
        return;
      }

      if (clan?.id && clan?.name) {
        setResolvedClanId(clan.id as ClanId);
        setResolvedClanName(clan.name);
        setClanLoadTimeout(false);
      }
    } catch (error) {
      console.error('Failed to fetch clan data:', error);
    }
  };

  // On mount, try to fetch clan data directly (don't wait for props)
  useEffect(() => {
    fetchClanDataDirectly();
  }, []);

  useEffect(() => {
    // Reactive update: whenever props change, update the resolved clan data
    // This prevents students from getting stuck on "Waiting for profile clan assignment"
    setResolvedClanId(clanId ?? null);
    setResolvedClanName(clanName ?? null);
    setClanLoadTimeout(false); // Reset timeout when clan data updates
  }, [clanId, clanName]);

  // If student is waiting too long for clan assignment, show timeout message
  useEffect(() => {
    if (!isTeacher && discoveredRoom && !resolvedClanId && !resolvedClanName) {
      const timer = setTimeout(() => {
        setClanLoadTimeout(true);
      }, 8000); // Show timeout after 8 seconds of waiting
      return () => clearTimeout(timer);
    }
  }, [isTeacher, discoveredRoom, resolvedClanId, resolvedClanName]);

  // Discovery
  useEffect(() => {
    if (!isTeacher && mode === "menu") {
      transport.startDiscovery((id) => {
        setDiscoveredRoom(id);
      });
      return () => transport.stopDiscovery();
    }
  }, [isTeacher, mode, transport]);

  useEffect(() => {
    if (roomId) {
      const unsubscribe = transport.onGameState(roomId, setGameState);
      return () => unsubscribe();
    }
  }, [roomId, transport]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      transport.stopDiscovery();
    };
  }, [transport]);

  const handleCreateRoom = () => {
    setShowQuestionSelection(true);
  };

  const handleQuestionsSelected = async (questions: any[]) => {
    setSelectedQuestions(questions);
    setShowQuestionSelection(false);
    const id = await transport.createRoom();
    // Send questions to game state
    transport.sendAction(id, { type: "SET_QUESTIONS", payload: { questions } });
    setRoomId(id);
    setMode("host");
  };

  const handleJoinRoom = async () => {
    if (!discoveredRoom) return;
    try {
      if (!resolvedClanId || !resolvedClanName) {
        throw new Error("You must be in a clan to join the Arena. Go to the Clans section to join a clan first.");
      }
      const pid = await transport.joinRoom(
        discoveredRoom,
        playerName,
        resolvedClanId,
        resolvedClanName
      );
      setRoomId(discoveredRoom);
      setPlayerId(pid);
      setPlayerFallback({
        id: pid,
        name: playerName,
        clanId: resolvedClanId,
        clanName: resolvedClanName,
      });
      setMode("player");
    } catch (e) {
      console.error("Failed to join", e);
      alert("Failed to join arena: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleStartGame = (duration: number) => {
    if (roomId) transport.sendAction(roomId, { type: "START_GAME", payload: { duration } });
  };

  const handleEndGame = () => {
    if (roomId) transport.sendAction(roomId, { type: "END_GAME" });
  };

  const handleKickPlayer = (pid: string) => {
    if (roomId) transport.sendAction(roomId, { type: "KICK_PLAYER", payload: { playerId: pid } });
  };

  // --- RENDER ---

  if (mode === "host") {
    return (
      <div className="h-screen bg-gray-900 text-white flex flex-col">
        <div className="bg-gray-800 p-4 flex justify-between items-center shadow-md z-10">
          <div>
            <span className="text-gray-400 text-sm uppercase tracking-wider">Room Code</span>
            <div className="text-4xl font-mono font-bold text-yellow-400 tracking-widest">{roomId}</div>
          </div>
          <button onClick={onExit} className="text-gray-400 hover:text-white">Exit</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ClanTerritoryTeacherView
            gameState={gameState}
            selectedQuestions={selectedQuestions}
            onStartGame={handleStartGame}
            onEndGame={handleEndGame}
            onKickPlayer={handleKickPlayer}
          />
        </div>
      </div>
    );
  }

  if (mode === "player" && playerId) {
    // Check if kicked
    // We assume if we have a playerId, we should be in the game state eventually.
    // If the game state has players (meaning it's loaded) and we are NOT in it, we are kicked.
    const isKicked = Object.keys(gameState.players).length > 0 && !gameState.players[playerId];

    if (isKicked) {
        return (
            <div className="h-screen bg-black flex flex-col items-center justify-center text-white p-8 text-center">
                <h1 className="text-4xl font-bold text-red-500 mb-4">DISCONNECTED</h1>
                <p className="text-gray-400 mb-8">You have been removed from the session.</p>
                <button onClick={onExit} className="bg-gray-800 px-6 py-3 rounded hover:bg-gray-700">Return to Menu</button>
            </div>
        )
    }

    return (
      <ClanTerritoryStudentView
        gameState={gameState}
        playerId={playerId}
        fallbackPlayer={playerFallback ?? undefined}
        onSelectZone={(zoneId) => {
          if (!roomId || !zoneId) return;
          transport.sendAction(roomId, { type: "SELECT_ZONE", payload: { playerId, zoneId } });
        }}
        onSubmitAnswer={(isCorrect, durationMs) => roomId && transport.sendAction(roomId, { type: "SUBMIT_ANSWER", payload: { playerId, isCorrect, durationMs } })}
      />
    );
  }

  // MENU MODE
  return (
    <>
      {showQuestionSelection && (
        <QuestionSelectionModal
          onConfirm={handleQuestionsSelected}
          onCancel={() => setShowQuestionSelection(false)}
        />
      )}
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black text-white tracking-tight">CLAN WARS</h1>
          <p className="text-slate-400">Territory Control Protocol</p>
        </div>

        <div className="grid gap-4">
          {isTeacher && (
            <button
              onClick={handleCreateRoom}
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg transition-all transform hover:scale-105 shadow-lg shadow-yellow-500/20"
            >
              HOST NEW BATTLE
            </button>
          )}

          {!isTeacher && !discoveredRoom && (
            <div className="text-center p-8 bg-slate-900/50 rounded-2xl border border-slate-800 animate-pulse">
              <div className="text-4xl mb-4">📡</div>
              <h3 className="text-xl font-bold text-white mb-2">Scanning for Signals...</h3>
              <p className="text-slate-400">Waiting for a teacher to open an arena.</p>
            </div>
          )}

          {!isTeacher && discoveredRoom && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4 animate-fade-in">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                Arena Detected
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={playerName}
                    readOnly
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-white cursor-not-allowed opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Assigned Clan</label>
                  {resolvedClanId && resolvedClanName ? (
                    <div
                      className="p-3 rounded border bg-slate-800/50 text-center font-bold"
                      style={{
                        borderColor: getClanColor(resolvedClanId),
                        color: getClanColor(resolvedClanId),
                      }}
                    >
                      {resolvedClanName}
                    </div>
                  ) : clanLoadTimeout ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded border border-dashed border-red-700 bg-red-950/30 text-center text-red-400 text-sm">
                        ⚠️ You must be in a clan to join the Arena. Go to the Clans section to join a clan first.
                      </div>
                      <div className="flex gap-2">
                        {onGoToClan && (
                          <button
                            onClick={onGoToClan}
                            className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded text-sm transition-colors"
                          >
                            🥇 Go to Clans
                          </button>
                        )}
                        {onRefreshProfile && (
                          <button
                            onClick={handleRefreshProfile}
                            disabled={isRefreshingProfile}
                            className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-semibold rounded text-sm transition-colors"
                          >
                            {isRefreshingProfile ? "Refreshing..." : "🔄 Retry"}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded border border-dashed border-slate-700 bg-slate-900/30 text-center text-slate-500 animate-pulse">
                      ⏳ Loading clan assignment...
                    </div>
                  )}
                </div>

                <button
                  onClick={handleJoinRoom}
                  disabled={!resolvedClanId || !resolvedClanName}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20"
                >
                  ENTER ARENA
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={onExit} className="text-slate-500 hover:text-slate-300 text-sm">
          Cancel Operation
        </button>
      </div>
    </div>
    </>
  );
};
