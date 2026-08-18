import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../../services/supabaseClient";
import { LockdownTransport, RoomId, PlayerId, TeacherCommand } from "./lockdownTransport";
import { GameState, GameAction, RoomSettings } from "../features/lockdown/lockdownTypes";
import { applyAction, createInitialGameState } from "../features/lockdown/lockdownEngine";
import { buildRoomSettings } from "../features/lockdown/defaultRoomSettings";

export class SupabaseLockdownTransport implements LockdownTransport {
  private channel: RealtimeChannel | null = null;
  private isHost = false;
  private state: GameState | null = null;
  private stateCallbacks: Set<(state: GameState) => void> = new Set();
  private tickInterval: any = null;
  private visibilityListener: (() => void) | null = null;

  async createRoom(settings?: Partial<RoomSettings>): Promise<RoomId> {
    this.isHost = true;
    // Generate a 4-digit room code for easy sharing
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const roomId = `room-${roomCode}` as RoomId;
    
    const resolvedSettings = buildRoomSettings(settings);
    this.state = createInitialGameState(resolvedSettings);

    this.channel = supabase.channel(`lockdown:${roomId}`, {
      config: {
        broadcast: { self: true },
      },
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Unable to activate realtime room"));
      }, 10000);

      this.channel!
        .on("broadcast", { event: "action" }, ({ payload }) => {
          // Host receives actions from players
          console.log("Host received action:", payload);
          this.handleAction(payload as GameAction);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Re-broadcast current state on initial subscription and reconnects.
            this.broadcastState();
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve();
            }
          } else if (!settled && (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`Unable to activate realtime room (${status})`));
          }
        });
    });

    // Start game loop with Page Visibility API to handle tab switching
    let lastTickTime = Date.now();
    
    const tick = () => {
      if (this.state && this.state.phase === "ACTIVE_ROUNDS") {
        const now = Date.now();
        const elapsed = now - lastTickTime;
        
        // Only tick if enough time has passed (prevent excessive ticks)
        if (elapsed >= 900) { // 900ms to account for slight drift
          lastTickTime = now;
          this.handleAction({ type: "TICK", elapsedMs: elapsed });
        }
      }
    };
    
    this.tickInterval = setInterval(tick, 1000);
    
    // Also tick when page becomes visible again to catch up
    const handleVisibilityChange = () => {
      if (!document.hidden && this.state && this.state.phase === "ACTIVE_ROUNDS") {
        tick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Store cleanup function
    this.visibilityListener = handleVisibilityChange;

    return roomId;
  }

  async joinRoom(
    roomId: RoomId,
    playerName: string,
    options?: { clanId?: string; clanName?: string; clanAvatarUrl?: string },
  ): Promise<PlayerId> {
    this.isHost = false;
    // Generate a persistent ID for this session if possible, or random
    const playerId = `player-${Math.floor(Math.random() * 1000000)}` as PlayerId;

    return new Promise((resolve, reject) => {
      let connected = false;
      let joinRetryInterval: ReturnType<typeof setInterval> | null = null;

      const clearJoinRetry = () => {
        if (joinRetryInterval) {
          clearInterval(joinRetryInterval);
          joinRetryInterval = null;
        }
      };

      const timeout = setTimeout(() => {
        if (!connected) {
          clearJoinRetry();
          if (this.channel) supabase.removeChannel(this.channel);
          reject(new Error("Room not found or host inactive"));
        }
      }, 10000);

      const sendJoin = async () => {
        if (connected) return;
        try {
          await this.sendAction(roomId, {
            type: "JOIN",
            playerId,
            name: playerName,
            clanId: options?.clanId,
            clanName: options?.clanName,
            clanAvatarUrl: options?.clanAvatarUrl,
          } as any);
        } catch (error) {
          // Realtime can briefly reconnect; the retry loop will send again.
          console.warn("Failed to send Lockdown JOIN; retrying", error);
        }
      };

      this.channel = supabase.channel(`lockdown:${roomId}`, {
        config: {
          broadcast: { ack: true },
        },
      });

      this.channel
        .on("broadcast", { event: "state" }, ({ payload }) => {
          if (!connected) {
            connected = true;
            clearTimeout(timeout);
            clearJoinRetry();
            resolve(playerId);
          }
          this.state = payload as GameState;
          this.notifySubscribers();
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !connected) {
            // JOIN is idempotent in the engine. Retrying closes the race where a
            // student's first JOIN arrives while the teacher channel is reconnecting.
            await sendJoin();
            if (!joinRetryInterval) {
              joinRetryInterval = setInterval(() => {
                void sendJoin();
              }, 750);
            }
          }
        });
    });
  }

  onGameState(roomId: RoomId, callback: (state: GameState) => void): () => void {
    this.stateCallbacks.add(callback);
    if (this.state) {
      callback(this.state);
    }
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  async sendAction(roomId: RoomId, action: GameAction): Promise<void> {
    if (this.isHost) {
      this.handleAction(action);
    } else {
      await this.channel?.send({
        type: "broadcast",
        event: "action",
        payload: action,
      });
    }
  }

  async sendTeacherCommand(roomId: RoomId, command: TeacherCommand): Promise<void> {
    if (this.isHost) {
      this.handleAction(command);
    } else {
       await this.sendAction(roomId, command);
    }
  }

  private handleAction(action: GameAction) {
    if (!this.state) return;
    
    // Apply action to state
    this.state = applyAction(this.state, action);
    
    // Notify local subscribers (Host UI)
    this.notifySubscribers();
    
    // Broadcast new state to everyone
    this.broadcastState();
  }

  private broadcastState() {
    if (this.channel && this.state && this.channel.state === 'joined') {
      this.channel.send({
        type: "broadcast",
        event: "state",
        payload: this.state,
      });
    }
  }

  private notifySubscribers() {
    if (this.state) {
      for (const cb of this.stateCallbacks) {
        cb(this.state);
      }
    }
  }
  
  cleanup() {
    if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
    }
    if (this.visibilityListener) {
        document.removeEventListener('visibilitychange', this.visibilityListener);
        this.visibilityListener = null;
    }
    if (this.channel) {
        supabase.removeChannel(this.channel);
        this.channel = null;
    }
  }
}
