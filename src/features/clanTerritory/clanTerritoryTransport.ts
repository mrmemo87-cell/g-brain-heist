import { ClanTerritoryGameState, GameAction } from "./clanTerritoryTypes";

export type RoomId = string;
export type PlayerId = string;

export interface ClanTerritoryTransport {
  createRoom(): Promise<RoomId>;
  joinRoom(
    roomId: RoomId,
    playerName: string,
    clanId: string,
    clanName: string
  ): Promise<PlayerId>;
  onGameState(roomId: RoomId, callback: (state: ClanTerritoryGameState) => void): () => void;
  sendAction(roomId: RoomId, action: GameAction): Promise<void>;
}
