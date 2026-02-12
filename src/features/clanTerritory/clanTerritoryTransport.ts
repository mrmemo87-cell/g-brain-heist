import { ClanTerritoryGameState, GameAction } from "./clanTerritoryTypes";

export type RoomId = string;
export type PlayerId = string;

export interface ClanTerritoryTransport {
  createRoom(options?: {
    allowClanlessPlayers?: boolean;
    schoolId?: string;
    teacherName?: string;
    classCodes?: string[];
    scheduledStartAt?: string;
  }): Promise<RoomId>;
  resumeRoom(
    roomId: RoomId,
    options?: {
      state?: ClanTerritoryGameState;
      allowClanlessPlayers?: boolean;
      schoolId?: string;
      teacherName?: string;
      classCodes?: string[];
      scheduledStartAt?: string;
    }
  ): Promise<void>;
  joinRoom(
    roomId: RoomId,
    playerName: string,
    clanId: string,
    clanName: string,
    options?: { clanColor?: string }
  ): Promise<PlayerId>;
  onGameState(roomId: RoomId, callback: (state: ClanTerritoryGameState) => void): () => void;
  sendAction(roomId: RoomId, action: GameAction): Promise<void>;
  startDiscovery(
    schoolId: string | null,
    onRoomFound: (
      roomId: RoomId,
      metadata?: {
        allowClanlessPlayers?: boolean;
        teacherName?: string;
        classCodes?: string[];
        scheduledStartAt?: string;
      }
    ) => void
  ): void;
  stopDiscovery(): void;
  cleanup(): void;
}
