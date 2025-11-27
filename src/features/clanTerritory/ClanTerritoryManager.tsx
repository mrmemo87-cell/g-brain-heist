import React, { useState, useEffect } from "react";
import { SupabaseClanTerritoryTransport } from "./clanTerritorySupabaseTransport";
import { ClanTerritoryTeacherView } from "./components/ClanTerritoryTeacherView";
import { ClanTerritoryStudentView } from "./components/ClanTerritoryStudentView";
import { QuestionSelectionModal } from "./components/QuestionSelectionModal";
import { ClanTerritoryErrorBoundary } from "./components/ClanTerritoryErrorBoundary";
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

const ClanTerritoryManager: React.FC<ClanTerritoryManagerProps> = ({
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

      const membership = await resolveClanMembership(user.id);
      if (!membership?.clanId) {
        return;
      }

      const clanName = membership.clanName ?? (await fetchClanName(membership.clanId));

      setResolvedClanId(membership.clanId);
      setResolvedClanName(clanName);
      setClanLoadTimeout(false);
    } catch (error) {
      console.error('Failed to fetch clan data:', error);
    }
  };

  const resolveClanMembership = async (userId: string) => {
    const { data, error } = await supabase
      .from('clan_members')
      .select('clan_id, clans(name)')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Failed to resolve clan membership via clan_members:', error.message ?? error);
    }

    if (data?.clan_id) {
      const clanRecord = Array.isArray(data.clans) ? data.clans[0] : data.clans;
      return {
        clanId: data.clan_id as ClanId,
        clanName: clanRecord?.name ?? null,
      };
    }

    if (error) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('clan_member_scores')
        .select('clan_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (fallbackError && fallbackError.code !== 'PGRST116') {
        console.warn('Fallback clan membership lookup failed:', fallbackError.message ?? fallbackError);
      }

      if (fallback?.clan_id) {
        return {
          clanId: fallback.clan_id as ClanId,
          clanName: null,
        };
      }
    }

    return null;
  };

  const fetchClanName = async (clanId: string) => {
    const { data, error } = await supabase
      .from('clans')
      .select('name')
      .eq('id', clanId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Failed to load clan name from clans table:', error.message ?? error);
    }

    return data?.name ?? null;
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
    // Set up state listener for all roles when roomId is available
    // For hosts, this may run after handleQuestionsSelected already set it up,
    // but calling onGameState again just re-syncs the callback (harmless)
    if (roomId) {
      const unsubscribe = transport.onGameState(roomId, setGameState);
      return () => unsubscribe();
    }
  }, [roomId, transport]);

  // Cleanup on unmount - prevent memory leaks
  useEffect(() => {
    return () => {
      transport.stopDiscovery();
      transport.cleanup();
    };
  }, [transport]);

  const handleCreateRoom = () => {
    setShowQuestionSelection(true);
  };

  const handleQuestionsSelected = async (questions: any[]) => {
    setSelectedQuestions(questions);
    setShowQuestionSelection(false);
    const id = await transport.createRoom();
    
    // IMPORTANT: Set up state listener BEFORE sending any actions or setting roomId
    // This prevents race conditions where JOIN actions are processed before the callback is set
    transport.onGameState(id, setGameState);
    
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
      <ClanTerritoryErrorBoundary onExit={onExit} fallbackTitle="Teacher View Error">
        <div className="h-screen text-white flex flex-col">
          <div className="bg-black/40 backdrop-blur p-4 flex justify-between items-center border-b border-white/10 z-10">
            <div>
              <span className="text-gray-400 text-sm uppercase tracking-wider">Room Code</span>
              <div className="text-4xl font-mono font-bold text-amber-400 tracking-widest">{roomId}</div>
            </div>
            <button onClick={onExit} className="text-gray-400 hover:text-white font-heading">Exit</button>
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
      </ClanTerritoryErrorBoundary>
    );
  }

  if (mode === "player" && playerId) {
    // Check if kicked
    // We assume if we have a playerId, we should be in the game state eventually.
    // If the game state has players (meaning it's loaded) and we are NOT in it, we are kicked.
    const isKicked = Object.keys(gameState.players).length > 0 && !gameState.players[playerId];

    if (isKicked) {
        return (
            <div className="h-screen flex flex-col items-center justify-center text-white p-8 text-center">
                <h1 className="font-heading text-4xl text-red-400 mb-4">DISCONNECTED</h1>
                <p className="text-gray-400 mb-8">You have been removed from the session.</p>
                <button onClick={onExit} className="font-heading bg-gray-600/30 hover:bg-gray-500/30 border border-gray-500 px-6 py-3 rounded-xl text-white">Return to Menu</button>
            </div>
        )
    }

    return (
      <ClanTerritoryErrorBoundary onExit={onExit} fallbackTitle="Player View Error">
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
      </ClanTerritoryErrorBoundary>
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
      <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <span className="inline-flex items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
            Territory Control
          </span>
          <h1 className="font-heading text-4xl text-white tracking-tight">CLAN WARS</h1>
          <p className="text-gray-400">Compete for territory dominance</p>
        </div>

        <div className="grid gap-4">
          {isTeacher && (
            <button
              onClick={handleCreateRoom}
              className="w-full font-heading font-bold py-4 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white rounded-xl text-lg transition-all"
            >
              HOST NEW BATTLE
            </button>
          )}

          {!isTeacher && !discoveredRoom && (
            <div className="text-center p-8 card-glass animate-pulse">
              <div className="text-4xl mb-4">📡</div>
              <h3 className="font-heading text-xl text-white mb-2">Scanning for Signals...</h3>
              <p className="text-gray-400">Waiting for a teacher to open an arena.</p>
            </div>
          )}

          {!isTeacher && discoveredRoom && (
            <div className="card-glass p-6 space-y-4">
              <h2 className="font-heading text-xl text-white flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                Arena Detected
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={playerName}
                    readOnly
                    className="w-full rounded-xl border border-gray-600 bg-black/30 px-4 py-3 text-white cursor-not-allowed opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Assigned Clan</label>
                  {resolvedClanId && resolvedClanName ? (
                    <div
                      className="p-3 rounded-xl border bg-black/30 text-center font-bold"
                      style={{
                        borderColor: getClanColor(resolvedClanId),
                        color: getClanColor(resolvedClanId),
                      }}
                    >
                      {resolvedClanName}
                    </div>
                  ) : clanLoadTimeout ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl border border-dashed border-red-400/60 bg-red-500/10 text-center text-red-300 text-sm">
                        ⚠️ You must be in a clan to join the Arena. Go to the Clans section to join a clan first.
                      </div>
                      <div className="flex gap-2">
                        {onGoToClan && (
                          <button
                            onClick={onGoToClan}
                            className="flex-1 py-2 font-heading bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white rounded-xl text-sm transition-colors"
                          >
                            🥇 Go to Clans
                          </button>
                        )}
                        {onRefreshProfile && (
                          <button
                            onClick={handleRefreshProfile}
                            disabled={isRefreshingProfile}
                            className="flex-1 py-2 font-heading bg-gray-600/30 hover:bg-gray-500/30 border border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm transition-colors"
                          >
                            {isRefreshingProfile ? "Refreshing..." : "🔄 Retry"}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-gray-600 bg-black/20 text-center text-gray-500 animate-pulse">
                      ⏳ Loading clan assignment...
                    </div>
                  )}
                </div>

                <button
                  onClick={handleJoinRoom}
                  disabled={!resolvedClanId || !resolvedClanName}
                  className="w-full font-heading font-bold py-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 disabled:bg-gray-600/30 disabled:border-gray-600 disabled:cursor-not-allowed text-white rounded-xl transition-colors mt-4"
                >
                  ENTER ARENA
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={onExit} className="w-full text-gray-500 hover:text-gray-300 text-sm">
          ← Return to Dashboard
        </button>
      </div>
    </div>
    </>
  );
};

export default ClanTerritoryManager;
