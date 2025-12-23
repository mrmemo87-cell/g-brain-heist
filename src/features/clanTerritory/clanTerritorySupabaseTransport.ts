import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../../services/supabaseClient";
import { ClanTerritoryTransport, RoomId, PlayerId } from "./clanTerritoryTransport";
import { ClanTerritoryGameState, GameAction } from "./clanTerritoryTypes";
import { clanTerritoryReducer, INITIAL_STATE } from "./clanTerritoryEngine";

// NOTE: In a real app, these would be environment variables
// const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
// const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export class SupabaseClanTerritoryTransport implements ClanTerritoryTransport {
  private channel: any;
  private discoveryChannel: any;
  private discoveryBroadcastInterval: any;
  private tickInterval: any = null;
  private visibilityListener: (() => void) | null = null;
  private state: ClanTerritoryGameState = INITIAL_STATE;
  private isHost: boolean = false;
  private allowClanlessPlayers: boolean = false;
  private schoolId: string | null = null;

  async createRoom(options?: { allowClanlessPlayers?: boolean; schoolId?: string }): Promise<RoomId> {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    this.isHost = true;
    this.allowClanlessPlayers = Boolean(options?.allowClanlessPlayers);
    this.schoolId = options?.schoolId || null;
    this.state = { ...INITIAL_STATE, allowClanlessPlayers: this.allowClanlessPlayers };

    // Start hosting logic immediately
    this.setupChannel(roomId);
    this.startBroadcastingDiscovery(roomId);
    
    return roomId;
  }

  // --- Discovery Logic ---
  private startBroadcastingDiscovery(roomId: RoomId) {
    // Use school-specific discovery channel to isolate rooms between schools
    const channelName = this.schoolId 
      ? `clan-territory-discovery:${this.schoolId}` 
      : 'clan-territory-discovery:global';
    
    this.discoveryChannel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false },
      },
    });
    this.discoveryChannel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        // Broadcast presence periodically
        this.discoveryBroadcastInterval = setInterval(() => {
          if (this.discoveryChannel && this.discoveryChannel.state === 'joined') {
            this.discoveryChannel.send({
              type: 'broadcast',
              event: 'room_open',
              payload: { roomId, allowClanlessPlayers: this.allowClanlessPlayers, schoolId: this.schoolId }
            });
          }
        }, 2000);
      }
    });
  }

  private stopBroadcastingDiscovery() {
    if (this.discoveryBroadcastInterval) {
      clearInterval(this.discoveryBroadcastInterval);
      this.discoveryBroadcastInterval = null;
    }
    if (this.discoveryChannel) {
      supabase.removeChannel(this.discoveryChannel);
      this.discoveryChannel = null;
    }
  }

  startDiscovery(schoolId: string | null, onRoomFound: (roomId: RoomId, metadata?: { allowClanlessPlayers?: boolean }) => void) {
    // Listen on school-specific discovery channel to only see rooms from same school
    const channelName = schoolId 
      ? `clan-territory-discovery:${schoolId}` 
      : 'clan-territory-discovery:global';
    
    this.discoveryChannel = supabase.channel(channelName);
    this.discoveryChannel
      .on('broadcast', { event: 'room_open' }, (payload: any) => {
        onRoomFound(payload.payload.roomId, { allowClanlessPlayers: payload.payload.allowClanlessPlayers });
      })
      .subscribe();
  }

  stopDiscovery() {
    if (this.discoveryChannel) {
      supabase.removeChannel(this.discoveryChannel);
      this.discoveryChannel = null;
    }
  }
  // -----------------------

  async joinRoom(
    roomId: RoomId,
    playerName: string,
    clanId: string,
    clanName: string,
    options?: { clanColor?: string }
  ): Promise<PlayerId> {
    const playerId = crypto.randomUUID();
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
        
        if (this.isHost) {
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
        } else {
            // Clients just send actions, they don't process them locally until they get state update?
            // OR: Optimistic updates.
            // For now: Clients listen for STATE updates from host.
            // BUT: We are listening to 'game_action' here.
            
            // If we are a client, we might want to optimistically update for some things,
            // but generally we wait for the host to send the full state.
        }
      })
      .on("broadcast", { event: "game_state" }, (payload: any) => {
        if (!this.isHost) {
          this.state = payload.payload;
          if (this.onStateUpdate) this.onStateUpdate(this.state);
        }
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
            if (this.isHost) {
                // Clear any existing tick interval to prevent duplicates
                if (this.tickInterval) {
                    clearInterval(this.tickInterval);
                    this.tickInterval = null;
                }
                
                // Timer uses absolute timestamps now (gameEndTime), so a single TICK
                // will correctly calculate remaining time based on Date.now()
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
                
                // Run tick every second - it uses absolute time so tab inactivity won't cause drift
                this.tickInterval = setInterval(tick, 1000);
                
                // Handle visibility changes to immediately update when tab becomes visible
                const handleVisibilityChange = () => {
                    if (!document.hidden && this.state.phase === 'ACTIVE') {
                        tick(); // Single tick recalculates from gameEndTime
                    }
                };
                document.addEventListener('visibilitychange', handleVisibilityChange);
                this.visibilityListener = handleVisibilityChange;
                
                // Broadcast initial state
                this.broadcastState();
            }
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
