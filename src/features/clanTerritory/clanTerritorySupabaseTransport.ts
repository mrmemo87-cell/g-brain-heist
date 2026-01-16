import { supabase } from "../../../services/supabaseClient";
import { ClanTerritoryTransport, RoomId, PlayerId } from "./clanTerritoryTransport";
import { ClanId, ClanTerritoryGameState, GameAction, ZoneId } from "./clanTerritoryTypes";
import { clanTerritoryReducer, INITIAL_STATE } from "./clanTerritoryEngine";

export class SupabaseClanTerritoryTransport implements ClanTerritoryTransport {
  private channel: any;
  private discoveryChannels: any[] = [];
  private discoveryBroadcastInterval: any;
  private tickInterval: any = null;
  private visibilityListener: (() => void) | null = null;
  private state: ClanTerritoryGameState = INITIAL_STATE;
  private isHost: boolean = false;
  private allowClanlessPlayers: boolean = false;
  private schoolId: string | null = null;
  private teacherName: string | null = null;
  private classCode: string | null = null;
  private scheduledStartAt: string | null = null;
  private warnedInvalidState: boolean = false;

  async createRoom(options?: {
    allowClanlessPlayers?: boolean;
    schoolId?: string;
    teacherName?: string;
    classCode?: string;
    scheduledStartAt?: string;
  }): Promise<RoomId> {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    this.isHost = true;
    this.allowClanlessPlayers = Boolean(options?.allowClanlessPlayers);
    this.schoolId = options?.schoolId || null;
    this.teacherName = options?.teacherName || null;
    this.classCode = options?.classCode || null;
    this.scheduledStartAt = options?.scheduledStartAt || null;
    this.state = { ...INITIAL_STATE, allowClanlessPlayers: this.allowClanlessPlayers };

    // Start hosting logic immediately
    this.setupChannel(roomId);
    this.startBroadcastingDiscovery(roomId);
    
    return roomId;
  }

  // --- Discovery Logic ---
  private startBroadcastingDiscovery(roomId: RoomId) {
    const channelNames = this.schoolId
      ? [
          `clan-territory-discovery:${this.schoolId}`,
          'clan-territory-discovery:global',
        ]
      : ['clan-territory-discovery:global'];

    this.discoveryChannels = channelNames.map((channelName) =>
      supabase.channel(channelName, {
        config: {
          broadcast: { ack: false },
        },
      })
    );

    this.discoveryChannels.forEach((channel) => {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED' && !this.discoveryBroadcastInterval) {
          // Broadcast presence periodically
          this.discoveryBroadcastInterval = setInterval(() => {
            this.discoveryChannels.forEach((activeChannel) => {
              if (activeChannel && activeChannel.state === 'joined') {
                activeChannel.send({
                  type: 'broadcast',
                  event: 'room_open',
                  payload: {
                    roomId,
                    allowClanlessPlayers: this.allowClanlessPlayers,
                    schoolId: this.schoolId,
                    teacherName: this.teacherName,
                    classCode: this.classCode,
                    scheduledStartAt: this.scheduledStartAt,
                  },
                });
              }
            });
          }, 2000);
        }
      });
    });
  }

  private stopBroadcastingDiscovery() {
    if (this.discoveryBroadcastInterval) {
      clearInterval(this.discoveryBroadcastInterval);
      this.discoveryBroadcastInterval = null;
    }
    if (this.discoveryChannels.length > 0) {
      this.discoveryChannels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      this.discoveryChannels = [];
    }
  }

  startDiscovery(
    schoolId: string | null,
    onRoomFound: (
      roomId: RoomId,
      metadata?: {
        allowClanlessPlayers?: boolean;
        teacherName?: string;
        classCode?: string;
        scheduledStartAt?: string;
      }
    ) => void
  ) {
    const channelNames = schoolId
      ? [
          `clan-territory-discovery:${schoolId}`,
          'clan-territory-discovery:global',
        ]
      : ['clan-territory-discovery:global'];

    this.discoveryChannels = channelNames.map((channelName) => supabase.channel(channelName));

    this.discoveryChannels.forEach((channel) => {
      channel
        .on('broadcast', { event: 'room_open' }, (payload: any) => {
          const roomPayload = payload.payload ?? {};
          if (schoolId && roomPayload.schoolId && roomPayload.schoolId !== schoolId) {
            return;
          }
          onRoomFound(roomPayload.roomId, {
            allowClanlessPlayers: roomPayload.allowClanlessPlayers,
            teacherName: roomPayload.teacherName,
            classCode: roomPayload.classCode,
            scheduledStartAt: roomPayload.scheduledStartAt,
          });
        })
        .subscribe();
    });
  }

  stopDiscovery() {
    if (this.discoveryChannels.length > 0) {
      this.discoveryChannels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      this.discoveryChannels = [];
    }
  }
  // -----------------------

  async joinRoom(
    roomId: RoomId,
    playerName: string,
    clanId: string,
    clanName: string,
    options?: { clanColor?: string; playerId?: string }
  ): Promise<PlayerId> {
    const playerId = options?.playerId ?? crypto.randomUUID();
    this.isHost = false;
    
    this.setupChannel(roomId);

    // Send join request
    // We need to wait a bit for connection to be established in a real scenario, 
    // but Supabase realtime buffers messages usually.
    // However, for 'broadcast', we need to be connected.
    
    // Wait for channel to subscribe with timeout to prevent infinite hang
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            clearInterval(check);
            reject(new Error('Connection timeout: Unable to join room. Please try again.'));
        }, 10000); // 10 second timeout
        
        const check = setInterval(() => {
            if (this.channel && this.channel.state === 'joined') {
                clearInterval(check);
                clearTimeout(timeout);
                resolve();
            }
        }, 100);
    });

    // Fetch clan color from database if not provided
    let clanColor: string | undefined = options?.clanColor;
    if (!clanColor) {
      try {
        const { data: clan, error } = await supabase
          .from('clans')
          .select('color')
          .eq('id', clanId)
          .single();

        if (!error && clan?.color) {
          clanColor = clan.color;
        }
      } catch (e) {
        console.error('Failed to fetch clan color:', e);
        // Continue without color - will use hash-based fallback
      }
    }

    await this.sendAction(roomId, {
      type: "JOIN",
      payload: { player: { id: playerId, name: playerName, clanId, clanName, clanColor } },
    });

    return playerId;
  }

  onGameState(roomId: RoomId, callback: (state: ClanTerritoryGameState) => void): () => void {
    // The callback will be called whenever state changes
    // We store the callback to invoke it on updates
    this.onStateUpdate = callback;
    // Immediately hydrate listener with whatever state we already have to avoid waiting for next tick
    callback(this.state);
    if (!this.isHost) {
      // Ask the host to rebroadcast in case we subscribed after the last state push
      void this.sendAction(roomId, { type: "REQUEST_STATE" });
    }
    return () => {
      this.cleanup();
    };
  }

  /**
   * Clean up all intervals and channels to prevent memory leaks
   */
  cleanup() {
    // Clear tick interval
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    // Remove visibility listener
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    // Remove main channel
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    // Stop discovery broadcasting
    if (this.isHost) {
      this.stopBroadcastingDiscovery();
    }
    // Reset state
    this.onStateUpdate = null;
  }

  async sendAction(roomId: RoomId, action: GameAction): Promise<void> {
    console.log('[Transport] sendAction called:', { roomId, actionType: action.type, channelState: this.channel?.state });
    
    // Wait for channel to be ready if it's not already
    if (!this.channel || this.channel.state !== 'joined') {
      console.log('[Transport] Channel not ready, waiting...');
      // Wait for channel to be subscribed with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(check);
          console.error('[Transport] Channel subscription timeout');
          reject(new Error('Channel subscription timeout: Unable to send action'));
        }, 5000); // 5 second timeout
        
        const check = setInterval(() => {
          if (this.channel && this.channel.state === 'joined') {
            clearInterval(check);
            clearTimeout(timeout);
            console.log('[Transport] Channel now ready');
            resolve();
          }
        }, 100);
      });
    }

    if (this.channel && this.channel.state === 'joined') {
      console.log('[Transport] Broadcasting action:', action.type);
      await this.channel.send({
        type: "broadcast",
        event: "game_action",
        payload: action,
      });
      console.log('[Transport] Action broadcast complete');
    } else {
      console.error('[Transport] Cannot send - channel not ready after wait');
    }
  }

  private onStateUpdate: ((state: ClanTerritoryGameState) => void) | null = null;

  private startTickLoop() {
    // Clear any existing tick interval to prevent duplicates
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    if (!this.isHost) {
      return;
    }

    const tick = () => {
      if (this.state.phase === 'ACTIVE') {
        const newState = clanTerritoryReducer(this.state, { type: 'TICK' });
        if (newState !== this.state) {
          this.state = newState;
          this.broadcastState();
          if (this.onStateUpdate) this.onStateUpdate(this.state);
        }
      }
    };

    // Run tick every second - uses absolute time so tab inactivity won't cause drift
    this.tickInterval = setInterval(tick, 1000);

    // Use Page Visibility API to force immediate broadcast when tab becomes visible
    // This ensures students see updated state even if browser throttled the interval
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[Transport] Tab became visible - forcing state broadcast');
        tick();
        this.broadcastState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    this.visibilityListener = handleVisibilityChange;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private recordsEqual<T extends Record<string, unknown>>(
    a: T,
    b: T,
    valueEqual: (left: T[keyof T], right: T[keyof T]) => boolean
  ) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!(key in b)) return false;
      if (!valueEqual(a[key], b[key])) return false;
    }
    return true;
  }

  private zoneStateEqual(a: ClanTerritoryGameState["zones"][ZoneId], b: ClanTerritoryGameState["zones"][ZoneId]) {
    if (a === b) return true;
    if (a.id !== b.id) return false;
    const aInfluence = a.influence ?? {};
    const bInfluence = b.influence ?? {};
    return this.recordsEqual(aInfluence, bInfluence, (left, right) => left === right);
  }

  private playerEqual(
    a: ClanTerritoryGameState["players"][string],
    b: ClanTerritoryGameState["players"][string]
  ) {
    if (a === b) return true;
    return (
      a.id === b.id &&
      a.name === b.name &&
      a.clanId === b.clanId &&
      a.clanName === b.clanName &&
      a.questionsAnswered === b.questionsAnswered &&
      a.questionsCorrect === b.questionsCorrect &&
      a.totalAnswerTimeMs === b.totalAnswerTimeMs &&
      a.fastAnswers === b.fastAnswers &&
      a.streak === b.streak &&
      a.bestStreak === b.bestStreak &&
      a.battleScore === b.battleScore &&
      a.selectedZoneId === b.selectedZoneId
    );
  }

  private clanEqual(
    a: ClanTerritoryGameState["clans"][ClanId],
    b: ClanTerritoryGameState["clans"][ClanId]
  ) {
    if (a === b) return true;
    return a.id === b.id && a.name === b.name && a.color === b.color;
  }

  private questionsEqual(
    a: ClanTerritoryGameState["questions"],
    b: ClanTerritoryGameState["questions"]
  ) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return a.every((question, index) => {
      const other = b[index];
      if (!other) return false;
      if (question.id !== other.id) return false;
      return JSON.stringify(question) === JSON.stringify(other);
    });
  }

  private reconcileRecord<T extends Record<string, unknown>>(
    prev: T,
    next: T,
    valueEqual: (left: T[keyof T], right: T[keyof T]) => boolean
  ): T {
    if (prev === next) return prev;
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length !== nextKeys.length) {
      return next;
    }
    let changed = false;
    const merged: T = { ...next };
    for (const key of nextKeys) {
      const prevValue = prev[key];
      const nextValue = next[key];
      if (prevValue !== undefined && valueEqual(prevValue, nextValue)) {
        merged[key] = prevValue;
      } else if (prevValue !== nextValue) {
        changed = true;
      }
    }
    if (!changed && prevKeys.length === nextKeys.length) {
      return prev;
    }
    return merged;
  }

  private stateEqual(a: ClanTerritoryGameState, b: ClanTerritoryGameState) {
    return (
      a.phase === b.phase &&
      a.timer === b.timer &&
      a.gameStartTime === b.gameStartTime &&
      a.gameEndTime === b.gameEndTime &&
      a.mapId === b.mapId &&
      a.allowClanlessPlayers === b.allowClanlessPlayers &&
      this.recordsEqual(a.players, b.players, (left, right) =>
        this.playerEqual(
          left as ClanTerritoryGameState["players"][string],
          right as ClanTerritoryGameState["players"][string]
        )
      ) &&
      this.recordsEqual(a.zones, b.zones, (left, right) =>
        this.zoneStateEqual(
          left as ClanTerritoryGameState["zones"][ZoneId],
          right as ClanTerritoryGameState["zones"][ZoneId]
        )
      ) &&
      this.recordsEqual(a.clans, b.clans, (left, right) =>
        this.clanEqual(
          left as ClanTerritoryGameState["clans"][ClanId],
          right as ClanTerritoryGameState["clans"][ClanId]
        )
      ) &&
      this.questionsEqual(a.questions, b.questions)
    );
  }

  private reconcileIncomingState(
    incoming: unknown
  ): ClanTerritoryGameState | null {
    if (!this.isRecord(incoming)) {
      return null;
    }

    const candidate = incoming as ClanTerritoryGameState;
    if (
      !this.isRecord(candidate.players) ||
      !this.isRecord(candidate.zones) ||
      !this.isRecord(candidate.clans) ||
      !Array.isArray(candidate.questions) ||
      typeof candidate.phase !== "string" ||
      typeof candidate.timer !== "number"
    ) {
      return null;
    }

    if (Object.keys(candidate.zones).length === 0) {
      return null;
    }

    const mergedPlayers = this.reconcileRecord(
      this.state.players,
      candidate.players,
      (left, right) =>
        this.playerEqual(
          left as ClanTerritoryGameState["players"][string],
          right as ClanTerritoryGameState["players"][string]
        )
    );
    const mergedZones = this.reconcileRecord(
      this.state.zones,
      candidate.zones,
      (left, right) =>
        this.zoneStateEqual(
          left as ClanTerritoryGameState["zones"][ZoneId],
          right as ClanTerritoryGameState["zones"][ZoneId]
        )
    );
    const mergedClans = this.reconcileRecord(
      this.state.clans,
      candidate.clans,
      (left, right) =>
        this.clanEqual(
          left as ClanTerritoryGameState["clans"][ClanId],
          right as ClanTerritoryGameState["clans"][ClanId]
        )
    );

    const mergedQuestions = this.questionsEqual(this.state.questions, candidate.questions)
      ? this.state.questions
      : candidate.questions;

    return {
      ...candidate,
      mapId: candidate.mapId ?? this.state.mapId,
      allowClanlessPlayers:
        typeof candidate.allowClanlessPlayers === "boolean"
          ? candidate.allowClanlessPlayers
          : this.state.allowClanlessPlayers,
      players: mergedPlayers,
      zones: mergedZones,
      clans: mergedClans,
      questions: mergedQuestions,
    };
  }

  private applyIncomingState(incoming: unknown) {
    const nextState = this.reconcileIncomingState(incoming);
    if (!nextState) {
      if (import.meta.env.DEV && !this.warnedInvalidState) {
        console.warn("[Transport] Ignored invalid or partial game_state payload.");
        this.warnedInvalidState = true;
      }
      return;
    }

    if (this.stateEqual(this.state, nextState)) {
      return;
    }

    this.state = nextState;
    if (this.onStateUpdate) this.onStateUpdate(this.state);
  }

  private setupChannel(roomId: RoomId) {
    if (this.channel) return;

    this.channel = supabase.channel(`clan-territory:${roomId}`, {
      config: {
        broadcast: { self: true },
      },
    });

    this.channel
      .on("broadcast", { event: "game_action" }, (payload: any) => {
        const action = payload.payload as GameAction;

        // If host, process action and broadcast new state?
        // Actually, for simplicity in this peer-to-peer-ish setup (or host-authoritative),
        // let's make the HOST the source of truth.
        
        if (!this.isHost) {
          return;
        }

        if (action.type === "REQUEST_STATE") {
          this.broadcastState();
          if (this.onStateUpdate) this.onStateUpdate(this.state);
          return;
        }

        const newState = clanTerritoryReducer(this.state, action);
        if (newState !== this.state) {
          this.state = newState;
          this.broadcastState();
          if (this.onStateUpdate) this.onStateUpdate(this.state);
        }
      })
      .on("broadcast", { event: "game_state" }, (payload: any) => {
        if (!this.isHost) {
          this.applyIncomingState(payload.payload);
        }
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
            // Start ticking for host to ensure authoritative timekeeping
            this.startTickLoop();

            // Broadcast initial state (only host will actually send)
            this.broadcastState();
        }
      });
  }

  private broadcastState() {
    if (this.channel && this.isHost && this.channel.state === 'joined') {
      this.channel.send({
        type: "broadcast",
        event: "game_state",
        payload: this.state,
      });
    }
  }
}
