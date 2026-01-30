import { supabase } from "../../../services/supabaseClient";
import {
  ClanTerritoryTransport,
  RoomId,
  PlayerId,
} from "./clanTerritoryTransport";
import { ClanTerritoryGameState, GameAction } from "./clanTerritoryTypes";
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

  private onStateUpdate: ((state: ClanTerritoryGameState) => void) | null = null;

  // Used to detect state changes even if reducer mutates in place
  private lastStateSignature: string = "";
  private lastBroadcastAtMs: number = 0;

  // ---- utilities ----
  private computeStateSignature(s: ClanTerritoryGameState): string {
    // Keep it cheap + stable. We only need to detect meaningful changes.
    const zoneKeys = Object.keys(s.zones || {}).sort();
    const zonesSig = zoneKeys
      .map((zid) => {
        const z = s.zones[zid];
        if (!z) return `${zid}:_`;
        const inflKeys = Object.keys(z.influence || {}).sort();
        const infl = inflKeys
          .map((cid) => `${cid}:${z.influence[cid] ?? 0}`)
          .join(",");
        return `${zid}[${infl}]`;
      })
      .join("|");

    const playerKeys = Object.keys(s.players || {}).sort();
    const playersSig = playerKeys
      .map((pid) => {
        const p = s.players[pid];
        if (!p) return `${pid}:_`;
        // Only the bits that affect UI/state sync
        return `${pid}:${p.selectedZoneId ?? ""}:${p.battleScore ?? 0}:${
          p.streak ?? 0
        }:${p.questionsAnswered ?? 0}`;
      })
      .join("|");

    const clansKeys = Object.keys(s.clans || {}).sort();
    const clansSig = clansKeys
      .map((cid) => `${cid}:${s.clans[cid]?.color ?? ""}`)
      .join("|");

    return [
      `phase=${s.phase}`,
      `timer=${s.timer}`,
      `start=${s.gameStartTime ?? ""}`,
      `end=${s.gameEndTime ?? ""}`,
      `map=${s.mapId ?? ""}`,
      `allowClanless=${s.allowClanlessPlayers ? "1" : "0"}`,
      `zones=${zonesSig}`,
      `players=${playersSig}`,
      `clans=${clansSig}`,
      `q=${(s.questions || []).length}`,
    ].join(";");
  }

  private commitStateIfChanged(next: ClanTerritoryGameState, reason: string) {
    const sig = this.computeStateSignature(next);

    if (sig === this.lastStateSignature) {
      // No meaningful change (even if object reference differs)
      return;
    }

    this.state = next;
    this.lastStateSignature = sig;

    if (this.onStateUpdate) this.onStateUpdate(this.state);

    if (this.isHost) {
      this.broadcastState();
    }
  }

  // ---- public API ----

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
    this.lastStateSignature = this.computeStateSignature(this.state);

    this.setupChannel(roomId);
    this.startBroadcastingDiscovery(roomId);

    return roomId;
  }

  async resumeRoom(
    roomId: RoomId,
    options?: {
      state?: ClanTerritoryGameState;
      allowClanlessPlayers?: boolean;
      schoolId?: string;
      teacherName?: string;
      classCode?: string;
      scheduledStartAt?: string;
    }
  ): Promise<void> {
    this.isHost = true;
    this.allowClanlessPlayers = Boolean(options?.allowClanlessPlayers);
    this.schoolId = options?.schoolId || null;
    this.teacherName = options?.teacherName || null;
    this.classCode = options?.classCode || null;
    this.scheduledStartAt = options?.scheduledStartAt || null;

    const restoredState = options?.state ?? {
      ...INITIAL_STATE,
      allowClanlessPlayers: this.allowClanlessPlayers,
    };

    this.state = restoredState;
    this.lastStateSignature = this.computeStateSignature(this.state);

    this.setupChannel(roomId);
    this.startBroadcastingDiscovery(roomId);
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
        phase?: ClanTerritoryGameState["phase"];
        timer?: number;
        gameEndTime?: number;
      }
    ) => void
  ) {
    const channelNames = schoolId
      ? [
          `clan-territory-discovery:${schoolId}`,
          "clan-territory-discovery:global",
        ]
      : ["clan-territory-discovery:global"];

    this.discoveryChannels = channelNames.map((channelName) =>
      supabase.channel(channelName)
    );

    this.discoveryChannels.forEach((channel) => {
      channel
        .on("broadcast", { event: "room_open" }, (payload: any) => {
          const roomPayload = payload.payload ?? {};
          if (schoolId && roomPayload.schoolId && roomPayload.schoolId !== schoolId) return;

          onRoomFound(roomPayload.roomId, {
            allowClanlessPlayers: roomPayload.allowClanlessPlayers,
            teacherName: roomPayload.teacherName,
            classCode: roomPayload.classCode,
            scheduledStartAt: roomPayload.scheduledStartAt,
            phase: roomPayload.phase,
            timer: roomPayload.timer,
            gameEndTime: roomPayload.gameEndTime,
          });
        })
        .subscribe();
    });
  }

  stopDiscovery() {
    if (this.discoveryChannels.length > 0) {
      this.discoveryChannels.forEach((channel) => supabase.removeChannel(channel));
      this.discoveryChannels = [];
    }
  }

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

    // Wait for join
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(check);
        reject(new Error("Connection timeout: Unable to join room. Please try again."));
      }, 10000);

      const check = setInterval(() => {
        if (this.channel && this.channel.state === "joined") {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    // Fetch clan color if missing
    let clanColor: string | undefined = options?.clanColor;
    if (!clanColor) {
      try {
        const { data: clan, error } = await supabase
          .from("clans")
          .select("color")
          .eq("id", clanId)
          .single();

        if (!error && clan?.color) clanColor = clan.color;
      } catch (e) {
        console.error("Failed to fetch clan color:", e);
      }
    }

    await this.sendAction(roomId, {
      type: "JOIN",
      payload: { player: { id: playerId, name: playerName, clanId, clanName, clanColor } },
    });

    return playerId;
  }

  onGameState(roomId: RoomId, callback: (state: ClanTerritoryGameState) => void): () => void {
    this.onStateUpdate = callback;

    // Hydrate immediately
    callback(this.state);

    if (!this.isHost) {
      void this.sendAction(roomId, { type: "REQUEST_STATE" });
    }

    return () => this.cleanup();
  }

  cleanup() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    if (this.visibilityListener) {
      document.removeEventListener("visibilitychange", this.visibilityListener);
      this.visibilityListener = null;
    }

    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    if (this.isHost) {
      this.stopBroadcastingDiscovery();
    }

    this.onStateUpdate = null;
  }

  async sendAction(roomId: RoomId, action: GameAction): Promise<void> {
    // Wait for channel ready
    if (!this.channel || this.channel.state !== "joined") {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(check);
          reject(new Error("Channel subscription timeout: Unable to send action"));
        }, 5000);

        const check = setInterval(() => {
          if (this.channel && this.channel.state === "joined") {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });
    }

    if (this.channel && this.channel.state === "joined") {
      if (this.isHost && action.type === "DISMISS_ARENA") {
        const next = clanTerritoryReducer(this.state, action);
        this.commitStateIfChanged(next, action.type);
      }

      await this.channel.send({
        type: "broadcast",
        event: "game_action",
        payload: action,
      });
    }
  }

  // ---- tick loop ----
  private startTickLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    if (!this.isHost) {
      // Clients do not tick. Host is authoritative.
      return;
    }

    const tick = () => {
      if (this.state.phase === "ACTIVE") {
        const next = clanTerritoryReducer(this.state, { type: "TICK" });
        this.commitStateIfChanged(next, "TICK");
      }
    };

    this.tickInterval = setInterval(tick, 1000);

    // Force an immediate update when tab becomes visible again
    if (this.visibilityListener) {
      document.removeEventListener("visibilitychange", this.visibilityListener);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        tick();
        this.broadcastState();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    this.visibilityListener = handleVisibilityChange;
  }

  // ---- realtime wiring ----
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

        if (this.isHost) {
          if (action.type === "REQUEST_STATE") {
            // Always send state when requested
            this.broadcastState();
            if (this.onStateUpdate) this.onStateUpdate(this.state);
            return;
          }

          // HOST ONLY applies reducer
          const next = clanTerritoryReducer(this.state, action);
          this.commitStateIfChanged(next, action.type);
        } else {
          // CLIENTS IGNORE game_action (prevents double simulation / flicker)
          // They only update from authoritative "game_state".
          return;
        }
      })
      .on("broadcast", { event: "game_state" }, (payload: any) => {
        if (this.isHost) return;

        const incoming = payload.payload as ClanTerritoryGameState;

        // Guard against invalid/partial payloads
        if (!incoming || typeof incoming !== "object") return;
        if (!incoming.phase || !incoming.zones || !incoming.players || !incoming.clans) {
          return;
        }

        this.commitStateIfChanged(incoming, "GAME_STATE");
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          // Start tick only on host
          this.startTickLoop();

          // Host broadcasts initial state
          this.broadcastState();
        }
      });
  }

  private broadcastState() {
    if (!this.channel || !this.isHost || this.channel.state !== "joined") return;

    // throttle a tiny bit to reduce spam if multiple actions land quickly
    const now = Date.now();
    if (now - this.lastBroadcastAtMs < 30) return;
    this.lastBroadcastAtMs = now;

    this.channel.send({
      type: "broadcast",
      event: "game_state",
      payload: this.state,
    });
  }

  // --- Discovery Logic ---
  private startBroadcastingDiscovery(roomId: RoomId) {
    const channelNames = this.schoolId
      ? [`clan-territory-discovery:${this.schoolId}`, "clan-territory-discovery:global"]
      : ["clan-territory-discovery:global"];

    this.discoveryChannels = channelNames.map((channelName) =>
      supabase.channel(channelName, {
        config: { broadcast: { ack: false } },
      })
    );

    this.discoveryChannels.forEach((channel) => {
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED" && !this.discoveryBroadcastInterval) {
          this.discoveryBroadcastInterval = setInterval(() => {
            this.discoveryChannels.forEach((activeChannel) => {
              if (activeChannel && activeChannel.state === "joined") {
                activeChannel.send({
                  type: "broadcast",
                  event: "room_open",
                  payload: {
                    roomId,
                    allowClanlessPlayers: this.allowClanlessPlayers,
                    schoolId: this.schoolId,
                    teacherName: this.teacherName,
                    classCode: this.classCode,
                    scheduledStartAt: this.scheduledStartAt,
                    phase: this.state.phase,
                    timer: this.state.timer,
                    gameEndTime: this.state.gameEndTime,
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
      this.discoveryChannels.forEach((channel) => supabase.removeChannel(channel));
      this.discoveryChannels = [];
    }
  }
}
