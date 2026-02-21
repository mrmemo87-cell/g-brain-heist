import { applyAction, createInitialGameState } from "../features/lockdown/lockdownEngine";
import { buildRoomSettings } from "../features/lockdown/defaultRoomSettings";
export class InMemoryLockdownTransport {
    constructor() {
        this.rooms = new Map();
        this.roomCounter = 0;
        this.playerCounter = 0;
    }
    async createRoom(settings) {
        const roomId = `room-${++this.roomCounter}`;
        const resolvedSettings = buildRoomSettings(settings);
        const state = createInitialGameState(resolvedSettings);
        this.rooms.set(roomId, {
            settings: resolvedSettings,
            state,
            subscribers: new Set(),
            players: new Map(),
        });
        return roomId;
    }
    async joinRoom(roomId, playerName, options) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error(`Room ${roomId} does not exist`);
        }
        const playerId = `player-${++this.playerCounter}`;
        room.players.set(playerId, playerName);
        this.applyAndBroadcast(roomId, {
            type: "JOIN",
            playerId,
            name: playerName,
            clanId: options?.clanId,
            clanName: options?.clanName,
            clanAvatarUrl: options?.clanAvatarUrl,
        });
        return playerId;
    }
    onGameState(roomId, callback) {
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
    async sendAction(roomId, action) {
        this.applyAndBroadcast(roomId, action);
    }
    async sendTeacherCommand(roomId, command) {
        this.applyAndBroadcast(roomId, command);
    }
    applyAndBroadcast(roomId, action) {
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
export function createRoomClient(transport, roomId, playerId) {
    const taggedPlayerId = playerId;
    return {
        subscribe: (callback) => transport.onGameState(roomId, callback),
        act: (action) => transport.sendAction(roomId, {
            ...action,
            playerId: taggedPlayerId,
        }),
        teacher: (command) => transport.sendTeacherCommand(roomId, command),
    };
}
