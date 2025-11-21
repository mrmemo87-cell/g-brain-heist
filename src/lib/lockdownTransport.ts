import { applyAction, createInitialGameState } from "../features/lockdown/lockdownEngine";
import { buildRoomSettings } from "../features/lockdown/defaultRoomSettings";
import {
  GameAction,
  GameState,
  RoomSettings,
} from "../features/lockdown/lockdownTypes";

export type RoomId = string;
export type PlayerId = string;
export type TeacherCommand = GameAction;
type PlayerAction = Extract<GameAction, { playerId: string }>;

export interface LockdownTransport {
  createRoom(settings?: Partial<RoomSettings>): Promise<RoomId>;
  joinRoom(roomId: RoomId, playerName: string): Promise<PlayerId>;
  onGameState(roomId: RoomId, callback: (state: GameState) => void): () => void;
  sendAction(roomId: RoomId, action: GameAction): Promise<void>;
  sendTeacherCommand(roomId: RoomId, command: TeacherCommand): Promise<void>;
}

export interface LockdownRoomClient {
  subscribe(callback: (state: GameState) => void): () => void;
  act(action: Omit<PlayerAction, "playerId">): Promise<void>;
  teacher(command: TeacherCommand): Promise<void>;
}

type StateSubscriber = (state: GameState) => void;

type RoomRecord = {
  settings: RoomSettings;
  state: GameState;
  subscribers: Set<StateSubscriber>;
  players: Map<PlayerId, string>;
};

export class InMemoryLockdownTransport implements LockdownTransport {
  private rooms: Map<RoomId, RoomRecord> = new Map();
  private roomCounter = 0;
  private playerCounter = 0;

  async createRoom(settings?: Partial<RoomSettings>): Promise<RoomId> {
    const roomId = `room-${++this.roomCounter}` as RoomId;
    const resolvedSettings = buildRoomSettings(settings);
    const state = createInitialGameState(resolvedSettings);

    this.rooms.set(roomId, {
      settings: resolvedSettings,
      state,
      subscribers: new Set<StateSubscriber>(),
      players: new Map<PlayerId, string>(),
    });

    return roomId;
  }

  async joinRoom(roomId: RoomId, playerName: string): Promise<PlayerId> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    const playerId = `player-${++this.playerCounter}` as PlayerId;
    room.players.set(playerId, playerName);
    this.applyAndBroadcast(roomId, {
      type: "JOIN",
      playerId,
      name: playerName,
    });
    return playerId;
  }

  onGameState(roomId: RoomId, callback: (state: GameState) => void): () => void {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    room.subscribers.add(callback);
    callback(room.state);

    return () => {
      room.subscribers.delete(callback);
    };
  }

  async sendAction(roomId: RoomId, action: GameAction): Promise<void> {
    this.applyAndBroadcast(roomId, action);
  }

  async sendTeacherCommand(roomId: RoomId, command: TeacherCommand): Promise<void> {
    this.applyAndBroadcast(roomId, command);
  }

  private applyAndBroadcast(roomId: RoomId, action: GameAction): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    room.state = applyAction(room.state, action);
    for (const subscriber of room.subscribers) {
      subscriber(room.state);
    }
  }
}

export function createRoomClient(
  transport: LockdownTransport,
  roomId: RoomId,
  playerId: PlayerId,
): LockdownRoomClient {
  const taggedPlayerId = playerId;
  return {
    subscribe: (callback: (state: GameState) => void) => transport.onGameState(roomId, callback),
    act: (action: Omit<PlayerAction, "playerId">) =>
      transport.sendAction(
        roomId,
        {
          ...action,
          playerId: taggedPlayerId,
        } as PlayerAction,
      ),
    teacher: (command: TeacherCommand) => transport.sendTeacherCommand(roomId, command),
  };
}
