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

    this.channel
      .on("broadcast", { event: "action" }, ({ payload }) => {
        // Host receives actions from players
        console.log("Host received action:", payload);
        this.handleAction(payload as GameAction);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
           this.broadcastState();
        }
      });

    // Start game loop
    this.tickInterval = setInterval(() => {
        if (this.state && this.state.phase === "ACTIVE_ROUNDS") {
            this.handleAction({ type: "TICK", elapsedMs: 1000 });
        }
    }, 1000);

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
      const timeout = setTimeout(() => {
        if (!connected) {
          if (this.channel) supabase.removeChannel(this.channel);
          reject(new Error("Room not found or host inactive"));
        }
      }, 5000);

      this.channel = supabase.channel(`lockdown:${roomId}`);

      this.channel
        .on("broadcast", { event: "state" }, ({ payload }) => {
          if (!connected) {
            connected = true;
            clearTimeout(timeout);
            resolve(playerId);
          }
          this.state = payload as GameState;
          this.notifySubscribers();
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            // Send JOIN action repeatedly until we get state, or timeout
            // But for now, just send once. The host should respond with state if they are there.
            // Actually, we need to trigger the host to send state.
            // The host sends state on any action.
            await this.sendAction(roomId, {
              type: "JOIN",
              playerId,
              name: playerName,
              clanId: options?.clanId,
              clanName: options?.clanName,
              clanAvatarUrl: options?.clanAvatarUrl,
            } as any);
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
    if (this.channel && this.state) {
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
    if (this.channel) {
        supabase.removeChannel(this.channel);
        this.channel = null;
    }
  }
}
