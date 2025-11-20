export type RoomId = string;
export type PlayerId = string;
export type RoomSettings = Record<string, unknown>;
export type GameState = Record<string, unknown>;
export type GameAction = { type: string; [key: string]: unknown };
export type TeacherCommand = { type: string; [key: string]: unknown };

export interface LockdownTransport {
  createRoom(settings: RoomSettings): Promise<RoomId>;
  joinRoom(roomId: RoomId, playerName: string): Promise<PlayerId>;
  onGameState(roomId: RoomId, callback: (state: GameState) => void): () => void;
  sendAction(roomId: RoomId, action: GameAction): Promise<void>;
  sendTeacherCommand(roomId: RoomId, command: TeacherCommand): Promise<void>;
}

export interface LockdownRoomClient {
  subscribe(callback: (state: GameState) => void): () => void;
  act(action: GameAction): Promise<void>;
  teacher(command: TeacherCommand): Promise<void>;
}

import { applyAction, createInitialGameState } from "./lockdownEngine";

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

  async createRoom(settings: RoomSettings): Promise<RoomId> {
    const roomId = `room-${++this.roomCounter}` as RoomId;
    const state = createInitialGameState(settings);

    this.rooms.set(roomId, {
      settings,
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

  private applyAndBroadcast(roomId: RoomId, update: GameAction | TeacherCommand): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} does not exist`);
    }

    room.state = applyAction(room.state, update);
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
    act: (action: GameAction) =>
      transport.sendAction(roomId, {
        ...action,
        playerId: taggedPlayerId,
      }),
    teacher: (command: TeacherCommand) => transport.sendTeacherCommand(roomId, command),
  };
}
