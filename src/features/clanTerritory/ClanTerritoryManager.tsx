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

const CLANLESS_CLAN_ID = "clanless-agents" as ClanId;
const CLANLESS_CLAN_NAME = "Independent Agents";
const CLANLESS_CLAN_COLOR = "#94a3b8";

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
  const [mode, setMode] = useState<"menu" | "host" | "player" | "configure">("menu");

  // Game configuration settings
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [selectedMap, setSelectedMap] = useState('default');
  const [discoveredRoom, setDiscoveredRoom] = useState<{ id: string; allowClanlessPlayers?: boolean } | null>(null);
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
  const [allowClanlessPlayers, setAllowClanlessPlayers] = useState(false);
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);

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
    // Also fetch the user's school_id for room isolation
    fetchUserSchoolId();
  }, []);

  const fetchUserSchoolId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('users')
        .select('school_id')
        .eq('id', user.id)
        .single();
      
      if (data?.school_id) {
        setUserSchoolId(data.school_id);
      }
    } catch (error) {
      console.warn('Failed to fetch user school_id:', error);
    }
  };

  useEffect(() => {
    // Reactive update: whenever props change, update the resolved clan data
    // This prevents students from getting stuck on "Waiting for profile clan assignment"
    setResolvedClanId(clanId ?? null);
    setResolvedClanName(clanName ?? null);
    setClanLoadTimeout(false); // Reset timeout when clan data updates
  }, [clanId, clanName]);

  // If student is waiting too long for clan assignment, show timeout message
  useEffect(() => {
    const allowIndependentAgents = allowClanlessPlayers || gameState.allowClanlessPlayers || discoveredRoom?.allowClanlessPlayers;
    if (!isTeacher && discoveredRoom && !resolvedClanId && !resolvedClanName && !allowIndependentAgents) {
      const timer = setTimeout(() => {
        setClanLoadTimeout(true);
      }, 8000); // Show timeout after 8 seconds of waiting
      return () => clearTimeout(timer);
    }
  }, [
    isTeacher,
    discoveredRoom,
    resolvedClanId,
    resolvedClanName,
    allowClanlessPlayers,
    gameState.allowClanlessPlayers,
  ]);

  // Discovery
  useEffect(() => {
    if (!isTeacher && mode === "menu") {
      // Pass userSchoolId to only discover rooms from the same school
      transport.startDiscovery(userSchoolId, (id, metadata) => {
        setDiscoveredRoom({ id, allowClanlessPlayers: metadata?.allowClanlessPlayers });
      });
      return () => transport.stopDiscovery();
    }
  }, [isTeacher, mode, transport, userSchoolId]);

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
    setMode('configure');
  };

  const handleQuestionsSelected = async (questions: any[]) => {
    setSelectedQuestions(questions);
    setShowQuestionSelection(false);
    
    // If we're in configure mode, create room after questions selected
    if (mode === 'configure') {
      const id = await transport.createRoom({ allowClanlessPlayers, schoolId: userSchoolId || undefined });
      
      // Set up state listener BEFORE sending any actions
      transport.onGameState(id, setGameState);
      
      // Send map configuration FIRST, then questions
      // This ensures zones are created for the correct map before any other state changes
      await transport.sendAction(id, { type: "SET_MAP", payload: { mapId: selectedMap } });
      await transport.sendAction(id, { type: "SET_ALLOW_CLANLESS", payload: { allow: allowClanlessPlayers } });
      await transport.sendAction(id, { type: "SET_QUESTIONS", payload: { questions } });
      
      setRoomId(id);
      setMode("host");
      return;
    }
    
    // Otherwise proceed with room creation (legacy flow)
    const id = await transport.createRoom({ allowClanlessPlayers, schoolId: userSchoolId || undefined });
    
    // IMPORTANT: Set up state listener BEFORE sending any actions or setting roomId
    // This prevents race conditions where JOIN actions are processed before the callback is set
    transport.onGameState(id, setGameState);
    
    // Send questions to game state
    await transport.sendAction(id, { type: "SET_ALLOW_CLANLESS", payload: { allow: allowClanlessPlayers } });
    await transport.sendAction(id, { type: "SET_QUESTIONS", payload: { questions } });
    setRoomId(id);
    setMode("host");
  };

  const handleJoinRoom = async () => {
    if (!discoveredRoom) return;
    const allowClanless = discoveredRoom.allowClanlessPlayers || gameState.allowClanlessPlayers;
    try {
      const clanlessAssigned = allowClanless && (!resolvedClanId || !resolvedClanName);
      if (!resolvedClanId || !resolvedClanName) {
        if (!clanlessAssigned) {
          throw new Error("You must be in a clan to join the Arena. Go to the Clans section to join a clan first.");
        }
      }
      const pid = await transport.joinRoom(
        discoveredRoom.id,
        playerName,
        clanlessAssigned ? CLANLESS_CLAN_ID : (resolvedClanId as ClanId),
        clanlessAssigned ? CLANLESS_CLAN_NAME : (resolvedClanName as string),
        clanlessAssigned ? { clanColor: CLANLESS_CLAN_COLOR } : undefined
      );
      setRoomId(discoveredRoom.id);
      setPlayerId(pid);
      setPlayerFallback({
        id: pid,
        name: playerName,
        clanId: clanlessAssigned ? CLANLESS_CLAN_ID : (resolvedClanId as ClanId),
        clanName: clanlessAssigned ? CLANLESS_CLAN_NAME : (resolvedClanName as string),
      });
      setMode("player");
    } catch (e) {
      console.error("Failed to join", e);
      alert("Failed to join arena: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleStartGame = () => {
    if (roomId) transport.sendAction(roomId, { type: "START_GAME", payload: { duration: durationMinutes * 60 } });
  };

  const handleEndGame = () => {
    if (roomId) transport.sendAction(roomId, { type: "END_GAME" });
  };

  const handleKickPlayer = (pid: string) => {
    if (roomId) transport.sendAction(roomId, { type: "KICK_PLAYER", payload: { playerId: pid } });
  };

  const allowClanlessEntry = allowClanlessPlayers || gameState.allowClanlessPlayers || discoveredRoom?.allowClanlessPlayers;
  const missingClanAssignment = !resolvedClanId || !resolvedClanName;

  // --- RENDER ---

  if (mode === 'configure') {
    return (
      <>
        {showQuestionSelection && (
          <QuestionSelectionModal
            onConfirm={handleQuestionsSelected}
            onCancel={() => setShowQuestionSelection(false)}
          />
        )}
        <div className="min-h-screen flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-2xl space-y-8">
          <div className="space-y-3 text-center">
            <button
              onClick={() => setMode('menu')}
              className="text-sm text-gray-400 hover:text-gray-300 transition"
            >
              ← Back
            </button>
            <span className="inline-flex items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
              Configure Battle
            </span>
            <h1 className="font-heading text-4xl text-white tracking-tight">Game Settings</h1>
            <p className="text-sm text-gray-400">Customize the battle duration, map, and objectives for your clan war.</p>
          </div>

          <div className="card-glass p-8 space-y-6">
            {/* Duration Setting */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Battle Duration</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="1"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="min-w-[80px] text-center rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-lg font-bold text-amber-300">
                  {durationMinutes}m
                </div>
              </div>
              <p className="text-xs text-gray-400">How long clans battle for territory control (2-20 minutes)</p>
            </div>

            {/* Map Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Territory Map</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedMap('default')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'default'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🗺️ Default</p>
                    <p className="text-xs text-gray-400">Standard 8-zone battlefield</p>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMap('city')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'city'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🏙️ City</p>
                    <p className="text-xs text-gray-400">Urban warfare, 10 districts</p>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMap('kyrgyzstan')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'kyrgyzstan'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🇰🇬 Kyrgyzstan</p>
                    <p className="text-xs text-gray-400">Regional conquest, 7 oblasts</p>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMap('fortress')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'fortress'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🏰 Fortress</p>
                    <p className="text-xs text-gray-400">Defensive stronghold, 6 layers</p>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMap('islands')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'islands'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🏝️ Islands</p>
                    <p className="text-xs text-gray-400">Archipelago, 12 territories</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Clanless Participation */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">Allow independent agents</p>
                <p className="text-xs text-gray-400">
                  Let students without a clan join this battle as "{CLANLESS_CLAN_NAME}"
                </p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowClanlessPlayers}
                  onChange={(e) => setAllowClanlessPlayers(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-600 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:bg-emerald-500 peer-checked:after:translate-x-full"></div>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <h3 className="text-sm font-bold text-white mb-3">Battle Preview</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Duration</p>
                  <p className="text-white font-bold">{durationMinutes} minutes</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Map</p>
                  <p className="text-white font-bold capitalize">{selectedMap}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Questions</p>
                  <p className="text-white font-bold">{selectedQuestions.length || 'To be selected'}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Total Zones</p>
                  <p className="text-white font-bold">8 territories</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Access</p>
                  <p className="text-white font-bold">
                    {allowClanlessPlayers ? "Clans + Independent agents" : "Clan members only"}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowQuestionSelection(true)}
              className="w-full font-heading font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 py-4 text-lg text-white transition"
            >
              {selectedQuestions.length ? 'Change Questions & Create' : 'Select Questions & Create'}
            </button>
          </div>
        </div>
      </div>
      </>
    );
  }

  if (mode === "host") {
    return (
      <ClanTerritoryErrorBoundary onExit={onExit} fallbackTitle="Teacher View Error">
        <div className="h-screen text-white flex flex-col">
          <div className="bg-black/40 backdrop-blur p-4 flex justify-between items-center border-b border-white/10 z-10">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-gray-400 text-sm uppercase tracking-wider">Room Code</span>
                <div className="text-4xl font-mono font-bold text-amber-400 tracking-widest">{roomId}</div>
              </div>
              <div className="text-left">
                <span className="text-gray-400 text-xs uppercase tracking-wider block">Map</span>
                <div className="text-sm font-bold text-cyan-400 capitalize">{selectedMap}</div>
              </div>
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
                  ) : allowClanlessEntry ? (
                    <div className="p-3 rounded-xl border border-emerald-500/50 bg-emerald-500/10 text-center text-emerald-200 text-sm">
                      Teacher enabled independent agents. You can join as {CLANLESS_CLAN_NAME} without a clan.
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
                  disabled={!allowClanlessEntry && missingClanAssignment}
                  className="w-full font-heading font-bold py-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 disabled:bg-gray-600/30 disabled:border-gray-600 disabled:cursor-not-allowed text-white rounded-xl transition-colors mt-4"
                >
                  {allowClanlessEntry && missingClanAssignment ? "ENTER AS INDEPENDENT AGENT" : "ENTER ARENA"}
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
