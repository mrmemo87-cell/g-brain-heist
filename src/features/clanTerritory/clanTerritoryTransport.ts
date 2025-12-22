import { ClanTerritoryGameState, GameAction } from "./clanTerritoryTypes";

export type RoomId = string;
export type PlayerId = string;

export interface ClanTerritoryTransport {
  createRoom(options?: { allowClanlessPlayers?: boolean; schoolId?: string }): Promise<RoomId>;
  joinRoom(
    roomId: RoomId,
    playerName: string,
    clanId: string,
    clanName: string,
    options?: { clanColor?: string }
  ): Promise<PlayerId>;
  onGameState(roomId: RoomId, callback: (state: ClanTerritoryGameState) => void): () => void;
  sendAction(roomId: RoomId, action: GameAction): Promise<void>;
  startDiscovery(schoolId: string | null, onRoomFound: (roomId: RoomId, metadata?: { allowClanlessPlayers?: boolean }) => void): void;
  stopDiscovery(): void;
  cleanup(): void;
}
