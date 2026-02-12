import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { SupabaseClanTerritoryTransport } from "./clanTerritorySupabaseTransport";
import { ClanTerritoryTeacherView } from "./components/ClanTerritoryTeacherView";
import { ClanTerritoryStudentView } from "./components/ClanTerritoryStudentView";
import { QuestionSelectionModal } from "./components/QuestionSelectionModal";
import { ClanTerritoryErrorBoundary } from "./components/ClanTerritoryErrorBoundary";
import { ClanTerritoryGameState, ClanId, getClanColor, assignSessionClanColor, getUsedSessionColors } from "./clanTerritoryTypes";
import { INITIAL_STATE } from "./clanTerritoryEngine";
import { supabase } from "../../../services/supabaseClient";
import { audioService } from "../../../services/audioService";
import { fetchSchoolBatches, type SchoolBatchInfo } from "../../../services/competitionService";
import { clan_list } from "../../../services/gameService";
import { ClanSummary } from "../../../types";
import * as SchoolAdminService from "../../../services/schoolAdminService";
import { fetchLockdownLimits, type LockdownLimits, FREE_LOCKDOWN_LIMITS } from "../../../services/tierService";
import { FreeTierWatermark } from "../../../components/FreeTierWatermark";

interface ClanTerritoryManagerProps {
  onExit: () => void;
  isTeacher?: boolean;
  playerName?: string;
  clanId?: string | null;
  clanName?: string | null;
  onRefreshProfile?: () => Promise<void>;
  onGoToClan?: () => void;
  assignedClasses?: SchoolAdminService.TeacherAssignedClass[];
}

const CLANLESS_CLAN_ID_PREFIX = "clanless-agent";
const CLANLESS_CLAN_LABEL = "Independent Agents";
const CLANLESS_CLAN_NAME = "Independent Agent";
const AUTO_START_DELAY_MS = 2 * 60 * 1000;
const FINISHED_ARENA_TTL_MS = 24 * 60 * 60 * 1000;

// Map configuration with zone/territory counts
const MAP_ZONE_CONFIG: Record<string, number> = {
  default: 8,
  city: 10,
  kyrgyzstan: 7,
  unitedkingdom: 16,
  usa: 51,
};

type DiscoveredRoom = {
  id: string;
  allowClanlessPlayers?: boolean;
  teacherName?: string;
  classCodes?: string[];
  allowedClanIds?: string[];
  scheduledStartAt?: string;
  phase?: ClanTerritoryGameState["phase"];
  timer?: number;
  gameEndTime?: number;
  lastSeen: number;
};

type StoredHostRoom = {
  roomId: string;
  state: ClanTerritoryGameState;
  selectedMap: string;
  durationMinutes: number;
  allowClanlessPlayers: boolean;
  selectedQuestions: any[];
  selectedBatches: string[];
  selectedClanIds: string[];
  teacherName?: string;
  scheduledStartAt?: string | null;
  lastUpdatedAt: number;
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

const getRemainingSeconds = (input: {
  phase?: ClanTerritoryGameState["phase"];
  timer?: number;
  gameEndTime?: number;
}) => {
  if (input.phase !== "ACTIVE") return null;
  if (typeof input.gameEndTime === "number") {
    return Math.max(0, Math.floor((input.gameEndTime - Date.now()) / 1000));
  }
  if (typeof input.timer === "number") {
    return Math.max(0, input.timer);
  }
  return null;
};

const createClanlessIdentity = (playerName: string, playerId?: string | null) => {
  const stableId = playerId
    ? `${CLANLESS_CLAN_ID_PREFIX}-${playerId}`
    : `${CLANLESS_CLAN_ID_PREFIX}-${crypto.randomUUID()}`;
  const clanId = stableId as ClanId;
  return {
    clanId,
    clanName: `${CLANLESS_CLAN_NAME} (${playerName})`,
    clanColor: getClanColor(clanId), // session-level dedup happens in engine on JOIN
  };
};

const ClanTerritoryManager: React.FC<ClanTerritoryManagerProps> = ({
  onExit,
  isTeacher = false,
  playerName = "Agent",
  clanId,
  clanName,
  onRefreshProfile,
  onGoToClan,
  assignedClasses = [],
}) => {
  const [transport] = useState(() => new SupabaseClanTerritoryTransport());
  const [gameState, setGameState] = useState<ClanTerritoryGameState>(INITIAL_STATE);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [mode, setMode] = useState<"menu" | "host" | "player" | "configure">("menu");

  // Game configuration settings
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [selectedMap, setSelectedMap] = useState('default');
  const [discoveredRooms, setDiscoveredRooms] = useState<Record<string, DiscoveredRoom>>({});
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
  const [studentBatch, setStudentBatch] = useState<string | null>(null);
  const [availableBatches, setAvailableBatches] = useState<SchoolBatchInfo[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [availableClans, setAvailableClans] = useState<ClanSummary[]>([]);
  const [selectedClanIds, setSelectedClanIds] = useState<string[]>([]);
  const [teacherName, setTeacherName] = useState<string>("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledStartAt, setScheduledStartAt] = useState<string>("");
  const [activeScheduledStartAt, setActiveScheduledStartAt] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [teacherUserId, setTeacherUserId] = useState<string | null>(null);
  const [storedHostRooms, setStoredHostRooms] = useState<StoredHostRoom[]>([]);
  const [loadedAssignedClasses, setLoadedAssignedClasses] = useState<SchoolAdminService.TeacherAssignedClass[]>(assignedClasses || []);
  const previousBgMusicEnabled = useRef<boolean | null>(null);
  const discoveredRoomsRef = useRef<Record<string, DiscoveredRoom>>({});
  const autoStartTriggeredRef = useRef(false);

  const [lockdownLimits, setLockdownLimits] = useState<LockdownLimits>(FREE_LOCKDOWN_LIMITS);
  const isMapLocked = (mapId: string) => lockdownLimits.allowed_maps !== null && !lockdownLimits.allowed_maps.includes(mapId);
  const effectiveDurationMax = lockdownLimits.max_duration_minutes ?? 20;

  const durationPercentage = ((durationMinutes - 2) / (effectiveDurationMax - 2)) * 100;

  const formatScheduleTime = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
  };

  useEffect(() => {
    if (!teacherName && playerName) {
      setTeacherName(playerName);
    }
  }, [playerName, teacherName]);

  useEffect(() => {
    if (!isTeacher) return;
    let m = true;
    fetchLockdownLimits().then(l => { if (m) setLockdownLimits(l); });
    return () => { m = false; };
  }, [isTeacher]);

  useEffect(() => {
    if (lockdownLimits.max_duration_minutes && durationMinutes > lockdownLimits.max_duration_minutes) {
      setDurationMinutes(lockdownLimits.max_duration_minutes);
    }
    if (isMapLocked(selectedMap)) setSelectedMap('default');
  }, [lockdownLimits]);

  useEffect(() => {
    if (!isTeacher) return;

    const loadTeacherId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setTeacherUserId(user?.id ?? null);
      } catch (error) {
        console.warn("Failed to resolve teacher identity for host recovery:", error);
      }
    };

    loadTeacherId();
  }, [isTeacher]);

  // Load teacher's assigned classes if not provided
  useEffect(() => {
    if (!isTeacher || (assignedClasses && assignedClasses.length > 0)) return;

    const loadAssignedClasses = async () => {
      try {
        console.log("📚 Loading teacher assigned classes...");
        const classes = await SchoolAdminService.getTeacherAssignedClasses();
        setLoadedAssignedClasses(classes);
        console.log("✅ Loaded assigned classes:", classes);
      } catch (error) {
        console.warn("Failed to load assigned classes:", error);
        setLoadedAssignedClasses([]);
      }
    };

    loadAssignedClasses();
  }, [isTeacher, assignedClasses]);

  const pruneExpiredHostRooms = useCallback((rooms: StoredHostRoom[]) => {
    const now = Date.now();
    return rooms.filter((room) => {
      if (room.state.phase !== "ENDED") return true;
      return now - room.lastUpdatedAt <= FINISHED_ARENA_TTL_MS;
    });
  }, []);

  const persistHostRooms = useCallback(
    (rooms: StoredHostRoom[]) => {
      if (teacherUserId && typeof window !== "undefined") {
        localStorage.setItem(
          `clan-territory-host-rooms:${teacherUserId}`,
          JSON.stringify(rooms)
        );
      }
    },
    [teacherUserId]
  );

  useEffect(() => {
    if (!isTeacher || !teacherUserId || typeof window === "undefined") {
      setStoredHostRooms([]);
      return;
    }

    const raw = localStorage.getItem(`clan-territory-host-rooms:${teacherUserId}`);
    if (!raw) {
      setStoredHostRooms([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as StoredHostRoom[];
      const cleaned = pruneExpiredHostRooms(Array.isArray(parsed) ? parsed : []);
      setStoredHostRooms(cleaned);
      if (cleaned.length !== parsed.length) {
        persistHostRooms(cleaned);
      }
    } catch (error) {
      console.warn("Failed to parse stored host rooms:", error);
      setStoredHostRooms([]);
    }
  }, [isTeacher, teacherUserId, persistHostRooms, pruneExpiredHostRooms]);

  useEffect(() => {
    if (!isTeacher || !teacherUserId) return;
    const interval = setInterval(() => {
      setStoredHostRooms((prev) => {
        const cleaned = pruneExpiredHostRooms(prev);
        if (cleaned.length !== prev.length) {
          persistHostRooms(cleaned);
        }
        return cleaned;
      });
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isTeacher, teacherUserId, persistHostRooms, pruneExpiredHostRooms]);

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

  const upsertHostRoom = (room: StoredHostRoom) => {
    setStoredHostRooms((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => item.roomId === room.roomId);
      if (index >= 0) {
        next[index] = room;
      } else {
        next.unshift(room);
      }
      const cleaned = pruneExpiredHostRooms(next);
      persistHostRooms(cleaned);
      return cleaned;
    });
  };

  const removeHostRoom = (targetRoomId: string) => {
    setStoredHostRooms((prev) => {
      const next = prev.filter((room) => room.roomId !== targetRoomId);
      persistHostRooms(next);
      return next;
    });
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
    fetchUserProfile();
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

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('username, batch')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('Failed to fetch user profile:', error.message ?? error);
        return;
      }

      if (data?.username) {
        setTeacherName(data.username);
      }

      if (data?.batch) {
        setStudentBatch(data.batch);
      }
    } catch (error) {
      console.warn('Failed to fetch user profile:', error);
    }
  };

  useEffect(() => {
    if (!isTeacher) return;

    const loadBatches = async () => {
      let batches = await fetchSchoolBatches();
      
      // Filter batches for teachers - only show their assigned classes
      // If teacher has NO assignments, show empty list (not all classes)
      if (isTeacher) {
        if (loadedAssignedClasses.length > 0) {
          const assignedClassCodes = loadedAssignedClasses.map((cls) => cls.class_code);
          batches = batches.filter((batch) => assignedClassCodes.includes(batch.batch));
          console.log(`🔒 Teacher class filtering: showing ${batches.length} of total batches`, {
            assignedClasses: assignedClassCodes,
            filteredBatches: batches.map((b) => b.batch),
          });
        } else {
          // No assignments = no access to any classes
          console.log(`⚠️ Teacher has no assigned classes - showing empty list`);
          batches = [];
        }
      }
      
      setAvailableBatches(batches);

      if (selectedBatches.length === 0) {
        if (studentBatch) {
          setSelectedBatches([studentBatch]);
        } else if (batches.length > 0) {
          setSelectedBatches([batches[0].batch]);
        }
      }
    };

    loadBatches();
  }, [isTeacher, selectedBatches.length, studentBatch, loadedAssignedClasses]);

  // Fetch available clans for the teacher's school
  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    const loadClans = async () => {
      try {
        const clans = await clan_list();
        if (!cancelled) setAvailableClans(clans);
      } catch (err) {
        console.warn("Failed to load clan list:", err);
      }
    };
    loadClans();
    return () => { cancelled = true; };
  }, [isTeacher]);

  useEffect(() => {
    // Reactive update: whenever props change, update the resolved clan data
    // This prevents students from getting stuck on "Waiting for profile clan assignment"
    setResolvedClanId(clanId ?? null);
    setResolvedClanName(clanName ?? null);
    setClanLoadTimeout(false); // Reset timeout when clan data updates
  }, [clanId, clanName]);

  // If student is waiting too long for clan assignment, show timeout message
  useEffect(() => {
    const discoveredList = Object.values(discoveredRooms);
    const allowIndependentAgents =
      allowClanlessPlayers || gameState.allowClanlessPlayers || discoveredList.some((room) => room.allowClanlessPlayers);
    if (!isTeacher && discoveredList.length > 0 && !resolvedClanId && !resolvedClanName && !allowIndependentAgents) {
      const timer = setTimeout(() => {
        setClanLoadTimeout(true);
      }, 8000); // Show timeout after 8 seconds of waiting
      return () => clearTimeout(timer);
    }
  }, [
    isTeacher,
    discoveredRooms,
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
        setDiscoveredRooms((prev) => ({
          ...prev,
          [id]: {
            id,
            allowClanlessPlayers: metadata?.allowClanlessPlayers,
            teacherName: metadata?.teacherName,
            classCodes: metadata?.classCodes,
            allowedClanIds: metadata?.allowedClanIds,
            scheduledStartAt: metadata?.scheduledStartAt,
            phase: metadata?.phase,
            timer: metadata?.timer,
            gameEndTime: metadata?.gameEndTime,
            lastSeen: Date.now(),
          },
        }));
      });
      return () => transport.stopDiscovery();
    }
  }, [isTeacher, mode, transport, userSchoolId]);

  useEffect(() => {
    discoveredRoomsRef.current = discoveredRooms;
  }, [discoveredRooms]);

  useEffect(() => {
    if (isTeacher || mode !== "menu") return;

    const interval = setInterval(() => {
      setDiscoveredRooms((prev) => {
        const now = Date.now();
        const next: Record<string, DiscoveredRoom> = {};
        Object.values(prev).forEach((room) => {
          if (now - room.lastSeen < 7000) {
            next[room.id] = room;
          }
        });
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isTeacher, mode]);

  useEffect(() => {
    // Set up state listener for all roles when roomId is available
    // For hosts, this may run after handleQuestionsSelected already set it up,
    // but calling onGameState again just re-syncs the callback (harmless)
    if (roomId) {
      const unsubscribe = transport.onGameState(roomId, setGameState);
      return () => unsubscribe();
    }
  }, [roomId, transport]);

  const shouldPlayMusic =
    Boolean(roomId) &&
    (mode === "host" || mode === "player") &&
    gameState.phase !== "ENDED";

  useEffect(() => {
    if (shouldPlayMusic) {
      if (previousBgMusicEnabled.current === null) {
        previousBgMusicEnabled.current = audioService.isBgMusicEnabled();
      }
      if (!audioService.isBgMusicEnabled()) {
        audioService.setBgMusicEnabled(true);
      } else {
        audioService.playBackgroundMusic();
      }
    }

    return () => {
      if (previousBgMusicEnabled.current !== null) {
        audioService.setBgMusicEnabled(previousBgMusicEnabled.current);
        previousBgMusicEnabled.current = null;
      }
    };
  }, [shouldPlayMusic]);

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
    const scheduledStartIso =
      scheduleEnabled && scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null;
    
    // If we're in configure mode, create room after questions selected
    if (mode === 'configure') {
      const id = await transport.createRoom({
        allowClanlessPlayers,
        schoolId: userSchoolId || undefined,
        teacherName: teacherName || playerName,
        classCodes: selectedBatches.length > 0 ? selectedBatches : undefined,
        allowedClanIds: selectedClanIds.length > 0 ? selectedClanIds : undefined,
        scheduledStartAt: scheduledStartIso || undefined,
      });
      
      // Set up state listener BEFORE sending any actions
      transport.onGameState(id, setGameState);
      
      // Send map configuration FIRST, then questions
      // This ensures zones are created for the correct map before any other state changes
      await transport.sendAction(id, { type: "SET_MAP", payload: { mapId: selectedMap } });
      await transport.sendAction(id, { type: "SET_ALLOW_CLANLESS", payload: { allow: allowClanlessPlayers } });
      if (selectedClanIds.length > 0) {
        await transport.sendAction(id, { type: "SET_ALLOWED_CLANS", payload: { clanIds: selectedClanIds } });
      }
      await transport.sendAction(id, { type: "SET_DURATION", payload: { duration: durationMinutes * 60 } });
      await transport.sendAction(id, { type: "SET_QUESTIONS", payload: { questions } });
      
      setRoomId(id);
      setActiveScheduledStartAt(scheduledStartIso);
      setMode("host");
      upsertHostRoom({
        roomId: id,
        state: gameState,
        selectedMap,
        durationMinutes,
        allowClanlessPlayers,
        selectedQuestions: questions,
        selectedBatches,
        selectedClanIds,
        teacherName: teacherName || playerName,
        scheduledStartAt: scheduledStartIso,
        lastUpdatedAt: Date.now(),
      });
      return;
    }
    
    // Otherwise proceed with room creation (legacy flow)
    const id = await transport.createRoom({
      allowClanlessPlayers,
      schoolId: userSchoolId || undefined,
      teacherName: teacherName || playerName,
      classCodes: selectedBatches.length > 0 ? selectedBatches : undefined,
      allowedClanIds: selectedClanIds.length > 0 ? selectedClanIds : undefined,
      scheduledStartAt: scheduledStartIso || undefined,
    });
    
    // IMPORTANT: Set up state listener BEFORE sending any actions or setting roomId
    // This prevents race conditions where JOIN actions are processed before the callback is set
    transport.onGameState(id, setGameState);
    
    // Send questions to game state
    await transport.sendAction(id, { type: "SET_ALLOW_CLANLESS", payload: { allow: allowClanlessPlayers } });
    if (selectedClanIds.length > 0) {
      await transport.sendAction(id, { type: "SET_ALLOWED_CLANS", payload: { clanIds: selectedClanIds } });
    }
    await transport.sendAction(id, { type: "SET_DURATION", payload: { duration: durationMinutes * 60 } });
    await transport.sendAction(id, { type: "SET_QUESTIONS", payload: { questions } });
    setRoomId(id);
    setActiveScheduledStartAt(scheduledStartIso);
    setMode("host");
    upsertHostRoom({
      roomId: id,
      state: gameState,
      selectedMap,
      durationMinutes,
      allowClanlessPlayers,
      selectedQuestions: questions,
      selectedBatches,
      selectedClanIds,
      teacherName: teacherName || playerName,
      scheduledStartAt: scheduledStartIso,
      lastUpdatedAt: Date.now(),
    });
  };

  const handleJoinRoom = async (targetRoomId: string) => {
    if (!targetRoomId) return;
    const waitForDiscovery = async () => {
      const initialRoom = discoveredRoomsRef.current[targetRoomId];
      if (initialRoom && Date.now() - initialRoom.lastSeen < 10000) {
        return true;
      }
      return new Promise<boolean>((resolve) => {
        const interval = setInterval(() => {
          const room = discoveredRoomsRef.current[targetRoomId];
          if (room && Date.now() - room.lastSeen < 10000) {
            clearInterval(interval);
            clearTimeout(timeout);
            resolve(true);
          }
        }, 200);
        const timeout = setTimeout(() => {
          clearInterval(interval);
          resolve(false);
        }, 8000);
      });
    };

    const roomAvailable = await waitForDiscovery();
    if (!roomAvailable) {
      console.warn(`[ClanTerritory] Discovery did not confirm room ${targetRoomId} — attempting direct join`);
    }

    const roomMetadata = discoveredRoomsRef.current[targetRoomId];
    const allowClanless = roomMetadata?.allowClanlessPlayers ?? gameState.allowClanlessPlayers ?? false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const storageKey = `clan-territory-player:${targetRoomId}`;
      const storedPlayerId = typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
      const stablePlayerId = user?.id ?? storedPlayerId ?? crypto.randomUUID();
      if (typeof window !== "undefined" && !storedPlayerId) {
        sessionStorage.setItem(storageKey, stablePlayerId);
      }
      const clanlessAssigned = allowClanless && (!resolvedClanId || !resolvedClanName);
      const clanlessIdentity = clanlessAssigned ? createClanlessIdentity(playerName, stablePlayerId) : null;
      if (!resolvedClanId || !resolvedClanName) {
        if (!clanlessAssigned) {
          throw new Error("You must be in a clan to join the Arena. Go to the Clans section to join a clan first.");
        }
      }
      const activeClanId = clanlessAssigned ? clanlessIdentity!.clanId : (resolvedClanId as ClanId);
      const activeClanName = clanlessAssigned ? clanlessIdentity!.clanName : (resolvedClanName as string);
      const activeClanColor = clanlessAssigned ? clanlessIdentity!.clanColor : undefined;
      const pid = await transport.joinRoom(
        targetRoomId,
        playerName,
        activeClanId,
        activeClanName,
        {
          clanColor: activeClanColor,
          playerId: stablePlayerId,
        }
      );
      setRoomId(targetRoomId);
      setPlayerId(pid);
      setPlayerFallback({
        id: pid,
        name: playerName,
        clanId: activeClanId,
        clanName: activeClanName,
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

  const handleTeacherExit = async () => {
    if (roomId) {
      try {
        await transport.sendAction(roomId, { type: "DISMISS_ARENA" });
      } catch (error) {
        console.warn("Failed to dismiss arena:", error);
      }
    }
    if (roomId) {
      removeHostRoom(roomId);
    }
    onExit();
  };

  const handleKickPlayer = (pid: string) => {
    if (roomId) transport.sendAction(roomId, { type: "KICK_PLAYER", payload: { playerId: pid } });
  };

  const missingClanAssignment = !resolvedClanId || !resolvedClanName;
  const canCreateRoom = selectedBatches.length > 0 && (!scheduleEnabled || Boolean(scheduledStartAt));
  const filteredRooms = useMemo(() => {
    const rooms = Object.values(discoveredRooms);
    return rooms.filter((room) => {
      // Filter by class / batch
      if (studentBatch && !room.classCodes?.includes(studentBatch)) return false;
      // Filter by allowed clans (if the room restricts clans)
      if (room.allowedClanIds && room.allowedClanIds.length > 0 && resolvedClanId) {
        if (!room.allowedClanIds.includes(resolvedClanId)) return false;
      }
      return true;
    });
  }, [discoveredRooms, studentBatch, resolvedClanId]);

  useEffect(() => {
    if (!roomId || !activeScheduledStartAt || gameState.phase !== "LOBBY") {
      autoStartTriggeredRef.current = false;
      return;
    }
    const startAt = new Date(activeScheduledStartAt);
    if (Number.isNaN(startAt.getTime())) return;
    const autoStartAt = startAt.getTime() + AUTO_START_DELAY_MS;
    autoStartTriggeredRef.current = false;

    const checkAutoStart = () => {
      if (autoStartTriggeredRef.current) return;
      if (Date.now() >= autoStartAt) {
        autoStartTriggeredRef.current = true;
        transport.sendAction(roomId, { type: "START_GAME", payload: { duration: durationMinutes * 60 } });
      }
    };

    checkAutoStart();
    const interval = setInterval(checkAutoStart, 1000);
    return () => clearInterval(interval);
  }, [activeScheduledStartAt, durationMinutes, gameState.phase, roomId, transport]);

  useEffect(() => {
    if (!isTeacher || mode !== "host" || !roomId) return;
    if (!teacherUserId) return;

    upsertHostRoom({
      roomId,
      state: gameState,
      selectedMap,
      durationMinutes,
      allowClanlessPlayers,
      selectedQuestions,
      selectedBatches,
      selectedClanIds,
      teacherName: teacherName || playerName,
      scheduledStartAt: activeScheduledStartAt,
      lastUpdatedAt: Date.now(),
    });
  }, [
    allowClanlessPlayers,
    durationMinutes,
    gameState,
    isTeacher,
    mode,
    roomId,
    selectedBatches,
    selectedClanIds,
    selectedMap,
    selectedQuestions,
    teacherName,
    playerName,
    teacherUserId,
    activeScheduledStartAt,
  ]);

  const handleResumeHostRoom = async (room: StoredHostRoom) => {
    try {
      await transport.resumeRoom(room.roomId, {
        state: room.state,
        allowClanlessPlayers: room.allowClanlessPlayers,
        schoolId: userSchoolId || undefined,
        teacherName: room.teacherName || teacherName || playerName,
        classCodes: room.selectedBatches?.length > 0 ? room.selectedBatches : undefined,
        allowedClanIds: room.selectedClanIds?.length > 0 ? room.selectedClanIds : undefined,
        scheduledStartAt: room.scheduledStartAt || undefined,
      });
      transport.onGameState(room.roomId, setGameState);
      setRoomId(room.roomId);
      setSelectedMap(room.selectedMap);
      setDurationMinutes(room.durationMinutes);
      setAllowClanlessPlayers(room.allowClanlessPlayers);
      setSelectedQuestions(room.selectedQuestions);
      setSelectedBatches(room.selectedBatches || []);
      setSelectedClanIds(room.selectedClanIds || []);
      setActiveScheduledStartAt(room.scheduledStartAt ?? null);
      setMode("host");
    } catch (error) {
      console.error("Failed to resume host room:", error);
      alert("Unable to resume this arena. Please create a new one.");
    }
  };

  // --- RENDER ---

  if (mode === 'configure') {
    return (
      <>
        {showQuestionSelection && (
          <QuestionSelectionModal
            onConfirm={handleQuestionsSelected}
            onCancel={() => setShowQuestionSelection(false)}
            restrictedSubjects={isTeacher && loadedAssignedClasses.length > 0 
              ? [...new Set(loadedAssignedClasses.map(cls => cls.subject))] 
              : []}
          />
        )}
        <div className="min-h-screen bg-slate-950 flex items-start justify-center px-4 py-10 overflow-y-auto">
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

          {lockdownLimits.tier === 'free' && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200 flex items-center gap-2">
              <span className="text-base">⚡</span>
              <span>Free plan — {lockdownLimits.max_duration_minutes}min max, limited maps, up to {lockdownLimits.max_students} students.</span>
            </div>
          )}

          <div className="card-glass p-8 space-y-6">
            {/* Duration Setting */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Battle Duration</label>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <input
                    type="range"
                    min="2"
                    max={effectiveDurationMax}
                    step="1"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="clan-range w-full"
                    style={{ "--clan-range-fill": `${durationPercentage}%` } as React.CSSProperties}
                  />
                </div>
                <div className="min-w-[80px] text-center rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-lg font-bold text-amber-300">
                  {durationMinutes}m
                </div>
              </div>
              <p className="text-xs text-gray-400">How long clans battle for territory control (2-{effectiveDurationMax} minutes)</p>
            </div>

            {/* Map Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Territory Map</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'default', emoji: '🗺️', label: 'Default', desc: 'Standard 8-zone battlefield' },
                  { id: 'city', emoji: '🏙️', label: 'City', desc: 'Urban warfare, 10 districts' },
                  { id: 'kyrgyzstan', emoji: '🇰🇬', label: 'Kyrgyzstan', desc: 'Regional conquest, 7 oblasts' },
                  { id: 'usa', emoji: '🇺🇸', label: 'USA', desc: 'States + DC, 51 zones' },
                  { id: 'unitedkingdom', emoji: '🇬🇧', label: 'United Kingdom', desc: 'UK regions + isles, 16 zones' },
                ].map(({ id, emoji, label, desc }) => {
                  const locked = isMapLocked(id);
                  return (
                    <button
                      key={id}
                      onClick={() => !locked && setSelectedMap(id)}
                      disabled={locked}
                      className={`p-4 rounded-xl border-2 transition relative ${
                        locked ? 'opacity-40 cursor-not-allowed border-slate-800 bg-slate-900/30' :
                        selectedMap === id ? 'border-cyan-400 bg-cyan-500/20' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-left space-y-1">
                        <p className="font-bold text-white">{emoji} {label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </div>
                      {locked && (
                        <span className="absolute top-2 right-2 text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">PRO</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Class Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Target Classes</label>
              <p className="text-xs text-gray-400 -mt-1">Select one or more classes to compete against each other</p>
              {availableBatches.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  {availableBatches.map((batch) => {
                    const isSelected = selectedBatches.includes(batch.batch);
                    return (
                      <label
                        key={batch.batch}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-emerald-500/20 border border-emerald-500/50' 
                            : 'bg-slate-800/50 border border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBatches([...selectedBatches, batch.batch]);
                              } else {
                                setSelectedBatches(selectedBatches.filter(b => b !== batch.batch));
                              }
                            }}
                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                          />
                          <div>
                            <span className="text-white font-medium">{batch.batch}</span>
                            {batch.grade !== null && (
                              <span className="text-slate-400 ml-2">Grade {batch.grade}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-slate-400">{batch.player_count} students</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={selectedBatches.join(', ')}
                  onChange={(e) => setSelectedBatches(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="Enter class codes (e.g. 9A, 9B)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white"
                />
              )}
              {selectedBatches.length > 1 && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <span>⚔️</span> {selectedBatches.length} classes will compete against each other!
                </p>
              )}
              {selectedBatches.length === 1 && (
                <p className="text-xs text-gray-400">Only students from {selectedBatches[0]} can join this arena.</p>
              )}
              {selectedBatches.length === 0 && (
                <p className="text-xs text-amber-400">Please select at least one class to continue.</p>
              )}
            </div>

            {/* Clan Selection (optional) */}
            {availableClans.length > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-bold text-white">Restrict to Specific Clans <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
                <p className="text-xs text-gray-400 -mt-1">Leave empty to allow all clans. Select clans to restrict who can join.</p>
                <div className="space-y-2 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  {availableClans.map((clan) => {
                    const isSelected = selectedClanIds.includes(clan.id);
                    return (
                      <label
                        key={clan.id}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-500/20 border border-purple-500/50'
                            : 'bg-slate-800/50 border border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedClanIds([...selectedClanIds, clan.id]);
                              } else {
                                setSelectedClanIds(selectedClanIds.filter(id => id !== clan.id));
                              }
                            }}
                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                          />
                          <div className="flex items-center gap-2">
                            {clan.crest_url && (
                              <img src={clan.crest_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                            )}
                            <span className="text-white font-medium">{clan.name}</span>
                          </div>
                        </div>
                        <span className="text-xs text-slate-400">{clan.member_count} members</span>
                      </label>
                    );
                  })}
                </div>
                {selectedClanIds.length > 0 && (
                  <p className="text-xs text-purple-400 flex items-center gap-1">
                    <span>🛡️</span> Only {selectedClanIds.length} clan{selectedClanIds.length !== 1 ? 's' : ''} allowed to compete
                  </p>
                )}
                {selectedClanIds.length === 0 && (
                  <p className="text-xs text-gray-400">All clans can join — no restriction applied.</p>
                )}
              </div>
            )}

            {/* Schedule Start */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">Schedule Start</p>
                  <p className="text-xs text-gray-400">Set a future time to auto-start the battle (starts 2 minutes after).</p>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="peer relative h-6 w-11 rounded-full bg-slate-600 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              {scheduleEnabled && (
                <input
                  type="datetime-local"
                  value={scheduledStartAt}
                  onChange={(e) => setScheduledStartAt(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-white"
                />
              )}
            </div>

            {/* Clanless Participation */}
            <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">Allow independent agents</p>
                <p className="text-xs text-gray-400">
                  Let students without a clan join this battle as "{CLANLESS_CLAN_LABEL}"
                </p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowClanlessPlayers}
                  onChange={(e) => setAllowClanlessPlayers(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="peer relative h-6 w-11 rounded-full bg-slate-600 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full"></div>
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
                  <p className="text-gray-400 text-xs mb-1">Classes</p>
                  <p className="text-white font-bold">{selectedBatches.length > 0 ? selectedBatches.join(', ') : "Not selected"}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Start</p>
                  <p className="text-white font-bold">
                    {scheduleEnabled ? formatScheduleTime(scheduledStartAt) ?? "Set time" : "Immediate"}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Questions</p>
                  <p className="text-white font-bold">{selectedQuestions.length || 'To be selected'}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Total Zones</p>
                  <p className="text-white font-bold">{MAP_ZONE_CONFIG[selectedMap] || 8} territories</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Access</p>
                  <p className="text-white font-bold">
                    {allowClanlessPlayers ? "Clans + Independent agents" : "Clan members only"}
                  </p>
                </div>
                {selectedClanIds.length > 0 && (
                  <div className="bg-slate-800/50 rounded-lg p-3 col-span-2">
                    <p className="text-gray-400 text-xs mb-1">Allowed Clans</p>
                    <p className="text-white font-bold">
                      {availableClans
                        .filter(c => selectedClanIds.includes(c.id))
                        .map(c => c.name)
                        .join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowQuestionSelection(true)}
              disabled={!canCreateRoom}
              className="w-full font-heading font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 py-4 text-lg text-white transition disabled:bg-slate-800/60 disabled:border-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {selectedQuestions.length ? 'Change Questions & Create' : 'Select Questions & Create'}
            </button>
            {!canCreateRoom && (
              <p className="text-xs text-amber-300 text-center">
                {selectedBatches.length > 0 ? "Pick a scheduled start time before creating the arena." : "Select at least one class before creating the arena."}
              </p>
            )}
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
              <div className="text-left">
                <span className="text-gray-400 text-xs uppercase tracking-wider block">Classes</span>
                <div className="text-sm font-bold text-emerald-300">{selectedBatches.join(', ') || "—"}</div>
              </div>
              {activeScheduledStartAt && (
                <div className="text-left">
                  <span className="text-gray-400 text-xs uppercase tracking-wider block">Scheduled Start</span>
                  <div className="text-sm font-bold text-amber-200">{formatScheduleTime(activeScheduledStartAt)}</div>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                void handleTeacherExit();
              }}
              className="text-gray-400 hover:text-white font-heading"
            >
              Exit
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ClanTerritoryTeacherView
              gameState={gameState}
              selectedQuestions={selectedQuestions}
              scheduledStartAt={activeScheduledStartAt}
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
      <>
      <FreeTierWatermark />
      <ClanTerritoryErrorBoundary onExit={onExit} fallbackTitle="Player View Error">
        <ClanTerritoryStudentView
          gameState={gameState}
          playerId={playerId}
          fallbackPlayer={playerFallback ?? undefined}
          onRewardsClaimed={handleRefreshProfile}
          onSelectZone={(zoneId) => {
            console.log('[ClanTerritoryManager] onSelectZone called:', { zoneId, roomId, playerId });
            if (!roomId) {
              console.error('[ClanTerritoryManager] onSelectZone: roomId is null/undefined!');
              return;
            }
            // Allow null zoneId to deselect current zone (for zone switching)
            console.log('[ClanTerritoryManager] Sending SELECT_ZONE action...');
            transport.sendAction(roomId, { type: "SELECT_ZONE", payload: { playerId, zoneId: zoneId || null } })
              .then(() => console.log('[ClanTerritoryManager] SELECT_ZONE sent successfully'))
              .catch((err) => console.error('[ClanTerritoryManager] SELECT_ZONE failed:', err));
          }}
          onSubmitAnswer={(isCorrect, durationMs) => {
            console.log('[ClanTerritoryManager] onSubmitAnswer called:', { isCorrect, durationMs, roomId, playerId });
            if (!roomId) {
              console.error('[ClanTerritoryManager] onSubmitAnswer: roomId is null/undefined!');
              return;
            }
            console.log('[ClanTerritoryManager] Sending SUBMIT_ANSWER action...');
            transport.sendAction(roomId, { type: "SUBMIT_ANSWER", payload: { playerId, isCorrect, durationMs } })
              .then(() => console.log('[ClanTerritoryManager] SUBMIT_ANSWER sent successfully'))
              .catch((err) => console.error('[ClanTerritoryManager] SUBMIT_ANSWER failed:', err));
          }}
        />
      </ClanTerritoryErrorBoundary>
      </>
    );
  }

  // MENU MODE
  return (
    <>
      {showQuestionSelection && (
        <QuestionSelectionModal
          onConfirm={handleQuestionsSelected}
          onCancel={() => setShowQuestionSelection(false)}
          restrictedSubjects={isTeacher 
            ? [...new Set(loadedAssignedClasses.map(cls => cls.subject))] 
            : undefined}
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
            <>
              {storedHostRooms.length > 0 && (
                <div className="card-glass p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-heading text-lg text-white">Your Active Arenas</h2>
                    <span className="text-xs text-gray-400">{storedHostRooms.length} saved</span>
                  </div>
                  <div className="space-y-3">
                    {storedHostRooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-400">Room Code</p>
                            <p className="text-2xl font-mono font-bold text-amber-400">{room.roomId}</p>
                          </div>
                          <button
                            onClick={() => handleResumeHostRoom(room)}
                            className="px-4 py-2 font-heading font-bold rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white transition-colors text-sm"
                          >
                            Open Host View
                          </button>
                        </div>
                        {(() => {
                          const remainingSeconds = getRemainingSeconds({
                            phase: room.state.phase,
                            timer: room.state.timer,
                            gameEndTime: room.state.gameEndTime,
                          });
                          if (remainingSeconds === null) return null;
                          return (
                            <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                              Live · {formatTimer(remainingSeconds)} remaining
                            </div>
                          );
                        })()}
                        <div className="text-xs text-gray-400 space-y-1">
                          <p>
                            Map: <span className="text-white capitalize">{room.selectedMap}</span>
                          </p>
                          <p>
                            Classes: <span className="text-white">{room.selectedBatches?.join(', ') || "—"}</span>
                          </p>
                          {room.scheduledStartAt && (
                            <p>
                              Scheduled:{" "}
                              <span className="text-white">{formatScheduleTime(room.scheduledStartAt)}</span>
                            </p>
                          )}
                          <p>
                            Updated:{" "}
                            <span className="text-white">{new Date(room.lastUpdatedAt).toLocaleString()}</span>
                          </p>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => removeHostRoom(room.roomId)}
                            className="text-xs text-gray-400 hover:text-gray-200"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={handleCreateRoom}
                className="w-full font-heading font-bold py-4 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-white rounded-xl text-lg transition-all"
              >
                HOST NEW BATTLE
              </button>
            </>
          )}

          {!isTeacher && (
            <div className="card-glass p-6 space-y-4">
              <h2 className="font-heading text-xl text-white flex items-center gap-2">
                <span className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse"></span>
                Agent Briefing
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
                        borderColor: gameState.clans[resolvedClanId]?.color || getClanColor(resolvedClanId),
                        color: gameState.clans[resolvedClanId]?.color || getClanColor(resolvedClanId),
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
                    <div className="p-3 rounded-xl border border-dashed border-gray-600 bg-black/20 flex justify-center">
                      <img src="/BRAINS.svg" alt="Loading..." className="w-12 h-12 animate-pulse" style={{ filter: 'drop-shadow(0 0 15px rgba(0, 212, 255, 0.6))' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isTeacher && (
            <div className="card-glass p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-xl text-white flex items-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                  Open Arenas
                </h2>
                <span className="text-xs text-gray-400">{filteredRooms.length} available</span>
              </div>

              {filteredRooms.length > 0 ? (
                <div className="space-y-3">
                  {filteredRooms.map((room) => {
                    const allowIndependent = Boolean(room.allowClanlessPlayers);
                    const remainingSeconds = getRemainingSeconds({
                      phase: room.phase,
                      timer: room.timer,
                      gameEndTime: room.gameEndTime,
                    });
                    return (
                      <div key={room.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-400">Room Code</p>
                            <p className="text-2xl font-mono font-bold text-amber-400">{room.id}</p>
                          </div>
                          <button
                            onClick={() => handleJoinRoom(room.id)}
                            disabled={!allowIndependent && missingClanAssignment}
                            className="px-4 py-2 font-heading font-bold rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 disabled:bg-gray-600/30 disabled:border-gray-600 disabled:cursor-not-allowed text-white transition-colors text-sm"
                          >
                            {allowIndependent && missingClanAssignment ? "Join as Independent" : "Enter Arena"}
                          </button>
                        </div>
                        {remainingSeconds !== null && (
                          <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            Live · {formatTimer(remainingSeconds)} remaining
                          </div>
                        )}
                        <div className="text-xs text-gray-400 space-y-1">
                          <p>Teacher: <span className="text-white">{room.teacherName || "Teacher"}</span></p>
                          <p>Classes: <span className="text-white">{room.classCodes?.join(', ') || "—"}</span></p>
                          {room.scheduledStartAt && (
                            <p>Scheduled: <span className="text-white">{formatScheduleTime(room.scheduledStartAt)}</span></p>
                          )}
                          {allowIndependent && (
                            <p className="text-emerald-300">Independent agents allowed.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-6 rounded-xl border border-dashed border-slate-700 bg-black/20">
                  <div className="text-3xl mb-2">📡</div>
                  {Object.keys(discoveredRooms).length > 0 && studentBatch ? (
                    <>
                      <p className="text-white font-semibold">No arenas for class {studentBatch} yet.</p>
                      <p className="text-gray-400 text-sm">Ask your teacher to open a battle for your class.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-white font-semibold">Scanning for signals...</p>
                      <p className="text-gray-400 text-sm">Waiting for a teacher to open an arena.</p>
                    </>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-700 space-y-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Join with Room Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    placeholder="Enter 4-digit code"
                    className="flex-1 rounded-xl border border-slate-700 bg-black/30 px-3 py-2 text-white"
                  />
                  <button
                    onClick={() => handleJoinRoom(roomCodeInput.trim())}
                    disabled={!roomCodeInput.trim()}
                    className="px-4 py-2 font-heading font-bold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 disabled:bg-gray-600/30 disabled:border-gray-600 disabled:cursor-not-allowed text-white transition-colors text-sm"
                  >
                    Join
                  </button>
                </div>
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
